# Phase 2.0.3.4 — Inventory Ledger & Balance

วันที่: 13 สิงหาคม 2026

สถานะ: **Owner Approved / Completed Locally**

ขอบเขต: immutable Stock Movement ledger, derived Inventory Balance, command idempotency และ internal atomic posting primitive ตาม D-206–D-213 และ D-217 บน local Supabase เท่านั้น ไม่ apply หรือแก้ Production

## 1. ผลลัพธ์

สร้าง migration `20260813131250_phase_2_0_3_4_inventory_ledger_balance.sql` ด้วย Supabase CLI `2.114.0` และเพิ่ม:

- `public.inventory_commands` — immutable command envelope และ idempotency outcome
- `public.stock_movements` — immutable source-of-truth ledger
- `public.inventory_balances` — derived current balance ต่อ Organization + SKU + Location
- `public.inventory_domain_events` — immutable machine-readable event ต่อ command
- `private.post_inventory_command(...)` — atomic posting primitive ที่ยังไม่เปิดให้ Data API หรือ service role

## 2. Stock identity และ quantity

- ทุก command และ movement บันทึก `sku_id`; `sku_code`, `barcode`, `sales_code`, `cf_code` หรือ fulfillment code ไม่ถูกใช้เป็น foreign key
- resolver ใน Server phase ต้องแปลง scanned identifier เป็น `sku_id` ก่อนเรียก command
- quantity ใช้ `numeric(20,6)` และ command input ต้องเป็นค่าบวก
- Movement เก็บ signed delta: Receive/Adjustment In/Transfer In เป็นบวก และ Adjustment Out/Transfer Out เป็นลบ
- Movement เก็บ `base_unit_code` snapshot จาก SKU ตอน post

## 3. Atomic posting และ locking

Internal primitive ทำงานใน transaction เดียว:

1. insert/select command ด้วย UUID และ lock command row
2. เปรียบเทียบ request hash เพื่อกัน command ID เดิมกับ payload ต่างกัน
3. ตรวจ active SKU, Branch, Warehouse และ Location พร้อม tenant scope
4. สร้าง balance row ที่ขาดแบบ `ON CONFLICT DO NOTHING`
5. lock balance rows ตาม `location_id` ลำดับคงที่
6. ตรวจ negative stock ก่อนสร้าง movement
7. insert movement, update balance และ insert domain event
8. เปลี่ยน command เป็น completed พร้อม immutable outcome

ไม่มี external call ระหว่างถือ lock และ error ทุกชนิด rollback ทั้ง command/movement/balance/event

## 4. Invariants

- `on_hand >= 0` และไม่มี override
- `allocated` เป็น generated `0`; `available` เป็น generated `on_hand`
- Balance version เพิ่มหนึ่งครั้งต่อ movement ที่กระทบ Location
- `last_movement_id` ต้องมีเมื่อ version มากกว่าศูนย์
- Transfer สร้าง `transfer_out` และ `transfer_in` สองรายการใน transaction เดียว พร้อม correlation เดียวกันและผลรวม delta เท่ากับศูนย์
- Movement, command envelope และ domain event update/delete ไม่ได้
- Balance insert/update ทำได้เฉพาะเมื่อมี processing command context
- SKU/Warehouse/Location ที่มี on-hand ไม่เท่ากับศูนย์ archive ไม่ได้
- failed validation ไม่ทิ้ง successful command หรือ partial movement

## 5. Idempotency

- command UUID เป็น global primary keyและมี composite unique `(organization_id, id)` สำหรับ tenant-safe references
- request hash เป็น lowercase SHA-256 hexadecimal 64 ตัว
- retry command + hash เดิมคืน JSON outcome และ movement IDs เดิม
- command ID เดิมกับ hash ต่างกันถูกปฏิเสธแบบ fail closed
- domain event unique ต่อ Organization + Command

## 6. Security boundary

- เปิด RLS บนทั้ง 4 ตารางและถอน privileges จาก `public`, `anon`, `authenticated`
- private posting primitive ถูก revoke จาก `public`, `anon`, `authenticated`, `service_role`
- Phase 2.0.4 จะสร้าง authorized Server boundary ที่ตรวจ verified actor, tenant, branch scope และ permission ก่อนเรียก primitive
- Phase 2.0.3.5 จะเพิ่ม reviewed SELECT policies/grants และ security abuse tests
- ไม่มี browser direct-write path และไม่มี Production mutation

## 7. Verification evidence

ชุดทดสอบ `supabase/tests/phase_2_0_3_4_inventory_ledger_balance.sql` ผ่าน:

```text
PHASE_2_0_3_4_INVENTORY_LEDGER_BALANCE_TESTS_PASSED
```

Scenario หลัก:

```text
Receive 10 → Adjust Out 3 → Transfer 2
Source balance = 5
Destination balance = 2
Total balance = Ledger sum = 7
Transfer delta sum = 0
```

ตรวจเพิ่ม:

- replay ไม่สร้าง movement/event ซ้ำ
- payload conflict ถูกปฏิเสธ
- negative stock rollback และไม่เหลือ partial rows
- adjustment reason note, active scope และ different transfer locations
- movement/event immutability และ direct balance-write denial
- nonzero stock archive denial
- RLS enabled `4/4`
- foreign-key indexes `18/18`
- reconciliation ระหว่าง Balance กับ Movement ต่อ SKU/Location

Supabase Advisors:

```text
supabase db advisors --local
No issues found
```

Production baseline validator ยังคงผ่าน `90/90 canonical SQL files + 7 bridges`

## 8. Rollback/compensation boundary

- Test data ทำงานภายใน transaction และ rollback หลังจบ
- Migration ยังไม่ถูก apply Production จึงไม่มี Production rollback
- ก่อนมี business data สามารถถอน triggers/functions/indexes แล้ว drop events → balances → movements → commands และถอน Location composite constraints
- หลังมี movement ห้ามลบ ledger; ใช้ compensating movement และ forward migration เท่านั้น
- clean rebuild และ rollback rehearsal เต็มรูปแบบอยู่ Phase 2.0.3.6

## 9. Gate ถัดไป

Phase 2.0.3.4 ปิดได้จากหลักฐาน local ขั้นถัดไปคือ **Phase 2.0.3.5 Permission, RLS & Security Tests** ซึ่งต้องได้รับอนุมัติแยก และยังไม่อนุญาตให้ apply Supabase Production

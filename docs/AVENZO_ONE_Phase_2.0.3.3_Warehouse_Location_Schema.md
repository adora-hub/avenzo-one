# Phase 2.0.3.3 — Warehouse/Location Schema

วันที่: 13 สิงหาคม 2026

สถานะ: **Owner Approved / Completed Locally**

ขอบเขต: Warehouse/Location topology และ tenant constraints ตาม D-201 และ D-205 บน local Supabase เท่านั้น ไม่ apply หรือแก้ Production

## 1. ผลลัพธ์

สร้าง migration `20260813130312_phase_2_0_3_3_warehouse_location_schema.sql` ด้วย Supabase CLI `2.114.0` และเพิ่ม:

- `public.warehouses` เป็น master data ภายใต้ Branch
- `public.locations` เป็นตำแหน่ง stock ที่เล็กที่สุดภายใน Warehouse
- composite unique key บน Branch เพื่อรองรับ tenant-safe FK
- composite Organization → Branch → Warehouse → Location constraints
- Default Location อัตโนมัติและ deferred end-of-transaction invariant
- indexes สำหรับ tenant topology, status/read paths และ actor foreign keys
- lifecycle, immutable topology keys และ hard-delete guards
- RLS แบบ deny-by-default โดยยังไม่มี Data API grant/policy จนถึง Phase 2.0.3.5

## 2. Topology contract

```text
Organization
└─ Branch
   └─ Warehouse
      └─ Location
```

- Warehouse ต้องมี `organization_id` และ `branch_id` ที่ตรงกันผ่าน composite FK
- Location ต้องมี `organization_id`, `branch_id` และ `warehouse_id` ที่ตรงกันผ่าน composite FK
- Warehouse ระดับ Organization โดยไม่มี Branch ไม่ได้รับอนุญาต
- Stock ใน Phase 2.0.3.4 ต้องอ้าง Location เสมอ
- topology keys ทุกระดับเปลี่ยนไม่ได้หลังสร้าง

## 3. Code และ default-location invariants

| Field | Canonical form | Uniqueness |
|---|---|---|
| Warehouse `code` | trim + uppercase | `(organization_id, code)` |
| Location `code` | trim + uppercase | `(warehouse_id, code)` |

เมื่อสร้าง Warehouse ระบบสร้าง Location `DEFAULT` ที่ active และ `is_default = true` ใน transaction เดียวกัน

- partial unique index จำกัดให้ Warehouse มี `is_default = true` ได้ไม่เกินหนึ่ง Location
- deferred constraint triggers ตรวจเมื่อจบ transactionว่า Warehouse ที่ยังไม่ archived มี active default เท่ากับหนึ่งรายการ
- การสลับ default ทำได้ใน transaction เดียว โดยยกเลิกค่าเดิมแล้วกำหนด Location ใหม่ที่ active และอยู่ Warehouse เดียวกัน
- default Location เปลี่ยนเป็น inactive/archived ไม่ได้หาก transaction จบโดยไม่มี active default ทดแทน

## 4. Lifecycle และ security

- Warehouse/Location ใช้ `active ↔ inactive → archived` หรือ `active → archived`
- `archived` เป็น terminal state และแก้ไขไม่ได้
- ห้าม hard delete; history จะถูกรักษาไว้สำหรับ ledger phase ถัดไป
- เปิด RLS บนทั้งสองตาราง
- ถอน privilege ทั้งหมดจาก `public`, `anon` และ `authenticated`
- trigger functions อยู่ใน `private`, ใช้ `SECURITY INVOKER`, fix `search_path` และไม่เปิด execute ให้ Data API roles
- ไม่มี Production mutation

Guard ที่ห้าม archive เมื่อ `on_hand <> 0` จะเพิ่มใน Phase 2.0.3.4 เมื่อ Inventory Balance มีอยู่แล้ว เพื่อไม่สร้าง dependency ไปยังตารางที่ยังไม่มี

## 5. Verification evidence

ทดสอบกับ local Supabase Postgres 17 ที่มี baseline และ Phase 2.0.3.2 แล้ว:

```text
PHASE_2_0_3_3_WAREHOUSE_LOCATION_TESTS_PASSED
```

ชุดทดสอบ `supabase/tests/phase_2_0_3_3_warehouse_location_schema.sql` ครอบคลุม:

1. canonicalization และ uniqueness ของ Warehouse/Location code
2. Default Location ถูกสร้างหนึ่งครั้งพร้อม Warehouse
3. ปฏิเสธ Warehouse ที่อ้าง Branch ข้าม Organization
4. ปฏิเสธ Location ที่อ้าง Warehouse ข้าม Branch/tenant
5. ปฏิเสธ default มากกว่าหนึ่งรายการ
6. ปฏิเสธ transaction ที่จบโดยไม่มี active default
7. สลับ default ใน transaction ได้สำเร็จ
8. immutable topology, lifecycle, archived immutability และ hard-delete denial
9. RLS enabled และไม่มี `anon`/`authenticated` SELECT grants
10. foreign-key indexes ครบ `9/9`

Supabase Advisors:

```text
supabase db advisors --local
No issues found
```

Production baseline validator ยังคงผ่าน `90/90 canonical SQL files + 7 bridges` และ migration ใหม่ไม่แก้ baseline archive

## 6. Rollback/compensation boundary

- Test data ทำงานภายใน transaction และ rollback หลังจบ
- Migration ยังไม่ถูก apply Production จึงไม่มี Production rollback
- rollback candidate ก่อนมี business data: ถอน triggers/functions/indexes, drop `locations`, drop `warehouses` แล้วถอน composite unique constraint ที่เพิ่มบน `branches`
- หลังมี stock/history ให้ใช้ forward compensation เท่านั้นและต้องผ่าน approval ใหม่
- clean rebuild และ rollback rehearsal เต็มรูปแบบอยู่ Phase 2.0.3.6

## 7. Gate ถัดไป

Phase 2.0.3.3 ปิดได้จากหลักฐาน local ขั้นถัดไปคือ **Phase 2.0.3.4 Inventory Ledger & Balance** ซึ่งต้องได้รับอนุมัติแยก และยังไม่อนุญาตให้ apply Supabase Production

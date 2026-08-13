# Phase 2.0.3.5 — Permission, RLS & Security Tests

วันที่: 13 สิงหาคม 2026  
สถานะ: **Owner Approved / Completed Locally**  
Production: **ไม่ apply และไม่แก้ข้อมูล Production**

## เป้าหมาย

ปิด Permission/RLS Gate ของ Foundation Vertical Slice ตาม Domain Contract D-201–D-217 โดยให้การอ่านข้อมูลยึด Organization/Branch scope, ปิด direct mutation จาก Data API และให้ Stock Command ผ่าน trusted server boundary ที่ตรวจ actor, tenant, membership, permission และ branch scope ก่อนเสมอ

## Permission catalog

เพิ่ม permission 8 รายการ:

| Permission | Scope | การใช้งาน |
|---|---|---|
| `product.read` | Organization | อ่าน Product/SKU |
| `product.manage` | Organization | ใช้กับ Server Command สำหรับ Product/SKU |
| `warehouse.read` | Branch | อ่าน Warehouse/Location |
| `warehouse.manage` | Branch | ใช้กับ Server Command สำหรับ Warehouse/Location |
| `inventory.read` | Branch | อ่าน command, ledger, balance และ event |
| `inventory.receive` | Branch ปลายทาง | รับสินค้าเข้าสต๊อก |
| `inventory.adjust` | Branch ที่เกิด adjustment | ปรับสต๊อก |
| `inventory.transfer` | Branch ต้นทางและปลายทาง | โอนสต๊อกระหว่าง Location |

Built-in role mapping:

- `owner` และ `admin` ได้ทั้ง 8 permission แบบ explicit สำหรับ Organization เดิมและ Organization ที่สร้างใหม่
- `manager`, `staff`, `viewer` ไม่ได้ permission ใหม่อัตโนมัติ เจ้าของระบบต้องมอบหมายผ่าน permission catalog
- Authorization ไม่ตรวจชื่อ role โดยตรง แต่ตรวจ permission assignment + active membership + Organization status + Branch scope

## RLS และ Data API grants

- เปิด SELECT ให้ `authenticated` เฉพาะผ่าน reviewed policy บน 8 ตาราง: `products`, `skus`, `warehouses`, `locations`, `inventory_commands`, `stock_movements`, `inventory_balances`, `inventory_domain_events`
- Product/SKU ใช้ Organization scope
- Warehouse/Location และ Inventory ใช้ Branch scope
- `inventory.read` อ่าน command ได้โดยไม่ต้องพึ่ง `warehouse.read` แฝง
- `anon` และ `public` ไม่มี table access
- `authenticated` ไม่มี INSERT/UPDATE/DELETE บนตาราง Foundation ทั้งหมด แม้มี `*.manage`; mutation ต้องเข้าผ่าน Server Command/API
- Platform Admin ไม่ถูกผสมเข้า tenant RLS และไม่มีสิทธิ์เขียน stock

## Trusted server boundary

เพิ่ม `public.server_post_inventory_command(...)` เป็น `SECURITY DEFINER` ที่:

1. execute ได้เฉพาะ `service_role`
2. รับ `actor_user_id` จาก server ที่ผ่าน authentication แล้ว
3. ตรวจ active Organization และ active membership
4. ตรวจ permission ตาม command type
5. ตรวจ Branch scope ของ Location ที่เกี่ยวข้อง
6. Transfer ต้องผ่าน scope ทั้งต้นทางและปลายทาง
7. เรียก private atomic posting primitive หลัง authorization ผ่านเท่านั้น

`private.post_inventory_command(...)` ยังคง revoke จากทั้ง `authenticated` และ `service_role` เพื่อไม่ให้ข้าม authorization wrapper

เพิ่ม `public.platform_inventory_evidence(organization_id)` เป็น read-only evidence RPC สำหรับ active Platform Admin ที่มี AAL2 เท่านั้น โดยคืน summary ของ Product/SKU/Warehouse/Location, movement, on-hand และ ledger total โดยไม่ให้ tenant operator permission หรือ stock override

## Security tests

ไฟล์ทดสอบ: `supabase/tests/phase_2_0_3_5_permission_rls_security.sql`

ผล local:

```text
PHASE_2_0_3_5_PERMISSION_RLS_SECURITY_TESTS_PASSED
```

ครอบคลุม:

- Owner/Admin seed permission ครบ 8/8
- Organization isolation และ Branch isolation
- `inventory.read` เป็นอิสระจาก `warehouse.read`
- suspended membership ถูกปฏิเสธ
- direct browser table write ถูกปฏิเสธ
- `authenticated` เรียก server posting RPC ไม่ได้
- authorized server receive สำเร็จ
- transfer ที่ actor ไม่มี scope ครบสอง branch ถูกปฏิเสธ
- Platform Admin AAL1 เปิด evidence ไม่ได้
- Platform Admin AAL2 อ่าน evidence ได้ แต่ tenant table RLS และ stock write ยังถูกปฏิเสธ
- private posting primitive ไม่ expose ให้ `service_role`

## Verification

- Migration apply บน local Postgres 17 ผ่าน
- Security/abuse suite ผ่านและ rollback fixture ทั้งหมด
- `supabase db lint --local --level warning` ไม่พบ warning ใหม่จาก Phase 2.0.3.5; เหลือ warning เดิมหนึ่งรายการใน `platform_simulate_sandbox_payment_event` เรื่องตัวแปร `v_payment` ไม่ถูกอ่าน
- Production baseline validator ผ่าน `90/90 canonical SQL files + 7 bridges`
- `git diff --check` ผ่าน

## ขอบเขตที่ยังไม่ทำ

- ยังไม่สร้าง Product/Warehouse application commands; อยู่ Phase 2.0.4
- ยังไม่ทำ clean rebuild/forward/rollback rehearsal ของ migration ชุด Phase 2.0.3 ทั้งหมด; อยู่ Phase 2.0.3.6
- ยังไม่ apply Supabase Production
- ยังไม่ Commit หรือ Push จนกว่าเจ้าของระบบสั่งแยก

## ขั้นถัดไป

ขั้นถัดไปที่เข้า Gate ได้คือ **Phase 2.0.3.6 Migration Verification** เพื่อทำ clean rebuild, forward verification, rollback/compensation evidence และ Advisors แบบเต็มชุด โดยต้องได้รับอนุมัติเริ่มงานแยกก่อน

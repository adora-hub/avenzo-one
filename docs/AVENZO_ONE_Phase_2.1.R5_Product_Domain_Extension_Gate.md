# Phase 2.1.R5 — Product Domain Extension Gate

วันที่ตัดสินใจ: 15 สิงหาคม 2026
สถานะ: Local implementation and verification complete; applied to AVENZO ONE PREVIEW during R7.3; Production apply not authorized

## ขอบเขตที่อนุมัติ

R5 เพิ่ม Domain contract ที่ Mockup ต้องใช้ โดยยังไม่สร้าง Product Image (R6) และยังไม่สร้าง Unified Product Creation UI/atomic aggregate command (R7)

## Decision record

| หัวข้อ | แหล่งข้อมูลจริง | ข้อตัดสินใจ |
|---|---|---|
| Category | `product_categories` | Organization master; ชื่อไม่ซ้ำแบบ case-insensitive ภายใน Organization |
| Brand | `product_brands` | Organization master; Product อ้างด้วย tenant-safe composite FK |
| Tags | `product_tags` + `product_tag_assignments` | Saved Tags ใช้ซ้ำได้; Product มีได้สูงสุด 40 Tags ต่อ command |
| Internal note | `products.internal_note` | แยกจาก description และจำกัด 4,000 ตัวอักษร |
| Product structure | `products.structure_type` | `standard`, `variant`, `bundle` |
| Sale price / tax | `sku_product_profiles` | อยู่ระดับ SKU เพราะแต่ละ Variant อาจขายคนละราคา/ภาษี |
| Cost | `sku_cost_profiles` | แยกตารางและต้องมีสิทธิ์ `product.cost.read` เพื่อไม่ให้ cost รั่วผ่าน Product read ปกติ |
| Quantity behavior | `sku_product_profiles.quantity_behavior` | `discrete`, `weight`, `volume`; ไม่เปลี่ยน `quantity_scale = 6` ของ Ledger |
| Product/package dimensions | `sku_product_profiles` | แยกน้ำหนัก/ขนาดสินค้าและกล่อง; ค่าเป็น non-negative |
| Reorder policy | `sku_product_profiles` | safety/min/max เป็น policy metadata ไม่ใช่ Inventory Balance |
| Sell units | `sku_sell_units` | `base_quantity` แปลง แพ็ค/คู่/กล่อง/ลัง กลับเป็น Base Unit ของ SKU เดิม |
| Bundle/Kit | `sku_bundle_components` | Bundle SKU อ้าง component `sku_id` จริง; ห้าม self/cycle และไม่สร้าง SKU ปลอม |

## Command boundary

คำสั่งทั้งหมดผ่าน `server_execute_product_domain_command` ซึ่งเรียกได้ด้วย `service_role` เท่านั้น และตรวจ actor ด้วย `product.manage` อีกครั้งใน Database

- `product.master.upsert`
- `product.metadata.update`
- `sku.profile.upsert`
- `sku.cost.upsert`
- `sku.sell_units.replace`
- `sku.bundle.replace`

ทุกคำสั่งมี command ID, request hash, idempotency, optimistic version (ส่วนที่เป็น versioned profile), immutable event และ Organization audit log

## Security contract

- ทุกตารางใหม่เปิด RLS และเริ่มจาก revoke สิทธิ์ `public`, `anon`, `authenticated`
- ตารางข้อมูลทั่วไป grant เฉพาะ `SELECT` ให้ `authenticated` และ policy ตรวจ `product.read`
- `sku_cost_profiles` ตรวจ `product.cost.read` แยกต่างหาก
- Browser ไม่มีสิทธิ์ insert/update/delete; mutation ต้องผ่าน Server Action → trusted command RPC
- FK ทุกความสัมพันธ์สำคัญรวม `organization_id` เพื่อป้องกัน cross-tenant reference
- Index ครอบคลุม tenant/name lookup, FK, timeline และ bundle reverse lookup

## Inventory invariants

1. SKU ID ยังคงเป็น Stock identity เพียงอย่างเดียว
2. SKU Code, Sales Code, Barcode และ Sell-unit Barcode เป็น lookup identifier เท่านั้น
3. ก่อนตัด Stock ต้อง resolve เป็น `sku_id` เสมอ
4. Sell Unit แปลงจำนวนกลับ Base Unit ก่อนส่ง Inventory Command
5. Bundle แตกเป็น component SKU และบันทึก movement ของ component; R5 ยังไม่เพิ่ม stock posting command สำหรับ Bundle
6. R5 ไม่เขียน `inventory_balances` โดยตรง

## Rollback / compensation

Migration เป็น additive และไม่เปลี่ยนข้อมูล Product/SKU/Inventory เดิม หากต้องหยุดใช้งานให้ทำ forward compensation migration เพื่อ revoke RPC/SELECT และซ่อน R5 read contract ก่อน ห้าม drop ตารางที่มีข้อมูลจริงแบบฉุกเฉิน ข้อมูล master/profile/bundle เก็บไว้เพื่อ audit และนำกลับมาใช้ใหม่ได้

## Verification

- Static domain/security contract: `npm run test:products-r5-domain-extension`
- Foundation/Product regressions: R0–R4 + Foundation application tests
- TypeScript: `npx tsc --noEmit`
- Baseline verification: 90/90 canonical migrations + 7 bridges
- Isolated local replay: Production baseline 90/90 แล้ว apply Phase 2.0.3.2–R5 ตามลำดับสำเร็จ
- SQL behavior/RLS actor matrix: `PHASE_2_1_R5_BEHAVIOR_AND_RLS_OK` และ rollback ข้อมูลทดสอบทั้งหมด
- Supabase DB lint: public/private ไม่มี schema error

## ขั้นถัดไป

หลัง Database gate ผ่านและเจ้าของระบบอนุมัติแยก จึงเริ่ม R6 Product Image Gate จากนั้น R7 Unified Product Creation โดยต้องใช้ atomic aggregate command ไม่เรียก `product.create` และ `sku.create` แยกจนเกิด partial state

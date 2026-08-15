# AVENZO ONE — Phase 2.1.R4 Product Detail & Safe Actions

วันที่ดำเนินการ: 15 สิงหาคม 2026
สถานะ: Owner Approved / Completed

## Outcome

หน้า Products จริงมี Product/SKU Detail Drawer ที่อ่านข้อมูลจริงผ่าน authenticated Supabase client และ RLS พร้อม Safe Actions ที่รักษา Domain Contract เดิม ไม่เพิ่ม Schema และไม่สร้างข้อมูลจำลองใน Production UI

## ขอบเขตที่เสร็จ

- Product Drawer แบ่งเป็น Overview, Inventory summary และ SKU / Identifiers
- แสดง SKU ทุกตัวแบบ bounded สูงสุด 200 รายการ พร้อม SKU Code, Sales Code/CF, Barcode, Base Unit, Status และ Stock แยก SKU
- Product aggregate ไม่รวม Stock ข้าม Base Unit และไม่เปิดเผยยอดเมื่อไม่มี `inventory.read`
- SKU Drawer แสดง identifier permanence และ Stock summary ตามสิทธิ์
- Edit SKU แสดง SKU Code และ Base Unit เป็น read-only
- Sales Code ที่มีค่าแล้วเป็น read-only; ถ้ายังว่างจึงตั้งค่าได้ครั้งแรก
- Product/SKU ที่ archived ไม่แสดง action แก้ไขและเป็น read-only
- Archive ใช้ `alertdialog` อธิบายผลกระทบก่อนยืนยัน ไม่ใช้ `window.confirm`
- SKU ที่ On hand ไม่เป็นศูนย์ถูกปิด action ตั้งแต่ UI และยังมี Database trigger เป็น authoritative guard
- ทุก mutation ยังคงผ่าน `executeFoundationCommandAction` พร้อม `expected_version`
- Version conflict แสดงข้อความและปุ่มรีเฟรชข้อมูล
- Database errors `sku_sales_code_is_permanent` และ `sku_base_unit_is_immutable` map เป็น `immutable_identifier`

## Read model และ Query boundary

- `getProductWorkspaceDetail` query Product ตาม `organization_id + product_id`
- query SKU แบบ batch และ bounded; ไม่มี N+1 ต่อ SKU
- query Inventory Balance แบบ batch เฉพาะเมื่อมี `inventory.read`
- query Branch codes แบบ batch
- `getSkuWorkspaceDetail` query SKU และ Inventory Balance แบบ tenant-scoped
- ไม่มี Service Role หรือ privileged client ใน Browser

## Safety contract

| เรื่อง | พฤติกรรม R4 |
|---|---|
| Product lifecycle | draft → active → archived; archived read-only |
| SKU lifecycle | draft → active → archived; archived read-only |
| SKU Code | immutable |
| Base Unit | immutable |
| Sales Code | ตั้งครั้งแรกได้ จากนั้น immutable |
| Stock | Drawer เป็น read-only; การเปลี่ยนยอดต้องผ่าน Inventory Command |
| Archive SKU | ต้องมี On hand = 0; Database trigger เป็น final guard |
| Concurrency | ส่ง `expected_version`; conflict ให้รีเฟรชก่อนลองใหม่ |
| Delete | ไม่มี hard delete |

## Test evidence

- R4 targeted tests: 6/6 ผ่าน
- R1–R4 + Product/SKU regression: 23/23 ผ่าน
- TypeScript: `tsc --noEmit --incremental false` ผ่าน
- Authenticated browser:
  - Product Drawer แสดง Overview / Inventory / SKU list ถูกต้อง
  - SKU Drawer แสดง Identifiers / permanence guidance ถูกต้อง
  - Edit SKU แสดง immutable fields และ permanent Sales Code แบบ read-only
  - Safe archive confirmation dialog แสดงผลกระทบ โดยไม่ได้ยืนยันคำสั่งจริงระหว่างทดสอบ
  - Light/Dark visual check ผ่าน

## ข้อจำกัดที่ตั้งใจคงไว้

- R4 ไม่เพิ่ม Category, Brand, Tags, Price/Cost/Tax, Image, Physical/Packaging หรือ Bundle fields; รอ R5/R6 gates
- Product archive ไม่ลบหรือ archive SKU/Stock แบบ cascade
- SKU list ใน Drawer bounded 200 รายการ; Product ขนาดใหญ่กว่านี้ต้องพัฒนา pagination ใน gate ถัดไป
- R4 ไม่แก้ Stock จาก Drawer

## Next gate

`2.1.R5 — Product Domain Extension Gate` ต้องตัดสิน Schema/Command/RLS/Audit สำหรับ metadata ที่ mockup ต้องใช้ ก่อนนำ Unified Product Creation ทั้งหมดเข้าสู่ระบบจริง

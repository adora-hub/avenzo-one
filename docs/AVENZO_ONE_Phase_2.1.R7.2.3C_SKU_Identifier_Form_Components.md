# AVENZO ONE — Phase 2.1.R7.2.3C SKU & Identifier Form Components

วันที่: 15 สิงหาคม 2026

สถานะ: **Implemented Locally / Awaiting Owner Visual Review**

## Scope

รอบนี้ทำเฉพาะ Section 3 `SKU แรกและรหัสสินค้า` ตาม Approved Mockup และ Visual Parity Audit Diff D-01–D-10 ในระดับ **Form Components** เท่านั้น โดยคง Interaction เต็มของ Identifier และ SKU staging ไว้ R7.2.4 ตาม Gap Freeze ไม่เริ่ม Section 4 หรือ R7.3

## Outcome

1. Heading เปลี่ยนเป็น `SKU แรกและรหัสสินค้า` พร้อมคำอธิบายว่า SKU คือรายการที่ขายและนับ Stock จริง
2. ชื่อรุ่น/ตัวเลือกมี `ใช้ชื่อเดียวกับสินค้า`, Information guide และ Variant name assistant
3. SKU Code, Sales Code, Barcode และ Base Unit มี Information guide ตาม Approved Mockup
4. Sales Code มีโหมดกรอกเอง, ใช้ SKU Code และรันเลขต่อเนื่อง
5. Barcode มีโหมดรหัสผู้ผลิต, รหัสภายในจาก SKU, รหัสภายในจาก Sales Code และยังไม่มี Barcode
6. Sequence panel จำกัด Prefix 10 ตัวอักษร, เลขเริ่มต้น 0–99,999,999, จำนวนหลัก 2–8 และแสดง Current/Next preview
7. Identifier assistant ตรวจรูปแบบ/ความยาวเบื้องต้นและยืนยันชัดเจนว่า Server transaction เป็นผู้ตรวจ Unique ขั้นสุดท้าย
8. Base Unit เพิ่ม `set — ชุด` และ `case — ลัง` พร้อม policy disclosure และตัวอย่างการเลือกหน่วย
9. สถานะเริ่มต้นแสดง `ฉบับร่าง` แบบ read-only เพราะ R7.1 Atomic Creation บังคับ Draft อย่างปลอดภัย
10. เพิ่ม SKU staging surface, count, empty state และ table contract ตาม Mockup
11. Responsive: Variant/Sequence เป็น 2 คอลัมน์ที่ ≤760px และ 1 คอลัมน์ที่ ≤480px

## Interaction Boundary

- Sequence เป็น Preview เท่านั้น ยังไม่จองเลข; เมื่อบันทึก Server ตรวจ Unique ใน transaction และปฏิเสธเมื่อรหัสชน
- Identifier assistant รอบนี้เป็น Client advisory ไม่ใช่ผลตรวจ Database
- SKU staging button รอบนี้แสดง component และแจ้งขอบเขต R7.2.4 แต่ยังไม่เก็บ/แก้ไข/ลบหลาย SKU จริง
- คำสั่งสร้างยังเป็น `product.create_with_initial_sku` เพียงคำสั่งเดียว; ไม่มีการเพิ่ม `sku.create` ใน Part นี้
- Full modal/popover, server identifier check, atomic sequence allocation และ multi-SKU staging interaction เป็น R7.2.4 ตาม Audit

## Boundary อื่นที่ยังไม่ทำ

- ไม่ทำ Section 4 ราคาและภาษีหรือ Section ถัดไป
- ไม่เปลี่ยน Supabase schema, Database constraints, command contract หรือ permission
- ไม่สร้าง Product/SKU/Stock ระหว่างงานรอบนี้
- ไม่ commit, push หรือ deploy

## Verification

- R7.2.3C SKU Components targeted: **6/6 ผ่าน**
- Product R1–R7.2.3C regression: **66/66 ผ่าน**
- TypeScript: ผ่านด้วย `tsc --noEmit --incremental false`
- `git diff --check`: ไม่มี whitespace error; มีเฉพาะคำเตือน line-ending เดิมของ worktree
- Browser control ยังไม่พร้อมในรอบนี้ จึงรอ Owner visual review บน Route จริง

Node test runner ยังแสดง `MODULE_TYPELESS_PACKAGE_JSON` warning เดิมจากไฟล์ TypeScript บางชุด แต่ไม่มี test failure และไม่เกี่ยวกับ R7.2.3C UI

## Next Gate

Owner ตรวจ Section 3 ใน Light/Dark โดยลองชื่อสินค้าอัตโนมัติ, Variant assistant, Sales/Barcode modes, Sequence preview, Identifier advisory และ Base Unit policy หากอนุมัติจึงเริ่ม **R7.2.3D — Section 4 ราคาและภาษี (Diff E-01)** แยกเป็น Part ถัดไป

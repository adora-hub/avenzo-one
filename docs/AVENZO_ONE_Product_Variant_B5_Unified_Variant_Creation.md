# AVENZO ONE — Phase B Part 5 Unified Variant Creation

สถานะ: **Completed locally — 16 สิงหาคม 2026**

## ขอบเขตที่ปิดแล้ว

- นำ Approved Variant Creation Mockup มาใช้ในฟอร์มสร้างสินค้าจริง
- สร้างกลุ่มตัวเลือกและค่าตัวเลือก แล้วคำนวณ Combination อัตโนมัติ
- กำหนด SKU Code, Sales Code, Barcode, ราคา, สถานะ และรูปต่อ Variant
- สร้าง Product และ Variant graph ทั้งหมดแบบ Atomic transaction
- ผูก Identifier Registry, Audit Log และ Domain Event ภายในคำสั่งเดียว
- อัปโหลดรูปก่อน แล้ว assign รูปให้ SKU Variant ด้วยคำสั่งที่ retry ได้
- บันทึก Browser Draft และคืนค่าหลัง F5

## Contract

คำสั่งหลัก: `product.create_with_variants`

คำสั่งกู้คืนรูป Variant: `product.variant_images.assign`

ฐานข้อมูลสร้างข้อมูลต่อไปนี้ใน transaction เดียว:

1. Product
2. Option Groups
3. Option Values และ Alias
4. SKU Variants
5. SKU Profile, Cost Profile และ Sell Unit
6. Variant Option Assignments
7. Permanent Identifier Registry
8. Audit Log และ Domain Event

หาก SKU, Sales Code หรือ Barcode ซ้ำ คำสั่งต้อง rollback ทั้งชุดและไม่เหลือ Product บางส่วน

## ผลทดสอบ

- SQL integration: ผ่าน — 4 SKU, 2 Groups, 4 Values, 8 Assignments, 8 Identifier rows
- Idempotent replay: ผ่าน
- Duplicate rollback: ผ่าน
- Service-role boundary: ผ่าน
- Variant image assignment: ผ่าน
- TypeScript: ผ่าน
- B5 static test: 3/3 ผ่าน
- R7 unified creation regression: 7/7 ผ่าน
- Production build: ผ่าน
- Browser interaction: 2 กลุ่มสร้าง 8 Combination, Bulk price และ F5 persistence ผ่าน

## Stop Gate

Part 6 — Products Workspace Alignment **ยังไม่เริ่ม**

ยังไม่ Commit, Push หรือ Deploy จนกว่า Owner จะตรวจ B5 และอนุมัติแยกต่างหาก

## Follow-up 1 — แยก Variant Editor ออกจาก Single-SKU Editor

สถานะ: **Completed locally — 16 สิงหาคม 2026**

- เมื่อเลือก “มีตัวเลือก / Variant” ฟอร์มจะแสดงเฉพาะ Variant Combination Builder
- ซ่อนชื่อรุ่น, รหัส SKU เดี่ยว, Sales Code/CF เดี่ยว, Barcode เดี่ยว และรายการพัก SKU เดี่ยวทั้งหมด
- หัวข้อส่วนที่ 3 เปลี่ยนเป็น “SKU Variant และตัวเลือกสินค้า” พร้อมจำนวน SKU ที่เปิดใช้งาน
- โหมดสินค้าปกติและ Bundle ยังคงใช้ Single-SKU Editor เดิม
- Approved Mockup ใช้เงื่อนไขเดียวกับระบบจริง
- TypeScript, B5 tests, R7 regression และ A2 Mockup tests ผ่านทั้งหมด

ข้อ 2 และข้อถัดไป **ยังไม่เริ่ม**

# AVENZO ONE — Product Variant A2 Variant UX Mockup

วันที่ตรวจ: 16 สิงหาคม 2026

สถานะ: **Completed locally — Sequential Gate Part 2**

ไฟล์ Mockup: `docs/mockups/phase-2.1-unified-product-creation-form.html`

## ขอบเขต

Part 2 เพิ่มการออกแบบ Variant ภายใน Unified Product Creation โดยยังเป็น Interaction Prototype และไม่เชื่อม Database, Storage หรือ Stock command

## พฤติกรรมที่เพิ่ม

1. เมื่อเลือก `มีตัวเลือก / Variant` จะแสดง Variant Builder โดยไม่เปลี่ยนหน้าตาโครงหลักที่ผ่านการอนุมัติ
2. มีค่าเริ่มต้น `สี` และ `ไซซ์` พร้อมตัวอย่าง สีฟ้า/สีดำ และ S/M/L/XL
3. เพิ่มกลุ่มกำหนดเองได้รวมสูงสุด 3 กลุ่ม และเพิ่มค่าได้สูงสุด 12 ค่าต่อกลุ่ม
4. ระบบสร้าง Combination Matrix จากค่าทุกกลุ่ม สูงสุด 100 Combination
5. ผู้ใช้เปิดหรือปิด Combination รายตัวหรือทั้งหมดได้
6. กรอกแบบกลุ่มได้ทั้ง SKU Code, ราคาขาย, Barcode และสถานะ
7. แต่ละ Combination เลือกใช้ภาพ Product หรือภาพประจำ Variant ได้
8. Draft เก็บ Option Group และ Combination ใน Browser แบบมีขอบเขตข้อมูล

## กฎ UX และความปลอดภัย

- กด Enter หรือ comma เพื่อเพิ่ม Option Value
- ทุก control มี label และใช้คีย์บอร์ดได้
- ข้อมูลข้อความและรหัสถูกจำกัดความยาวและ normalize ก่อนใช้
- Combination ที่เปิดขายต้องมี SKU Code และต้องไม่ซ้ำกัน
- ใช้ Design Token เดิม จึงรองรับ Light/Dark โดยไม่สร้างชุดสีใหม่
- Mobile เปลี่ยน Option Card และ Bulk Toolbar เป็นหนึ่งคอลัมน์ ส่วน Matrix เลื่อนแนวนอนได้
- Mockup ไม่เรียก Supabase, ไม่อัปโหลดไฟล์ และไม่สร้าง Product/SKU จริง

## หลักฐานการตรวจ

- Static/JavaScript contract test: `web/scripts/test-products-variant-a2-mockup.mjs`
- Browser interaction: สลับ Variant, สร้าง 8 Combination เริ่มต้น, เพิ่มกลุ่ม `เนื้อผ้า` 2 ค่าเป็น 16 Combination และ Bulk fill ผ่าน
- Responsive browser check: 390 × 844 ผ่าน
- Default desktop visual check ผ่าน

## Sequential Gate

Part 2 ผ่านเมื่อ Test ทั้งหมดผ่าน, Design QA ไม่มี P0/P1 และ Guide กลางระบุสถานะ Completed locally ก่อนเริ่ม Part 3

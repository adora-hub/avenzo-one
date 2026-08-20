# AVENZO ONE — Phase 2.1.R7.2.3A General Form Components

วันที่: 15 สิงหาคม 2026

สถานะ: **Implemented Locally / Awaiting Owner Visual Review**

## Scope

รอบนี้ทำเฉพาะ Section 1 `ข้อมูลทั่วไป` ตาม Approved Mockup และ Visual Parity Audit Diff B-01–B-06 เท่านั้น โดยหยุดรอ Owner ตรวจหลังจบ Section นี้ ไม่เริ่ม Section 2 รูปสินค้า, R7.2.4 Interaction Parity หรือ R7.3

## Outcome

1. เพิ่ม Information guide ที่ชื่อสินค้า, รูปแบบสินค้า และวิธีนับจำนวน โดยไม่เปลี่ยน command boundary เดิม
2. หมวดหมู่และแบรนด์ใช้ select treatment ตาม Mockup พร้อมลูกศรห่างขอบขวา 12px และปุ่มแก้ไข Master แบบ icon
3. รูปแบบสินค้าเป็น Button group 3 ตัวที่เชื่อมติดกัน: สินค้าปกติ, มีตัวเลือก / Variant และ Bundle / Kit พร้อม responsive stacking บนจอแคบ
4. วิธีนับจำนวนแสดงคำอธิบายและตัวอย่าง `ต่างหู 1 คู่`, `ข้าวสาร 0.50 kg` และ `น้ำหอม 1.25 litre`
5. Tags แสดง chip ที่เลือก, ลบได้, เลือก Tag ที่บันทึกไว้จาก Organization master และแนะนำคำจากชื่อสินค้าได้ โดยไม่สร้าง Master จากข้อความที่ไม่ผ่าน trusted flow
6. ปุ่มแก้ไข Category, Brand และ Tag ใช้ edit icon ตาม Approved Mockup
7. ช่อง `หมายเหตุสินค้า` เป็นข้อมูลภายในทีม ไม่แสดงให้ลูกค้า และจำกัด 1,000 ตัวอักษร โดย map ไปยัง `internalNote`; contract ฝั่ง Backend ยังไม่เปลี่ยน
8. คง R7.1 `product.create_with_initial_sku`, R6 image lifecycle, Local draft recovery และ Stock command boundary เดิมทั้งหมด

## Boundary ที่ยังไม่ทำในรอบนี้

- ยังไม่ทำ Section 2 รูปสินค้าและ Section ถัดไป
- ยังไม่ทำ Modal/Popover guide ฉบับเต็ม, Tag hover/search interaction และ Master editor dialog; เป็น R7.2.4
- ไม่เปลี่ยน Database schema, Supabase migration, command contract หรือสิทธิ์
- ไม่สร้าง Product/SKU/Stock หรือข้อมูลทดสอบในระบบจริง
- ไม่ commit, push หรือ deploy

## Verification

- R7.2.3A Form Components targeted: **5/5 ผ่าน**
- R7.2.2 Page Structure targeted: **4/4 ผ่าน**
- R7.2 Unified Creation targeted: **6/6 ผ่าน**
- Product R1–R7.2.3A regression: **55/55 ผ่าน**
- TypeScript: ผ่านด้วย `tsc --noEmit --incremental false`
- Authenticated Chrome: Desktop Light/Dark ผ่าน, ไม่มี horizontal page overflow และคืน Theme เป็น Light แล้ว
- ไม่มีการกด submit หรือสร้างข้อมูลระหว่าง Visual QA

Node test runner ยังแสดง `MODULE_TYPELESS_PACKAGE_JSON` warning เดิมจากไฟล์ TypeScript บางชุด แต่ไม่มี test failure และไม่เกี่ยวกับ R7.2.3A UI

## Next Gate

Owner ตรวจ Section 1 ใน Route จริงก่อน หากอนุมัติจึงเริ่ม **R7.2.3B — Section 2 รูปสินค้า (Diff C-01–C-04)** แยกเป็น Part ถัดไป ห้ามข้ามไปทำหลาย Section พร้อมกัน

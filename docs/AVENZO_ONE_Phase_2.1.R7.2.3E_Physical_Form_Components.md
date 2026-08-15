# AVENZO ONE — Phase 2.1.R7.2.3E Physical Form Components

วันที่: 15 สิงหาคม 2026

สถานะ: **Owner Approved / Completed Locally**

## Scope

รอบนี้ทำเฉพาะ Section 5 `น้ำหนักและขนาด` ตาม Approved Mockup และ Visual Parity Audit Diff E-02 ในระดับ **Form Components** เท่านั้น ไม่เริ่ม Section 6 และไม่เปลี่ยน R7.1 Atomic command หรือ Physical data contract

## Outcome

1. Heading และคำอธิบายตรง Mockup: ข้อมูลสำหรับขนส่ง คำนวณพื้นที่ และเลือกบรรจุภัณฑ์
2. เปลี่ยน Fieldset สองชุดที่แสดงพร้อมกันเป็น Tabs `น้ำหนักและขนาดสินค้า` และ `น้ำหนักและขนาดกล่อง`
3. Tabs ใช้ `tablist/tab/tabpanel`, `aria-selected`, `aria-controls` และ roving `tabIndex`
4. ฝั่งสินค้าแยก Net Weight, ยาว, กว้าง และสูง พร้อม suffix `kg/cm`
5. ฝั่งกล่องแยก Gross Weight, ยาว, กว้าง และสูง พร้อม suffix `kg/cm`
6. ทุกค่าจำกัด `0–100,000`; น้ำหนักละเอียด 0.001 และขนาดละเอียด 0.1
7. ตรวจ Gross Weight ว่าต้องไม่น้อยกว่า Net Weight
8. ตรวจยาว/กว้าง/สูงของกล่องว่าต้องไม่น้อยกว่าตัวสินค้า
9. Validation ทำงานระหว่างกรอกและตรวจซ้ำก่อนเรียก Atomic command; เมื่อผิดจะเปิด Tab กล่องและบล็อก submit
10. เพิ่มคำอธิบายขอบเขตขนาดสินค้าและ Packaging Level ตาม Mockup พร้อม responsive tab layout

## Contract Boundary

- Command ยังเป็น `product.create_with_initial_sku` เพียงคำสั่งเดียว
- Payload เดิมยังส่ง `product_weight_kg`, `product_length_cm`, `product_width_cm`, `product_height_cm`, `package_weight_kg`, `package_length_cm`, `package_width_cm` และ `package_height_cm`
- Cross-field validation รอบนี้เป็น Client Form guard เพื่อให้ตรง Mockup; Database contract เดิมยังคงตรวจ non-negative และยังไม่ได้เพิ่ม cross-field constraint
- ไม่มีการแก้ Supabase schema, migration, RLS, permission, Packaging หรือ Stock
- Client component ยังไม่เป็น async และไม่มี non-serializable prop ข้าม Server/Client boundary

## Boundary ที่ยังไม่ทำ

- ไม่ทำ Section 6 หน่วยบรรจุและ Bundle หรือ Section ถัดไป
- ไม่เพิ่ม Shipping rate, volumetric weight หรือ automatic box recommendation
- ไม่เพิ่ม Physical profile แยกต่อ Packaging Level
- ไม่ commit, push หรือ deploy

## Verification

- R7.2.3E Physical Components targeted: **6/6 ผ่าน**
- Product R2–R7.2.3E regression: **73/73 ผ่าน**
- TypeScript: ผ่านด้วย `tsc --noEmit --incremental false`
- แก้ regression test ของ R7.2.3D ให้ตรวจ suffix เฉพาะ Section 4 หลัง Section 5 เพิ่ม suffix ตาม Mockup; ไม่มี UI change จากการแก้ test
- Node test runner ยังแสดง `MODULE_TYPELESS_PACKAGE_JSON` warning เดิม แต่ไม่มี test failure
- Browser control ไม่ได้ใช้ในรอบนี้ จึงรอ Owner visual review บน Route จริง

## Next Gate

Owner ตรวจ Section 5 ใน Light/Dark และ Mobile โดยสลับ Tabs, กรอก Net/Gross และทดลองให้ขนาดกล่องเล็กกว่าสินค้า หากอนุมัติจึงเริ่ม **R7.2.3F — Section 6 หน่วยบรรจุและ Bundle (Diff E-03–E-04)** แยกเป็น Part ถัดไป

Owner อนุมัติให้เริ่ม R7.2.3F แล้วเมื่อ 15 สิงหาคม 2026 จึงถือว่า Section 5 ผ่าน Gate นี้

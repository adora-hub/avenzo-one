# AVENZO ONE — Phase 2.1.R7.2.3G Inventory Form Components

วันที่: 15 สิงหาคม 2026

สถานะ: **Owner Approved / Completed**

## Scope

รอบนี้ทำเฉพาะ Section 7 `สาขาและนโยบายสต๊อก` ตาม Approved Mockup และ Visual Parity Audit Diff E-05–E-06 ในระดับ **Form Components** เท่านั้น ไม่เริ่ม Section 8 และไม่เพิ่ม Branch sales-scope, Inventory Balance หรือ Stock Movement command

## Outcome

1. Heading และคำอธิบายตรง Approved Mockup พร้อมสถานะ `Inventory Policy`
2. เปลี่ยน Branch read-only chips เป็น checkbox cards สำหรับทดลองเลือกสาขาที่เปิดขาย
3. สาขาที่เลือกสะท้อนใน Summary และ Browser Draft ของ Organization
4. แสดง `กันสต๊อกสินค้า (Safety Stock)`, `จำนวน Min ในการเติม` และ `จำนวน Max ในการเติม` พร้อมขอบเขตตัวเลข
5. ตรวจ Cross-field ว่า Min ไม่น้อยกว่า Safety Stock และ Max ไม่น้อยกว่า Min ทั้งระหว่างกรอกและก่อน submit
6. แสดง `จำนวนที่ใช้ได้` เป็น read-only derived value โดยไม่ส่งเป็น payload
7. แสดงคำเตือนว่า Reserved/Allocated จาก Order เป็น Transaction คนละส่วนกับ Safety Stock
8. Responsive layout เปลี่ยน Branch cards และ Inventory fields เป็นหนึ่งคอลัมน์บนหน้าจอแคบ

## Contract Boundary

- Command ยังคงเป็น `product.create_with_initial_sku` คำสั่งเดียว
- R7.1 รองรับเฉพาะ `safety_stock`, `reorder_min` และ `reorder_max` ของ policy metadata
- Available เป็น derived value และไม่มี field ใน payload
- การเลือกสาขาเก็บเฉพาะ Browser Draft เพื่อทดสอบ UI; R7.1 ยังไม่มี Branch sales-scope contract จึงไม่ส่งข้อมูลปลอมเข้า Backend
- On hand, Available, Reserved และ Allocated ต้องมาจาก Inventory/Order transaction ที่มี Authority ของตนเอง
- ไม่มี direct Stock write, Inventory Balance mutation, Supabase migration หรือ permission change
- Client component ยังไม่เป็น async และ Server ส่งเฉพาะ plain serializable branch objects

## Boundary ที่ยังไม่ทำ

- ไม่ทำ Section 8 ข้อมูลระบบ หรือ Section ถัดไป
- ไม่ persist สาขาที่เปิดขายจนกว่าจะมี Branch sales-scope contract ที่ผ่าน Domain/Data/Security gate
- ไม่เพิ่ม Order allocation/reservation workflow
- ไม่ commit, push หรือ deploy

## Verification

- R7.2.3G Inventory Components targeted: **6/6 ผ่าน**
- Product R2–R7.2.3G regression: **86/86 ผ่าน**
- TypeScript: ผ่านด้วย `tsc --noEmit --incremental false`
- Node test runner ยังแสดง `MODULE_TYPELESS_PACKAGE_JSON` warning เดิม แต่ไม่มี test failure
- Browser control ไม่ได้ใช้ในรอบนี้ จึงรอ Owner visual review บน Route จริง

## Next Gate

Owner ตรวจ Section 7 ใน Light/Dark และ Mobile โดยเลือก/ยกเลิกสาขา, กรอก Safety/Min/Max ทั้งค่าที่ถูกและผิด และยืนยันว่า Available แก้ไขไม่ได้ หากอนุมัติจึงเริ่ม **R7.2.3H — Section 8 ข้อมูลระบบ (Diff E-07–E-08)** แยกเป็น Part ถัดไป

Owner อนุมัติให้เริ่ม R7.2.3H แล้วเมื่อ 15 สิงหาคม 2026 จึงถือว่า Section 7 ผ่าน Gate นี้

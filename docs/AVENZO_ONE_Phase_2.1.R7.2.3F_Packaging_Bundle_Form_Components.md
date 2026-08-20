# AVENZO ONE — Phase 2.1.R7.2.3F Packaging & Bundle Form Components

วันที่: 15 สิงหาคม 2026

สถานะ: **Owner Approved / Completed**

## Scope

รอบนี้ทำเฉพาะ Section 6 `หน่วยบรรจุและ Bundle` ตาม Approved Mockup และ Visual Parity Audit Diff E-03–E-04 ในระดับ **Form Components** เท่านั้น ไม่เริ่ม Section 7 และไม่เพิ่ม Schema, Assembly หรือ Stock command

## Outcome

1. Heading เปลี่ยนเป็น `หน่วยบรรจุและ Bundle` พร้อมคำอธิบายว่าการตัด Stock ต้อง resolve กลับเป็น Component SKU
2. เพิ่ม Switch `ขายหลายหน่วยบรรจุ` เพื่อเปิด/ปิด Packaging editor
3. Packaging table มี Base row และรองรับหลาย Sell Unit พร้อมชื่อ, Unit Code, ตัวคูณ, Conversion preview และ Barcode
4. เพิ่ม Presets `คู่ ×2`, `แพ็ค ×6`, `กล่อง ×12`, `ลัง ×24` และ `กำหนดเอง`
5. Sell Units ที่รองรับถูกส่งเป็นหลายรายการใน `sell_units` ของ R7.1 Atomic payload
6. แสดงคอลัมน์ Sales Code และราคาขายตาม Mockup แต่ล็อกเป็น `Future contract` เพราะ R7.1 ยังไม่มีสอง field นี้ต่อ Sell Unit
7. เมื่อ Product เป็น Bundle แสดง selector `Virtual / Pre-assembled`, Bundle SKU read-only และ Component table หลายรายการ
8. Bundle Components ที่รองรับถูกส่งเป็นหลายรายการใน `bundle_components` ของ R7.1 Atomic payload
9. Virtual Bundle อธิบายว่าตัด Component ตอนขาย; Pre-assembled แสดงคำเตือนและบล็อก submit เพราะยังต้องมี Assembly Command
10. ตรวจ Sell Unit name/code, factor > 1, factor จำนวนเต็มสำหรับ discrete, Unit Code/Barcode ซ้ำ และตรวจ Bundle อย่างน้อย 2 Components, SKU ไม่ซ้ำ, quantity > 0
11. Packaging/Bundle state ถูกเก็บและ sanitize ใน Browser Draft เดิม
12. ตารางมี horizontal overflow ภายใน ไม่ทำให้หน้าแตกบนหน้าจอแคบ

## Contract Boundary

- Command ยังคงเป็น `product.create_with_initial_sku` คำสั่งเดียว
- R7.1 รองรับ `sell_units` เฉพาะ `unit_code`, `name`, `base_quantity`, `barcode`
- R7.1 รองรับ `bundle_components` เฉพาะ `sku_id`, `quantity`
- Sales Code/ราคาต่อ Sell Unit และ Bundle stock mode ยังไม่ถูก persist; UI ระบุขอบเขตและไม่ส่งข้อมูลปลอม
- Pre-assembled ถูกบล็อกจนกว่าจะมี Assembly Command ที่ลด Component และเพิ่ม Stock ของ Bundle อย่างถูกต้อง
- ไม่มี direct Stock write, `sku.sell_units.replace`, `sku.bundle.replace`, Supabase migration หรือ permission change
- Client component ยังไม่เป็น async และไม่มี non-serializable prop ข้าม Server/Client boundary

## Boundary ที่ยังไม่ทำ

- ไม่ทำ Section 7 สาขา/Inventory Policy หรือ Section ถัดไป
- ไม่เพิ่ม Sales Code/ราคาแยกต่อ Sell Unit ใน Database
- ไม่เพิ่ม Assembly/Disassembly command หรือ Stock ของ Pre-assembled Bundle
- ไม่ commit, push หรือ deploy

## Verification

- R7.2.3F Packaging & Bundle Components targeted: **7/7 ผ่าน**
- Product R2–R7.2.3F regression: **80/80 ผ่าน**
- TypeScript: ผ่านด้วย `tsc --noEmit --incremental false`
- Node test runner ยังแสดง `MODULE_TYPELESS_PACKAGE_JSON` warning เดิม แต่ไม่มี test failure
- Browser control ไม่ได้ใช้ในรอบนี้ จึงรอ Owner visual review บน Route จริง

## Next Gate

Owner ตรวจ Section 6 ใน Light/Dark และ Mobile โดยเปิด Switch, เพิ่มหลาย Presets, ลบแถว, เลือก Bundle, เพิ่มอย่างน้อย 2 Components และลอง Pre-assembled warning หากอนุมัติจึงเริ่ม **R7.2.3G — Section 7 สาขาและสต๊อก (Diff E-05–E-06)** แยกเป็น Part ถัดไป

Owner อนุมัติให้เริ่ม R7.2.3G แล้วเมื่อ 15 สิงหาคม 2026 จึงถือว่า Section 6 ผ่าน Gate นี้

# AVENZO ONE — Phase 2.1.R7.2.3D Pricing & Tax Form Components

วันที่: 15 สิงหาคม 2026

สถานะ: **Owner Approved / Completed Locally**

## Scope

รอบนี้ทำเฉพาะ Section 4 `ราคาและภาษี` ตาม Approved Mockup และ Visual Parity Audit Diff E-01 ในระดับ **Form Components** เท่านั้น ไม่เริ่ม Section 5, ไม่เปลี่ยน R7.1 Atomic command และไม่ขยาย Tax/Invoice domain contract

## Outcome

1. Heading และคำอธิบายตรง Mockup: ราคานี้เป็น Default price ของ SKU แรก ไม่ใช่ราคาทุกสาขาตลอดไป
2. Pricing layout ใช้ 3 ช่องหลัก: ราคาขาย, ราคาต้นทุน และอัตราภาษี
3. ราคาขายเป็นช่องบังคับ มี Information guide, ช่วง `0–999,999,999.99`, ทศนิยม 2 ตำแหน่ง และ suffix `THB`
4. ราคาต้นทุนใช้ข้อจำกัดตัวเลขเดียวกัน พร้อมข้อความว่าข้อมูลจำกัดสิทธิ์และไม่ใช่ต้นทุนบัญชีจริง
5. Tax Category แสดง `VAT 7%`, `อัตรา 0%` และ `ยกเว้นภาษี` ตาม Mockup
6. UI ไม่ให้ผู้ใช้กรอก Tax rate แยกเอง; ระบบ map `standard → 7` และ `zero/exempt → 0` เข้าสู่ R7.1 command เดิมอัตโนมัติ
7. เพิ่มตัวเลือก `ราคาขายรวมภาษีแล้ว` และคำอธิบาย Tax snapshot ของ Invoice ตาม Mockup
8. Tax Category ถูกเก็บใน Browser Draft เดิม และ layout ลดเหลือหนึ่งคอลัมน์บน Mobile

## Contract Boundary

- Command ยังเป็น `product.create_with_initial_sku` เพียงคำสั่งเดียว
- Payload เดิมยังส่ง `sale_price`, `cost_price`, `currency_code`, `tax_category` และ `tax_rate`
- `taxInclusive` เป็น Form Component ตาม Mockup ใน Part นี้ แต่ R7.1 schema ยังไม่มี `tax_inclusive`; จึงยังไม่ persist ค่านี้และไม่กล่าวอ้างว่า Invoice behavior ถูกเปลี่ยน
- Cost profile ยังคงแยกจาก read model ปกติและอยู่ภายใต้ permission เดิม
- ไม่มีการแก้ Supabase schema, migration, RLS, permission, Invoice หรือ Stock

## Boundary ที่ยังไม่ทำ

- ไม่ทำ Section 5 น้ำหนักและขนาดหรือ Section ถัดไป
- ไม่ทำ Price Book, ราคาตามสาขา/ช่องทาง/ช่วงเวลา หรือ Tax engine เพิ่ม
- ไม่เปลี่ยน Server/Client boundary หรือส่ง prop ที่ serialize ไม่ได้
- ไม่ commit, push หรือ deploy

## Verification

- R7.2.3D Pricing Components targeted: **5/5 ผ่าน**
- Product R2–R7.2.3D regression: **67/67 ผ่าน**
- TypeScript: ผ่านด้วย `tsc --noEmit --incremental false`
- Node test runner ยังแสดง `MODULE_TYPELESS_PACKAGE_JSON` warning เดิม แต่ไม่มี test failure และไม่เกี่ยวกับ Section 4
- Browser control ไม่ได้ใช้ในรอบนี้ จึงรอ Owner visual review บน Route จริง

## Next Gate

Owner ตรวจ Section 4 ใน Light/Dark โดยดู 3 ช่องหลัก, suffix THB, Select, Tax-inclusive choice และ Mobile layout หากอนุมัติจึงเริ่ม **R7.2.3E — Section 5 น้ำหนักและขนาด (Diff E-02)** แยกเป็น Part ถัดไป

Owner อนุมัติให้เริ่ม R7.2.3E แล้วเมื่อ 15 สิงหาคม 2026 จึงถือว่า Section 4 ผ่าน Gate นี้

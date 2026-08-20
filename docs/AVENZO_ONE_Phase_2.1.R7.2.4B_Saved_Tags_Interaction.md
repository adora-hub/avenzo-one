# AVENZO ONE — Phase 2.1.R7.2.4B Saved Tags Interaction

วันที่: 15 สิงหาคม 2026

สถานะ: **Owner Approved / Completed**

## Scope

รอบนี้ทำเฉพาะ Saved Tags Interaction ใน Unified Product Creation Form ตาม Approved Mockup: เมนูด่วนแบบ Hover/Focus/Click, Modal ค้นหาและเลือกหลาย Tag, การสร้าง Tag ใหม่จากผลค้นหา และ Dialog จัดการ Tag master ไม่เริ่ม Identifier assistant, SKU staging, Validation summary หรือ Success/Recovery interaction

## Outcome

1. ปุ่ม `เลือก Tags ที่บันทึกไว้` เปิดเมนูด่วนด้วย Hover, Focus หรือ Click และใช้ Keyboard ได้
2. เมนูด่วนแบ่งเป็น `ปักหมุด`, `ใช้ล่าสุด` และ `ใช้บ่อย` พร้อมทางเข้า `ค้นหาและดู Tags ทั้งหมด...`
3. Modal รายการทั้งหมดรองรับ Search, Multi-select, Empty state, Selected count และจำกัดสูงสุด 12 Tags
4. หากไม่พบชื่อที่ค้นหา ผู้มีสิทธิ์ `product.manage` สามารถสร้างและเลือก Tag นั้นได้จาก Modal
5. ไอคอนดินสอใช้ Dialog ร่วมกับ Master Data Manager สำหรับเพิ่ม เปลี่ยนชื่อ หรือเก็บ Tag ที่ไม่ใช้แล้ว
6. Archived Tag ไม่ปรากฏใน Picker และถูกนำออกจากค่าที่เลือกหากถูกเก็บถาวร
7. Modal และ Dialog รองรับ Escape, Focus trap, คืน Focus ไปยัง Trigger และล็อก Body scroll
8. หน้าจอแสดง Empty state ที่ชัดเจนเมื่อ Organization ยังไม่มี Saved Tags

## Contract Boundary

- Tag master เป็นข้อมูลระดับ Organization และทุก Mutation ใช้ trusted command `product.master.upsert`; Browser ไม่เขียน Supabase โดยตรง
- Product creation ยังคงส่ง `tag_ids` ผ่าน `product.create_with_initial_sku` ตาม R7.1 contract เดิม
- เลือกได้เฉพาะ Active Tag; Archived Tag ใช้ดูประวัติใน Manager เท่านั้น
- จำนวน Tag ต่อ Product จำกัดสูงสุด 12 ทั้ง Interaction และ Command boundary
- `ใช้ล่าสุด` เป็น UI preference เฉพาะ Browser ปัจจุบัน แยกตาม Organization และเก็บสูงสุด 5 ID; ไม่อ้างว่าเป็นข้อมูลร่วมข้ามอุปกรณ์
- ไม่มี Schema, RLS, RPC, Inventory หรือ Atomic Product Creation contract ใหม่ใน Part นี้

## Safety

- กรณีเลือกครบ 12 Tags ระบบหยุดก่อนเรียกคำสั่งสร้าง Tag ใหม่ จึงไม่สร้าง Master ที่ไม่ได้ถูกเลือก
- Search/Create input ตัด Control characters, Trim และจำกัด 40 ตัวอักษรตาม Approved Mockup
- Dialog จัดการ Tag ใช้ Versioned update และ Duplicate guard เดียวกับ R7.2.4A
- Browser verification ไม่กดสร้างหรือบันทึก จึงไม่มีข้อมูลทดสอบถูกเขียนลงระบบ

## Verification

- R7.2.4B targeted interaction: **8/8 ผ่าน**
- Product R2–R7.2.4B regression: **107/107 ผ่าน**
- TypeScript: ผ่านด้วย `tsc --noEmit --incremental false`
- Authenticated Chrome Desktop Light: Quick menu, Empty state, Search modal, Create preview, Escape close, Focus restoration และ Tag manager ผ่าน โดยไม่ส่งคำสั่ง Mutation
- Node test runner ยังรายงาน `MODULE_TYPELESS_PACKAGE_JSON` warning เดิม ซึ่งไม่ใช่ Functional failure ของ Part นี้
- Dark Mode, Mobile และ Owner visual comparison ยังรอตรวจบน Route จริง

## Boundary ที่ยังไม่ทำ

- ไม่ทำ Identifier assistant, SKU staging, Validation summary หรือ Success/Recovery interaction
- ไม่เปลี่ยน Mockup, Schema, Permission, Inventory rule หรือ Image pipeline
- ไม่ commit, push หรือ deploy

## Owner Approval

Owner อนุมัติ R7.2.4B เมื่อวันที่ 15 สิงหาคม 2026 โดยยืนยัน Saved Tags Interaction ตาม Approved Mockup ต่อมา Owner อนุมัติเริ่ม **R7.2.4C — Identifier Assistant Interaction** แยกแล้ว; รายละเอียดผล R7.2.4C บันทึกในเอกสาร Part ของตัวเองและไม่เปลี่ยน Scope/ผลอนุมัติของ Part B

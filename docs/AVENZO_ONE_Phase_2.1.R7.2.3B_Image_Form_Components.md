# AVENZO ONE — Phase 2.1.R7.2.3B Image Form Components

วันที่: 15 สิงหาคม 2026

สถานะ: **Implemented Locally / Awaiting Owner Visual Review**

## Scope

รอบนี้ทำเฉพาะ Section 2 `รูปสินค้า` ตาม Approved Mockup และ Visual Parity Audit Diff C-01–C-04 เท่านั้น โดยหยุดรอ Owner ตรวจ ไม่เริ่ม Section 3, R7.2.4 Interaction Parity หรือ R7.3

## Outcome

1. Header แสดงจำนวนรูปจริง `0 / 9 ภาพ` และอัปเดตตามไฟล์ที่เลือก
2. เปลี่ยน Dropzone เดี่ยวเป็น Toolbar `เลือกภาพจากเครื่อง` พร้อมข้อความว่าภาพแรกเป็นภาพปก
3. เพิ่ม Image grid 4 คอลัมน์บน Desktop และ 2 คอลัมน์บนจอไม่เกิน 760px
4. Empty state และ Preview ใช้อัตราส่วน 1:1 พร้อมชื่อไฟล์และป้าย `ภาพปก`
5. แต่ละภาพเลื่อนไปซ้าย/ขวา, ตั้งเป็นภาพปก และลบได้ตาม Approved Mockup
6. แสดง policy: JPEG/PNG/WebP, ไม่เกิน 5 MB ต่อภาพ และแนะนำ 1200 × 1200 px
7. เพิ่ม live upload status สำหรับเลือกไฟล์, อัปโหลดสำเร็จ และอัปโหลดล้มเหลว
8. ใช้ `next/image` สำหรับ Preview โดยระบุ dimensions/sizes และใช้ `unoptimized` เฉพาะ Blob URL ในเครื่อง
9. ไม่มีปุ่ม Prototype-only `เพิ่มภาพจำลอง` ในระบบจริง
10. คง R6 lifecycle `prepare → authenticated upload → finalize → reorder`, validation, cleanup compensation และ private Storage boundary เดิม

## Boundary ที่ยังไม่ทำในรอบนี้

- ยังไม่ทำ Section 3 `SKU แรกและรหัสสินค้า` หรือ Section ถัดไป
- ไม่เปลี่ยน Supabase schema, Storage bucket/policy, command contract หรือ permission
- ไม่สร้าง Product/SKU/Stock และไม่กด submit ระหว่างงานรอบนี้
- ไม่ commit, push หรือ deploy

## Verification

- R7.2.3B Image Components targeted: **5/5 ผ่าน**
- Product R1–R7.2.3B regression: **60/60 ผ่าน**
- TypeScript: ผ่านด้วย `tsc --noEmit --incremental false`
- `git diff --check`: ไม่มี whitespace error; มีเฉพาะคำเตือน line-ending เดิมของ worktree
- Browser control และ local `agent-browser` ไม่พร้อมในรอบนี้ จึงไม่บันทึกสถานะ authenticated visual QA ว่าผ่าน; ต้องให้ Owner ตรวจ Route จริงก่อนเริ่ม Part ถัดไป

Node test runner ยังแสดง `MODULE_TYPELESS_PACKAGE_JSON` warning เดิมจากไฟล์ TypeScript บางชุด แต่ไม่มี test failure และไม่เกี่ยวกับ R7.2.3B UI

## Next Gate

Owner reload และตรวจ Section 2 บน Route `/organizations/[id]/products/new` ใน Light/Dark โดยทดสอบเลือกภาพจริง 2–3 ภาพ, ตั้งภาพปก, เลื่อนลำดับ และลบ หากอนุมัติจึงเริ่ม **R7.2.3C — Section 3 SKU แรกและรหัสสินค้า (Diff D-01 เป็นต้นไป)** เป็น Part แยก ห้ามทำหลาย Section พร้อมกัน

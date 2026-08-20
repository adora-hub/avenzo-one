# AVENZO ONE — Phase 2.1.R7.2.3H Metadata & Security Form Components

วันที่: 15 สิงหาคม 2026

สถานะ: **Owner Approved / Completed**

## Scope

รอบนี้ทำเฉพาะ Section 8 `ข้อมูลระบบ` ตาม Approved Mockup และ Visual Parity Audit Diff E-07–E-08 ในระดับ **Form Components** เท่านั้น ไม่เริ่ม R7.2.4 Interaction Parity และไม่เปลี่ยน Schema, Command, Permission หรือ Image pipeline

## Outcome

1. Heading ใช้คำอธิบาย `ระบบสร้างอัตโนมัติและแสดงแบบอ่านอย่างเดียวหลังบันทึก` และสถานะ `Read-only`
2. Metadata แสดง 3 รายการตาม Mockup: วันที่สร้าง, แก้ไขล่าสุด และผู้สร้าง
3. วันที่สร้าง/แก้ไขล่าสุดระบุ `กำหนดหลังบันทึก`; ผู้สร้างใช้ Email จาก authenticated Server page
4. เพิ่มการ์ด `Validation & Security Guardrails` พร้อม Plain text/Normalize/length, Code allowlist, numeric bounds/cross-field, Browser Draft และ Session authority
5. Browser Draft จำกัดจริงไม่เกิน 256 KB ด้วย UTF-8 byte count และยังไม่เก็บไฟล์ภาพ
6. เปิดเผยสถานะ Image Gate ตามจริงว่า MIME/size มีแล้ว แต่ Magic bytes, Decode/Re-encode และ Strip EXIF ยังเป็น Known gap ก่อน Production hardening
7. Metadata ใช้ 3 คอลัมน์และ Security list ใช้ 2 คอลัมน์บน Desktop ก่อนยุบเป็น 1 คอลัมน์บน Mobile

## Contract Boundary

- Metadata ทั้งหมดเป็น read-only; Form ไม่รับ Created/Updated/Creator จากผู้ใช้
- Organization, Actor และ Permission มาจาก Session ฝั่ง Server
- Server page ส่ง `organizationName` และ `actorEmail` เป็น string ซึ่ง serialize ข้าม RSC boundary ได้
- Browser Draft cap เป็น Client guard เพิ่มเติม; Server command validation ยังเป็น Authority
- Image pipeline ปัจจุบันตรวจ MIME และขนาด แต่ยังไม่อ้างว่าได้ตรวจ Magic bytes หรือ Strip EXIF
- Command ยังคงเป็น `product.create_with_initial_sku`; ไม่มี Schema, Supabase migration หรือ permission change

## Boundary ที่ยังไม่ทำ

- ไม่ทำ R7.2.4 Interaction Parity, R7.2.5 Visual Verification หรือ R7.2.6 Owner Approval
- ไม่เพิ่ม image content decoding/re-encoding ใน Part นี้
- ไม่ commit, push หรือ deploy

## Verification

- R7.2.3H Metadata & Security Components targeted: **6/6 ผ่าน**
- Product R2–R7.2.3H regression: **92/92 ผ่าน**
- TypeScript: ผ่านด้วย `tsc --noEmit --incremental false`
- Node test runner ยังแสดง `MODULE_TYPELESS_PACKAGE_JSON` warning เดิม แต่ไม่มี test failure
- Browser control ไม่ได้ใช้ในรอบนี้ จึงรอ Owner visual review บน Route จริง

## Next Gate

Owner อนุมัติ Section 8 และอนุมัติให้เริ่ม **R7.2.4 — Interaction Parity** เมื่อ 15 สิงหาคม 2026 โดยยังคงแบ่งทำทีละ interaction ตาม Gap Freeze ส่วนแรกคือ **R7.2.4A — Context Master Data Interaction** สำหรับหมวดหมู่และแบรนด์

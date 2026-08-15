# AVENZO ONE — Phase 2.1.R7.2.4A Context Master Data Interaction

วันที่: 15 สิงหาคม 2026

สถานะ: **Owner Approved / Completed**

## Scope

รอบนี้ทำเฉพาะ Interaction สำหรับจัดการ `หมวดหมู่` และ `แบรนด์` จาก Unified Product Creation Form ตาม Approved Mockup ไม่เริ่ม Saved Tags, Identifier assistant, SKU staging, Validation summary หรือ Success/Recovery interaction

## Outcome

1. ปุ่มแก้ไขของหมวดหมู่และแบรนด์เปิด Dialog ที่เข้าถึงได้ด้วย Keyboard
2. ค้นหารายการเดิมได้จากชื่อ
3. เปลี่ยนชื่อรายการเดิมแบบ Inline ได้
4. เลือกเก็บถาวรและยกเลิกก่อนบันทึกได้
5. เพิ่มหลายรายการด้วย Comma หรือขึ้นบรรทัดใหม่ได้ สูงสุด 20 รายการต่อครั้ง
6. ตรวจชื่อซ้ำกับรายการที่ยังใช้งานก่อนส่งคำสั่ง
7. รายการที่เก็บถาวรแล้วแสดงเป็น Read-only และไม่ปรากฏใน Category/Brand selector
8. รองรับ Escape, Focus trap, คืน Focus กลับ Trigger และล็อก Body scroll ขณะ Dialog เปิด
9. แสดงข้อผิดพลาดแบบคงข้อมูลรายการที่บันทึกสำเร็จแล้ว เพื่อให้ผู้ใช้แก้รายการที่เหลือและลองใหม่ได้

## Contract Boundary

- ทุก Mutation ใช้ trusted command `product.master.upsert`; UI ไม่เขียน Supabase โดยตรง
- รายการเดิมส่ง `master_id` และ `expected_version` เพื่อป้องกัน Lost update
- คำสั่งแต่ละรายการมี Command ID แยกเพื่อรักษา Idempotency
- Archived master เป็น Immutable ตาม Database contract จึงไม่แสดงคำสั่งเปิดใช้งานอีกครั้ง
- Server page อ่าน Category/Brand ทั้ง Active และ Archived เพื่อให้ Dialog แสดงประวัติได้ แต่ Selector ใช้เฉพาะ Active
- Permission, Organization และ Actor ยังคงมาจาก Session/Server boundary เดิม

## Boundary ที่ยังไม่ทำ

- ไม่ทำ R7.2.4B Saved Tags Interaction หรือ Interaction ส่วนถัดไป
- ไม่เปลี่ยน Schema, RLS, RPC หรือ Atomic Product Creation command
- ไม่ commit, push หรือ deploy

## Verification

- R7.2.4A targeted interaction: **7/7 ผ่าน**
- Product R2–R7.2.4A regression: **99/99 ผ่าน**
- TypeScript: ผ่านด้วย `tsc --noEmit --incremental false`
- Authenticated Chrome Desktop Light: Category/Brand Dialog, Bulk add 2 รายการ, ไม่มี Stale error, Escape close, Focus trap และ Focus restoration ผ่าน โดยยกเลิกข้อมูลทดลองและไม่ส่งคำสั่งบันทึก
- Dark Mode และ Mobile ยังรอ Owner visual review บน Route จริง

## Owner Approval

Owner อนุมัติ R7.2.4A เมื่อวันที่ 15 สิงหาคม 2026 และอนุมัติให้เริ่ม **R7.2.4B — Saved Tags Interaction** เป็น Part ถัดไปเพียง Part เดียว โดยยังคงกฎ Approved Mockup เป็น Source of Truth และห้ามรวม Interaction ส่วนถัดไปพร้อมกัน

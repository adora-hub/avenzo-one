# AVENZO ONE — Phase 2.1.R7.2.4F Success & Recovery Interaction

วันที่: 15 สิงหาคม 2026

สถานะ: **Implemented Locally / Owner Approved for Sequential Execution**

Recovery Contract Amendment: **Owner Approved — 20 สิงหาคม 2026 / Pending current Gate 1 evidence**

## Outcome

R7.2.4F ทำเฉพาะ Success และ Partial-image Recovery ตาม Approved Mockup/Production contract โดยไม่เริ่ม Visual Parity Matrix หรือสร้างข้อมูลทดสอบ

- Success dialog เปิดหลัง Atomic Product/SKU, การ resolve รูปที่เลือก และ Backend workflow สำเร็จเท่านั้น; Recovery สามารถ resolve เป็นไม่มีรูปได้
- Dialog แสดงชื่อสินค้า, จำนวน SKU, สถานะฉบับร่าง และบอกชัดว่ายังไม่เพิ่ม Stock
- มีทางไป Product ที่สร้างและกลับ Products Workspace
- รองรับ Focus trap, Escape, Backdrop close, Body scroll lock และคืน Focus
- Pending recovery ถูก Validate ก่อน Restore: UUID, bounded Product name, control characters และ timestamp
- เมื่อ Image ล้มเหลว ระบบเก็บ Product ID/SKU ID เดิมและไม่เรียก Atomic creation ซ้ำ
- Recovery banner แสดงสถานะ, เวลาบันทึก, ปุ่มเลือกภาพใหม่ และเปิด Product Draft
- Recovery validation ตรวจเฉพาะไฟล์ภาพใหม่ ไม่บังคับให้กรอก/ตรวจ Identifier เดิมซ้ำ และไม่บังคับเลือกภาพใหม่เมื่อผู้ใช้ต้องการจบโดยไม่มีรูป
- หากยังมีไฟล์สถานะ `failed` ต้องบล็อกจนผู้ใช้เปลี่ยนหรือนำไฟล์ที่ล้มเหลวออก
- ปุ่ม Recovery ที่ไม่มีไฟล์ใช้ข้อความ `เสร็จสิ้นโดยไม่มีรูป`
- Success message ใช้จำนวน UUID ใน durable `readyImageIdsByClientId` เป็นจำนวนรูปที่อัปโหลดสำเร็จจริง ไม่ใช้จำนวนไฟล์ใน UI state

## Safety Boundary

1. `product.create_with_initial_sku` ทำงานเฉพาะเมื่อยังไม่มี Pending recovery
2. Image retry ใช้ `recovery.productId` เดิม
3. Pending recovery ไม่ถูกลบจน Image retry สำเร็จหรือผู้ใช้ยืนยันจบโดยไม่มีรูป และ Initial Stock workflow เดิมคืนผลสำเร็จ
4. Invalid local recovery record ถูกลบทิ้งจาก Browser ก่อนใช้งาน
5. Success UI ไม่สื่อว่าสินค้า Active หรือมี Stock
6. ไม่มี Inventory command และไม่เปลี่ยน Stock authority
7. Retry ใช้ Product ID, Workflow ID, activation Command IDs และ Batch idempotency key เดิมเสมอ ห้ามสร้าง Product, SKU หรือ Stock ซ้ำ

## Recovery Acceptance Matrix — Owner Decision 20 สิงหาคม 2026

| Case | Expected result |
|---|---|
| Retry พร้อมรูปใหม่ | ใช้ Product/Workflow/Command/Batch keys เดิม, อัปโหลดต่อ และนับรูปสำเร็จจาก durable recovery map |
| Finish ไม่มีรูป | ไม่มี empty-image validation error, ปุ่มแสดง `เสร็จสิ้นโดยไม่มีรูป`, ดำเนิน Initial Stock workflow เดิมต่อ |
| Partial image recovery | รูปที่สำเร็จแล้วคงอยู่ใน recovery map; ไฟล์ `failed` ยังบล็อก; เมื่อนำไฟล์ failed ออกจึง finish ได้โดยไม่สร้าง entity หรือ Stock ซ้ำ |
| Workflow failure/unknown outcome | คง Pending recovery และ identifiers เดิม; ห้ามแสดง Success หรือล้าง state |
| Workflow completed | ล้าง Pending recovery แล้วแสดงจำนวนรูปสำเร็จจริงและสถานะ Initial Stock จาก Backend authority |

## Verification

- R7.2.4F targeted interaction: **10/10 ผ่าน**
- Product R1–R7.2.4F regression: **149/149 ผ่าน**
- TypeScript: ผ่านด้วย `tsc --noEmit --incremental false`
- Authenticated Route จริงโหลดโดยไม่มี Runtime overlay; Browser Draft ปัจจุบันไม่มี Pending recovery หรือ Success dialog ค้าง
- Full success/retry visual path ต้องตรวจพร้อม Controlled Preview record ใน R7.3 เพื่อไม่สร้างข้อมูลทดสอบนอก E2E Gate

Node แสดงเฉพาะ `MODULE_TYPELESS_PACKAGE_JSON` warning เดิมของ Test runner ซึ่งไม่ทำให้การทดสอบล้มเหลว

## Scope Boundary

- ไม่สร้าง Product/SKU/Image test record ใน Part นี้
- ไม่เริ่ม Side-by-side/Responsive Visual Matrix
- ไม่ apply Supabase Preview/Production
- ไม่ commit, push หรือ deploy

## Closure

R7.2.5 Visual Parity & Responsive QA และ R7.3 Creation Recovery & E2E Gate ปิดตามลำดับแล้ววันที่ 15 สิงหาคม 2026

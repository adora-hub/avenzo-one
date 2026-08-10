# AVENZO ONE — Phase 1.1.3.7.5.6 Shadow Executor Command Audit

## เป้าหมาย

เพิ่มชั้น Shadow Executor ระหว่าง Dry-run กับ Live Executor จริง เพื่อพิสูจน์ว่าระบบสามารถจอง Command ID, สร้าง Idempotency Key, ตรวจ Safety Gate และบันทึก Audit ได้ครบ โดยไม่เรียก Stripe Live API และไม่มีเงินจริงเคลื่อนย้าย

## ขอบเขตที่พัฒนา

- รับเฉพาะ Dry-run ที่ผ่านและยังไม่ถูกใช้
- Feature Flag ฝั่ง Server ต้องเป็น `STRIPE_LIVE_EXECUTOR_MODE=shadow`
- ตรวจ Platform Admin ที่ใช้งานอยู่และ MFA ระดับ AAL2
- ตรวจ Production Readiness, Two-person Approval, ผู้ทดสอบ, วงเงิน, Pilot และ Emergency Stop ซ้ำจาก Server
- จอง Command ID และ Idempotency Key รูปแบบ `avenzo-shadow:<command_uuid>`
- บันทึกผลเป็น `reserved` หรือ `blocked` ในตาราง Audit ที่แก้ไขและลบย้อนหลังไม่ได้
- บันทึก Snapshot ของ 6 ขั้น Executor เพื่อใช้ตรวจสอบใน Phase ถัดไป

## การป้องกันเงินจริง

- `real_charge` ถูกบังคับเป็น `false`
- `stripe_api_called` ถูกบังคับเป็น `false`
- `checkout_session_id` ถูกบังคับเป็น `null`
- Route นี้ไม่มีการ import หรือเรียก Stripe SDK
- Pilot ต้องปิดและ Emergency Stop ต้องเปิด

## ฐานข้อมูลและ RLS

ตาราง `billing_live_shadow_commands` เปิด RLS ผู้ใช้ทั่วไปเข้าถึงไม่ได้ ผู้ที่อ่านผ่านหน้า Platform Admin ต้องผ่านฟังก์ชันสิทธิ์ของระบบ ส่วนการสร้างรายการทำผ่าน Server ที่ตรวจ Authentication, Platform Admin และ AAL2 ก่อนทุกครั้ง

## วิธีทดสอบ Local

1. Login ด้วย Platform Admin และกรอกรหัส MFA
2. เปิด `/platform-admin/billing/live-control`
3. หากยังไม่มี Dry-run ที่ว่าง ให้สร้าง Dry-run ที่ผ่านจากส่วนทดลอง Checkout แบบควบคุม
4. ที่การ์ด **จองคำสั่งจำลองและบันทึก Audit** เลือก Dry-run และกรอกเหตุผลอย่างน้อย 10 ตัวอักษร
5. กด **ตรวจสอบก่อนจองคำสั่ง Shadow** แล้วตรวจยอด ผู้ทดสอบ และข้อความว่าไม่เรียก Stripe
6. กด **ยืนยันจองคำสั่ง Shadow**
7. ต้องพบรายการใหม่ใน **ประวัติคำสั่ง Shadow** และ Dry-run เดิมต้องไม่สามารถจองซ้ำ

## เกณฑ์ผ่าน

- คำสั่งถูกบันทึกเป็น `reserved` เมื่อ Safety Gate ครบ หรือ `blocked` เมื่อเงื่อนไขไม่ครบ
- การส่ง Command ID หรือ Dry-run เดิมซ้ำไม่สร้างรายการใหม่ซ้ำ
- ไม่มี Stripe Checkout Session, Payment Intent, Payment Attempt หรือเงินจริงเกิดขึ้น
- Audit ระบุผู้ดำเนินการ เหตุผล เวลา Checks และ Stage Snapshot ครบ

## สถานะ

Local test passed / ผู้ใช้ทดสอบผ่าน

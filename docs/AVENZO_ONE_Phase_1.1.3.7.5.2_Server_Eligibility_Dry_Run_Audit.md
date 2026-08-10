# AVENZO ONE — Phase 1.1.3.7.5.2 Server Eligibility & Dry-run Audit

## เป้าหมาย

ย้ายการตรวจ Controlled Live Checkout จากการคำนวณใน Browser ไปตรวจซ้ำที่ Server และบันทึกผลเป็น Audit ที่แก้ไขหรือลบย้อนหลังไม่ได้ โดยยังไม่สร้างธุรกรรมเงินจริง

## สิ่งที่พัฒนา

- API `POST /api/billing/stripe/live-eligibility` สำหรับ Platform Admin ที่ผ่าน MFA ระดับ AAL2
- ตรวจสถานะ Platform Admin ซ้ำทั้ง Route และ Server helper
- ตรวจ Production Readiness, คำอนุมัติสองคน, Tester Allowlist และ Snapshot ของ Policy
- ตรวจวงเงินต่อครั้ง จำนวนรายการสำเร็จ และยอดสะสมจากข้อมูล Production ที่มีอยู่
- ตรวจสถานะ Live Credentials โดยไม่ส่ง Secret ไป Browser
- บังคับ Environment Lock, Emergency Stop, Pilot ปิด และ Code Test-only
- บันทึก `billing_live_checkout_dry_runs` ด้วย `command_id` เพื่อรองรับ Idempotency
- แสดงประวัติ Dry-run 10 รายการล่าสุดในศูนย์ควบคุม

## ขอบเขตความปลอดภัย

- `real_charge` ถูกบังคับเป็น `false` ในฐานข้อมูล
- ไม่มีการ import หรือเรียก Stripe SDK ใน Route/Server helper นี้
- ไม่สร้าง Checkout Session หรือ Payment Intent
- ไม่แก้ Invoice, Payment, Subscription หรือ Safety State
- Browser ไม่มีสิทธิ์ INSERT/UPDATE/DELETE ตาราง Audit
- Audit แก้ไขหรือลบย้อนหลังไม่ได้

## วิธีทดสอบ Local

1. เปิด `/platform-admin/billing/live-control` ด้วย Platform Admin ที่ผ่าน MFA
2. ไปการ์ด `ทดลองตรวจ Checkout แบบควบคุม`
3. เลือกผู้ทดสอบ กรอกยอด และรหัสอ้างอิงอย่างน้อย 10 ตัว เช่น `LIVE-DRY-RUN-001`
4. กด `ตรวจสอบฝั่ง Server และบันทึก Dry-run`
5. ต้องเห็น Audit ID และข้อความยืนยันว่าไม่มีการสร้างรายการชำระเงินจริง
6. ส่วน `ประวัติการตรวจ Eligibility` ต้องมีรายการใหม่
7. หาก Live Credentials ยังไม่ครบ ผลควรเป็น `Dry-run ยังไม่ผ่าน` ซึ่งเป็นผลที่ปลอดภัยและถูกต้อง
8. ปุ่ม `สร้าง Live Checkout — ยังล็อก` ต้องกดไม่ได้เสมอ

## ขั้นต่อไป

Phase 1.1.3.7.5.3 จะเพิ่มการทดสอบ Contract/Abuse Cases ของ Server Eligibility เช่น ผู้ไม่มี AAL2, Tester ไม่ได้รับอนุญาต, ยอดเกินวงเงิน และ Command ซ้ำ โดยยังไม่เปิดรับเงินจริง

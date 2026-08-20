# AVENZO ONE — Phase 1.1.3.7.5.5 Executor Design & Feature Flag Specification

## เป้าหมาย

กำหนดสัญญาการทำงานของ Live Checkout Executor และ Feature Flag ก่อนเขียนโค้ดที่สามารถเรียก Stripe Live API โดย Phase นี้ยังไม่สร้าง Checkout Session, Payment Intent, Payment Attempt แบบ Production หรือรายการรับเงินจริง

## Feature Flag

- ชื่อ: `STRIPE_LIVE_EXECUTOR_MODE`
- ค่าเริ่มต้น: `disabled`
- ค่าที่อนุญาตใน Phase นี้:
  - `disabled` — ปิด Executor ทั้งหมด
  - `shadow` — ตรวจแบบและเงื่อนไขเท่านั้น ห้ามส่งคำสั่งไป Stripe
- ค่า `live`, `enabled`, `true`, `1` หรือค่าอื่น: ไม่อนุญาต ระบบรายงาน `blocked` และบังคับใช้ `disabled`
- Feature Flag เป็น Server-only และต้องไม่ใช้ตัวแปรที่ขึ้นต้น `NEXT_PUBLIC_`

## กติกาที่บังคับในโค้ด

1. `serverEnforcedBlock=true`
2. `realMoneyAllowed=false`
3. `stripeApiInvocationAllowed=false`
4. `checkoutEndpointExists=false`
5. ทุก Command ต้องมี Idempotency Key
6. Success URL ห้ามเปลี่ยน Invoice หรือ Subscription
7. การยืนยันการชำระต้องมาจาก Live Webhook ที่ตรวจลายเซ็นแล้วเท่านั้น
8. ต้องอ่าน Emergency Stop, Pilot Policy, Two-person Approval และ Release Gate ใหม่ทุกคำสั่ง ห้ามเชื่อผลจาก Browser

## ลำดับ Executor ที่วางแผนไว้

1. ตรวจ Authentication, Platform Admin, AAL2 และ Tester Allowlist
2. จอง Command ID และ Idempotency Key ในฐานข้อมูล
3. ตรวจ Release Gate, Approval Snapshot, วงเงินสะสม และ Kill Switch ซ้ำ
4. สร้าง Stripe Live Checkout Session ฝั่ง Server
5. บันทึก Payment Attempt แบบ `production` โดยยังไม่ถือว่าชำระแล้ว
6. รอ Live Webhook ที่ผ่าน Signature Verification เพื่อยืนยันผล

ทุกขั้นข้างต้นมีสถานะ `enabled=false` ใน Phase 1.1.3.7.5.5

## วิธีทดสอบ Local

1. เปิด `http://localhost:3000/platform-admin/billing/live-control`
2. Login ด้วย Platform Admin และผ่าน MFA ระดับ AAL2
3. เลื่อนไปที่ `ทบทวนแบบ Executor ก่อนเขียนระบบรับเงินจริง`
4. กด `ตรวจ Executor Design และ Feature Flag`
5. ต้องเห็นผลผ่าน 6 ข้อเมื่อ Environment Lock, Emergency Stop และ Pilot อยู่ในสถานะปลอดภัย
6. ต้องเห็น `เรียก Stripe Live API: ไม่อนุญาต`
7. ต้องเห็นลำดับงาน 6 ขั้นและทุกขั้นแสดง `ยังไม่เปิดใช้งาน`
8. รัน `npm.cmd run test:live-executor-design` ต้องผ่าน 4 ชุดทดสอบ

## ข้อจำกัด

- ไม่มีการ import หรือเรียก Stripe Live Client ใน Route ของ Phase นี้
- ไม่มี Migration ใหม่ เพราะยังไม่บันทึกคำสั่งเงินจริง
- ไม่มีปุ่มเปิด Feature Flag
- ไม่มีเงินจริงเคลื่อนย้าย

## ขั้นต่อไป

หลังผู้ใช้ทดสอบ Local ผ่าน จึงพิจารณา Commit, Push และ Deploy ตามคำสั่งแยก จากนั้นต้องอนุมัติ Phase ถัดไปก่อนสร้าง Shadow Executor ที่บันทึก Command Reservation/Audit โดยยังไม่เรียก Stripe Live API

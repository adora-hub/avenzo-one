# AVENZO ONE — Phase 1.1.3.7.5.3 Contract & Abuse-case Tests

## เป้าหมาย

พิสูจน์ว่า Server Eligibility ปฏิเสธคำสั่งที่ไม่ผ่านเงื่อนไข และรองรับ Command Idempotency ก่อนพัฒนา Live Checkout โดยยังไม่มีการรับเงินจริง

## กรณีที่ตรวจ

1. ไม่มี Session ได้ HTTP 401 และไม่มี Audit ใหม่
2. Platform Admin ที่ไม่ผ่าน MFA ระดับ AAL2 ถูกปฏิเสธด้วย HTTP 403
3. Tester ที่ไม่อยู่ใน Allowlist ได้ `tester_allowed=false`
4. ยอดเกินวงเงินต่อครั้งได้ `amount_within_limit=false`
5. Command ID เดิมที่ส่งซ้ำคืน Audit เดิมและมีเพียง 1 แถวในฐานข้อมูล

## ขอบเขตความปลอดภัย

- ชุดทดสอบเรียกเฉพาะ Server Dry-run helper
- ไม่มี Stripe SDK หรือ Stripe Live API ใน Route ทดสอบ
- ไม่สร้าง Checkout Session, Payment Intent, Invoice หรือ Payment
- Audit ทุกแถวถูกบังคับ `real_charge=false`
- Pilot ยังคงปิดและ Emergency Stop ยังคงทำงาน
- ผู้เรียกปุ่มทดสอบต้องเป็น Platform Admin ที่ใช้งานอยู่และผ่าน AAL2

## ผลทดสอบภายใน

- Automated Contract Tests ผ่าน 5/5
- TypeScript ผ่าน
- UI Contract Runner ผ่าน 4/4
- Request ไม่มี Session ได้ HTTP 401
- Tester นอก Allowlist ถูกปฏิเสธ
- ยอด 100.01 บาทถูกปฏิเสธเมื่อเพดานต่อครั้งคือ 100 บาท
- Command ซ้ำคืน Audit เดิมและพบเพียง 1 แถว
- ทุก Audit มี `real_charge=false`

## ผลยืนยันจากผู้ใช้

- ผู้ใช้ทดสอบ Local ตามขั้นตอนด้านล่างและยืนยันว่าผ่านแล้วเมื่อวันที่ 10 สิงหาคม 2569
- สถานะ Phase: `Local test passed / ผู้ใช้ทดสอบผ่าน`
- ยังไม่ได้ Commit, Push หรือ Deploy การเปลี่ยนแปลงชุดนี้

## วิธีทดสอบ Local

1. เปิด `http://localhost:3000/platform-admin/billing/live-control`
2. Login ด้วย Platform Admin และยืนยัน MFA ให้เป็น AAL2
3. เลื่อนลงไปที่ `ทดสอบการปฏิเสธคำสั่งผิดเงื่อนไข`
4. กด `เริ่มทดสอบ Contract 4 กรณี`
5. ต้องเห็นสถานะ `4 / 4 ผ่าน`
6. การ์ดทั้งสี่ต้องเป็นสีเขียว ได้แก่ ไม่มี AAL2, Tester ไม่ได้รับอนุญาต, ยอดเกินวงเงิน และ Command ID ซ้ำ
7. ต้องเห็นข้อความ `ยืนยันไม่มีการรับเงินจริง`

## ขั้นต่อไป

Phase 1.1.3.7.5.4 จะจัดทำ Release Gate และหลักฐานรวมก่อนพิจารณาว่าจะเริ่มส่วน Checkout Executor ที่ยังคงปิดด้วย Feature Flag หรือไม่ โดยยังไม่เปิดรับเงินจริงจนกว่าจะได้รับอนุมัติแยกต่างหาก

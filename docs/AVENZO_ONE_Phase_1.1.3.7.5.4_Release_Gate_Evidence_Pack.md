# AVENZO ONE — Phase 1.1.3.7.5.4 Release Gate & Evidence Pack

## เป้าหมาย

รวบรวมหลักฐานก่อนเสนอการพัฒนา Live Checkout Executor โดยไม่สร้าง Checkout Session, Payment Intent, Invoice หรือรายการรับเงินจริง

## Release Gate 10 ข้อ

1. Production Readiness ได้รับการยืนยันครบ
2. Safety Control อยู่สถานะพร้อมทบทวนและ Environment ยังล็อก
3. Emergency Stop ยังทำงาน
4. Limited Live Pilot ยังปิด
5. Live Secret และ Live Webhook Secret ตั้งค่าฝั่ง Server ครบโดยไม่เปิดเผยค่า
6. มี Platform Admin ที่ใช้งานอยู่อย่างน้อย 2 บัญชี
7. มีผู้ทดสอบใน Allowlist อย่างน้อย 1 บัญชี
8. Two-person Approval ยังไม่หมดอายุและ Snapshot ตรงกับกติกาปัจจุบัน
9. มีหลักฐาน Contract สำหรับ Tester นอก Allowlist, ยอดเกินวงเงิน และ Command ซ้ำ
10. Dry-run ทุกแถวเป็น `real_charge=false` และโค้ดยัง Test-only

## ผลลัพธ์

- ผ่าน: `evidence_complete` หมายถึงพร้อมเสนอแผนพัฒนา Executor ที่ยังล็อกไว้
- ไม่ผ่าน: `blocked` พร้อมแสดงเงื่อนไขที่ต้องแก้
- ทั้งสองผลบังคับ `realMoneyAllowed=false`
- การพัฒนา Executor ต้องได้รับอนุมัติแยกต่างหาก

## วิธีทดสอบ Local

1. เปิด `http://localhost:3000/platform-admin/billing/live-control`
2. Login ด้วย Platform Admin และยืนยัน MFA ให้เป็น AAL2
3. เลื่อนลงไปที่ `ตรวจด่านก่อนพัฒนา Live Checkout Executor`
4. กด `ตรวจ Release Gate และสร้าง Evidence Pack`
5. ตรวจว่ามีผล 10 ข้อพร้อมคำอธิบายภาษาไทย
6. หากครบ ต้องเห็น `10 / 10 ผ่าน` และ `ไม่อนุญาตรับเงินจริง`
7. กด `ดาวน์โหลดหลักฐาน JSON` และตรวจว่าไฟล์ถูกดาวน์โหลด

## ข้อจำกัด

- ไม่มี Route สำหรับสร้าง Live Checkout
- ไม่เรียก Stripe Live API
- Pilot ยังปิดและ Emergency Stop ยังเปิด
- Evidence Pack เป็น Snapshot แบบอ่านอย่างเดียวจากหลักฐาน Audit เดิม ไม่มี Secret หรือข้อมูลบัตร

## ขั้นต่อไป

หลังผู้ใช้ทดสอบ Local ผ่าน จึงพิจารณา Commit, Push และ Deploy ตามคำสั่งแยก จากนั้นแผนถัดไปต้องเป็นการทบทวนขอบเขต Executor และ Feature Flag ก่อนเขียนโค้ดรับเงินจริง

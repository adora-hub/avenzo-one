# Phase 1.1.3.7.5.1 — Controlled Live Checkout UI

สถานะ: Implemented / รอทดสอบ Local

## เป้าหมาย

สร้างหน้าตรวจสอบ Checkout แบบควบคุมให้ Platform Admin เห็นเงื่อนไขทั้งหมดก่อนพัฒนาเส้นทางรับเงินจริงฝั่ง Server

## สิ่งที่ทำใน Phase นี้

- เลือกบัญชีผู้ทดสอบจาก Allowlist ที่เปิดใช้งาน
- กรอกยอดทดสอบและรหัสอ้างอิง
- ตรวจความพร้อม Production, การอนุมัติร่วมกัน 2 คน, Policy Version, วงเงิน, Live Credentials และ Safety Lock
- แสดงหน้าสรุปครั้งสุดท้ายแบบภาษามนุษย์
- ปุ่มสร้าง Live Checkout ถูกล็อกและกดไม่ได้

## ขอบเขตความปลอดภัย

Phase นี้เป็น UI Simulation เท่านั้น:

- ไม่สร้าง Stripe Checkout Session
- ไม่สร้าง Payment Intent
- ไม่เรียก Stripe Live API
- ไม่บันทึกรายการชำระเงิน
- ไม่ปิด Environment Lock
- ไม่ปลด Emergency Stop
- ไม่มีเงินจริงเคลื่อนย้าย

## เกณฑ์ทดสอบ Local

1. เปิด `/platform-admin/billing/live-control` ด้วย Platform Admin ที่ผ่าน MFA
2. ตรวจว่าการ์ด `Controlled Live Checkout UI` แสดงสถานะ `UI จำลอง · ไม่รับเงินจริง`
3. กรอกผู้ทดสอบ ยอดเงิน และรหัสอ้างอิงอย่างน้อย 10 ตัวอักษร
4. กด `ตรวจสอบ Checkout แบบจำลอง`
5. ตรวจว่ารายการที่ไม่ผ่านแสดงเครื่องหมาย `!` และคำอธิบาย
6. ตรวจว่าปุ่ม `สร้าง Live Checkout — ยังล็อก` กดไม่ได้เสมอ

## ขั้นต่อไป

Phase 1.1.3.7.5.2 จะเพิ่มการตรวจ Eligibility ฝั่ง Server และ Dry-run Audit โดยยังไม่สร้างธุรกรรมเงินจริง และเริ่มได้หลัง Phase 1.1.3.7.4 ผ่านการทดสอบสองบัญชี

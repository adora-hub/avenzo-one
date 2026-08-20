# AVENZO ONE — Phase 1.1.3.7.1 ศูนย์ควบคุมการรับเงินจริง

หน้าสำหรับตรวจสอบ ล็อก หรือหยุดการรับเงินจริงผ่าน Stripe พร้อมบันทึกประวัติทุกคำสั่ง โดยชื่อภาษาอังกฤษทางเทคนิคคือ Live Safety Architecture & Kill Switch

อัปเดตล่าสุด: 9 สิงหาคม 2026

## สถานะ

Implemented; รอทดสอบ TypeScript, Production Build, Database Security และ Local Browser

## เป้าหมาย

เพิ่ม Kill Switch และ Audit Gate ก่อนเชื่อม Stripe Live โดย Phase นี้ต้องไม่มีเส้นทางเปิดรับเงินจริง แม้ผู้ดูแลเลือกสถานะพร้อมทบทวน

## กุญแจความปลอดภัย

1. `STRIPE_LIVE_ACTIVATION` ต้องไม่เป็น `enabled`
2. Database Emergency Stop บังคับเป็น `true` ด้วย Check Constraint
3. Checkout Server ยังคงรับเฉพาะ `sk_test_`
4. Webhook ยังคงปฏิเสธ Stripe Live Event

## สถานะที่อนุญาต

- `locked`: ล็อกรับเงินจริงและใช้สำหรับ Emergency Stop
- `review_ready`: ผ่านรายการ Manual Readiness เพื่อเข้าสู่การทบทวนขั้นถัดไป แต่ยังล็อกรับเงินจริง

ไม่มีสถานะ `enabled` ใน Phase นี้

## สิทธิ์และ Audit

- อ่านและสั่งการได้เฉพาะ Platform Admin ที่ยืนยัน MFA ระดับ AAL2
- ทุกคำสั่งต้องมีเหตุผล 10–2,000 ตัวอักษรและ Command ID ป้องกันคำสั่งซ้ำ
- Event เป็นประวัติแบบเพิ่มรายการใหม่เท่านั้น ผู้ใช้แก้ไขหรือลบไม่ได้
- ไม่เก็บ Stripe Key, Webhook Secret หรือข้อมูลบัญชีเต็มในฐานข้อมูล

## แผนถัดไป

Phase 1.1.3.7.2 แยก Test/Live Credentials และ Live Webhook โดยยังต้องผ่าน Kill Switch และขออนุมัติก่อนตั้งค่า Secret จริง

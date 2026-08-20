# Phase 1.1.3.7.3 — Limited Live Pilot Guardrails

## เป้าหมาย

เตรียมกติกาก่อนทดลองรับเงินจริงแบบวงจำกัด โดยไม่เปิด Live Checkout และไม่รับเงินจริงใน Phase นี้

## กติกาที่บังคับฝั่ง Server/Database

- ผู้ทดสอบต้องอยู่ใน Tester Allowlist และมีสถานะอนุญาต
- จำนวนเงินต่อครั้งต้องไม่เกิน `max_amount_per_charge`
- ยอดสำเร็จสะสมต้องไม่เกิน `max_total_amount`
- จำนวนรายการสำเร็จต้องไม่เกิน `max_successful_charges`
- `pilot_enabled` ต้องเปิด และ `emergency_stop` ต้องถูกปลด จึงจะอนุญาตได้
- Phase 1.1.3.7.3 บังคับ `pilot_enabled = false` และระบบเดิมบังคับ `emergency_stop = true` จึงไม่มีคำสั่งใดรับเงินจริงได้

## เครื่องมือผู้ดูแล

- ตั้งขีดจำกัดพร้อมเหตุผลและการตรวจสอบก่อนบันทึก
- เพิ่มหรือพักสิทธิ์อีเมลผู้ทดสอบ
- Dry Run ตรวจทุกกติกาโดยไม่สร้าง Checkout
- Emergency Rollback ยืนยันสถานะล็อกและบันทึก Audit Log

ทุกคำสั่งต้องเป็น Platform Admin ที่ยืนยัน MFA ระดับ AAL2 และใช้ Command ID เพื่อป้องกันการบันทึกคำสั่งซ้ำ

## Acceptance Criteria

1. ผู้ใช้ทั่วไปและผู้ดูแลที่ยังไม่ยืนยัน MFA อ่านหรือแก้ไขข้อมูล Pilot ไม่ได้
2. การแก้ขีดจำกัด ผู้ทดสอบ Dry Run และ Rollback มี Audit Log แบบแก้ย้อนหลังไม่ได้
3. Dry Run แสดงผลรายกติกา และผลรวมต้องเป็น “ถูกบล็อก” ใน Phase นี้
4. ไม่มี Live Checkout route และไม่มีการเปลี่ยน Invoice, Payment หรือ Subscription
5. RLS, explicit grants, TypeScript และ Production build ผ่าน

## ขั้นต่อไป

หลัง Local test ผ่าน ให้รออนุมัติ Commit/Push/Deploy แยกต่างหาก แล้ววางแผน Phase ที่เปิด Pilot จริงพร้อมการอนุมัติสองชั้นและการเฝ้าระวังธุรกรรม

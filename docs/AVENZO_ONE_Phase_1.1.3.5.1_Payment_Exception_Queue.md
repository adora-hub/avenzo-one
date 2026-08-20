# AVENZO ONE — Phase 1.1.3.5.1 Payment Exception Queue

อัปเดตล่าสุด: 8 สิงหาคม 2026

## สถานะ

เสร็จและทดสอบ Local/Production ผ่าน; Deploy ไปยัง `adora3/avenzo-one` แล้ว

## เป้าหมาย

ทำให้ Platform Admin เห็นรายการชำระเงินที่ต้องตรวจสอบจากจุดเดียว โดยยังไม่เพิ่มคำสั่งแก้ไขอัตโนมัติใน Phase นี้

## สิ่งที่พัฒนา

- เพิ่มส่วน `รายการชำระเงินที่ต้องตรวจสอบ` บนหน้า Platform Admin Billing
- ตรวจ Payment Attempt 100 รายการล่าสุด และแสดงคิวสูงสุด 10 รายการ
- แบ่งระดับเป็น `เร่งด่วน`, `ควรตรวจสอบ` และ `ติดตาม`
- ตรวจกรณี Webhook ล้มเหลว, Payment สำเร็จแต่ Invoice ไม่ตรงกัน, รอกระทบยอดค่าธรรมเนียม, ชำระไม่สำเร็จ, หมดเวลา, ยกเลิก และ Pending เกิน 30 นาที
- แสดง Organization, Invoice, ช่องทาง, ยอดชำระ, เวลา และรหัสอ้างอิง
- ไม่แสดง Attempt เก่าที่ล้มเหลวหรือหมดเวลา หาก Invoice เดียวกันได้รับการชำระสำเร็จจาก Attempt อื่นแล้ว
- ใช้ข้อมูลจากตาราง Billing เดิม ไม่มี Migration และไม่มีการเปลี่ยน RLS

## Security และสิทธิ์

- หน้า Queue ใช้สิทธิ์เดิมของ Platform Admin ที่ active
- ต้องผ่าน MFA ระดับ AAL2
- อ่านข้อมูลฝั่ง Server เท่านั้น และไม่ส่ง Secret ไปยัง Browser
- Phase นี้เป็น Read-only Operations จึงยังไม่มีปุ่ม Retry หรือแก้สถานะ

## เกณฑ์ทดสอบ Local

1. เข้า `Platform Admin > Billing & Invoice`
2. เห็นหัวข้อ `รายการชำระเงินที่ต้องตรวจสอบ`
3. PromptPay ที่ชำระสำเร็จแต่ยังไม่มีค่าธรรมเนียมจริง แสดงเป็น `ควรตรวจสอบ`
4. Attempt เก่าที่หมดเวลา แต่ Invoice ถูกชำระแล้วจาก Attempt อื่น ไม่แสดงในคิว
5. หน้า Billing ส่วนอื่นยังใช้งานได้และไม่ต้องกด Hard Refresh

## แผนถัดไป

Phase 1.1.3.5.2 Retry & Reconciliation Actions: เพิ่มคำสั่งลองใหม่/กระทบยอด พร้อม Preview, ยืนยันครั้งสุดท้าย, Idempotency และ Audit Log

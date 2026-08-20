# AVENZO ONE — Phase 1.1.3.5.2 Retry & Reconciliation Actions

อัปเดตล่าสุด: 9 สิงหาคม 2026

## สถานะ

เสร็จและทดสอบ Local/Production ผ่าน; Deploy ไปยัง `adora3/avenzo-one` แล้ว

## เป้าหมาย

ให้ Platform Admin จัดการรายการ Payment Exception ได้อย่างปลอดภัยจากหน้า Billing โดยตรวจสอบกับ Stripe Test Mode ก่อนแก้ข้อมูล และมีประวัติย้อนหลังครบถ้วน

## สิ่งที่พัฒนา

- เพิ่มคำสั่งตามชนิดปัญหา: ตรวจค่าธรรมเนียมอีกครั้ง, ตรวจ/ซ่อมสถานะ Provider และสร้าง Checkout ใหม่
- มีหน้าตรวจสอบครั้งสุดท้าย เหตุผลบังคับอย่างน้อย 3 ตัวอักษร และเลือก PromptPay/บัตรเมื่อ Retry
- ตรวจสิทธิ์ Platform Admin และ MFA AAL2 ซ้ำใน Server API
- จำกัดการทำงานกับ Stripe Test Mode เท่านั้น
- ใช้ Command ID ไม่ซ้ำ ป้องกันการกดหรือประมวลผลคำสั่งเดิมซ้ำ
- ตรวจสถานะจริงจาก Stripe ก่อนซ่อม Invoice และไม่สร้างยอดชำระซ้ำ
- บันทึกผู้ดำเนินการ อีเมล เหตุผล ผลลัพธ์ รหัสข้อผิดพลาด และเวลา
- แสดงประวัติคำสั่ง 10 รายการล่าสุดบนหน้า Billing
- แยก Helper สำหรับสร้าง Stripe Test Checkout เพื่อให้คำสั่งปกติและ Retry ใช้กติกาเดียวกัน

## Database และ Security

- เพิ่ม `billing_payment_exception_commands` พร้อม RLS
- `authenticated` อ่านได้เฉพาะ Platform Admin ผ่าน Policy และไม่มีสิทธิ์ Insert/Update
- การเขียนอนุญาตเฉพาะ `service_role` ผ่าน Server API
- เพิ่ม RPC ซ่อม Invoice จาก Attempt ที่ Stripe Test ยืนยันว่าชำระสำเร็จแล้วเท่านั้น
- เพิ่ม Index รองรับ Foreign Key และหน้าประวัติล่าสุด

## เกณฑ์ทดสอบ Local

1. เข้า `Platform Admin > Billing & Invoice`
2. ใน Exception Queue กด `ตรวจค่าธรรมเนียมอีกครั้ง`
3. เห็นหน้าตรวจสอบครั้งสุดท้ายและยังไม่มีการบันทึก
4. ไม่กรอกเหตุผลหรือกรอกสั้นกว่า 3 ตัวอักษร ต้องไม่ให้ดำเนินการ
5. กรอกเหตุผลแล้วกดยืนยัน ระบบต้องสำเร็จและรายการกระทบยอดหายจาก Queue
6. ส่วน `ประวัติคำสั่งแก้ไขล่าสุด` แสดงคำสั่ง สถานะ ผู้ดำเนินการ เหตุผล และเวลา
7. รีเฟรชหน้าแล้วประวัติยังอยู่ และหน้า Billing ส่วนอื่นยังทำงานปกติ

## แผนถัดไป

Phase 1.1.3.5.3 Exception Operations Hardening: เพิ่มตัวกรอง/ค้นหาประวัติ, SLA ของคิว, การแจ้งเตือนรายการเร่งด่วน และ Runbook สำหรับ Production ก่อนเปิด Stripe Live Mode

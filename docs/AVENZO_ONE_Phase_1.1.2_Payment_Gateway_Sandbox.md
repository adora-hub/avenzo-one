# AVENZO ONE — Phase 1.1.2 Payment Gateway Sandbox & Reconciliation Foundation

## เป้าหมาย

เตรียมระบบ Billing ให้รองรับ Payment Gateway หลายผู้ให้บริการ โดยทดสอบ Checkout, Webhook, Idempotency และการกระทบยอดได้ครบเส้นทางก่อนเชื่อมบัญชีเงินจริง

## สิ่งที่ทำในระยะนี้

- Payment Attempt แบบ Provider-neutral เชื่อมกับ Invoice และ Organization
- Sandbox ภายในระบบสำหรับจำลองผลสำเร็จและไม่สำเร็จ โดยไม่เรียก API ภายนอกและไม่ตัดเงินจริง
- Event Ledger เก็บ Provider Event ID, สถานะประมวลผล และ SHA-256 Hash เพื่อป้องกัน Event ซ้ำ
- Command ID และ Idempotency Key ป้องกันการกดซ้ำหรือบันทึกซ้ำ
- Payment History และสถานะ Invoice เปลี่ยนใน Transaction เดียวผ่าน RPC
- RLS แบบอ่านได้เฉพาะ Platform Admin ที่ผ่าน MFA AAL2
- Audit Log แบบ Append-only สำหรับ Payment Attempt และ Event
- หน้าตรวจสอบครั้งสุดท้ายก่อนจำลองผล พร้อมคำอธิบายภาษาไทย
- Payment แบบ Manual เดิมยังใช้ได้ แต่แยกไว้ในส่วนพับเพื่อไม่ให้สับสนกับ Gateway

## ขั้นตอนทดสอบ Local

1. เข้า `Platform Admin > Billing & Invoice`
2. เปิด Invoice สถานะ `รอชำระ` หรือ `ชำระไม่สำเร็จ`
3. เปิด `ดูประวัติและจัดการ Payment`
4. กด `สร้างรายการ Sandbox`
5. เลือก `จำลองชำระสำเร็จ` หรือ `จำลองชำระไม่สำเร็จ`
6. ตรวจหน้าสรุปและกด `ยืนยันผลจำลอง`
7. ตรวจว่า Payment History และสถานะ Invoice เปลี่ยนทันที

## ค่าใช้จ่าย

Phase นี้ไม่เสียค่าบริการ Payment Gateway เพราะไม่เชื่อมบัญชีผู้ให้บริการและไม่ส่งธุรกรรมจริง ค่าใช้จ่ายจะเริ่มขึ้นตามเงื่อนไขของผู้ให้บริการที่เลือกในระยะเชื่อม Production

## ขอบเขตความปลอดภัย

- ไม่เก็บ Secret Key ใน Database หรือ Browser
- ไม่เก็บ Raw Webhook Payload ที่อาจมีข้อมูลละเอียดอ่อนในตาราง Public
- Production Webhook ในระยะถัดไปต้องตรวจลายเซ็นจาก Raw Body ก่อนประมวลผล
- ห้ามให้สถานะ Subscription หรือ Invoice สำเร็จจากข้อมูลที่ Browser ส่งมาโดยตรง

## ยังไม่รวม

- การสมัครหรือเชื่อมบัญชี Stripe, Opn, 2C2P หรือผู้ให้บริการอื่น
- Checkout URL จริง, QR Payment จริง และการตัดบัตรจริง
- Production Webhook Secret และการเปิด Live Mode
- Refund จริง, Partial Payment, Settlement และ Bank Reconciliation

## แผนถัดไป

Phase 1.1.3 Payment Provider Selection & Production Sandbox: เปรียบเทียบผู้ให้บริการตามประเทศ ช่องทางชำระ ค่าธรรมเนียม และความต้องการเอกสาร ก่อนเชื่อม Sandbox ของผู้ให้บริการที่เลือก

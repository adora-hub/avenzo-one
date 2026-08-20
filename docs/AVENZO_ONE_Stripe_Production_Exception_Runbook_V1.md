# AVENZO ONE — Stripe Production Exception Runbook V1

อัปเดตล่าสุด: 9 สิงหาคม 2026

> เอกสารนี้เป็นขั้นตอนเตรียม Production เท่านั้น ระบบปัจจุบันยังจำกัดอยู่ใน Stripe Test Mode

## ผู้รับผิดชอบ

- Platform Admin ที่เปิด MFA AAL2 เท่านั้นเป็นผู้ตรวจและยืนยันคำสั่ง
- ผู้ดำเนินการต้องเขียนเหตุผลที่ตรวจสอบย้อนกลับได้ ห้ามใช้ข้อความกว้าง เช่น `แก้ไข` หรือ `ทดสอบ`
- หากเกี่ยวข้องกับยอดเงินจริงและหลักฐานไม่ครบ ให้หยุดรายการและส่งต่อผู้รับผิดชอบด้านการเงิน

## ลำดับตรวจสอบ

1. เปิดรายการจาก Exception Queue และตรวจ Organization, Invoice, จำนวนเงิน, Provider Reference และเวลาที่เกิด
2. เปิด Stripe Dashboard ใน Environment เดียวกับรายการ และตรวจ PaymentIntent/Charge/Event จากหมายเลขอ้างอิง
3. เปรียบเทียบสถานะ Stripe กับ Payment Attempt, Invoice และ Webhook Event ใน AVENZO ONE
4. เลือกคำสั่งที่ตรงกับปัญหา ตรวจหน้าสรุปครั้งสุดท้าย และบันทึกเหตุผลพร้อมหลักฐานอ้างอิง
5. หลังคำสั่งสำเร็จ รีเฟรชคิวและตรวจ Action Audit ว่าผู้ดำเนินการ ผลลัพธ์และเวลาถูกบันทึก

## ข้อห้ามสำคัญ

- ห้ามเปลี่ยน Invoice เป็น Paid หาก Stripe ไม่มีหลักฐานยืนยันการชำระสำเร็จ
- ห้ามสร้าง Payment ซ้ำเพื่อให้ยอดดูตรง
- ห้ามนำ Secret Key, Webhook Secret หรือข้อมูลบัตรมาใส่ในเหตุผล/Audit Log
- ห้าม Retry Checkout หาก Invoice ชำระแล้ว ถูกยกเลิก หรือยอดเงินไม่ตรง
- ห้ามใช้ Test Key กับ Live Webhook หรือใช้ Live Key กับ Local Development

## แนวทางตามชนิดปัญหา

### Webhook ล้มเหลวหรือสถานะไม่ตรงกัน

ตรวจ Event ID และลายเซ็นก่อน จากนั้นใช้ `ตรวจสถานะ Provider` ระบบต้องอ่านสถานะจาก Stripe ก่อนซ่อม Invoice และต้องไม่สร้างยอดชำระใหม่หากมี Payment สำเร็จอยู่แล้ว

### รอตรวจค่าธรรมเนียม

ใช้ `ตรวจค่าธรรมเนียมอีกครั้ง` หลัง Stripe มี Balance Transaction แล้ว เปรียบเทียบค่าธรรมเนียมจริง ยอดสุทธิ และค่าประมาณเดิม

### Payment ล้มเหลว/หมดเวลา

ตรวจว่าลูกค้ายังต้องการชำระและ Invoice ยังชำระได้ ก่อนใช้ `สร้าง Checkout ใหม่` ลิงก์เดิมที่หมดอายุไม่ควรนำกลับมาใช้

## Incident และการหยุดระบบ

หากพบยอดซ้ำ, ยอดผิด, Secret รั่ว หรือ Webhook ผิด Environment:

1. หยุดสร้าง Checkout ใหม่จากช่องทางที่มีปัญหา
2. เก็บ Event ID, PaymentIntent ID, Invoice และเวลาที่พบ โดยไม่คัดลอก Secret
3. หมุน/เพิกถอน Key ที่สงสัยว่ารั่ว และตั้งค่า Webhook Secret ใหม่
4. ตรวจรายการตั้งแต่เหตุการณ์ล่าสุดที่เชื่อถือได้
5. ห้ามลบ Audit/Event Ledger เพื่อซ่อนความผิดพลาด
6. เปิดระบบอีกครั้งเมื่อการกระทบยอดครบและมีผู้อนุมัติ Go/No-Go

## Go/No-Go ก่อน Stripe Live

- KYC และบัญชีรับเงินของนิติบุคคลผ่านแล้ว
- Live Secret อยู่เฉพาะ Production Environment และไม่อยู่ใน Git/Browser
- Live Webhook ใช้ URL Production, ตรวจลายเซ็น และทดสอบ Idempotency
- Domain, Success URL และ Cancel URL เป็น Production ทั้งหมด
- ทดสอบ Card/PromptPay, Failed, Expired, Duplicate Webhook และ Reconciliation ใน Live-safe checklist
- มีผู้รับผิดชอบคิวเกิน SLA และช่องทางแจ้งเตือนจริง
- มี Refund, Dispute, Chargeback และ Accounting Policy ที่ได้รับอนุมัติ
- มีแผน Rollback และหยุด Checkout ได้ทันที

หากข้อใดข้อหนึ่งไม่ผ่าน ให้ตัดสินใจ `No-Go` และคง Test Mode ไว้

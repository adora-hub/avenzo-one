# AVENZO ONE — Phase 1.1.0 Billing Foundation

อัปเดตล่าสุด: 8 สิงหาคม 2026

## เป้าหมาย

วางฐาน Billing ที่เชื่อม Organization, Subscription, Plan Version และ Active Plan Price โดยยังไม่เชื่อม Payment Gateway และไม่มีการตัดเงินจริง

## สิ่งที่พัฒนา

- Invoice Number รูปแบบ `INV-YYYYMM-XXXXXX` และ Payment Number รูปแบบ `PAY-YYYYMM-XXXXXX`
- Snapshot รอบ Billing, ราคา, ส่วนลด, ภาษี, สกุลเงิน และยอดสุทธิ
- สถานะภาษาไทย: รอชำระ, ชำระแล้ว, ชำระไม่สำเร็จ และยกเลิกแล้ว
- Payment History แบบ Provider-neutral รองรับ `manual` และเลขอ้างอิงจาก Provider ในอนาคต
- Preview ก่อนสร้าง Invoice และก่อนบันทึกผล Payment
- Command ID ป้องกันคำสั่งซ้ำจากการกดหรือ Network Retry
- รายการ Invoice 10 รายการต่อหน้า พร้อม Payment History
- Audit Log แยก Invoice และ Payment แบบ Append-only

## สิทธิ์และความปลอดภัย

- Owner และ Admin ของ Organization ได้ `billing.read` และ `billing.manage`
- Tenant อ่าน Billing ได้เมื่อมี `billing.read`; ไม่มีสิทธิ์เขียนตารางโดยตรง
- การสร้าง Invoice และบันทึก Payment ทำผ่าน RPC สำหรับ Platform Admin ที่ผ่าน MFA ระดับ AAL2 เท่านั้น
- ตาราง Billing เปิด RLS และให้ `authenticated` เฉพาะ `SELECT` ที่ผ่าน Policy
- Payment สถานะ `paid` ต้องมียอดเท่ากับยอดสุทธิของ Invoice
- Invoice ที่ชำระแล้วหรือยกเลิกแล้วถือเป็นสถานะสุดท้าย

## ผลการทดสอบ

- Migration ใช้กับ Supabase Production สำเร็จ
- ทดสอบสร้าง Invoice และบันทึก Payment ใน Transaction สำเร็จ
- Rollback หลังทดสอบสำเร็จ ไม่มี Invoice, Payment หรือ Audit Log ทดสอบตกค้าง
- TypeScript ตรวจผ่านด้วย `tsc --noEmit --incremental false`
- Next.js Production Build ผ่านและมี Route `/platform-admin/billing`

## ยังไม่รวมใน Phase นี้

- การตัดบัตร, QR Payment, Bank Transfer Automation หรือ Payment Gateway จริง
- Webhook จากผู้ให้บริการ Payment
- Receipt/Tax Invoice PDF และการออกเลขตามข้อกำหนดทางบัญชี/ภาษีฉบับ Production
- Refund, Credit Note, Partial Payment และ Reconciliation

ก่อนเปิด Billing Production จริง ต้องให้ผู้เชี่ยวชาญบัญชีและภาษีตรวจรูปแบบเอกสาร เลขที่เอกสาร VAT และนโยบายการแก้ไข/ยกเลิกเอกสาร

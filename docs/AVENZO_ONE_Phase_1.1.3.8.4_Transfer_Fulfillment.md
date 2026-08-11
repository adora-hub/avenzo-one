# AVENZO ONE — Phase 1.1.3.8.4 Transfer Fulfillment

## เป้าหมาย

เปลี่ยนหลักฐานโอนเงินที่ Platform Admin คนที่ 1 รับรองแล้ว ให้เป็นผลรับชำระที่สมบูรณ์โดย Platform Admin คนที่ 2 ภายใน Transaction เดียว

## กติกาความปลอดภัย

- ผู้ดำเนินการต้องเป็น Platform Admin และผ่าน MFA ระดับ AAL2
- ผู้รับรองหลักฐานกับผู้ยืนยันรับชำระต้องเป็นคนละบัญชี
- หลักฐานต้องมีสถานะ `accepted` และยังไม่เคย Fulfill
- Invoice ต้องเป็น `pending`
- ยอดที่ลูกค้าแจ้งต้องเท่ากับยอดสุทธิของ Invoice
- Subscription ต้องยัง `active` และใช้ Plan Version เดียวกับ Invoice
- ทุกคำสั่งมี `command_id` และ Unique Constraint ป้องกันการกดซ้ำ

## ผลลัพธ์แบบ Atomic

RPC `platform_fulfill_billing_transfer_proof` ทำงานทั้งหมดใน PostgreSQL Transaction เดียว:

1. ล็อกหลักฐาน, Invoice และ Subscription
2. สร้าง Payment ประเภท `bank_transfer`
3. เปลี่ยน Invoice เป็น `paid`
4. ต่ออายุ Subscription ตามรอบ Billing ใน Invoice และคำนวณ Grace Period
5. บันทึก Subscription Event พร้อมผู้ดำเนินการและเหตุผล
6. ผูกหลักฐานกับ Payment และบันทึกผู้ยืนยันรับชำระ

หากขั้นตอนใดล้มเหลว ระบบจะยกเลิกทุกการเปลี่ยนแปลง จึงไม่เกิด Payment สำเร็จเพียงบางส่วน

## ขั้นตอนทดสอบ Local

1. ลูกค้า Owner/Admin แนบหลักฐานใหม่ให้ Invoice ที่ยังรอชำระ
2. Login เป็น Platform Admin คนที่ 1 พร้อม MFA แล้วรับรองหลักฐาน
3. ตรวจว่าบัญชีคนที่ 1 เห็นข้อความว่าต้องใช้ Platform Admin คนที่ 2 และไม่สามารถยืนยันรับชำระเอง
4. Logout แล้ว Login เป็น Platform Admin คนที่ 2 พร้อม MFA
5. เปิด `/platform-admin/billing/transfer-proofs`
6. กด `ตรวจสอบก่อนยืนยันรับชำระ` ตรวจ Payment, Invoice และ Subscription แล้วกรอกเหตุผล
7. กด `ยืนยันรับชำระและต่ออายุ`
8. ตรวจว่าแสดงเลข Payment, Invoice เป็นชำระแล้ว และ Subscription มีวันหมดอายุ/Grace Period ตาม Invoice
9. โหลดหน้าใหม่แล้วตรวจว่าหลักฐานเดิมไม่กลับมาในคิว

## ขอบเขต

Phase นี้ใช้สำหรับ Bank Transfer ที่เจ้าหน้าที่ตรวจหลักฐานแล้ว ไม่เกี่ยวกับ Stripe Webhook และไม่มีการเรียก Stripe API

## แผนถัดไป

Phase 1.1.3.8.5 — เพิ่มประวัติการรับชำระและผลการตรวจหลักฐานที่อ่านง่ายทั้งฝั่งลูกค้าและ Platform Admin พร้อมเลข Payment และ Audit Timeline


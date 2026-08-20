# AVENZO ONE — Phase 1.1.3.6 Billing Production Readiness Gate

อัปเดตล่าสุด: 9 สิงหาคม 2026

## สถานะ

เสร็จและผู้ใช้ทดสอบ Local ผ่านแล้ว รวมถึงผ่าน TypeScript, Production Build, Database Security Check และ Browser Smoke Test; ยังไม่ได้ Commit, Push หรือ Deploy

## เป้าหมาย

สร้างจุดตรวจ Go/No-Go ก่อนพิจารณาเปิด Stripe Live Mode โดยรวบรวมหลักฐานทางเทคนิคและการยืนยันจาก Platform Admin ไว้ในหน้าเดียว ทั้งหมดเป็นการตรวจความพร้อมเท่านั้นและไม่สามารถเปิดรับเงินจริงจากหน้านี้ได้

## สิ่งที่พัฒนา

- หน้า `Platform Admin > Billing & Invoice > ตรวจความพร้อม Production`
- ตรวจอัตโนมัติว่า Production URL ถูกต้อง, Stripe Test Key ยังทำงาน, Webhook Secret มีค่า, Live Activation ถูกล็อก และผลทดสอบ Card/PromptPay/Webhook/Exception Queue พร้อม
- Checklist ด้วยภาษามนุษย์ 9 ข้อ: KYC, บัญชีรับเงิน, การเก็บ Live Credentials, Live Webhook, Refund/Dispute, ผู้รับผิดชอบ Alert, บัญชี/กฎหมาย/PDPA, Rollback Drill และแผนทดสอบ Live แบบปลอดภัย
- ต้องใส่บันทึกหลักฐานอย่างน้อย 10 ตัวอักษรและตรวจสอบครั้งสุดท้ายก่อนบันทึก
- บันทึกผลแบบเพิ่มประวัติใหม่เท่านั้น (Immutable), มี Command ID ป้องกันคำสั่งซ้ำ และเก็บผู้ตรวจ/เวลา
- จำกัดสิทธิ์ Platform Admin ที่ยืนยัน MFA ระดับ AAL2; ผู้ใช้ทั่วไปอ่านหรือบันทึกไม่ได้
- แสดงผลสุดท้ายเป็น `ยังไม่พร้อมเปิดรับเงินจริง` หรือ `พร้อมเสนอเข้าสู่ขั้นเปิดแบบควบคุม`
- เพิ่ม `STRIPE_LIVE_ACTIVATION=disabled` เป็น Safety Switch; Phase นี้ไม่มีเส้นทางเปิด Stripe Live Mode

## ผลตรวจฐานข้อมูล

- RLS เปิดใช้งาน
- `anon` อ่านตารางหรือเรียก RPC ไม่ได้
- `authenticated` อ่านผ่าน RLS ได้ แต่ INSERT ตรงไม่ได้
- RPC ตรวจ `private.is_platform_admin()` ซึ่งรวม AAL2 ก่อนบันทึกทุกครั้ง
- เพิ่ม Index ครอบ Foreign Key ผู้ตรวจตามคำแนะนำ Performance Advisor
- Security Advisor แจ้งเตือน SECURITY DEFINER ตามรูปแบบ RPC; เป็นการใช้งานโดยตั้งใจและฟังก์ชันตรวจ Platform Admin + AAL2 ภายในก่อนเขียนข้อมูล

## วิธีทดสอบ Local

1. เปิด Local Server และ Login ด้วยบัญชี Platform Admin
2. ยืนยันรหัส MFA 6 หลักให้ Session เป็น AAL2
3. เข้า `Platform Admin > Billing & Invoice`
4. กด `ตรวจความพร้อม Production`
5. ตรวจว่าด้านบนแสดง `ยังไม่เปิดเงินจริง` และ Safety Switch เป็น `disabled`
6. ตรวจรายการอัตโนมัติว่ามีผลผ่าน/ต้องแก้พร้อมคำอธิบายภาษาไทย
7. ติ๊ก Checklist บางข้อ ใส่หลักฐานอย่างน้อย 10 ตัวอักษร กดตรวจสอบ แล้วบันทึก
8. ตรวจว่าประวัติล่าสุดแสดงผู้ตรวจ เวลา และสถานะ `กำลังรวบรวมหลักฐาน`
9. ติ๊กครบ 9 ข้อแล้วบันทึกอีกครั้ง สถานะควรเป็น `ยืนยันรายการด้วยตนเองครบแล้ว`
10. แม้ทุกข้อผ่าน หน้าเว็บต้องแสดงเพียง `พร้อมเสนอเข้าสู่ขั้นเปิดแบบควบคุม` และต้องไม่มีปุ่มเปิดรับเงินจริง

## สิ่งที่ยังไม่ทำ

- ไม่สร้างหรือบันทึก Stripe Live Secret Key
- ไม่สร้าง Live Webhook Endpoint
- ไม่สลับ Checkout/Webhook ไปรับ Live Event
- ไม่รับเงินจริงและไม่เปลี่ยนสถานะ Invoice ด้วย Live Payment

## แผนถัดไป

Phase 1.1.3.7 Controlled Live Activation: แยก Environment/Secret ของ Live, สร้าง Live Webhook, จำกัดวงเงินและกลุ่มทดสอบ, ทำ Kill Switch/Rollback และขออนุมัติแยกก่อนเริ่มรับเงินจริง

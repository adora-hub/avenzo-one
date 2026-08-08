# AVENZO ONE — Phase 1.1.3.3 Stripe Test Checkout & Fee Snapshot

อัปเดตล่าสุด: 8 สิงหาคม 2026

## สถานะ

Implemented / เชื่อม Stripe Sandbox และทดสอบ Local E2E แล้ว โดยผล Acceptance/Reconciliation อยู่ใน Phase 1.1.3.4

## เป้าหมาย

เชื่อม Stripe เฉพาะ Test Mode สำหรับ Invoice ของ AVENZO ONE ให้ Platform Admin ทดลองชำระด้วย PromptPay QR หรือบัตร ผ่าน Hosted Checkout โดยไม่ตัดเงินจริง พร้อมเก็บผลจาก Webhook ที่ตรวจลายเซ็นและบันทึกค่าธรรมเนียมเป็น Snapshot ตรวจสอบย้อนหลังได้

## สิ่งที่พัฒนาแล้ว

- Stripe SDK ทำงานฝั่ง Server เท่านั้น และปฏิเสธ Key ที่ไม่ขึ้นต้นด้วย `sk_test_`
- Platform Admin ต้อง Login, มีสถานะ active และผ่าน MFA ระดับ AAL2 ก่อนสร้าง Checkout
- รองรับ Invoice สกุล THB ที่มียอดมากกว่า 0 และมีสถานะรอชำระ/ชำระไม่สำเร็จ
- Hosted Checkout รองรับ PromptPay QR และบัตรในประเทศ
- Success Page ไม่ถือว่าชำระสำเร็จจนกว่า Webhook ที่ตรวจลายเซ็นจะยืนยัน
- Webhook ปฏิเสธ Live Event, ตรวจ Stripe Signature, เก็บ Event ID และ SHA-256 Hash และประมวลผลแบบ Idempotent
- เก็บ Fee Snapshot ต่อ Payment Attempt ได้แก่ช่องทาง, อัตรา, ค่าคงที่, ค่าธรรมเนียมประมาณการ, ค่าธรรมเนียมลูกค้า, ยอดที่ลูกค้าชำระ, ค่าธรรมเนียมจริงและยอดสุทธิเมื่อ Stripe ส่งข้อมูลมา
- UI แสดงยอด Invoice, ค่าธรรมเนียมประมาณการ, ผู้รับภาระค่าธรรมเนียม และยอดที่ลูกค้าชำระก่อนเปิด Checkout
- UI แสดง Fee Snapshot ล่าสุดเพื่อแจ้งลูกค้าและตรวจย้อนหลัง

## นโยบายค่าธรรมเนียมรุ่นนี้

- PromptPay: ประมาณ 1.65% ต่อรายการ
- บัตรในประเทศ: ประมาณ 3.65% + 10 บาทต่อรายการ
- ลูกค้าชำระเท่ากับยอด Invoice
- ค่าธรรมเนียมที่เรียกเก็บเพิ่มจากลูกค้าเป็น 0 บาท
- AVENZO ONE รับภาระค่าธรรมเนียม Provider ในรุ่นนี้
- ตัวเลขก่อน Checkout เป็นค่าประมาณจากราคามาตรฐาน และอาจต่างจาก Settlement จริงหรือสัญญาราคาแบบกำหนดเอง

อ้างอิงอัตรา: [Stripe Thailand Pricing](https://stripe.com/th/pricing)

## โครงสร้างข้อมูล

ตาราง `billing_payment_attempts` เพิ่ม:

- `payment_method`
- `fee_rate_bps`
- `fee_fixed_amount`
- `estimated_provider_fee`
- `customer_fee_amount`
- `customer_charge_amount`
- `provider_fee_actual`
- `provider_net_amount`

ฟังก์ชัน `server_process_stripe_test_event` รับเฉพาะ `service_role` และเปลี่ยน Attempt, Payment และ Invoice ภายใน Transaction เดียว

## Security Gate

- ห้ามใส่ Stripe Secret ในตัวแปร `NEXT_PUBLIC_*`
- ห้าม Commit Secret ลง Git
- Webhook ใช้ Raw Request Body สำหรับตรวจลายเซ็น
- Test Mode เท่านั้น; Live Event ถูกปฏิเสธ
- Browser ไม่มีสิทธิ์เรียก RPC ประมวลผล Webhook
- Production Key, การตัดเงินจริง, Refund จริง และ Production Webhook ยังไม่อยู่ใน Phase นี้

## Acceptance Criteria ที่ผ่านแล้ว

- Migration ถูกใช้กับ Supabase และตรวจพบคอลัมน์ Fee Snapshot/RPC แล้ว
- TypeScript ตรวจผ่านด้วย `tsc --noEmit --incremental false`
- อัตราค่าธรรมเนียมและสูตรคำนวณตรงกับราคา Stripe Thailand ที่ตรวจล่าสุด
- UI แยกยอดลูกค้าออกจากค่าธรรมเนียม Provider ชัดเจน

## Acceptance Criteria ที่ยังรอ

- ติดตั้ง Stripe Integration/Sandbox ใน Vercel โดยผู้ใช้ยืนยันการยอมรับเงื่อนไข
- ตั้ง `STRIPE_SECRET_KEY` และ `STRIPE_WEBHOOK_SECRET` ใน Local/Preview โดยไม่เปิดเผยค่า
- ทดสอบ PromptPay Test Checkout อย่างน้อย 1 รายการ
- ทดสอบ Card Test Checkout อย่างน้อย 1 รายการ
- ตรวจว่า Webhook ซ้ำไม่สร้าง Payment ซ้ำ
- ตรวจ Fee Snapshot ก่อน/หลัง Webhook บนหน้า Billing
- ผู้ใช้ยืนยันว่า Local ผ่านก่อน Deploy ขึ้น Vercel

## หมายเหตุการตรวจ Dependency

`npm audit` พบคำเตือนระดับสูง 3 รายการใน dependency ที่มากับ Next.js (`postcss` และ `sharp`) โดยคำแนะนำอัตโนมัติให้ข้ามไป Next.js 16 ซึ่งเป็น breaking change จึงไม่ใช้ `npm audit fix --force` ใน Phase นี้ และต้องวางแผนอัปเกรด/ทดสอบแยกต่างหาก

## แผนถัดไป

Phase 1.1.3.4 Stripe Sandbox Acceptance & Reconciliation: ดำเนินการแล้ว โดยทดสอบ Card Success, PromptPay QR/Expiration, Duplicate Webhook, Invoice State Guard และ Fee Reconciliation

# AVENZO ONE — Phase 1.1.3.4 Stripe Sandbox Acceptance & Reconciliation

อัปเดตล่าสุด: 8 สิงหาคม 2026

## สถานะ

Implemented / Local automated acceptance ผ่าน และรอผู้ใช้ยืนยันหน้าจอ Local ก่อน Deploy

## เป้าหมาย

ปิดช่องว่างระหว่างการสร้าง Stripe Test Checkout กับผล Settlement จริง โดยทดสอบ Webhook ซ้ำ เหตุการณ์หมดอายุ การคงสถานะ Invoice ที่ชำระแล้ว และเพิ่มการกระทบยอดค่าธรรมเนียมจริงจาก Stripe Test Mode

## สิ่งที่พัฒนา

- เพิ่ม Server API `POST /api/billing/stripe/reconcile`
- อนุญาตเฉพาะ Platform Admin ที่ active และผ่าน MFA ระดับ AAL2
- รับเฉพาะ Payment Attempt ของ Stripe Sandbox ที่ชำระสำเร็จแล้ว
- อ่าน Balance Transaction จาก Stripe Test Mode และบันทึก `provider_fee_actual` กับ `provider_net_amount`
- หน้า Billing มีปุ่ม `ตรวจค่าธรรมเนียมจริง` เมื่อ Webhook สำเร็จแต่ค่าจริงยังมาไม่ทัน
- หลังตรวจสำเร็จ หน้าอัปเดตด้วย `router.refresh()` โดยไม่ต้องกด Ctrl+F5
- แสดงค่าประมาณ ค่าจริง ยอดสุทธิหลังหักค่าธรรมเนียม และส่วนต่างอย่างชัดเจน

## ผลการทดสอบ Local

Invoice ทดสอบ: `INV-202608-000058` ยอด `1,605.00 THB`

| รายการ | ผล |
|---|---|
| Card Test Checkout | ผ่าน — Checkout สำเร็จและ Verified Webhook เปลี่ยน Invoice เป็น `paid` |
| PromptPay Test Checkout | ผ่าน — เปิด Hosted Checkout และแสดง QR ได้ |
| PromptPay Expiration | ผ่าน — Stripe ส่ง `checkout.session.expired` และ Attempt เปลี่ยนเป็น `expired` |
| ป้องกัน Invoice ถอยสถานะ | ผ่าน — PromptPay หมดอายุภายหลัง แต่ Invoice ยังคง `paid` |
| Duplicate Webhook | ผ่าน — ส่ง Event เดิมซ้ำ 2 ครั้ง แต่มี Event 1 แถวและ Payment 1 แถว |
| Fee Reconciliation | ผ่าน — หน้าอัปเดตค่าจริงทันทีโดยไม่ต้อง Hard Refresh |
| TypeScript | ผ่าน — `tsc --noEmit --incremental false` |
| Diff Check | ผ่าน — `git diff --check` |

## ผลกระทบยอดค่าธรรมเนียม

| ค่า | จำนวน |
|---|---:|
| ยอดลูกค้าชำระ | 1,605.00 THB |
| ค่าธรรมเนียมประมาณการ | 68.58 THB |
| ค่าธรรมเนียมจริงจาก Stripe Test | 92.28 THB |
| ยอดสุทธิหลังหักค่าธรรมเนียม | 1,512.72 THB |
| ส่วนต่างจากประมาณการ | +23.70 THB |

บัตรทดสอบมาตรฐานถูกจัดเป็นบัตรต่างประเทศและมี Sales Tax บนค่าบริการ จึงทำให้ค่าจริงสูงกว่าสูตรประมาณการสำหรับบัตรในประเทศ ระบบแสดงสองตัวเลขแยกกันและไม่แก้ย้อนหลังค่า Snapshot ก่อน Checkout

## Security Gate

- ใช้ Stripe Test Key เท่านั้น และปฏิเสธ Live Event
- Secret อยู่ฝั่ง Server และไม่ใช้ตัวแปร `NEXT_PUBLIC_*`
- Webhook ตรวจลายเซ็นจาก Raw Body
- Event ID เป็น Idempotency Gate ป้องกัน Payment ซ้ำ
- Reconciliation ไม่เปลี่ยนยอด Invoice หรือสถานะการชำระ
- Reconciliation ปฏิเสธ Attempt ที่ไม่ใช่ Stripe Sandbox หรือยังไม่สำเร็จ

## ข้อจำกัดที่ยังต้องทดสอบด้วยผู้ใช้

- การสแกน PromptPay QR จนสำเร็จด้วยมือถือใน Stripe Test Mode
- การติดตั้ง Test Secret/Webhook Secret บน Vercel Preview/Production จะทำหลัง Local ผ่านและผู้ใช้อนุมัติ Deploy
- Production Onboarding, Live Key, Refund จริง และการตัดเงินจริงยังไม่อยู่ใน Phase นี้

## แผนถัดไป

Phase 1.1.3.5 Payment Exception Operations: เพิ่มหน้าปฏิบัติการสำหรับรายการล้มเหลว/หมดอายุ, ลองชำระใหม่, Reconciliation Queue และ Audit Trail ก่อน Production Onboarding

## เอกสารอ้างอิง

- [Stripe Checkout — handle post-payment events](https://docs.stripe.com/payments/accept-a-payment)
- [Stripe PaymentIntent lifecycle](https://docs.stripe.com/payments/payment-intents)

# AVENZO ONE — Phase 1.1.3.7.2 แยก Test/Live Credentials และ Live Webhook

## เป้าหมาย

- แยก Stripe Test และ Live Secret ออกจากกันอย่างชัดเจน
- เตรียม Live Webhook ที่ตรวจลายเซ็นจาก Raw Body
- บันทึกเฉพาะ Event ID, Type, เวลา และ SHA-256 Hash เพื่อ Audit
- ปิดกั้นการเปลี่ยน Invoice, Payment, Subscription และการรับเงินจริงทั้งหมด

## Environment Variables

| Environment | Secret Key | Webhook Signing Secret |
|---|---|---|
| Test | `STRIPE_SECRET_KEY` (`sk_test_...`) | `STRIPE_WEBHOOK_SECRET` (`whsec_...`) |
| Live | `STRIPE_LIVE_SECRET_KEY` (`sk_live_...`) | `STRIPE_LIVE_WEBHOOK_SECRET` (`whsec_...`) |

ค่าทั้งหมดเป็น Server-only ห้ามใช้คำนำหน้า `NEXT_PUBLIC_` และห้ามบันทึกค่าจริงใน Git, Log หรือฐานข้อมูล

## Live Webhook

- Endpoint: `POST /api/billing/stripe/live-webhook`
- ต้องมี `stripe-signature` และผ่านการตรวจด้วย Live Signing Secret
- ปฏิเสธ Test Event ที่ส่งผิด Endpoint
- Live Event ที่ผ่านจะเข้า `billing_live_webhook_inbox` ในสถานะ `blocked_by_emergency_stop`
- ไม่เก็บ Raw Payload และไม่เรียก RPC ประมวลผล Payment
- Event ซ้ำถูกกันด้วย Unique Provider Event ID

## Safety Boundary

Phase นี้ไม่มี Live Checkout Route, `STRIPE_LIVE_ACTIVATION` ต้องเป็น `disabled`, Database Emergency Stop ต้องเป็น `true` และ Live Webhook มีหน้าที่รับรองโครงสร้างกับเก็บหลักฐานเท่านั้น

## ขั้นต่อไป

Phase 1.1.3.7.3 จำกัดผู้ทดสอบ วงเงิน จำนวนรายการ และกำหนด Rollback ก่อนพิจารณาเปิด Controlled Live Checkout

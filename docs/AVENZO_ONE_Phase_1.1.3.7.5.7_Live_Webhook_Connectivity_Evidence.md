# AVENZO ONE — Phase 1.1.3.7.5.7 Live Webhook Connectivity Evidence

## เป้าหมาย

แสดงหลักฐานอย่างซื่อตรงว่า Stripe Live Webhook เชื่อมต่อถึง Production และ Event ถูกกักโดย Emergency Stop โดยไม่สร้าง Checkout ไม่เรียกเก็บเงินจริง และไม่เปลี่ยน Invoice หรือ Subscription

## หลักฐานที่ตรวจ

- Endpoint เป็น URL สาธารณะ HTTPS
- Live API Secret และ Live Webhook Secret ตั้งค่าฝั่ง Server ครบ โดยไม่แสดงค่าจริง
- Emergency Stop ทำงานอยู่
- พบ Event จริงที่มี `livemode=true` และผ่านการตรวจลายเซ็นก่อนบันทึก
- Event มี SHA-256 Metadata และสถานะ `blocked_by_emergency_stop`
- Endpoint อยู่ในโหมด `verify_and_quarantine` และไม่มี Business Mutation

## สถานะที่แสดง

- **เงื่อนไขยังไม่พร้อม** — URL, Secret หรือ Emergency Stop ไม่ครบ
- **ระบบพร้อม รอ Live Event แรก** — โครงสร้างพร้อมแต่ยังไม่มีหลักฐาน Event จริง
- **พบหลักฐานการเชื่อมต่อแล้ว** — ทุกเงื่อนไขผ่านและพบ Event จริงที่ถูกกัก

ระบบห้ามเปลี่ยนสถานะเป็นผ่านจาก Event จำลองหรือข้อมูลที่กรอกเอง

## ความเป็นส่วนตัวและความปลอดภัย

- อ่านจาก `billing_live_webhook_inbox` เดิม จึงไม่เพิ่มตารางหรือสิทธิ์ใหม่
- เก็บเฉพาะ Event ID, Type, เวลา, Live Mode, สถานะ และ SHA-256
- ไม่เก็บ Raw Payload, ชื่อลูกค้า, อีเมล หรือข้อมูลการชำระเงิน
- ไม่มีปุ่มส่ง Event และไม่มีการเรียก Stripe API จากการ์ดหลักฐาน

## วิธีทดสอบ Local

1. Login เป็น Platform Admin และผ่าน MFA
2. เปิด `/platform-admin/billing/live-control`
3. ดูการ์ด **หลักฐานการเชื่อมต่อ Stripe Live Webhook**
4. ก่อนมี Live Event ต้องขึ้น **ระบบพร้อม รอ Live Event แรก** หรือแสดงเงื่อนไขที่ยังขาด ห้ามขึ้นว่าหลักฐานครบ
5. ตรวจว่าไม่มี Checkout, Invoice, Subscription หรือรายการเงินจริงใหม่จากการเปิดหน้านี้

## ผลการทดสอบ Production

- ทดสอบกับ Stripe Live Mode ผ่านครบ `6/6`
- Production Endpoint เป็น HTTPS และเข้าถึงได้
- Live API Secret และ Live Webhook Secret ถูกตั้งค่าฝั่ง Server ครบ
- รับ `customer.created` ที่มี `livemode=true` และผ่านการตรวจลายเซ็นสำเร็จ
- Event ถูกกักด้วยสถานะ `blocked_by_emergency_stop`
- ไม่สร้าง Checkout, ไม่เรียกเก็บเงินจริง และไม่เปลี่ยน Invoice หรือ Subscription
- หลังเก็บหลักฐานครบแล้ว ได้นำ `customer.created` ออกจาก Stripe Live Event destination เรียบร้อย

## สถานะ

Completed / ปิด Phase หลังทดสอบ Production ผ่าน

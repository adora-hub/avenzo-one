# AVENZO ONE — Phase 1.0.5.2 Scheduler & Delivery Worker

อัปเดต: 8 สิงหาคม 2026

## เป้าหมาย

ประมวลผลคิวแจ้งเตือน Subscription อย่างปลอดภัย ส่งผ่าน Resend เมื่อถึงกำหนด รองรับการลองใหม่ และตรวจสอบประวัติการส่งย้อนหลังได้

## กลไกป้องกันการส่งซ้ำ

- Worker Claim คิวด้วย `FOR UPDATE SKIP LOCKED` เพื่อไม่ให้ Worker หลายตัวหยิบรายการเดียวกัน
- แต่ละ Claim มี `lock_token` และหมดอายุอัตโนมัติหลัง 10 นาทีหาก Worker หยุดทำงาน
- ใช้ Queue ID เป็น Resend Idempotency Key ป้องกันอีเมลซ้ำอีกชั้นหนึ่ง
- Delivery สำเร็จต้องมี `sent_at`; งานที่ส่งแล้วจะไม่ถูก Claim ซ้ำ
- Retry แบบ Exponential Backoff: 5, 10, 20, 40 และ 80 นาที สูงสุด 5 ครั้ง

## ความเป็นส่วนตัวและสิทธิ์

- Worker RPC เรียกได้เฉพาะ Supabase `service_role`
- Platform Admin ต้องผ่าน MFA ระดับ AAL2 จึงอ่าน Delivery Log หรือสั่งลองใหม่ได้
- Resolve อีเมล Owner จาก Supabase Auth เฉพาะตอนส่ง ไม่ทำสำเนาอีเมลลง Queue หรือ Delivery Log
- Delivery Log เก็บเฉพาะผลลัพธ์, Error Code ที่ปลอดภัย และ Resend Message ID

## UI

- แสดงโหมด Worker ว่า “ตรวจสอบเท่านั้น” หรือ “ส่งอีเมลจริง”
- ปุ่มตรวจรายการถึงกำหนดสำหรับ Platform Admin
- แสดงจำนวนครั้งที่ลองส่งต่อ Queue
- รายการ Failed มีปุ่ม “ลองส่งใหม่”
- แสดง Delivery Log ล่าสุด 20 รายการ

## Scheduler

- เพิ่ม Vercel Cron Route: `/api/cron/subscription-notifications`
- ตั้งเวลาเริ่มต้นทุกต้นชั่วโมงด้วย `0 * * * *`
- Route ตรวจ `Authorization: Bearer <CRON_SECRET>` ก่อนทำงาน
- Cron ทำงานบน Production Deployment เท่านั้น และตารางเวลารายชั่วโมงต้องใช้ Vercel Plan ที่รองรับ

## Environment Variables

```env
SUBSCRIPTION_NOTIFICATION_DELIVERY_MODE=preview
RESEND_API_KEY=re_xxx
RESEND_FROM_EMAIL=no-reply@avenzoone.com
NEXT_PUBLIC_APP_URL=https://your-production-domain.example
CRON_SECRET=long-random-secret
```

ค่าเริ่มต้นเป็น `preview` เสมอ หากไม่ได้กำหนด `live` ระบบจะคำนวณจำนวนรายการถึงกำหนดแต่ไม่ Claim และไม่ส่งอีเมล

## ผลการทดสอบ

- Migration ใช้งานบน Supabase สำเร็จ
- Queue Generation ซ้ำได้ 0 รายการ และคิวจริงคงเดิม 7 รายการ
- เวลาปัจจุบันมี 0 รายการถึงกำหนด
- Claim + Failure สร้างผล `retrying` และกำหนดลองใหม่หลัง 5 นาที
- Claim + Success สร้างผล `sent`, `sent_at` และ Provider Message ID
- การทดสอบ Claim/Complete ใช้ Transaction และ rollback จึงไม่เปลี่ยนข้อมูลจริง
- AAL1 อ่าน Delivery Log ได้ 0 รายการ
- TypeScript ผ่าน และ UI Preview ไม่มี Console Error

## สถานะ

Implemented และทดสอบผ่านใน Preview Mode; รอ Resend API Key และ Production URL เพื่อทดสอบส่งอีเมลจริงก่อนเปิด `live`

# AVENZO ONE — Phase 1.0.5.4 Production Deployment

วันที่ดำเนินการ: 8 สิงหาคม 2569 (2026)

## ผลลัพธ์

Phase 1.0.5.4 นำระบบ AVENZO ONE ขึ้น Production สำเร็จ โดยใช้ Vercel Hobby สำหรับ Web Application และใช้ Supabase Cron แทน Vercel Cron เพื่อให้ทำงานรายชั่วโมงได้โดยไม่ต้องอัปเกรด Vercel Pro

- Production URL: `https://app.avenzoone.com`
- Vercel fallback URL: `https://avenzo-one.vercel.app`
- Vercel project: `adora3/avenzo-one`
- Canonical production target: deploy AVENZO ONE to `adora3/avenzo-one` only. Never deploy this repository to `ADORA/adora-commerce-os`.
- Git branch: `main`
- Application root: `web`
- Supabase project: `eigrllibviqjddenjuch`
- Scheduler: Supabase Cron เวลา `0 * * * *` หรือทุกต้นชั่วโมง

## สถาปัตยกรรมการแจ้งเตือน

1. Supabase Cron เรียกฟังก์ชัน `private.invoke_subscription_notification_worker()`
2. ฟังก์ชันอ่าน `avenzo_app_url` และ `avenzo_cron_secret` จาก Supabase Vault
3. `pg_net` ส่ง `GET /api/cron/subscription-notifications` พร้อม Bearer Secret
4. Worker ตรวจ Subscription Notification Queue และส่งอีเมลผ่าน Resend
5. Resend ส่งสถานะกลับมาที่ `POST /api/webhooks/resend`
6. ระบบตรวจ Svix Signature แล้วบันทึกสถานะ delivered, delayed, failed, bounced, complained หรือ suppressed

## การตั้งค่า Production

### Cloudflare DNS

- Type: `CNAME`
- Name: `app`
- Target: `a4d84368acade73d.vercel-dns-017.com`
- Proxy: `DNS only`

### Supabase Auth

- Site URL: `https://app.avenzoone.com`
- Production redirect: `https://app.avenzoone.com/auth/callback`
- Local redirect: `http://localhost:3000/auth/callback`

### Vercel Environment Variables

ค่าที่ระบบต้องมี โดยห้ามบันทึกค่าจริงลง Git:

- `NEXT_PUBLIC_SUPABASE_URL`
- `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`
- `SUPABASE_SECRET_KEY`
- `SUBSCRIPTION_NOTIFICATION_DELIVERY_MODE=live`
- `RESEND_API_KEY`
- `RESEND_FROM_EMAIL`
- `RESEND_WEBHOOK_SECRET`
- `NEXT_PUBLIC_APP_URL=https://app.avenzoone.com`
- `CRON_SECRET`

### Supabase Vault

- `avenzo_app_url`
- `avenzo_cron_secret`

## หลักฐานการทดสอบ

| ขอบเขต | ผล | หลักฐาน |
|---|---|---|
| Production build | ผ่าน | Vercel สถานะ Ready, build 49 วินาที |
| หน้าเว็บจริง | ผ่าน | `https://app.avenzoone.com` แสดงหน้า Login ภาษาไทย |
| Browser console | ผ่าน | ไม่พบ Console Error |
| Cron ไม่มี Secret | ผ่าน | HTTP 401 |
| Cron มี Secret | ผ่าน | HTTP 200 |
| Supabase Cron → Production API | ผ่าน | `net._http_response.status_code = 200`, ไม่ timeout |
| Resend Webhook ไม่มี/ผิด Signature | ผ่าน | HTTP 400 แทน 503 แสดงว่า Production โหลด Signing Secret แล้ว |
| Runtime logs | ผ่าน | หน้าเว็บและหน้ากฎหมายตอบ HTTP 200; ไม่พบ HTTP 500 ในช่วงทดสอบ |

## ข้อจำกัดและงานที่ต้องติดตาม

- Supabase แผน Free ยังไม่เปิด Leaked Password Protection; Production Security Gate ของ Phase 0.9 ยังต้องติดตามเมื่อพร้อมอัปเกรด
- ควรเพิ่ม Production monitoring/alert สำหรับ Cron status ที่ไม่ใช่ 200 และ Resend delivery failures
- ต้องทดสอบอีเมลจากเหตุการณ์ Subscription จริงอย่างน้อยหนึ่งรายการเมื่อมี Queue ถึงกำหนด เพื่อยืนยัน Resend Webhook event แบบ signed ตั้งแต่ต้นจนจบ

## Rollback

1. ปิด job `avenzo-subscription-notifications-hourly` ด้วย `cron.unschedule`
2. ปิด Resend Webhook จาก Resend Dashboard
3. ถอด `app.avenzoone.com` จาก Vercel หรือเอา CNAME `app` ออกจาก Cloudflare
4. Vercel สามารถ Rollback ไป Deployment ก่อนหน้าได้โดยไม่แก้ฐานข้อมูล

# AVENZO ONE — Phase 1.0.6 Production Monitoring

อัปเดตล่าสุด: 8 สิงหาคม 2026

## เป้าหมาย

เพิ่มจุดตรวจสุขภาพสำหรับระบบแจ้งเตือน Subscription บน Production โดยดูเส้นทาง Cron → Worker → Queue → Resend → Webhook ได้จากหน้า Platform Admin โดยไม่เปิดเผยอีเมลผู้รับหรือ Secret

## สิ่งที่พัฒนา

- บันทึกผลการทำงานของ Worker แยกรอบ Cron และการสั่งด้วยตนเอง
- เก็บสถานะสำเร็จ/ล้มเหลว ระยะเวลา จำนวนคิวที่พบ ส่งสำเร็จ รอลองใหม่ และล้มเหลว
- เพิ่ม RPC `platform_subscription_notification_health` สำหรับ Platform Admin ที่ผ่าน MFA ระดับ AAL2 เท่านั้น
- เพิ่มการ์ดสุขภาพระบบและ Alert ภาษาไทยในหน้า `/platform-admin/subscription-notifications`
- ตรวจ Cron ที่ปิดหรือขาดรอบ, คิวค้าง, Retry ครบจำนวน, Webhook ล้มเหลว, Bounce/Complaint/Suppression และอีเมลที่ยังไม่มีสถานะจาก Resend
- เพิ่ม Structured Runtime Log ให้ Cron Worker และ Resend Webhook โดยไม่บันทึก Token, Secret หรืออีเมลผู้รับ
- จำกัด Environment Variables ทั้ง 9 รายการของ Vercel ให้ใช้เฉพาะ Production

## Security

- ตาราง `subscription_notification_worker_runs` เปิด RLS และไม่มีสิทธิ์อ่านตรงสำหรับ `anon` หรือ `authenticated`
- Worker RPC เรียกได้เฉพาะ `service_role`
- Health RPC ใช้ `security definer` เพราะต้องอ่านสถานะภายในของ Cron/pg_net แต่ตรวจ `private.is_platform_admin()` ซึ่งบังคับ Platform Admin สถานะ active และ AAL2 ก่อนทุกครั้ง
- Health Response ไม่ส่งอีเมลผู้รับ, Provider Payload, API Key หรือ Secret กลับไปที่ UI

## Acceptance Criteria

- TypeScript และ Production Build ผ่าน
- Migration ถูกใช้กับ Supabase Production และตรวจสิทธิ์แล้ว
- Cron เรียก Production Endpoint ได้ HTTP 200
- Worker Run มีหลักฐานในฐานข้อมูลและแสดงบนหน้า Monitoring
- Platform Admin เห็นสถานะและ Alert ภาษาไทยหลังผ่าน MFA
- Vercel Runtime ไม่มี Error ใหม่จากเส้นทาง Cron และ Webhook

## หมายเหตุการเปิดใช้งาน

การเปลี่ยน Environment Variable Scope ต้องมี Production Redeployment ใหม่จึงจะมีผลกับ Deployment ปัจจุบัน


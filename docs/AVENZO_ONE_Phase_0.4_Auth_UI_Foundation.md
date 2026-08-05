# AVENZO ONE — Phase 0.4 Auth & UI Foundation

สถานะ: Completed / Build Verified

## Application

โครงสร้าง Next.js App Router อยู่ที่ `web/` และเชื่อมกับ Supabase ด้วย `@supabase/ssr`

## Routes

- `/` — Login และ Sign-up ด้วย Email/Password
- `/auth/callback` — แลก Auth Code เป็น Session
- `/dashboard` — แสดง Subscription ของ Organization ที่ผู้ใช้เข้าถึงได้
- `/platform-admin` — แสดง Organization สำหรับ Platform Admin
- `/platform-admin` — Provision/Renew/Cancel/Adjust Subscription พร้อมเหตุผล
- `/onboarding` — สร้าง Organization/Workspace สำหรับบัญชีที่ Login แล้ว
- Session Refresh ผ่าน `web/src/middleware.ts` และ Supabase SSR cookies

## Subscription Countdown

Dashboard อ่านจาก View `organization_subscription_status` และแสดงเวลาที่เหลือแบบ live:

- วัน
- ชั่วโมง
- นาที
- วินาที

## Environment

สร้างไฟล์ `.env.local` จาก `web/.env.example` แล้วใส่เฉพาะ:

```text
NEXT_PUBLIC_SUPABASE_URL=https://<project-ref>.supabase.co
NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=<publishable-key>
```

ห้ามใส่ `service_role`, Secret Key หรือ Database Password ใน Browser/App Repository

## Verification

- `npm install` สำเร็จ
- `npm run build` สำเร็จบน Next.js 15.5.22
- Middleware ป้องกันหน้า `/dashboard` และ `/platform-admin` เมื่อไม่มี Session
- TypeScript ตรวจผ่าน

## ข้อจำกัด

- ต้องตั้งค่า Email Auth/Redirect URL ใน Supabase ก่อนทดสอบ Login จริง
- ต้อง Bootstrap Platform Admin ด้วย Auth User UUID จริง
- ยังไม่มีหน้า Action สำหรับ Suspend/Renew เพราะต้องยืนยัน UX และสิทธิ์ผู้ปฏิบัติงานก่อน
- `npm install` รายงาน dependency vulnerabilities ระดับ high จำนวน 3 รายการ ต้องจัดการแยกเป็น Security Maintenance Task โดยไม่ใช้ `npm audit fix --force` อัตโนมัติ

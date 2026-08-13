# Phase 1.2.4.2.3 — RLS InitPlan Optimization

## เป้าหมาย

ลดการประเมิน JWT ซ้ำทุกแถวใน Row Level Security โดยไม่เปลี่ยนผู้มีสิทธิ์เข้าถึงข้อมูล ไม่ลดข้อกำหนด MFA และไม่แก้ข้อมูลธุรกิจ

## ผลตรวจ Current State

Supabase Performance Advisor วันที่ 11 สิงหาคม 2569 พบ `auth_rls_initplan` 1 รายการ:

- ตาราง: `public.billing_live_shadow_commands`
- Policy: `aal2 platform admins read billing live shadow commands`
- คำสั่ง: `SELECT`
- Role: `authenticated`
- เงื่อนไขเดิมยังบังคับ Platform Admin และ AAL2

Policy อื่นที่เรียก `auth.uid()` หรือ `auth.jwt()` ใช้ Scalar Subquery อยู่แล้ว จึงไม่ต้องแก้ใน Phase นี้

## การเปลี่ยนแปลง

เปลี่ยนเฉพาะรูปแบบอ่านค่า AAL จาก:

```sql
(select auth.jwt() ->> 'aal') = 'aal2'
```

เป็น:

```sql
((select auth.jwt()) ->> 'aal') = 'aal2'
```

รูปแบบใหม่ทำให้ PostgreSQL วาง `auth.jwt()` เป็น InitPlan และนำค่าที่ไม่ขึ้นกับแต่ละแถวกลับมาใช้ซ้ำได้

## สิ่งที่ไม่เปลี่ยน

- ชื่อ Policy และตาราง
- Role `authenticated`
- คำสั่ง `SELECT`
- เงื่อนไข Platform Admin
- เงื่อนไข AAL2 / MFA
- Grants, RLS state, Schema และข้อมูลในตาราง

## ไฟล์ส่งมอบ

- Migration: `supabase/migrations/20260811205313_phase_1_2_4_2_3_rls_initplan_optimization.sql`
- Contract Test: `web/scripts/test-supabase-rls-initplan-optimization.mjs`
- คำสั่งทดสอบ: `npm run test:supabase-rls-initplan`

## Production Gate

สถานะ: **Completed / Production Migration Applied / Verified**

นำ Migration ไปใช้กับ Supabase Production โปรเจกต์ AVENZO ONE เมื่อวันที่ 11 สิงหาคม 2569 แล้ว และตรวจยืนยันดังนี้:

- Migration History มี `phase_1_2_4_2_3_rls_initplan_optimization`
- Policy ยังคงเป็น `PERMISSIVE`, Role `authenticated` และคำสั่ง `SELECT`
- เงื่อนไขยังบังคับ `private.is_platform_admin()` และ JWT `aal2`
- Performance Advisor ไม่พบ `auth_rls_initplan` เหลืออยู่ (`0` รายการ)
- Security Advisor ไม่พบคำเตือนใหม่ที่อ้างถึง `public.billing_live_shadow_commands`

เอกสารอ้างอิง: [Supabase RLS — Call functions with select](https://supabase.com/docs/guides/database/postgres/row-level-security#call-functions-with-select)

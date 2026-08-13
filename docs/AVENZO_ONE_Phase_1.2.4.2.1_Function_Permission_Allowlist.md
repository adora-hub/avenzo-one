# AVENZO ONE — Phase 1.2.4.2.1 Function Permission Allowlist

วันที่จัดทำ: 11 สิงหาคม 2569

Supabase Project เป้าหมาย: `eigrllibviqjddenjuch`

สถานะ: **Completed — ใช้ Migration กับ Supabase Production และตรวจสิทธิ์จริงแล้ว**

## เป้าหมาย

กำหนดรายชื่อฟังก์ชัน `SECURITY DEFINER` ที่ Role `authenticated` เรียกได้อย่างชัดเจน เพื่อลดพื้นที่โจมตีและป้องกันไม่ให้ฟังก์ชันภายในถูกเปิดให้ Browser โดยไม่ตั้งใจ

Supabase ระบุว่าฟังก์ชันฐานข้อมูลใหม่อาจมีสิทธิ์ `EXECUTE` สำหรับทุก Role โดยค่าเริ่มต้น จึงต้องใช้ `REVOKE` และ `GRANT` อย่างเจาะจงใน Migration

## ผลการจำแนก

| กลุ่ม | จำนวน | การอนุญาต |
|---|---:|---|
| Application Allowlist | 42 | `authenticated` และ `service_role` |
| Internal / Server-only | 14 | `service_role` เท่านั้น |
| รวม SECURITY DEFINER ที่ตรวจ | 56 | ทุกฟังก์ชันถูกจำแนกหนึ่งครั้ง |

### 3 ฟังก์ชันที่ถอนสิทธิ์ `authenticated` เพิ่มใน Phase นี้

1. `current_app_session_policy()` — ตัวช่วยภายในสำหรับคำนวณ Session Policy
2. `platform_billing_transfer_fulfillment_queue()` — Endpoint รุ่นเก่า; แอปปัจจุบันใช้รุ่น `v2`
3. `platform_cancel_billing_credit_note(uuid,text)` — ยังไม่มี Flow/UI ของแอปที่เรียกใช้งาน

อีก 11 ฟังก์ชันเป็น Server/Webhook/Worker ที่เดิมจำกัดไว้เฉพาะ `service_role` อยู่แล้ว

## สิ่งที่ Migration ทำ

- ตั้ง Default Privilege สำหรับฟังก์ชันใหม่ที่สร้างโดย `postgres` ไม่ให้ `public`, `anon` หรือ `authenticated` ได้ `EXECUTE` อัตโนมัติ
- ถอน `EXECUTE` ของทั้ง 56 ฟังก์ชันก่อนทุกครั้ง เพื่อเริ่มจาก deny-by-default
- ให้ `service_role` เรียกทั้ง 56 ฟังก์ชันสำหรับงาน Server ที่ไว้ใจได้
- ให้ `authenticated` เรียกเฉพาะ 42 ฟังก์ชันใน Allowlist
- ไม่เปลี่ยนสิทธิ์ของฟังก์ชัน `SECURITY INVOKER` อื่นในระบบ

Migration: `supabase/migrations/20260811124120_phase_1_2_4_2_1_function_permission_allowlist.sql`

## การทดสอบ Local

รันจากโฟลเดอร์ `web`:

```powershell
npm.cmd run test:supabase-function-permissions
npm.cmd run build
```

Contract Test ตรวจว่า:

- มีการจำแนกครบ 56 รายการและไม่มีรายการซ้ำ
- Allowlist มี 42 รายการ และ Server-only มี 14 รายการ
- ไม่มีการ `GRANT` ให้ `anon` หรือ `public`
- 3 ฟังก์ชันที่ถอนสิทธิ์ไม่หลุดกลับเข้า Allowlist
- ฟังก์ชันหลักที่หน้าเว็บใช้งานยังคงอยู่ใน Allowlist

## ผลการใช้กับ Supabase Production

ใช้ Migration กับโปรเจกต์ `eigrllibviqjddenjuch` สำเร็จเมื่อ 11 สิงหาคม 2569 และตรวจสิทธิ์จากฐานข้อมูลจริงแล้ว:

| รายการตรวจ | ผล Production |
|---|---:|
| SECURITY DEFINER ทั้งหมด | 56 |
| `authenticated` เรียกได้ | 42 |
| `service_role` เรียกได้ | 56 |
| `anon` เรียกได้ | 0 |
| `public` เรียกได้ | 0 |

- Default Privilege ของฟังก์ชันใหม่ใน `public` เหลือ `postgres` และ `service_role`
- 3 ฟังก์ชันที่ลดสิทธิ์ตรวจแล้วว่า `authenticated=false`, `anon=false`, `public=false` และ `service_role=true`
- Security Advisor หลัง Migration พบ 48 รายการ: INFO 5 และ WARN 43
- WARN 42 รายการเป็น SECURITY DEFINER ใน Application Allowlist ที่ตั้งใจให้ผู้ใช้ที่ลงชื่อเข้าใช้เรียก โดยทุกฟังก์ชันต้องตรวจสิทธิ์ภายในตาม Contract ของระบบ
- WARN ที่เหลือ 1 รายการคือ Leaked Password Protection ซึ่งต้องใช้ Supabase Pro จึงยังเป็น Production Security Gate ที่ค้างอยู่
- INFO 5 รายการเป็นตารางใน schema `private` ที่เปิด RLS แต่ไม่มี Policy โดยตั้งใจไม่เปิดให้ Client เข้าถึงโดยตรง

## Rollback เฉพาะกรณีจำเป็น

หาก Smoke Test หลังใช้ Migration พบ Flow เก่าที่มีหลักฐานว่าจำเป็น ให้คืนสิทธิ์เฉพาะ Signature ที่ได้รับผลกระทบ เช่น:

```sql
grant execute on function public.platform_billing_transfer_fulfillment_queue() to authenticated;
```

ห้ามคืนสิทธิ์แบบ `grant execute on all functions` เพราะจะทำลาย Allowlist

## ขอบเขตที่ยังไม่ทำ

- ยังไม่ Commit, Push หรือ Deploy
- ยังไม่ถอน Table Grant ของ `anon` (เป็น Phase 1.2.4.2.2)

## แผนถัดไป

**Phase 1.2.4.2.2 — Anonymous Grant Hardening**: ตรวจ Contract ของ Login, Invitation และ Public Auth Flow จากนั้นถอน Table Grant ของ `anon` บน 4 ตารางที่ไม่จำเป็น พร้อม Regression Test ก่อนใช้ Production

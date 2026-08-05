# AVENZO ONE — Phase 0.3 Platform Admin Control

สถานะ: Completed / Deployed to Supabase

Supabase Project: `AVENZO ONE` (`eigrllibviqjddenjuch`)

Migration ที่ Deploy แล้ว:

- `phase_0_3_platform_admin_control`
- `phase_0_3_merge_platform_policies`

## เป้าหมาย

ให้ Platform Admin สามารถตรวจสอบ พัก ระงับ แบน และเปิดใช้งาน Organization/Branch ได้ โดยมีเหตุผล หลักฐาน และประวัติการดำเนินการทุกครั้ง

## สถานะที่รองรับ

| สถานะ | ความหมาย |
|---|---|
| `active` | ใช้งานปกติ |
| `review` | อยู่ระหว่างตรวจสอบ |
| `suspended` | ระงับชั่วคราว |
| `banned` | แบนถาวรตามนโยบาย |
| `inactive` | ปิดใช้งานทั่วไป |

## สิ่งที่เพิ่ม

- `platform_admins` — รายชื่อ Platform Admin ที่ได้รับอนุญาตเท่านั้น
- `organization_moderation_actions` — Audit Trail ของการตรวจสอบ/ระงับ/แบน/กู้คืน
- `private.is_platform_admin()` — ตรวจสิทธิ์ Platform Admin ในฐานข้อมูล
- `platform_moderate_organization(...)` — คำสั่งกลางที่เปลี่ยนสถานะและบันทึกประวัติใน Transaction เดียว
- RLS สำหรับ Platform Admin ใน Organization, Branch และ Moderation History
- ป้องกัน Tenant Admin เปลี่ยนสถานะระงับ/แบนโดยตรง

## กติกาการใช้งาน

1. Platform Admin ต้องถูกเพิ่มใน `platform_admins` โดยผู้ดูแลระบบ/Service Role เท่านั้น
2. ทุกการดำเนินการต้องระบุ `reason`
3. การแบน/ระงับ Organization จะทำให้ Permission ของสมาชิกภายในใช้งานไม่ได้ เพราะ Permission ตรวจ Organization Status
4. การระงับ Branch จะปิดเฉพาะ Scope ของ Branch นั้น
5. ประวัติ Moderation ห้ามแก้ไขหรือลบผ่าน API

## Bootstrap Platform Admin

หลังมีบัญชีใน Supabase Auth แล้ว ให้ผู้ดูแลระบบยืนยัน User UUID ก่อนเพิ่มข้อมูลใน `platform_admins` ผ่าน Supabase SQL Editor หรือ Backend ที่ใช้ Secret Key เท่านั้น ห้ามเปิดช่องให้ผู้ใช้ทั่วไปเพิ่มตัวเอง

## ข้อจำกัดของขั้นนี้

- ยังไม่มีหน้า UI สำหรับ Platform Admin
- ยังไม่มีระบบแนบไฟล์หลักฐานจริง ใช้ `evidence jsonb` เป็นโครงสร้างเตรียมไว้
- ยังไม่ได้ทำ Auth End-to-End Test ด้วยบัญชีจริง

## เกณฑ์ตรวจสอบ

- [x] ตาราง Platform Admin และ Moderation History เปิด RLS
- [x] Platform Admin เท่านั้นที่อ่านประวัติการดำเนินการได้
- [x] การเปลี่ยนสถานะต้องระบุเหตุผล
- [x] Tenant Admin ไม่สามารถเปลี่ยนสถานะระงับ/แบนโดยตรง
- [x] Security Advisor ไม่พบปัญหาใหม่
- [ ] Bootstrap Platform Admin ด้วย Auth User UUID จริง
- [ ] ทดสอบ Suspend/Restore ผ่านบัญชี Auth จริง

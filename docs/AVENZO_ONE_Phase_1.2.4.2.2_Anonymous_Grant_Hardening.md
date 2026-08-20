# AVENZO ONE — Phase 1.2.4.2.2 Anonymous Grant Hardening

สถานะ: **Completed / Production Migration Applied / Verified**

วันที่: 11 สิงหาคม 2569

## เป้าหมาย

ถอนสิทธิ์ฐานข้อมูลของผู้ใช้ที่ยังไม่ได้เข้าสู่ระบบ (`anon`) ออกจากตารางข้อมูล Tenant ที่ไม่จำเป็นต้องเปิดสาธารณะ โดยไม่กระทบ Login, สมัครบัญชี, ลืมรหัสผ่าน และคำเชิญเข้า Workspace

ตารางที่อยู่ในขอบเขต:

- `public.branches`
- `public.member_branches`
- `public.organization_members`
- `public.organizations`

## ผลตรวจ Production ก่อนแก้ไข

- ทั้ง 4 ตารางเปิดใช้ Row Level Security แล้ว
- Policy ของทั้ง 4 ตารางกำหนดให้ role `authenticated` เท่านั้น
- แต่สิทธิ์ระดับตารางยังให้ `anon` ครบหลายคำสั่งโดยไม่จำเป็น
- Default privileges เดิมยังทำให้ตารางและ sequence ใหม่ที่สร้างโดย `postgres` สืบทอดสิทธิ์ `anon`

การมี RLS ช่วยจำกัดแถวข้อมูล แต่ไม่ควรใช้แทนการกำหนดสิทธิ์ระดับตาราง จึงต้องใช้ทั้ง Grants และ RLS ร่วมกัน

## สัญญาการทำงานของ Public Auth

| การทำงาน | แหล่งข้อมูล | ผลกระทบจากการถอนสิทธิ์ `anon` |
|---|---|---|
| Login / สมัครบัญชี / ลืมรหัสผ่าน | Supabase Auth | ไม่กระทบ |
| Auth callback | แลก Code หรือยืนยัน OTP ผ่าน Supabase Auth | ไม่กระทบ |
| เปิดหน้าคำเชิญ | ตรวจ Session ก่อน แล้ว Server อ่าน `organization_invitations` | ไม่กระทบ |
| ยอมรับคำเชิญ | RPC หลังยืนยันตัวตนแล้ว | ไม่กระทบ |
| Dashboard / Organization / Branch | ผู้ใช้ `authenticated` และ RLS | ไม่กระทบ |

## Migration ที่นำขึ้น Production แล้ว

ไฟล์ `supabase/migrations/20260811133658_phase_1_2_4_2_2_anonymous_grant_hardening.sql`

Migration จะ:

1. ถอนสิทธิ์ทั้งหมดของ `anon` จาก 4 ตารางในขอบเขต
2. ป้องกันตารางใหม่ใน `public` ที่สร้างโดย `postgres` ไม่ให้ได้รับสิทธิ์ `anon` อัตโนมัติ
3. ป้องกัน sequence ใหม่ใน `public` ที่สร้างโดย `postgres` ไม่ให้ได้รับสิทธิ์ `anon` อัตโนมัติ

Migration จะไม่:

- เปลี่ยนสิทธิ์ `authenticated`
- เปลี่ยนสิทธิ์ `service_role`
- เปลี่ยน Supabase Auth
- ถอนสิทธิ์จาก sequence เดิมทั้งหมด
- แก้ไขข้อมูล Production

## การทดสอบ Local

รันจากโฟลเดอร์ `web`:

```powershell
npm.cmd run test:supabase-anon-grants
npm.cmd run test:supabase-function-permissions
npm.cmd run test:session-security-regression
npx.cmd tsc --noEmit --incremental false
```

ชุดทดสอบตรวจว่า Migration ถอนสิทธิ์เฉพาะขอบเขตที่อนุมัติ, ไม่แตะสิทธิ์ของผู้ใช้ที่เข้าสู่ระบบ และ Public Auth ไม่อ่าน 4 ตารางนี้ก่อนยืนยันตัวตน

## ผลตรวจ Production หลัง Migration

นำ Migration `phase_1_2_4_2_2_anonymous_grant_hardening` ไปใช้กับ Supabase Production โปรเจกต์ `eigrllibviqjddenjuch` สำเร็จแล้ว และบันทึกอยู่ใน Migration History

| ตาราง | `anon` | `authenticated` | `service_role` | RLS | Policy สำหรับ `anon` |
|---|---:|---:|---:|---|---:|
| `branches` | 0 | 6 | 7 | เปิด | 0 |
| `member_branches` | 0 | 1 | 7 | เปิด | 0 |
| `organization_members` | 0 | 1 | 7 | เปิด | 0 |
| `organizations` | 0 | 6 | 7 | เปิด | 0 |

ผลตรวจเพิ่มเติม:

- Default ACL ของตารางใหม่สำหรับ `anon` เหลือ 0 รายการ
- Default ACL ของ sequence ใหม่สำหรับ `anon` เหลือ 0 รายการ
- Policy เดิมของ `authenticated` ยังอยู่ครบ และไม่มี Policy ที่เปิดให้ `anon`
- Security Advisor ไม่พบรายการใหม่ที่เกี่ยวกับ 4 ตารางในขอบเขต
- Security Advisor คงเหลือรายการเดิม 48 รายการ: `INFO` 5 และ `WARN` 43 โดยเป็น RLS ที่ตั้งใจไม่มี Policy 5 รายการ, SECURITY DEFINER Allowlist 42 รายการ และ Leaked Password Protection 1 รายการ

Public Auth Contract และ Local regression tests ยืนยันแล้วว่า Login, สมัครบัญชี, ลืมรหัสผ่าน, Auth Callback และ Invitation ไม่พึ่งสิทธิ์ `anon` ของ 4 ตารางนี้

## แนวทางย้อนกลับ

หากพบ Regression ที่ยืนยันได้ ให้คืนเฉพาะ privilege ที่จำเป็นต่อ table และ operation ที่พิสูจน์แล้วเท่านั้น ห้ามคืนด้วย `grant all` และต้องบันทึกเหตุผลใน Audit/เอกสารการเปลี่ยนแปลง

## แผนถัดไป

หลังนำ Migration นี้ขึ้น Production และตรวจผ่าน จึงเริ่ม **Phase 1.2.4.2.3 — RLS InitPlan Optimization**

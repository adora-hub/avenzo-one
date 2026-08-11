# AVENZO ONE — Phase 1.2.1 Session Policy Foundation

## สถานะ

Implemented / Contract Test, TypeScript และ Production Build ผ่าน / ใช้ Migration กับ Supabase Production แล้วเมื่อ 11 ส.ค. 2569 / รอทดสอบด้วยบัญชีจริง

## เป้าหมาย

สร้างแหล่งนโยบาย Session กลางและโครงสร้างบันทึก Session ของแอป โดยยังไม่บังคับ Logout หรือปฏิเสธคำขอเมื่อหมดเวลา การบังคับใช้ฝั่ง Server เป็น Phase 1.2.2

## นโยบายเริ่มต้น

| ระดับบัญชี | ไม่มีการใช้งาน | อายุสูงสุด | แจ้งเตือนล่วงหน้า |
|---|---:|---:|---:|
| Super Admin / Platform Admin (`privileged`) | 30 นาที | 8 ชั่วโมง | 5 นาที |
| Owner / Admin / Staff / Viewer (`organization`) | 8 ชั่วโมง | 7 วัน | 5 นาที |

บัญชี Platform Admin ที่มีสถานะ `active` จะได้รับนโยบาย `privileged` แม้ Session ยังเป็น `aal1` ระหว่างขั้นตอน Login/MFA เพื่อไม่ลดระดับความปลอดภัยก่อน Challenge เสร็จ

## สิ่งที่พัฒนา

1. `private.app_session_policies` เก็บนโยบายและ Version ฝั่ง Server
2. `private.app_sessions` ผูก `auth.uid()` กับ `session_id` จาก Supabase JWT และเก็บ Snapshot ของนโยบาย
3. `private.app_session_security_events` เก็บหลักฐานการลงทะเบียนหรือเปลี่ยนระดับนโยบายแบบ append-only
4. RPC `current_app_session_policy()` อ่านนโยบายของบัญชีปัจจุบัน
5. RPC `app_register_current_session()` ลงทะเบียน/อัปเดตเฉพาะ Session ปัจจุบัน
6. RPC `app_current_session_status()` อ่านสถานะเฉพาะ Session ปัจจุบัน
7. `web/src/lib/session-policy.ts` เป็นสัญญากลางสำหรับ TypeScript และข้อความภาษาไทย

## Security Controls

- ตารางทั้งหมดอยู่ใน `private` schema เปิด RLS และไม่ให้ `anon` หรือ `authenticated` อ่าน/เขียนโดยตรง
- RPC ตรวจ `auth.uid()` และ `session_id` จาก JWT
- Session ID เดียวกันไม่สามารถเปลี่ยนเจ้าของได้
- ฝั่ง Browser ไม่สามารถเลือก Policy Tier เองได้
- Policy ถูก Snapshot ลง Session เพื่อรองรับ Audit และการเปลี่ยน Version ในอนาคต
- Phase นี้ไม่ลบ Supabase Session, ไม่บังคับ Logout และไม่เปลี่ยน Middleware

## วิธีทดสอบหลังใช้ Migration

1. Login ด้วย Super Admin หรือ Platform Admin
2. เรียก RPC `current_app_session_policy()` ต้องได้ `privileged`, 1,800 วินาที และ 28,800 วินาที
3. เรียก RPC `app_register_current_session()` ต้องสร้าง Session พร้อม `revoked = false`
4. เรียก RPC `app_current_session_status()` ต้องได้ `registered = true`
5. Login ด้วยบัญชี Owner/Staff แล้วทำซ้ำ ต้องได้ `organization`, 28,800 วินาที และ 604,800 วินาที
6. ยืนยันว่าทั้งสองบัญชียังใช้งานต่อได้แม้ปรับเวลาทดสอบ เพราะ Phase นี้ยังไม่บังคับหมดอายุ

## Acceptance Criteria

- TypeScript และ Production Build ผ่านแล้ว
- Contract test ของนโยบาย/RPC/RLS ผ่าน 4/4 ข้อ
- ตรวจ Production แล้วพบ Policy 2 ระดับ, ตาราง Private 3 ตารางเปิด RLS และ RPC 3 รายการปิดสิทธิ์ `anon` ครบ
- ไม่มี direct table grant ให้ Browser
- ไม่แตะ Billing, Invoice, Payment หรือ Subscription
- ผู้ใช้อนุมัติและนำ Migration ไปใช้กับ Supabase Production สำเร็จแล้ว

## แผนถัดไป

Phase 1.2.2 — Server-side Session Enforcement: ตรวจ Idle/Absolute/Revoked ก่อนเข้าหน้าป้องกันและ API สำคัญ พร้อม Redirect แบบเก็บ `next` อย่างปลอดภัย

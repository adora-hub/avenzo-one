# AVENZO ONE — Phase 0.10.3 Platform Admin AAL2 RLS Enforcement

Status: Implemented / Awaiting end-to-end user test

## เป้าหมาย

บังคับให้บัญชี Platform Admin ต้องผ่าน TOTP MFA และมี Session ระดับ `aal2` ก่อนใช้สิทธิ์ Control Plane ที่ฐานข้อมูล แม้ผู้ใช้จะพยายามเรียก Supabase Data API หรือ RPC โดยตรงโดยไม่ผ่านหน้าเว็บ

## การทำงาน

1. `private.is_platform_admin()` ตรวจว่าบัญชีอยู่ใน `platform_admins` และมีสถานะ `active`
2. ฟังก์ชันตรวจค่า `aal` จาก JWT ของ Session ปัจจุบัน
3. คืนค่า `true` เฉพาะเมื่อ `aal = aal2`
4. RLS Policy และ RPC ของ Platform Admin ที่ใช้งานฟังก์ชันนี้จึงถูกบังคับ MFA จากฐานข้อมูลโดยอัตโนมัติ

## ขอบเขตการป้องกัน

- การอ่านและแก้ไข Organization/Branch ด้วยสิทธิ์ Platform Admin
- Moderation history และการพัก ระงับ แบน หรือเปิดใช้งานอีกครั้ง
- การสร้าง แก้ไข และดู Subscription/Event ด้วยสิทธิ์ Platform Admin
- RPC ของ Platform Admin ที่ตรวจ `private.is_platform_admin()`
- การบันทึก Audit ของ MFA หลังยืนยันสำเร็จ
- ตาราง Platform Security Audit มีนโยบายปฏิเสธการเข้าถึงโดยตรงอย่างชัดเจนและใช้งานผ่าน Trusted Writer เท่านั้น

บัญชี Owner, Admin, Staff และ Viewer ของ Organization ยังคงใช้สิทธิ์ Tenant RBAC เดิม ไม่ถูกบังคับ `aal2` จากกฎ Platform Admin นี้

## การรองรับหน้า Login และ MFA

ตาราง `platform_admins` ยังอนุญาตให้ผู้ใช้ดูสถานะ Platform Admin ของบัญชีตนเองที่ `aal1` เพื่อให้ระบบทราบว่าต้องส่งไปหน้า MFA จากนั้นสิทธิ์ Control Plane จะเปิดเมื่อ Session ยกระดับเป็น `aal2` เท่านั้น

## Acceptance Test

1. Logout แล้ว Login บัญชี Platform Admin ใหม่
2. ก่อนกรอกรหัส TOTP ระบบต้องส่งไป `/auth/mfa`
3. Session ระดับ `aal1` ต้องทำให้ `private.is_platform_admin()` คืนค่า `false`
4. กรอกรหัส TOTP ถูกต้องและ Session เป็น `aal2`
5. `private.is_platform_admin()` ต้องคืนค่า `true`
6. เข้า `/platform-admin` และจัดการ Control Plane ได้ตามปกติ
7. กดกลับ Dashboard และกลับเข้า Platform Admin ได้โดยไม่ถามรหัสซ้ำระหว่าง Session `aal2` เดิม

## ยังไม่รวมใน Phase นี้

- การถอด Authenticator
- Backup/Recovery factor และกระบวนการกู้บัญชี Platform Admin
- Session revocation และ Recovery audit เพิ่มเติม ซึ่งอยู่ใน Phase 0.10.4

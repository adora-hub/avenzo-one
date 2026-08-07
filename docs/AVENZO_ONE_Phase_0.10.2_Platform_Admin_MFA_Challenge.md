# AVENZO ONE — Phase 0.10.2 Platform Admin MFA Challenge

Status: Implemented / Awaiting end-to-end user test

## เป้าหมาย

ให้บัญชี Platform Admin ที่ลงทะเบียน TOTP แล้วต้องยืนยันรหัส 6 หลักหลัง Login ก่อนเข้าพื้นที่ Platform Admin โดยผู้ใช้ไม่ต้องพิมพ์ URL เอง

## เส้นทางการทำงาน

1. ผู้ใช้ Login ด้วยอีเมลและรหัสผ่าน
2. ระบบตรวจสิทธิ์ `platform_admins.status = active`
3. ระบบตรวจ Authenticator Assurance Level (AAL)
4. ถ้ามี TOTP แต่ Session ยังเป็น `aal1` ระบบส่งไป `/auth/mfa`
5. ผู้ใช้กรอกรหัส 6 หลักจาก Authenticator
6. Supabase ยกระดับ Session เป็น `aal2`
7. ระบบส่งไป `/platform-admin` อัตโนมัติ

## การป้องกัน

- หน้า Platform Admin ตรวจ AAL ซ้ำบน Server ก่อนอ่านข้อมูล
- การพิมพ์ `/platform-admin` โดยตรงไม่สามารถข้าม MFA Challenge ได้
- Challenge รองรับเฉพาะ Platform Admin ที่ active
- Audit เก็บเฉพาะเหตุการณ์ `mfa_challenge_verified` ไม่เก็บ OTP, Secret หรือ QR Code
- ค่า `next` รับเฉพาะ path ภายในระบบที่ขึ้นต้นด้วย `/` และไม่รับ `//`

## UI

- หน้า `/auth/mfa` สำหรับกรอกรหัส 6 หลัก
- Login ส่ง Platform Admin ไป Challenge หรือ Platform Admin อัตโนมัติ
- Dashboard แสดงปุ่มลัด `Platform Admin` เฉพาะบัญชีที่มีสิทธิ์ active

## ยังไม่รวมใน Phase นี้

- Restrictive RLS ที่บังคับ `aal2` ในทุกตารางของ Control Plane (Phase 0.10.3)
- การถอด Authenticator และ Recovery/Backup factor (Phase 0.10.4)

## Acceptance Test

1. Logout จากบัญชี Platform Admin
2. Login ใหม่ด้วยอีเมลและรหัสผ่าน
3. ต้องถูกส่งไปหน้ากรอกรหัส MFA โดยอัตโนมัติ
4. กรอกรหัสผิดต้องไม่ผ่าน
5. กรอกรหัสถูกต้องต้องเข้าสู่ `/platform-admin`
6. กด Dashboard แล้วเห็นปุ่มลัด Platform Admin

# AVENZO ONE — Phase 0.10.1 Platform Admin TOTP Enrollment

สถานะ: Implemented / Awaiting User Enrollment Test

## เป้าหมาย

เพิ่มขั้นตอนลงทะเบียน Authenticator แบบ TOTP สำหรับบัญชี Platform Admin โดยยังไม่บังคับ Challenge หลัง Login จนกว่า Phase 0.10.2 จะได้รับอนุมัติ

## Routes และ UI

- `/platform-admin/security/mfa` — หน้าตั้งค่า TOTP MFA
- หน้า Platform Admin มีปุ่ม “ตั้งค่า MFA”
- ตรวจสิทธิ์ฝั่ง Server จาก `platform_admins.user_id` และต้องมีสถานะ `active`
- ตรวจ Factor เดิมก่อนเริ่มเพื่อไม่สร้าง TOTP ซ้ำ
- ลบเฉพาะ TOTP ที่ยัง `unverified` และมีชื่อ `AVENZO ONE Platform Admin` ก่อนเริ่ม Enrollment ใหม่
- แสดง QR Code และ Secret สำหรับกรอกเองเมื่อสแกนไม่ได้
- รับรหัสตัวเลข 6 หลักและยืนยันด้วย `challengeAndVerify`

## Security Controls

- ใช้ Supabase Publishable Key ใน Browser เท่านั้น
- ไม่ส่งหรือบันทึก QR Code, TOTP Secret, Authenticator URI และรหัส 6 หลักในฐานข้อมูลหรือ Audit Log
- RPC ตรวจ `auth.uid()` และ `private.is_platform_admin()` ซ้ำก่อนบันทึกเหตุการณ์
- ตาราง `private.platform_security_audit_logs` เปิด RLS และปิดสิทธิ์อ่าน/เขียนโดยตรงจาก `anon` และ `authenticated`
- บันทึกเฉพาะ `mfa_enrollment_started` และ `mfa_enrollment_verified`
- Supabase จะออกจากระบบ Session อื่นเมื่อยืนยัน Factor สำเร็จ และยกระดับ Session ปัจจุบันเป็น `aal2`

## Acceptance Criteria

1. ผู้ใช้ทั่วไปและสมาชิก Organization เปิดหน้าตั้งค่าไม่ได้
2. Platform Admin ที่ Active เห็นสถานะ Factor และเริ่ม Enrollment ได้
3. QR Code และ Secret แสดงเฉพาะหลังผู้ใช้กดเริ่มตั้งค่า
4. รหัสที่ไม่ครบ 6 หลักไม่สามารถ Submit ได้
5. รหัสถูกต้องทำให้ Factor เป็น `verified`
6. Audit Log ไม่มี Secret, QR Code, URI หรือ OTP
7. เมื่อมี TOTP ที่ Verified แล้ว หน้าแสดงสถานะ “เปิดใช้งานแล้ว” และไม่สร้าง Factor ซ้ำ

## ยังไม่รวมใน Phase นี้

- Challenge หลัง Login — Phase 0.10.2
- การบังคับ `aal2` ที่ Route/API/RLS — Phase 0.10.3
- Backup Factor, Recovery และ Unenroll — Phase 0.10.4

## วิธีทดสอบโดยผู้ใช้

1. Login ด้วยบัญชี Platform Admin
2. เปิด `/platform-admin` แล้วกด “ตั้งค่า MFA”
3. กด “เริ่มตั้งค่า TOTP MFA”
4. ใช้ Authenticator App สแกน QR Code
5. กรอกรหัส 6 หลัก แล้วกด “ยืนยันและเปิด MFA”
6. ตรวจว่าหน้าแสดง “เปิดใช้งานแล้ว”

คำเตือน: อย่า Logout จนกว่าจะยืนยันว่า Authenticator สร้างรหัสได้ถูกต้อง และ Phase 0.10.4 ยังไม่มี Recovery UI

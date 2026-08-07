# AVENZO ONE — Phase 0.10.4 Platform Admin MFA Recovery

วันที่: 7 สิงหาคม 2026
สถานะ: Implemented / รอทดสอบการใช้งานจริง

## เป้าหมาย

ทำให้ Platform Admin กู้คืนการเข้าใช้งานได้อย่างปลอดภัย โดยไม่สร้างช่องทางข้าม MFA ด้วย Secret Key

## สิ่งที่พัฒนา

- เพิ่ม TOTP Authenticator ได้สูงสุด 2 เครื่อง: เครื่องหลักและเครื่องสำรอง
- หน้า Challenge ให้เลือก Authenticator เมื่อมีมากกว่า 1 เครื่อง
- ถอดอุปกรณ์ได้เฉพาะ Session ที่ยืนยันเป็น `aal2`
- ห้ามถอด Authenticator เครื่องสุดท้าย ต้องเพิ่มเครื่องสำรองก่อน
- ก่อนถอดอุปกรณ์ ระบบยกเลิก Session อื่นทั้งหมด
- หลังถอดอุปกรณ์ ระบบ Refresh Session และบังคับยืนยันรหัสจากเครื่องที่เหลืออีกครั้ง
- บันทึก Audit Event `mfa_factor_unenrolled` และ `mfa_other_sessions_revoked`
- ไม่เก็บ OTP, TOTP Secret, QR Code หรือ Recovery Secret ในฐานข้อมูล

## Recovery Policy

Supabase Auth ไม่มี Backup Code สำหรับ TOTP ใน Flow นี้ ดังนั้น AVENZO ONE ใช้ Authenticator เครื่องที่สองเป็น Recovery Factor หลัก

ถ้าสูญหายทั้งสองเครื่อง ห้ามมี Self-service Bypass ในแอป ต้องใช้ Emergency Recovery โดยผู้มีสิทธิ์ Supabase Project หลังตรวจตัวตนนอกระบบและบันทึก Incident เท่านั้น

## Acceptance Test

1. Platform Admin ที่ AAL2 เปิดหน้า `/platform-admin/security/mfa`
2. เพิ่ม Authenticator สำรองและยืนยันรหัส 6 หลัก
3. Logout แล้ว Login ใหม่ ต้องเลือกเครื่องหลักหรือเครื่องสำรองและเข้าได้ทั้งสองเครื่อง
4. กลับหน้าจัดการ MFA เลือกถอดอุปกรณ์หนึ่งเครื่อง และพิมพ์ `REMOVE`
5. ระบบต้องบังคับยืนยัน MFA จากเครื่องที่เหลืออีกครั้ง
6. ไม่สามารถถอด Authenticator เครื่องสุดท้ายได้
7. Audit Log ต้องมี `mfa_other_sessions_revoked` และ `mfa_factor_unenrolled`

## Rollback

- Rollback UI โดยย้อน Commit ได้โดยไม่กระทบ MFA Factor ที่ลงทะเบียนไว้
- Migration เพิ่มเฉพาะค่า Allowlist ของ Audit Event ไม่เปลี่ยนข้อมูลผู้ใช้
- ไม่ควรถอด Factor ผ่านฐานข้อมูลโดยตรง

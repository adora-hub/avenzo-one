# AVENZO ONE — Phase 1.2.2.1 Session Registration

สถานะ: Implemented / รอผู้ใช้ทดสอบ Local

## เป้าหมาย

บันทึก Supabase Session ปัจจุบันลง Session Registry ของ AVENZO ONE หลังยืนยันตัวตนสำเร็จ โดยยังไม่บังคับหมดเวลาและยังไม่สั่ง Logout ใน Phase นี้

## จุดที่เชื่อมแล้ว

- Login ด้วยอีเมลและรหัสผ่านสำหรับบัญชี Organization
- Login ด้วยอีเมลและรหัสผ่านสำหรับ Platform Admin ที่มี AAL2 อยู่แล้ว
- หลัง Platform Admin กรอกรหัส TOTP MFA สำเร็จ
- Auth callback ของ PKCE, Email OTP, Invitation และ Password Recovery
- Hash session จากลิงก์ Auth รุ่นเดิมที่ระบบยังรองรับ

## หลักความปลอดภัย

- Client เรียกเฉพาะ `app_register_current_session()` ด้วย Publishable Key และ Session ของผู้ใช้ปัจจุบัน
- RPC ฝั่งฐานข้อมูลผูกข้อมูลกับ `auth.uid()` และ `session_id` จาก JWT เท่านั้น
- ไม่มี Secret Key หรือ Service Role อยู่ใน Browser
- หาก Session Registry ขัดข้อง การ Login ที่ Supabase ยืนยันแล้วจะยังสำเร็จ และระบบบันทึกเฉพาะข้อความผิดพลาดที่ไม่เปิดเผย Token
- การบังคับ Idle Timeout, Absolute Timeout, Warning และ Logout อยู่ใน Phase ย่อยถัดไป

## วิธีทดสอบ Local

1. ออกจากระบบให้หมด แล้ว Login ด้วยบัญชี Owner/Staff หนึ่งครั้ง ต้องเข้าสู่ Dashboard ได้ตามปกติ
2. ออกจากระบบ แล้ว Login ด้วยบัญชี Platform Admin
3. กรอกรหัส TOTP 6 หลัก ต้องเข้าสู่ Platform Admin ได้ตามปกติ
4. ตรวจ Browser Console ต้องไม่มีข้อความ `[session-registration] registration failed`
5. Phase นี้ยังไม่แสดงกล่องเตือนและยังไม่บังคับออกจากระบบ

## ผลตรวจอัตโนมัติ

- `npm.cmd run test:session-registration`
- `npm.cmd run test:session-policy-foundation`
- `npx.cmd tsc --noEmit --incremental false`
- `npm.cmd run build`

# Phase 0.10.4.1 — Preferred Authenticator & MFA Layout

วันที่อัปเดต: 8 สิงหาคม 2026

สถานะ: พัฒนาและทดสอบ Local ผ่าน รอ Deploy Production

## เป้าหมาย

- ทำให้การ์ดจัดการ TOTP MFA ใช้ความกว้างเดียวกับพื้นที่เนื้อหาและปุ่มกลับ Platform Admin
- แสดง Authenticator เป็น “เครื่องหลัก” และ “เครื่องสำรอง” อย่างชัดเจน
- ให้ Platform Admin เปลี่ยนเครื่องหลักได้โดยไม่ต้องถอดอุปกรณ์
- ให้หน้า MFA Challenge เลือกเครื่องหลักเป็นค่าเริ่มต้นในการ Login ครั้งถัดไป

## การทำงาน

1. ผู้ใช้กด `ตั้งเป็นเครื่องหลัก` ที่ Authenticator เครื่องสำรอง
2. ระบบตรวจว่าผู้ใช้เป็น Platform Admin และ Session อยู่ที่ AAL2
3. ระบบบันทึกเฉพาะ Factor ID ที่เลือก ไม่บันทึก TOTP Secret หรือรหัส OTP
4. รายการ Authenticator ถูกเรียงใหม่ทันที โดยเครื่องหลักอยู่ลำดับ 1
5. เมื่อ Login ครั้งถัดไป หน้า MFA Challenge จะเลือกเครื่องหลักให้อัตโนมัติ แต่ผู้ใช้ยังเลือกเครื่องสำรองได้

## Security Controls

- ตาราง Preference เปิด RLS และผู้ใช้ดูได้เฉพาะข้อมูลของตนเอง
- Client ไม่มีสิทธิ์ Insert/Update ตารางโดยตรง ต้องใช้ RPC ที่ตรวจ Platform Admin และ AAL2
- RPC ตรวจว่า Factor เป็น TOTP ที่ยืนยันแล้วและเป็นของบัญชีผู้ใช้จริง
- ทุกการเปลี่ยนเครื่องหลักบันทึก Audit Event `mfa_preferred_factor_changed`
- หาก Preference หายหรือล้าสมัย ระบบใช้ Authenticator ที่มีอยู่เป็นค่าเริ่มต้นอย่างปลอดภัย

## Acceptance Criteria

- การ์ด MFA แสดงเต็มความกว้างของ Content Container
- เครื่องหลักและเครื่องสำรองมีป้ายสถานะและลำดับชัดเจน
- เปลี่ยนเครื่องหลักได้โดยไม่ถอดอุปกรณ์
- Refresh แล้วยังจำเครื่องหลักเดิม
- Login ใหม่เลือกเครื่องหลักเป็นค่าเริ่มต้น
- TypeScript ผ่าน และไม่เกิด Console Error
- ทดสอบ Local ผ่านก่อน Deploy Production

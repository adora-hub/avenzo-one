# Phase 1.2.4.2.4 — Production Password Gate

วันที่ตรวจ: 11 สิงหาคม 2569

Supabase Project: `eigrllibviqjddenjuch` (`AVENZO ONE`)

Supabase Organization: `dcimjyuqnhzfvfokensk` (`adora-personal`)

## ผลสรุป

สถานะ: **Completed / Deferred by Owner / ยอมรับความเสี่ยงชั่วคราว**

Production ทำงานปกติ แต่ยังไม่ผ่าน Password Security Gate ขั้นสุดท้าย เพราะ Supabase Security Advisor ยืนยันว่า `Leaked Password Protection` ยังปิดอยู่ และ Organization ปัจจุบันใช้แพ็กเกจ `free` ขณะที่เอกสาร Supabase ระบุว่าฟีเจอร์นี้ใช้ได้ตั้งแต่ Pro Plan ขึ้นไป

Phase นี้ไม่มีการอัปเกรดแพ็กเกจ ไม่มีการเปิดค่าใช้จ่าย และไม่มีการเปลี่ยน Auth Configuration โดยอัตโนมัติ

## มติของเจ้าของระบบ

วันที่ 11 สิงหาคม 2569 เจ้าของระบบตัดสินใจ **ยังไม่อัปเกรด Supabase Pro ในช่วงนี้** โดยให้พัฒนาฟีเจอร์หลักของ AVENZO ONE ให้ครบและพร้อมใช้งานมากขึ้นก่อน แล้วจึงกลับมาพิจารณาค่าใช้จ่ายและการเปิด Leaked Password Protection อีกครั้ง

การตัดสินใจนี้เป็นการพักงานแบบมีเงื่อนไข ไม่ใช่การยกเลิก Security Gate และไม่ถือว่า Leaked Password Protection ผ่านการตรวจแล้ว

## หลักฐานจาก Production

- Project status: `ACTIVE_HEALTHY`
- Organization plan: `free`
- Security Advisor: 48 รายการ
  - `WARN`: 43 รายการ
  - `INFO`: 5 รายการ
- Password advisory ที่ยังเปิดอยู่:
  - Name: `auth_leaked_password_protection`
  - Title: `Leaked Password Protection Disabled`
  - Level: `WARN`
  - Detail: ระบบยังไม่ตรวจรหัสผ่านใหม่กับฐานข้อมูลรหัสผ่านที่รั่วไหลของ HaveIBeenPwned
- Performance Advisor: ไม่พบ `auth_rls_initplan` เหลืออยู่ (`0` รายการ)

## ผลกระทบและขอบเขต

เมื่อเปิด Leaked Password Protection ระบบจะปฏิเสธรหัสผ่านใหม่หรือรหัสผ่านที่ผู้ใช้กำลังเปลี่ยน หากพบว่ารหัสนั้นอยู่ในฐานข้อมูลรหัสผ่านที่เคยรั่วไหล ฟีเจอร์นี้ช่วยลด Account Takeover จากการนำรหัสผ่านเก่าที่รั่วมาใช้ซ้ำ

ฟีเจอร์นี้ไม่บังคับให้ผู้ใช้เดิมออกจากระบบทันที และไม่ใช่การแทนที่ MFA, Session Policy, Rate Limit หรือข้อกำหนดความซับซ้อนของรหัสผ่านที่ AVENZO ONE มีอยู่แล้ว

## Decision Gate

ก่อนเปิดใช้จริงต้องได้รับอนุมัติแยกต่างหากสำหรับ:

1. อัปเกรด Supabase Organization จาก Free เป็น Pro และยืนยันค่าใช้จ่าย
2. เปิด Leaked Password Protection ใน Auth Password Security
3. ทดสอบสมัครบัญชี ตั้งรหัสผ่านใหม่ ลืมรหัสผ่าน และเปลี่ยนรหัสผ่าน
4. รัน Security Advisor รอบปิดงานและยืนยันว่า `auth_leaked_password_protection` หายไป
5. บันทึกผลทดสอบและอนุมัติ Production Security Gate

## มาตรการชดเชยระหว่างรอ

- คงข้อกำหนดรหัสผ่านอย่างน้อย 8 ตัว และบังคับตัวพิมพ์เล็ก ตัวพิมพ์ใหญ่ ตัวเลข และสัญลักษณ์
- คง MFA/AAL2 สำหรับ Platform Admin
- คง Session Policy, Refresh Token Reuse Detection และ Security Email Alert ที่พัฒนาแล้ว
- ห้ามถือว่า Production Password Gate ผ่าน จนกว่าจะเปิดฟีเจอร์และรัน Advisor ยืนยัน

## เอกสารอ้างอิง

- [Supabase Password Security](https://supabase.com/docs/guides/auth/password-security)
- [Supabase Security Advisor remediation](https://supabase.com/docs/guides/auth/password-security#password-strength-and-leaked-password-protection)
- [Supabase Changelog — Platform Updates December 2023](https://supabase.com/changelog/20346-platform-updates-december-2023)

## แผนถัดไป

**Phase 1.2.4.2.4.1 — Supabase Pro Upgrade Decision & Password Gate Activation (Deferred)**

นำกลับมาพิจารณาเมื่อฟีเจอร์หลักพร้อมและก่อนเปิด Production เต็มรูปแบบ จากนั้นจึงอนุมัติแพ็กเกจและค่าใช้จ่าย เปิด Leaked Password Protection ทดสอบ Auth Flow และตรวจ Security Advisor รอบสุดท้าย

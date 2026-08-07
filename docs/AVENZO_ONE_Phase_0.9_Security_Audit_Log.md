# AVENZO ONE — Phase 0.9 Security Hardening และ Audit Log

สถานะ: เสร็จสมบูรณ์สำหรับ Development; มี Production Gate เรื่อง Supabase Pro ก่อนเปิดใช้งานจริง

## เป้าหมาย

เพิ่มชั้นความปลอดภัยให้ Multi-tenant และสร้างประวัติกิจกรรมของแต่ละ Organization เพื่อให้ Owner/Admin ตรวจสอบย้อนหลังได้ว่าใครทำอะไร เมื่อใด และกับข้อมูลใด

## สิ่งที่พัฒนา

- เพิ่ม permission `audit.read` ให้ System Role `Owner` และ `Admin` ทั้งข้อมูลเดิมและ Role ที่สร้างในอนาคต
- เพิ่มการ์ด “ประวัติกิจกรรม” ในหน้า Workspace เฉพาะผู้ที่มีสิทธิ์ `audit.read`
- แสดงครั้งละ 10 รายการ พร้อมค้นหา กรองหมวดหมู่ เปลี่ยนหน้า และกรอกหมายเลขหน้าที่ต้องการ
- บันทึกเหตุการณ์ของ Organization, Branch, สมาชิก, คำเชิญ, Subscription และการระงับ/แบน
- แสดงผู้ดำเนินการ อีเมล เป้าหมาย และวันเวลาตาม Timezone ของ Organization
- เติมประวัติเริ่มต้นจากข้อมูลปัจจุบัน 40 รายการ เพื่อให้ Audit Log ไม่เริ่มจากหน้าว่าง

## Security Hardening

- เก็บ Audit Log ใน schema `private` และไม่อนุญาตให้ Client อ่านหรือแก้ไขตารางโดยตรง
- Audit Log เป็น append-only: แอปอ่านผ่าน RPC ที่ตรวจ permission เท่านั้น
- Public RPC เป็น `SECURITY INVOKER`; งานที่ต้องใช้สิทธิ์ฐานข้อมูลสูงอยู่ในฟังก์ชัน private
- ปิดการสร้าง แก้ไข และลบคำเชิญโดยตรงจาก Client ผู้ดูแลต้องใช้ RPC ที่ตรวจสิทธิ์
- จำกัดการอ่านคำเชิญโดยตรงไว้เฉพาะอีเมลผู้รับคำเชิญ
- ปรับ RLS ให้ใช้ JWT แบบ init-plan เพื่อลดการประเมินซ้ำต่อแถว
- เพิ่ม restrictive deny policy ให้ตาราง Audit Log เพื่อป้องกันการเปิดสิทธิ์โดยไม่ตั้งใจในอนาคต

## หมวดหมู่กิจกรรม

- `organization`: สร้างหรือแก้ไข Organization
- `branch`: สร้างหรือแก้ไข Branch
- `member`: เพิ่ม แก้ไขสิทธิ์ พัก เปิดคืน หรือยกเลิกสมาชิก
- `invitation`: สร้าง ตอบรับ ยกเลิก หรือหมดอายุ
- `subscription`: เปิด ต่ออายุ ปรับ หรือยกเลิก Subscription
- `moderation`: พัก เปิดคืน หรือแบน Organization/Branch
- `security`: รองรับเหตุการณ์ด้านความปลอดภัยในอนาคต

## ผลการตรวจสอบ

- TypeScript: ผ่าน
- ตัวกรองหมวดคำเชิญพบ 36 รายการ
- การค้นหา `invite04` พบ 2 รายการ
- หน้าที่ 2 แสดง 10 รายการตามมาตรฐาน
- Owner อ่าน Audit Log ได้ และ Staff ที่ไม่มี `audit.read` ถูกปฏิเสธ
- Owner ไม่สามารถ INSERT คำเชิญโดยตรงได้
- ทดสอบสร้างและยกเลิกคำเชิญภายใน transaction: บันทึกทั้งสองเหตุการณ์และ rollback สำเร็จ
- Supabase Security Advisor เหลือเฉพาะคำเตือนการป้องกันรหัสผ่านที่เคยรั่ว ซึ่งต้องเปิดใน Auth Dashboard
- Supabase Performance Advisor ไม่มีคำเตือน RLS init-plan เหลือเพียงข้อมูล index ที่ยังไม่ถูกใช้งานในระบบทดสอบ
- กำหนดรหัสผ่านขั้นต่ำ 8 ตัวอักษร
- บังคับให้มีตัวพิมพ์เล็ก ตัวพิมพ์ใหญ่ ตัวเลข และสัญลักษณ์
- เปิด Secure password change เพื่อบังคับ Reauthentication สำหรับ Session ที่เก่ากว่า 24 ชั่วโมง
- เปิด Require current password when updating เพื่อให้กรอกรหัสผ่านปัจจุบันก่อนเปลี่ยนรหัส

## หมายเหตุข้อมูลย้อนหลัง

คำเชิญเก่าที่ถูกยกเลิกหรือหมดอายุไม่มีคอลัมน์เวลาสถานะเฉพาะใน schema เดิม จึงใช้เวลาสร้างคำเชิญเป็นเวลาประมาณการสำหรับรายการย้อนหลังเท่านั้น เหตุการณ์ใหม่หลังติดตั้ง Phase 0.9 จะใช้เวลาที่ Trigger บันทึกจริง

## Production Gate

Project ปัจจุบันใช้ Supabase Free Plan ซึ่งไม่รองรับ leaked-password protection ดังนั้นคำเตือน `auth_leaked_password_protection` ใน Security Advisor เป็นข้อจำกัดที่รับทราบสำหรับ Development

ก่อนเปิด Production ต้อง:

1. อัปเกรด Supabase Organization เป็น Pro หรือสูงกว่า
2. เปิด `Prevent use of leaked passwords` ใน Authentication → Sign In / Providers → Email
3. รัน Security Advisor และยืนยันว่าไม่มีคำเตือนระดับ WARN เหลืออยู่

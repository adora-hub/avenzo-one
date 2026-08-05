# AVENZO ONE — Phase 0.6 Invitation Acceptance

สถานะ: Implemented / TypeScript Verified / Supabase Verified

## สิ่งที่เพิ่ม

- หน้า `/invitations/[id]` สำหรับเปิดคำเชิญ
- ตรวจว่าผู้ล็อกอินใช้อีเมลตรงกับผู้รับคำเชิญ
- ตรวจสถานะ pending และวันหมดอายุ
- ยอมรับคำเชิญแล้วสร้างหรือเปิดใช้งาน Organization Membership
- ผูก Role และ Branch Scope จากคำเชิญให้อัตโนมัติ
- ป้องกันผู้ไม่ล็อกอินเรียก RPC รับคำเชิญ
- แสดงลิงก์เปิดคำเชิญในหน้า Workspace

## ข้อจำกัดของรอบนี้

คำเชิญยังเป็นลิงก์ที่ระบบสร้างไว้ในฐานข้อมูล ยังไม่ได้ส่งอีเมลจริง เพราะต้องตั้งค่า Supabase Auth Email Template/SMTP และ URL ของระบบก่อน จึงจะทำส่วนส่งอีเมลอัตโนมัติในงานถัดไปได้อย่างปลอดภัย

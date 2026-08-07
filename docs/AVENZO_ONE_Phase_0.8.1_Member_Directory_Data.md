# AVENZO ONE — Phase 0.8.1 Member Directory Data

สถานะ: Deployed / Database and TypeScript verified

## เป้าหมาย

วางโครงข้อมูลสำหรับหน้าจัดการสมาชิก โดยแยกข้อมูลธุรกิจของสมาชิกออกจาก Role ที่ใช้กำหนดสิทธิ์ และไม่เปิดเผยตาราง `auth.users` ให้ Browser อ่านโดยตรง

## สิ่งที่เพิ่ม

- `organization_members.display_name` — ชื่อแสดงหรือชื่อเล่นภายใน Organization
- `organization_members.job_title` — ตำแหน่งงานทางธุรกิจ แยกจาก Role ของระบบ
- `membership_events` — ประวัติแบบ append-only สำหรับการแก้โปรไฟล์ Role, Scope และสถานะสมาชิก
- `organization_member_directory(uuid)` — RPC ที่ตรวจ `member.read` ก่อนส่งคืนสมาชิก อีเมล Role และ Branch Scope
- Index สำหรับรายชื่อสมาชิกและประวัติการเปลี่ยนแปลง
- ปิดการเขียนตารางสมาชิกโดยตรงทั้งหมด รวมถึง `TRUNCATE` ซึ่ง RLS ไม่ครอบคลุม
- การเขียนข้อมูลใน Phase 0.8.2 ต้องผ่าน RPC ที่ตรวจสิทธิ์และบันทึก Audit เท่านั้น

## กฎความปลอดภัย

- อีเมลอ่านจาก `auth.users` เฉพาะภายในฟังก์ชันฝั่งฐานข้อมูล
- ผู้เรียกต้องเข้าสู่ระบบและมี `member.read` ใน Organization หรือเป็น Platform Admin
- Browser ไม่มีสิทธิ์เพิ่มหรือแก้ไข `membership_events` โดยตรง
- ไม่ใช้ `user_metadata` สำหรับการตัดสินสิทธิ์
- การยกเลิกสมาชิกใน Phase 0.8.2 จะเปลี่ยนสถานะเป็น `removed` และไม่ลบบัญชี Auth

## งานต่อไป

Phase 0.8.2 จะนำ RPC นี้ไปแสดงในการ์ดสมาชิก และเพิ่มคำสั่งแก้ชื่อ ตำแหน่ง Role, Scope, พักสิทธิ์ เปิดคืน และยกเลิกสมาชิก พร้อมเขียน Audit Event ทุกครั้ง

## ผลการตรวจสอบ

- Schema, ตาราง Audit และ RPC ถูกสร้างใน Supabase แล้ว
- Owner ที่มี `member.read` อ่าน Directory ได้
- ผู้ใช้ที่ไม่ได้รับสิทธิ์ถูกปฏิเสธจากฐานข้อมูล
- อีเมล Role และ Branch Scope มีรูปแบบข้อมูลครบถ้วน
- TypeScript `--noEmit --incremental false` ผ่าน

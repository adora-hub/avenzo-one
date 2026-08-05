# AVENZO ONE — Phase 0.3 Subscription & Expiry

สถานะ: Completed / Deployed to Supabase

Supabase Project: `AVENZO ONE` (`eigrllibviqjddenjuch`)

Migration ที่ Deploy แล้ว:

- `phase_0_3_subscription_expiry`
- `phase_0_3_subscription_indexes`

## เป้าหมาย

จัดเก็บ Subscription ของแต่ละ Organization และแสดงเวลาที่เหลือก่อนหมดอายุให้ผู้ใช้เห็นแบบคำนวณสดจากฐานข้อมูล

## ตารางใหม่

- `subscription_plans` — แผนและจำนวนวัน/Grace Period ที่กำหนดค่าได้
- `organization_subscriptions` — Subscription ปัจจุบันของ Organization
- `subscription_events` — ประวัติ Provision/Renew/Cancel/Adjust

## View สำหรับหน้าจอลูกค้า

`organization_subscription_status` คืนค่า:

- `access_state`: `active`, `grace`, `expired`, `canceled`, `blocked_by_platform`
- `expires_at`
- `days_remaining`
- `hours_remaining`
- `seconds_remaining`
- `is_expired`

ระบบจึงสามารถแสดงข้อความ เช่น “เหลือ 5 วัน 8 ชั่วโมง” ได้ โดยไม่ต้องรอ Job มาอัปเดตตัวเลขทุกชั่วโมง

## หลักความปลอดภัย

- สมาชิกที่มี `organization.read` ดูสถานะ Subscription ของ Organization ตัวเองได้
- Platform Admin เป็นผู้ Provision/Renew/Cancel/Adjust
- การเปลี่ยน Subscription ต้องมีเหตุผลและสร้าง Event ใน Transaction เดียว
- ไม่มีราคา หรือ entitlement ถูกกำหนดใน Phase นี้
- View ใช้ `security_invoker` และตารางฐานมี RLS

## ค่าเริ่มต้นที่เตรียมไว้

มี Plan `standard` เป็นค่าเริ่มต้นเชิงโครงสร้าง: 30 วัน และ Grace Period 3 วัน โดยตั้งใจให้แก้ไขได้ตามนโยบายธุรกิจภายหลัง ไม่มีข้อมูลราคาในระบบ

## ข้อจำกัด

- ยังไม่มีหน้า UI แสดง Countdown
- ยังไม่มีระบบชำระเงิน/ต่ออายุอัตโนมัติ
- การ Provision Plan ต้องเรียกผ่าน Platform Admin API/Backend
- ยังไม่ได้ทำ Auth End-to-End Test ด้วยบัญชีจริง

## เกณฑ์ตรวจสอบ

- [x] ตาราง Subscription และ Event เปิด RLS
- [x] มี View คำนวณ Countdown แบบสด
- [x] Platform Admin เท่านั้นที่ Provision/Renew/Cancel/Adjust
- [x] การเปลี่ยน Subscription ต้องมีเหตุผลและ Event
- [x] Security Advisor ไม่พบปัญหาใหม่
- [ ] ทดสอบการแสดงผลด้วยบัญชี Auth จริง

# AVENZO ONE — Phase 1.0.4.1 Subscription Preview & Automatic Dates

อัปเดต: 7 สิงหาคม 2026

## เป้าหมาย

ลดความผิดพลาดของ Platform Admin ก่อนกำหนด Subscription ให้ Organization โดยให้ระบบอ่านค่าจาก Active Plan Version และ Active Price แล้วแสดงหน้าตรวจสอบก่อนบันทึกจริง

## สิ่งที่พัฒนา

- เลือก Organization, Active Plan Version และราคา Active ที่สัมพันธ์กัน
- แสดงราคา รอบบิล และจำนวนวันทดลองเป็นภาษาที่อ่านง่าย
- คำนวณวันหมดอายุจาก `วันเริ่มต้น + duration_days`
- คำนวณวันสิ้นสุด Grace Period จาก `วันหมดอายุ + grace_period_days`
- แสดงวันสิ้นสุดการทดลองแยกจากวันหมดอายุ Subscription
- ล็อกช่องวันหมดอายุและ Grace Period ไม่ให้แก้จนขัดกับ Plan Version
- ตรวจสอบลำดับวันที่ เหตุผล และกรณีจำนวนวันทดลองยาวกว่า Subscription
- เปลี่ยนขั้นตอนบันทึกเป็น 2 จังหวะ: `ตรวจสอบก่อนบันทึก` และ `ยืนยันและบันทึก Subscription`
- เก็บ Snapshot ราคา รอบบิล Trial และวิธีคำนวณวันที่ไว้ใน `subscription_event.metadata`

## กติกาการคำนวณ

1. `expires_at = starts_at + plan_version.duration_days`
2. `grace_ends_at = expires_at + plan_version.grace_period_days`
3. `trial_ends_at = starts_at + active_price.trial_days`
4. ระยะทดลองอยู่ภายในอายุ Subscription และยังไม่ก่อให้เกิดการเรียกเก็บเงินจริง

## ขอบเขตที่ยังไม่ทำ

- Payment Gateway
- Auto-renew
- Invoice และ Receipt
- การตัดบัตรหรือเรียกเก็บเงินจริง
- Proration เมื่อเปลี่ยนแพ็กเกจระหว่างรอบ

## Acceptance Criteria

- เปลี่ยน Plan Version แล้ววันหมดอายุและ Grace Period เปลี่ยนตามค่า Version
- เปลี่ยนวันเริ่มต้นแล้วทุกวันที่เกี่ยวข้องคำนวณใหม่
- หน้าพรีวิวแสดง Organization, Plan, Version, ราคา, Trial, วันเริ่มต้น, วันหมดอายุ, Grace และ Event ครบ
- ผู้ใช้ย้อนกลับไปแก้ไขได้โดยยังไม่บันทึกฐานข้อมูล
- บันทึกจริงเกิดขึ้นหลังยืนยันครั้งสุดท้ายเท่านั้น
- Event ที่สร้างใหม่มี Metadata Snapshot ของราคาและ Trial

## สถานะ

Implemented และผ่าน TypeScript verification; รอทดสอบ UI และการบันทึกจริงโดยผู้ใช้

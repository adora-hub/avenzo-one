# AVENZO ONE — Phase 1.0.2 Plans & Prices

วันที่: 7 สิงหาคม 2026
สถานะ: Implemented / รอทดสอบการใช้งานจริง

## เป้าหมาย

สร้างโครงสร้างแพ็กเกจเชิงพาณิชย์ที่รองรับราคา รอบบิล ทดลองใช้ และค่าของ Feature โดยแยกเป็น Version เพื่อไม่ให้การแก้ไขในอนาคตเปลี่ยนประวัติของลูกค้าเดิมย้อนหลัง

## ขอบเขตที่พัฒนา

- ต่อยอด `subscription_plans` เดิมให้รองรับ Description และ Lifecycle `draft`, `active`, `retired`
- `subscription_plan_versions` สำหรับเก็บรุ่นของแพ็กเกจ
- `subscription_plan_prices` รองรับรายเดือน รายปี ครั้งเดียว สกุลเงิน และ Trial Days
- `subscription_plan_features` สำหรับกำหนดค่าเปิด/ปิด หรือจำนวนสูงสุดของ Feature
- Plan Version ที่ `active` แก้ไขย้อนหลังไม่ได้
- แพ็กเกจใหม่เริ่มเป็น `draft` และต้องเปิด Plan ก่อนจึงเปิด Version ได้
- การจัดการ Draft/Active/Retired แยกไว้ใน Phase 1.0.2.1 โดยไม่ลบข้อมูลถาวร
- หน้า `/platform-admin/plans` สำหรับ Platform Admin ที่ผ่าน MFA ระดับ `aal2`
- Audit แบบ append-only ใน `private.subscription_plan_audit_logs`
- RLS และ Data API grants แบบจำกัดสิทธิ์ตามแนวทาง Supabase ปัจจุบัน

## ตัวอย่างการตั้งโปรโมชั่น

แพ็กเกจทดลองใช้ 1 เดือนเต็มทุกฟีเจอร์สามารถตั้งได้ด้วย:

- Plan: `trial`
- Version: `Trial 2026`
- Price: `0 THB`, รอบรายเดือน, `Trial Days = 30`
- Feature Values: เปิดใช้งานฟีเจอร์ทุกตัว หรือกำหนด Limit ตามต้องการ

Phase นี้เป็นเพียงการเก็บโครงสร้างและข้อมูลกำหนดค่า ยังไม่บังคับ Entitlement กับ Organization จริง และยังไม่เปลี่ยน Subscription ที่มีอยู่

## Acceptance Test

1. Platform Admin เปิดหน้า Plans & Prices จาก Control Plane
2. สร้าง Plan ใหม่เป็น Draft
3. สร้าง Plan Version ให้ Plan
4. เพิ่มราคา 0 บาทและ Trial 30 วันได้
5. เพิ่ม Feature แบบเปิด/ปิด และแบบจำนวนได้
6. เปิด Version เป็น Active ได้เมื่อ Plan หลัก Active
7. Version ที่ Active แล้วแก้ไขไม่ได้
8. Feature Value ต้องตรงกับชนิดของ Feature ใน Catalog
9. ผู้ใช้ทั่วไปและ Session ที่ไม่ใช่ AAL2 ไม่สามารถสร้างหรือแก้ไขได้
10. ทุกการสร้าง/แก้ไขต้องมี Audit Log
11. Subscription เดิมของ Organization ยังอ่านและใช้งานได้เหมือนเดิม

## สิ่งที่ยังไม่ทำ

- ยังไม่ผูก `organization_subscriptions` เข้ากับ `plan_version_id`
- ยังไม่คำนวณสิทธิ์จาก Plan ให้ API หรือ UI บล็อกการใช้งาน
- ยังไม่ทำ Payment Gateway, Invoice หรือ Auto-renew

## Rollback

ตาราง Phase 1.0.2 ยังไม่ถูกอ้างอิงโดย Subscription เดิม จึง rollback ได้โดยตรวจไม่มี Phase ถัดไปอ้างอิงก่อนลบตาราง และต้องเก็บ Audit/ข้อมูลเชิงพาณิชย์ตามนโยบาย retention ที่กำหนดภายหลัง

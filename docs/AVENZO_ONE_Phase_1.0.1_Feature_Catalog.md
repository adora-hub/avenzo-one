# AVENZO ONE — Phase 1.0.1 Feature Catalog

วันที่: 7 สิงหาคม 2026
สถานะ: Implemented / รอทดสอบการใช้งานจริง

## เป้าหมาย

สร้างทะเบียนฟีเจอร์กลางที่มีรหัสและความหมายคงที่ เพื่อใช้ประกอบ Plans, Prices และ Entitlements ใน Phase ถัดไป โดยยังไม่เปลี่ยนสิทธิ์ของ Organization ปัจจุบัน

## ขอบเขตที่พัฒนา

- ตาราง `public.feature_catalog`
- รองรับชนิดค่า `boolean` สำหรับเปิด/ปิด และ `integer` สำหรับ Limit
- Lifecycle `draft`, `active`, `retired`
- Feature Key และ Value Type แก้ย้อนหลังไม่ได้
- ไม่มี Delete; ใช้ `retired` เพื่อรักษาประวัติอ้างอิง
- Feature ใหม่เริ่มเป็น `draft`
- หน้า `/platform-admin/features` สำหรับสร้างและแก้รายละเอียด
- UI มี Combo Box ภาษาคน แยกหมวด สาขา สมาชิก และรายงาน พร้อมโหมดกำหนดเอง
- เมื่อเลือก Feature สำเร็จรูป ระบบเติม Feature Key, ชนิดค่า, Unit และคำอธิบายให้อัตโนมัติ
- ใช้งานได้เฉพาะ Platform Admin ที่ผ่าน MFA ระดับ `aal2`
- Audit แบบ append-only ใน `private.feature_catalog_audit_logs`

## สิ่งที่ยังไม่ทำ

- ยังไม่ผูก Feature เข้ากับ Plan
- ยังไม่กำหนดค่าฟีเจอร์หรือ Limit ให้ Organization
- ยังไม่บังคับ Entitlement ที่ UI, API หรือ RLS
- ยังไม่มีราคา Trial หรือ Promotion

## Acceptance Test

1. Platform Admin เปิดหน้า Feature Catalog จากปุ่มใน Control Plane
2. เลือก Feature จาก Combo Box แล้วตรวจสอบค่าที่ระบบเติมให้อัตโนมัติ
3. สร้าง Feature แบบเปิด/ปิดได้ โดยไม่ต้องกรอก Unit
4. สร้าง Feature แบบจำนวนได้โดยระบบเติม Unit ให้ หรือใช้โหมดกำหนดเอง
5. Feature ใหม่ต้องมีสถานะ `draft`
6. Feature Key ซ้ำต้องถูกปฏิเสธ
7. แก้ชื่อ คำอธิบาย Unit และสถานะได้
8. Feature Key และ Value Type ต้องเปลี่ยนไม่ได้
9. ผู้ใช้ทั่วไปและ Session ที่ไม่ใช่ AAL2 อ่านหรือแก้ Catalog ไม่ได้
10. การสร้างและแก้ไขต้องมี Audit Log

## Rollback

การ Rollback UI ไม่เปลี่ยนสิทธิ์ลูกค้าเพราะยังไม่มี Plan Entitlement ใช้งาน หากต้องย้อนฐานข้อมูล ต้องตรวจว่าไม่มีตารางใน Phase หลังอ้างอิง `feature_catalog` ก่อนเสมอ

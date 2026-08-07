# AVENZO ONE — Phase 1.0.2.1 Plan Lifecycle Management

วันที่: 7 สิงหาคม 2026
สถานะ: Implemented / รอทดสอบการใช้งานจริง

## เป้าหมาย

จัดการ Plan ที่สร้างผิดหรือไม่ต้องการใช้แล้ว โดยไม่ลบข้อมูลถาวรและไม่ทำลายประวัติการตั้งราคา/Feature

## กติกาสถานะ

- `Draft` → เปิดใช้งานเป็น `Active` หรือเก็บเป็น `Retired` ได้
- `Active` → ปิดใช้งานเป็น `Retired` ได้
- `Retired` → ไม่สามารถเปิดกลับมาใช้งานใหม่ได้ เพื่อป้องกันประวัติเปลี่ยนย้อนหลัง
- Plan ที่ `Retired` จะไม่ปรากฏในตัวเลือกสำหรับสร้าง Version ใหม่
- Version ของ Plan ที่ `Retired` จะเปิดใช้งานไม่ได้

## การใช้งานในหน้า Plans & Prices

- Draft มีปุ่ม **เปิดใช้งาน Plan นี้** และ **เก็บ Draft นี้**
- Active มีปุ่ม **ปิดใช้งาน Plan นี้**
- Retired แสดงข้อความว่าเก็บถาวรแล้ว
- ทุกการเปลี่ยนสถานะต้องผ่าน Platform Admin ที่ยืนยัน MFA ระดับ `aal2`
- การเปลี่ยนสถานะถูกบันทึกใน `private.subscription_plan_audit_logs`

## สิ่งที่ไม่ทำ

- ไม่ลบ Plan, Version, ราคา หรือ Feature Value แบบถาวรจากหน้าเว็บ
- ยังไม่เปลี่ยน Subscription ของ Organization เดิม
- การบังคับสิทธิ์ตาม Plan ยังอยู่ใน Phase 1.0.3

## Acceptance Test

1. สร้าง Plan เป็น Draft แล้วกดเก็บ Draft ได้
2. สร้าง Plan เป็น Draft แล้วเปิดใช้งานเป็น Active ได้
3. ปิดใช้งาน Plan Active ได้
4. Plan Retired ไม่สามารถกลับเป็น Active และไม่สามารถสร้าง Version ใหม่ได้
5. ตรวจพบ Audit Log ของการเปลี่ยนสถานะ

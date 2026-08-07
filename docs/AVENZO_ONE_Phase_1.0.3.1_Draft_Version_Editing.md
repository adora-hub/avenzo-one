# AVENZO ONE — Phase 1.0.3.1 Draft Version Editing

อัปเดตล่าสุด: 7 สิงหาคม 2026

## เป้าหมาย

ให้ Platform Admin แก้ข้อมูล Plan Version ที่ยังเป็น Draft ได้อย่างปลอดภัย ก่อนเปิดใช้งานและล็อกเป็นประวัติสำหรับ Subscription จริง

## สิ่งที่พัฒนา

- เพิ่ม Snapshot `duration_days` และ `grace_period_days` ใน Plan Version
- Plan ใหม่ยังเก็บค่าอายุและ Grace เป็นค่าเริ่มต้นสำหรับ Version ที่สร้างภายหลัง
- แก้ชื่อ คำอธิบาย อายุ และ Grace ของ Draft Version ได้
- ราคาแต่ละรอบบิลใช้การบันทึกแบบ Upsert จึงแก้ราคาและ Trial เดิมได้โดยไม่เกิดข้อมูลซ้ำ
- ค่า Feature ใช้การบันทึกแบบ Upsert จึงแก้ค่าของ Feature เดิมได้
- เก็บ Draft Version เป็น `retired` ได้โดยไม่ลบข้อมูลและ Audit Log
- Version ที่เป็น `active` หรือ `retired` แก้ไขไม่ได้
- การ Provision Subscription ใช้อายุและ Grace จาก Active Plan Version ที่เลือก ไม่อ่านค่าปัจจุบันของ Plan หลัก

## วิธีใช้งาน

1. ไปที่ Platform Admin > Plans & Prices
2. เลือก Version ที่มีสถานะ Draft ในหัวข้อ “แก้ไข Draft Version”
3. แก้ข้อมูล Version แล้วกด “บันทึกข้อมูล Version”
4. เลือกรอบบิล แก้ราคา/Trial แล้วกด “อัปเดตราคา”
5. เลือก Feature แก้ค่าแล้วกด “อัปเดตสิทธิ์ Feature”
6. ตรวจการ์ดสรุปให้ครบ แล้วจึงกด “เปิดใช้งาน Version นี้”

หาก Draft สร้างผิดและไม่ต้องการใช้ ให้กด “เก็บ Draft Version” แทนการลบ เพื่อรักษาประวัติระบบ

## กฎความปลอดภัย

- ทุกการเขียนต้องเป็น Platform Admin ที่ผ่าน MFA ระดับ AAL2
- Active Version เป็น Snapshot ถาวรและแก้ไขไม่ได้
- Retired Version นำกลับมาแก้หรือเปิดใช้งานอีกไม่ได้
- การเปลี่ยนข้อเสนอสำหรับลูกค้าใหม่ให้สร้าง Version ใหม่


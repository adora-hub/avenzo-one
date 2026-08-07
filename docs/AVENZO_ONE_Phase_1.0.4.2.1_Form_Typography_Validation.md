# AVENZO ONE — Phase 1.0.4.2.1 Form Typography & Inline Validation

อัปเดต: 7 สิงหาคม 2026

## เป้าหมาย

ทำให้ฟอร์ม Subscription ใช้ฟอนต์เดียวกับระบบ และแจ้งข้อผิดพลาดในหน้าจออย่างสม่ำเสมอ โดยไม่พึ่งกล่อง Popup ของ Browser

## สิ่งที่ทำ

- บังคับ `input`, `select`, `textarea` และ `button` ให้ใช้ฟอนต์เดียวกับหน้าเว็บ
- ปิด Native Browser Validation Popup สำหรับฟอร์ม Provision และ Lifecycle Action
- แสดงคำเตือนใต้ช่องเหตุผลด้วยไอคอน `i`
- แจ้งจำนวนตัวอักษรที่ต้องพิมพ์เพิ่มให้ผู้ใช้เข้าใจทันที
- ใช้ `aria-invalid`, `aria-describedby` และ `role=status` เพื่อรองรับการใช้งานด้วยเทคโนโลยีช่วยเหลือ
- ยังป้องกันการเปิดหน้า Preview จนกว่าเหตุผลจะมีอย่างน้อย 3 ตัวอักษร

## การตรวจสอบ

- TypeScript ผ่าน
- `git diff --check` ผ่าน
- Route `/platform-admin` ตอบกลับตามระบบ Authentication ปกติ

## สถานะ

Implemented และรอผู้ใช้ตรวจภาพบน Browser จริง

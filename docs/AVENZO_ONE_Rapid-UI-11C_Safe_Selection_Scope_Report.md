# AVENZO ONE — Rapid UI-11C Safe Selection Scope Report

วันที่: 21 สิงหาคม 2026
สถานะ: Implemented on localhost — Pending Owner Visual Test

## ปัญหาที่แก้

เมื่อผู้ใช้เปลี่ยนตัวกรอง รายการที่เคยเลือกยังคงอยู่ ทำให้ Bulk action อาจแก้สินค้าที่ซ่อนอยู่โดยผู้ใช้ไม่รู้ตัว

## พฤติกรรมที่อนุมัติ

- Bulk action ค่าเริ่มต้นใช้เฉพาะรายการที่มองเห็นและเลือกในสถานะปัจจุบัน
- แสดงจำนวน Selection ที่มองเห็นและ Selection จากสถานะอื่นแยกกัน
- Selection จากสถานะอื่นไม่ถูกรวมอัตโนมัติ
- ผู้ใช้สามารถสั่งรวมรายการที่ซ่อน หรือล้างเฉพาะรายการที่ซ่อนได้
- การเปลี่ยนตัวกรองยกเลิกการเลือก `รวมรายการที่ซ่อน` เพื่อให้ต้องยืนยันใหม่ทุกครั้ง
- ก่อนเปิด Confirmation Dialog ระบบ Snapshot หมายเลขแถวเป้าหมาย และใช้ Snapshot เดิมตอนยืนยัน

## Safety Contract

- ห้าม Bulk action อ้างอิง `row.selected` ใหม่ในจังหวะ Confirm
- คำสั่ง `ทุก 50 รายการ` ยังคงต้องผ่าน Confirmation Dialog
- Modal ต้องระบุชัดเจนเมื่อรวม Selection จากสถานะอื่น
- การล้าง Selection ที่ซ่อนต้องไม่กระทบรายการที่กำลังมองเห็น

## Verification

- Scoped UI tests: 12/12 PASS
- TypeScript: PASS
- Localhost: ไม่มี Runtime/Console Error
- Backend/Data write: ไม่เปลี่ยน
- Commit/Push: ยังไม่ได้ดำเนินการ

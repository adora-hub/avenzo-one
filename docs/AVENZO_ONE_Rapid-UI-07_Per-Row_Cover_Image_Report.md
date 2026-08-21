# AVENZO ONE — Rapid-UI-07 Per-row Cover Image Report

**Status:** Owner Approved — image flow and alignment passed
**Scope:** Live Sale Rapid Entry UI only; no Storage, Product, SKU or Stock write

## Delivered

- เพิ่มภาพปกได้ 1 ภาพต่อแถวด้วยการคลิกหรือ Drag & Drop ลงช่องรูปภาพ
- แสดง Preview อัตราส่วน 1:1 ภายในตารางโดยไม่เปลี่ยนความสูงของแถว
- เปลี่ยนภาพและนำภาพออกด้วย Icon-only actions พร้อม Tooltip ด้านบนและ Accessible label
- ตรวจ MIME เป็น JPEG/PNG/WebP, ปฏิเสธไฟล์ว่าง และจำกัดไม่เกิน 5 MB
- แสดงข้อผิดพลาดเฉพาะแถวโดยไม่ทำให้แถวอื่นผิดตาม
- คืน Blob URL เมื่อเปลี่ยนภาพ นำภาพออก เปลี่ยนช่วงรหัส หรือออกจากหน้า เพื่อป้องกันหน่วยความจำค้าง
- คงการจัดกึ่งกลาง การ Resize/Auto-fit และ Sticky Status ที่ Owner อนุมัติใน Rapid-UI-06

## Boundary

- เป็น Browser Preview เท่านั้น
- ไม่มี Supabase Storage upload และไม่มี Backend mutation
- Bulk filename matching เป็นงาน Phase V/Bulk Images ในอนาคต

## Verification

- Scoped test: `test-products-rapid-ui-07-row-images.mjs`
- Regression: Rapid-UI-04–06
- TypeScript, production build และ diff check ต้องผ่านก่อนส่ง Owner ตรวจ

## Owner Acceptance

- การคลิก/ลากเพื่อใส่ภาพผ่าน
- Preview, เปลี่ยนภาพและนำภาพออกผ่าน
- การจัดตำแหน่งช่องภาพและ Checkbox ผ่าน

## Next Action

เริ่ม Rapid-UI-08 ได้เมื่อ Owner อนุมัติ

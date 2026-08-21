# AVENZO ONE — Rapid-UI-05 Inline Editing and Keyboard Report

**Status:** Implemented locally — Pending Owner Visual Test
**Date:** 21 August 2026
**Branch:** `codex/workstream-ui`

## Scope

- เปิดแก้ไขแบบ Click-to-edit เฉพาะชื่อสินค้า ราคาขาย และสต็อกเริ่มต้น
- `Enter` เลื่อนลงเซลล์ชนิดเดียวกันในแถวถัดไป
- `Tab` เลื่อนไปเซลล์ขวา และ `Shift+Tab` เลื่อนกลับซ้าย
- `Escape` คืนค่าเดิมก่อนเริ่มแก้ไข
- แสดง Focus ring โดยไม่เปลี่ยนความสูงหรือแนววางของตาราง
- ชื่อที่ผู้ใช้แก้เองติดป้าย “แก้ไขเฉพาะรายการ” และไม่ถูก Template เขียนทับ
- ตรวจชื่อ ราคา และสต็อกในแต่ละเซลล์ โดยไม่ทำให้แถวอื่นผิดตาม
- อัปเดตสถานะแถว: ยังไม่ครบ, กำลังแก้ไข, พร้อมตรวจ และข้อมูลไม่ถูกต้อง

## Deferred by Approval Gate

- Unit/Branch Combobox, row selection และ Bulk tools อยู่ใน Rapid-UI-06
- Image click/drag อยู่ใน Rapid-UI-07
- Validation summary และ selected-ready behavior อยู่ใน Rapid-UI-08

## Safety Boundary

- เป็น Browser UI state เท่านั้น ไม่มี Browser Draft ใน Part นี้
- ไม่มี Server Action, API, RPC, Migration, Product/SKU หรือ Stock write
- รองรับ Paste ค่าเดียว; Multi-cell paste ยังไม่เปิดใช้

## Verification

- Scoped tests: PASS 5/5
- Live Sale/Rapid regression: PASS 43/43
- TypeScript: PASS (`tsc --noEmit --incremental false`)
- Localhost visual test: Pending Owner inspection

## Next Gate

หยุดรอ Owner ตรวจ Rapid-UI-05 ก่อนเริ่ม Rapid-UI-06

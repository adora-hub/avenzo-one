# AVENZO ONE — Rapid-UI-04 50-Row Table Structure Report

**Status:** Implemented locally — Pending Owner Visual Test
**Date:** 21 August 2026
**Branch:** `codex/workstream-ui`

## Scope

- สร้างตารางแสดงผล 50 แถวจากช่วงรหัสที่เลือกใน Rapid-UI-02
- นำ Naming Template ที่ผ่าน Rapid-UI-03 มาแสดงเป็นชื่อสินค้าแต่ละแถว
- เพิ่มคอลัมน์ Select, Sales Code, Image, Product name, Price, Initial stock, Unit, Branch และ Status
- ทำหัวตาราง Sticky และปักหมุด Select + Sales Code พร้อมเงาแบ่งเขต
- จำกัดความสูงและใช้ Scroll ภายในทั้งแนวตั้งและแนวนอน
- เพิ่มเส้นแบ่งแถว/คอลัมน์, Zebra rows, Empty state และ Footer สรุป 50 รายการ

## Deferred by Approval Gate

- Inline editing และ Keyboard navigation อยู่ใน Rapid-UI-05
- Unit Combobox และ Bulk tools อยู่ใน Rapid-UI-06
- Click/drag image upload อยู่ใน Rapid-UI-07
- Validation และ row selection behavior อยู่ใน Rapid-UI-08

## Safety Boundary

- เป็น Browser UI display เท่านั้น
- ไม่จองรหัส ไม่สร้าง Product/SKU และไม่เปลี่ยน Stock
- ไม่มี Server Action, API, RPC, Migration หรือ Supabase mutation ใหม่

## Verification

- Scoped tests: PASS 5/5
- Live Sale/Rapid regression: PASS 38/38
- TypeScript: PASS (`tsc --noEmit --incremental false`)
- Localhost visual test: Pending Owner inspection

## Next Gate

หยุดรอ Owner ตรวจ Rapid-UI-04 ก่อนเริ่ม Rapid-UI-05

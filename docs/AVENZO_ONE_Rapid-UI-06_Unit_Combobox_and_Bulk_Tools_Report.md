# AVENZO ONE — Rapid-UI-06 Unit Combobox and Bulk Tools Report

**Status:** Implemented locally — Pending Owner Visual Test
**Date:** 21 August 2026
**Branch:** `codex/workstream-ui`

## Scope

- เปิด checkbox รายแถวและเลือก/ล้างทั้งหมด
- เพิ่ม Unit Combobox แบบค้นหาได้จาก Approved Unit master list
- เพิ่ม Branch Combobox โดยแสดงเฉพาะสาขาที่ได้รับอนุญาตใน UI Preview
- เพิ่ม Bulk actions: ราคา, สต็อก, หน่วย, สาขา และคืนชื่อจาก Naming Template
- ค่าเริ่มต้นใช้กับรายการที่เลือกเท่านั้น
- การใช้กับทุก 50 แถวต้องเลือก Target แยกและยืนยันอย่างชัดเจน
- แสดงจำนวนรายการที่จะได้รับผลก่อนยืนยัน
- Snapshot ค่าเดิมและ Undo คำสั่งแบบกลุ่มล่าสุดได้หนึ่งครั้ง
- คง Keyboard navigation จาก Rapid-UI-05 สำหรับ Unit และ Branch
- ปรับเลขลำดับเป็นคอลัมน์ซ้ายสุดก่อน Checkbox และลดเงาขอบคอลัมน์ปักหมุดให้เป็นแนวแบ่งบาง
- เพิ่ม Column Resize Handle และดับเบิลคลิก Auto-fit โดยเผื่อระยะข้อความอย่างน้อย 5px ซ้าย/ขวา
- จัดหัวตารางและข้อมูลทุกคอลัมน์กึ่งกลาง พร้อมปักหมุด Status ไว้ขอบขวา

## Safety Boundary

- เป็น Browser UI state เท่านั้น
- ไม่มี Server Action, API, RPC, Migration, Product/SKU หรือ Stock write
- Branch Preview จำกัดที่ `BKK-01`; Backend authorization ยังไม่เชื่อม

## Deferred by Approval Gate

- Image click/drag อยู่ใน Rapid-UI-07
- Validation summary และ selected-ready submission preview อยู่ใน Rapid-UI-08
- Browser Draft recovery อยู่ใน Rapid-UI-09

## Verification

- Scoped tests: PASS 6/6
- Live Sale/Rapid regression: PASS 49/49
- TypeScript: PASS
- Localhost visual test: Pending Owner inspection

## Next Gate

หยุดรอ Owner ตรวจ Rapid-UI-06 ก่อนเริ่ม Rapid-UI-07

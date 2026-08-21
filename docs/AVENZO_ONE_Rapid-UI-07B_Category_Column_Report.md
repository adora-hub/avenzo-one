# AVENZO ONE — Rapid-UI-07B Category Column Report

**Status:** Owner Approved — Checkpoint Closed
**Approved date:** 21 August 2026
**Scope:** Rapid Entry UI only; no Category API or Database write

## Delivered

- เพิ่มคอลัมน์ `หมวดหมู่` หลัง `ชื่อสินค้า` และก่อน `ราคาขาย`
- ค่าเริ่มต้นเป็น `ไม่ระบุหมวดหมู่` จึงไม่ขวางงาน Live Sale ที่ต้องทำเร็ว
- เลือกหรือค้นหาหมวดหมู่ต่อแถวผ่าน Combobox
- เพิ่ม `หมวดหมู่` ในเครื่องมือแก้ไขหลายรายการ ใช้ได้กับรายการที่เลือกหรือครบ 50 รายการ
- เพิ่ม `จัดการหมวดหมู่` ตาม Master Data Manager Dialog เพื่อสร้างหมวดใหม่ใน Browser แล้วใช้ต่อแถวหรือ Bulk ได้ทันที
- ป้องกันชื่อว่างและชื่อซ้ำแบบไม่สนตัวพิมพ์ใหญ่–เล็ก
- รองรับ Resize และ Auto-fit ตามมาตรฐานตารางเดิม
- ค่า Category ทั้งหมดเป็น UI Simulation; ยังไม่ดึง Master Data จริง

## Verification

- Scoped test: `test-products-rapid-ui-07b-category-column.mjs`
- Regression: Rapid-UI-04–07
- TypeScript และ diff check ต้องผ่านก่อน Owner Visual Test

## Next Action

Rapid-UI-07B ผ่าน Owner checkpoint แล้ว และถูกใช้เป็นฐานของ Rapid-UI-08

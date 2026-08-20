# AVENZO ONE — Live-UI-03 Rapid Product Entry UI Report

**Status:** Implemented locally — Pending Owner Visual Test
**Date:** 20 August 2026
**Branch:** `codex/workstream-ui`

## Scope

- เปลี่ยนการ์ด `สร้างสินค้าขายด่วน` จาก Placeholder เป็นฟอร์มกรอกเร็ว
- แสดง Sales Code ถัดไปจากชุดที่ทดลองจอง และเลื่อนไปรหัสต่อไปหลังบันทึกใน UI
- รองรับรูปสินค้าแบบ Browser preview จำนวน 1 ภาพ ไม่บังคับ และจำกัด JPG/PNG/WebP ไม่เกิน 10 MB
- รองรับชื่อสินค้า, ราคาขาย, จำนวนเริ่มต้น, หน่วยขาย, สาขา และหมายเหตุ
- เพิ่มคำสั่ง `บันทึกและกลับ Products` กับ `บันทึกและสร้างรายการถัดไป`
- แสดงรายการล่าสุดสูงสุด 5 รายการ พร้อมปรับ Metrics ใช้แล้ว/คงเหลือ/รหัสถัดไป
- รายการล่าสุดแสดงภาพสินค้าที่เพิ่งเลือกแบบ 1:1 และใช้ Placeholder เมื่อยังไม่มีภาพ โดยเก็บเฉพาะใน Browser session
- รองรับ Required validation, Error state, Status announcement, Keyboard และ Responsive
- ใช้ Live Sale accent `#AAE600`, Hover `#D6E600` และตัวอักษรสีดำตาม Design System
- รองรับ granular permission `product.create` พร้อม legacy compatibility `product.manage`

## Safety Boundary

- เป็น UI Simulation และ Browser memory เท่านั้น
- ไม่สร้าง Product/SKU, ไม่จอง Sales Code และไม่บันทึกรูปภาพจริง
- ไม่เปิดบิล ไม่เพิ่ม Stock และไม่สร้าง Stock Movement
- ไม่มี Server Action, API, RPC, Migration หรือ Supabase mutation ใหม่
- เมื่อรีเฟรชหน้า ข้อมูลจำลองทั้งหมดจะหาย

## Verification

- Live-UI scoped tests: PASS 14/14
- TypeScript no-emit/no-incremental: PASS
- Production Build: PASS — 39/39 pages
- `git diff --check`: PASS (มีเพียงคำเตือน line ending เดิม)
- Authenticated visual test: รอ Owner เปิด session บน localhost

## Next Gate

Owner ตรวจ Live-UI-03 บน localhost แล้วหยุดรออนุมัติก่อนเริ่ม Live-UI-04 ตารางสถานะ Sales Code

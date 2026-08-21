# AVENZO ONE — Rapid-UI-03 Naming Template Builder Report

**Status:** Implemented locally — Pending Owner Visual Test
**Date:** 21 August 2026
**Branch:** `codex/workstream-ui`

## Scope

- เชื่อมช่วงรหัสที่ผู้ใช้เลือกจาก Rapid-UI-02 เข้ากับ Naming Template Builder
- รองรับ Preset: รหัสอย่างเดียว, Live + รหัส, Campaign + รหัส และกำหนดเอง
- ค่าแนะนำเริ่มต้นเป็น `{campaign}-{code}` พร้อม Campaign `PayDay`
- รองรับ Token `{code}`, `{campaign}`, `{date}`, `{branch}` และ `{seller}`
- เพิ่ม `{code}` อัตโนมัติเมื่อ Custom Template ไม่มี Token นี้
- แสดงตัวอย่างชื่อ 3 รายการแรกและรายการสุดท้ายจากช่วง 50 รหัส
- จำกัดชื่อสินค้า 120 ตัวอักษรและตรวจชื่อซ้ำใน Preview
- อธิบายการป้องกันชื่อที่แก้เฉพาะรายการจากการถูก Template เขียนทับ

## Safety Boundary

- เป็น Browser UI state เท่านั้น
- ไม่บันทึก Template, Product name, Product/SKU หรือ Sales Code จริง
- ไม่มี Server Action, API, RPC, Migration หรือ Supabase mutation ใหม่

## Verification

- Scoped tests: PASS 5/5
- Live Sale/Rapid regression: PASS 33/33
- TypeScript: PASS (`tsc --noEmit --incremental false`)
- `git diff --check`: PASS (มีเฉพาะคำเตือน line ending ของไฟล์เดิม)
- Localhost visual test: Pending Owner inspection

## Next Gate

หยุดรอ Owner ตรวจ Rapid-UI-03 ก่อนเริ่ม Rapid-UI-04 ตาราง 50 แถว

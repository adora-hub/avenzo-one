# AVENZO ONE — SKU-02 Variant SKU Code UI Report

Status: Owner Accepted

Status: Implemented locally — Pending Owner Visual Test
Branch: `codex/workstream-ui`

## Scope

- เพิ่มช่อง `คำนำหน้า SKU` ตาม Contract 2–12 ตัวอักษร A–Z/0–9
- เพิ่มช่อง `เลขลำดับ Product` ค่าเริ่มต้น 001
- เพิ่ม Preview รูปแบบ `TS-001-GLD` หรือ `TS-001-GLD-S` จาก Option Group ปัจจุบัน
- ปุ่ม `ใช้กับทุกรายการ` สร้าง SKU โดยใช้ Product Prefix + Sequence ก่อน Option Code
- แสดงคำเตือนว่า Preview ยังไม่จองเลขจนกว่า Backend จะตรวจและบันทึก
- Sales Code/CF และ Barcode ยังคงเป็น Identifier แยก

## Safety Boundary

- Local UI only
- ไม่มี API, Database, Migration, Sequence reservation หรือ Concurrent protection
- ไม่ Rename SKU เดิมอัตโนมัติ
- SKU-03 จะดูแล client generation behavior เพิ่มเติม
- SKU-04 จะดูแล Server-side next available และ transaction

## Verification

- SKU-02 scoped tests: PASS 4/4
- Existing Variant creation regression: PASS 5/5
- TypeScript: PASS
- Localhost route: HTTP 200
- Automated browser screenshot: Blocked by Windows workspace ACL; Owner visual test required

## Owner Test

1. เปิดหน้าสร้างสินค้าและเลือก `มีตัวเลือกหลายรายการ`
2. ดูโซน `กำหนดตัวเลือกและสร้าง SKU Combination`
3. กรอก Prefix `TS` และเลขลำดับ Product `1`
4. ตรวจ Preview เป็น `TS-001-GLD` สำหรับสีทอง หรือ `TS-001-GLD-S` เมื่อมีสีและไซซ์
5. กด `ใช้กับทุกรายการ` และตรวจ SKU Code ทุกแถว
6. เปลี่ยนเลข Product เป็น `2`, กดใช้กับทุกรายการ และตรวจว่าเปลี่ยนเป็น `TS-002-...`
7. ตรวจว่า Sales Code/CF และ Barcode ไม่ถูกเปลี่ยนความหมาย

Commit/Push: NONE / NONE

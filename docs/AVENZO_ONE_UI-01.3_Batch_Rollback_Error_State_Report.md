# AVENZO ONE — UI-01.3 Batch Rollback Error State Report

วันที่: 20 สิงหาคม 2026
Branch: `codex/workstream-ui`

## Status

**CONDITIONAL PASS — Code gates ผ่าน รอ Owner ทดสอบ Visual/Interaction บน authenticated Localhost**

## Scope ที่ทำ

- แสดงผล Rollback ทั้ง Batch โดยระบุชัดว่าไม่มี SKU ใดถูกบันทึกสำเร็จบางส่วน
- แสดงจำนวน SKU ที่ได้รับผลกระทบและจำนวนที่บันทึกจริงเป็น 0
- แสดงสาเหตุระดับ Batch และรายการ SKU ที่ต้องแก้พร้อม SKU Code
- เพิ่มปุ่ม `แก้ไขข้อมูล` เพื่อเลื่อนและโฟกัสช่องแรกที่ต้องแก้
- เพิ่มปุ่ม `ตรวจสอบอีกครั้ง` โดยใช้ Batch ID เดิมและข้อมูลเดิม
- รักษาข้อมูลที่ผู้ใช้กรอก ลำดับ Section และ All-or-Nothing UI contract จาก UI-01.2

## Files

- `web/src/app/organizations/[id]/products/new/unified-product-creation-form.tsx`
- `web/src/app/globals.css`
- `web/scripts/test-products-initial-stock-all-or-nothing-ui.mjs`

## Gates

- TypeScript: PASS
- UI/Contract tests: PASS 8/8
- Product UI regression: PASS 66/66
- Production Build: PASS 39/39 pages
- Localhost: `http://127.0.0.1:3000/` — HTTP 200
- `git diff --check`: PASS

## Guardrails

- ไม่มีการแก้ API, Database, Supabase, Transaction หรือ Stock Movement
- UI ยังคงระบุว่าเป็น Simulation และไม่ส่ง Backend
- Browser visual automation ถูก Windows sandbox ACL ปิดกั้น จึงต้องให้ Owner ตรวจด้วย browser session ที่ล็อกอินอยู่

## Owner Test

1. เปิดหน้าสร้างสินค้าและเปิด `สต็อกเริ่มต้น`
2. ลบจำนวนตั้งต้นของ SKU อย่างน้อยหนึ่งรายการ แล้วกด `ตรวจสอบ Batch ทั้งชุด`
3. ตรวจว่าแสดงจำนวน SKU ใน Batch, `0 SKU ที่บันทึก`, สาเหตุ และ SKU ที่ผิด
4. กด `แก้ไขข้อมูล` และตรวจว่าหน้าเลื่อนไปพร้อมโฟกัสช่องแรกที่ผิด
5. แก้จำนวนแล้วกด `ตรวจสอบอีกครั้ง` และตรวจว่าเปลี่ยนเป็นผลสำเร็จทั้ง Batch

## Commit/Push

NONE / NONE — หยุดรอ Owner อนุมัติ UI-01.3 ก่อนเริ่ม UI-01.4

# AVENZO ONE — SKU-03 Client Behavior Report

Status: Owner Accepted

## Scope

- สร้าง SKU ตาม `{PREFIX}-{PRODUCT_SEQUENCE}-{OPTION_CODE}` เมื่อ Prefix, Product Sequence หรือตัวเลือกเปลี่ยน
- ตรวจ SKU Code, Sales Code / CF และ Barcode ที่ซ้ำกันภายในฟอร์มก่อนเรียก Backend
- รักษา SKU Code ที่ผู้ใช้แก้เอง ไม่ให้การเปลี่ยน Prefix/Sequence อัตโนมัติเขียนทับ
- ปุ่ม `ใช้กับทุกรายการ` เป็นคำสั่งชัดแจ้งที่สร้าง SKU ใหม่ทุกแถวและยกเลิกสถานะ Manual edit
- แสดงคำแนะนำเลข Product Sequence ถัดไปแบบ UI เท่านั้น พร้อมข้อความว่า Backend ยังไม่ได้จองรหัส

## Guardrails

- ไม่มี Supabase Migration, Database write, Reservation, RPC หรือ API ใหม่
- การแนะนำเลขถัดไปยังไม่ยืนยันกับฐานข้อมูล
- การตรวจรหัสที่มีอยู่จริงใน Organization ยังคงใช้ Server Action เดิม
- SKU-04 จะเป็น Authority สำหรับ Next available, Organization uniqueness และ Concurrency protection

## Verification

- SKU-02 + SKU-03 scoped tests: 8/8 PASS
- Related Product/SKU regression tests: 32/32 PASS
- TypeScript `--noEmit --incremental false`: PASS
- Owner Visual Test: PASS

## Owner Visual Test

1. เปิดหน้าสร้างสินค้า และเลือก `มีตัวเลือกหลายรายการ`
2. สร้างตัวเลือกสี `สีทอง` และ `สีเงิน`
3. ใส่ Prefix `TS` และเลข Product `1`; ตรวจว่าได้ `TS-001-GLD` และ `TS-001-SLV`
4. กด `ใช้เลขถัดไป 002`; ตรวจว่าแถวอัตโนมัติเปลี่ยนเป็น `TS-002-GLD` และ `TS-002-SLV`
5. แก้ SKU สีทองเองเป็น `SPECIAL-GLD` แล้วเปลี่ยน Product Sequence; ตรวจว่า `SPECIAL-GLD` ไม่ถูกเขียนทับ แต่แถวสีเงินเปลี่ยนตามเลขใหม่
6. กด `ใช้กับทุกรายการ`; ตรวจว่าทุกแถวกลับมาใช้รูปแบบอัตโนมัติ
7. ทำให้ SKU, รหัส CF หรือ Barcode สองแถวซ้ำกัน; ตรวจว่าแถวถูกทำเครื่องหมายและระบบแจ้งให้แก้รหัสซ้ำในฟอร์มก่อนตรวจฐานข้อมูล

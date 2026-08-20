# AVENZO ONE — SKU-04 Backend Integration Report

วันที่: 20 สิงหาคม 2026
สถานะ: **Completed — Applied to AVENZO ONE PREVIEW — Production Untouched**

## Scope

- เพิ่ม `sku_product_sequences` เป็น High-water mark แยกตาม Organization + Prefix
- Preview เลขว่างถัดไปจาก Sequence และ SKU Code ที่มีอยู่จริง โดยยังไม่จองเลข
- จอง Product Sequence พร้อมสร้าง Product และ SKU Variant ทั้งหมดใน Transaction เดียว
- ใช้ Transaction advisory lock ป้องกันผู้ใช้พร้อมกันได้เลขเดียวกัน
- ใช้ Atomic Variant command เดิมเป็น Authority สำหรับ Product, SKU, Identifier, Audit และ Idempotency
- ไม่คืนเลขที่ข้ามหรือเคยใช้แล้วกลับมาใช้โดยอัตโนมัติ
- ไม่สร้างระบบ SKU Unique หรือ Identifier Registry ซ้ำ

## Safety และ Rollout

- RPC ใหม่ให้ `service_role` เรียกได้เท่านั้น; `anon` และ `authenticated` ไม่มีสิทธิ์เรียกหรือเขียน Sequence table โดยตรง
- Localhost ที่ชี้ Preview ซึ่งยังไม่มี Migration จะถอยกลับไปใช้ Atomic Variant command เดิมเฉพาะกรณี RPC ไม่มีอยู่เท่านั้น
- Conflict, Permission และ Validation error จะไม่ Fallback และไม่ถูกซ่อน
- Apply Migration `20260820134813` เฉพาะ AVENZO ONE PREVIEW (`kenhlerbirchcpzgnfsh`) แล้ว; Production ไม่ถูกเชื่อมและไม่ถูกแตะ
- ตรวจหลัง Apply แบบ read-only: Table/RPC/History ครบ, `anon`/`authenticated` ไม่มี Execute, `service_role` มี Execute
- Server Preview บน Organization ทดสอบคืน `TS-001`, `preview_only: true`, `reserved: false` โดยไม่สร้างหรือแก้ Product

## Verification

- TypeScript: PASS
- SKU-02–04 scoped tests: 12/12 PASS
- Existing Atomic/B5 static regression: 10/10 PASS; A4 Docker test แยกจากชุดนี้
- SKU-04 isolated database migration and behavior: PASS
- SKU-04 real concurrent commands: PASS — สำเร็จ 1, Rollback 1, Sequence ถูกจองครั้งเดียว
- Isolated database ถูกลบทิ้งหลังทดสอบ; Supabase Local หลักไม่ถูก Reset

## Owner Test บน Localhost ที่เชื่อม AVENZO ONE PREVIEW

1. เปิดหน้าสร้างสินค้าแบบ “มีตัวเลือกหลายรายการ”
2. กรอก Prefix เช่น `TS` และรอข้อความ “ฐานข้อมูลแนะนำเลขที่ว่างถัดไป”
3. กด “ใช้เลขถัดไป” แล้วตรวจรูปแบบ เช่น `TS-003-GLD`
4. สร้างสินค้าให้สำเร็จ แล้วเปิดสร้างสินค้าใหม่ด้วย Prefix เดิม
5. เลขแนะนำต้องเพิ่มเป็น Product Sequence ถัดไป และไม่ย้อนใช้ช่องว่างเดิม

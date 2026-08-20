# AVENZO ONE — Phase 2.1.R7.2.4C Identifier Assistant Interaction

วันที่: 15 สิงหาคม 2026

สถานะ: **Owner Approved / Completed**

## Outcome

R7.2.4C ทำเฉพาะ Identifier Assistant ใน Section `SKU แรกและรหัสสินค้า` ตาม Approved Mockup โดยไม่เริ่ม SKU staging, Validation summary หรือ Success/Recovery interaction

- SKU Code, Sales Code และ Barcode รองรับโหมดกรอกเอง/ใช้ค่าเดียวกันตามที่ Mockup กำหนด
- SKU Code และ Sales Code แปลงเป็นตัวพิมพ์ใหญ่ขณะกรอก และค่าที่ผูกกัน Sync แบบ Live
- เมื่อ Identifier หรือโหมดเปลี่ยน ผลตรวจเดิมถูกทำเครื่องหมายว่า Stale และต้องตรวจใหม่
- ปุ่ม `ตรวจสอบรหัส` มี Loading state, `aria-busy` และ Live status ที่ Screen Reader อ่านได้
- ระบบตรวจรหัสซ้ำจริงภายใน Organization สำหรับ SKU Code, Sales Code และ Barcode ก่อนบันทึกแบบ Advisory
- ป้องกันผล Async เก่ากลับมาทับค่าปัจจุบันด้วย Request identity และตรวจค่าซ้ำก่อนแสดงผล
- Sales Code sequence แสดง Preview เท่านั้น ยังไม่จองรหัสและไม่ถือว่าเป็น Atomic allocator

## Server และ Security Contract

1. การตรวจใช้ Authenticated Supabase client ภายใต้ Session และ RLS ของผู้ใช้ปัจจุบัน ไม่ใช้ Admin/Service-role client
2. Server ตรวจ `product.manage` ก่อนอ่าน และ Query ทุก Identifier ด้วย `organization_id` แบบชัดเจนพร้อมจำกัดผลลัพธ์
3. Input ถูก Normalize และ Validate ก่อน Query: Organization UUID, ความยาวสูงสุด, Character allowlist และ Control-character guard
4. Part นี้เป็น Read-only advisory check ไม่มี Schema/RPC/Command/Mutation ใหม่
5. Database transaction ของ `product.create_with_initial_sku` ยังคงเป็นผู้ยืนยัน Unique ขั้นสุดท้าย เพื่อป้องกัน Race condition ระหว่างตรวจและบันทึก
6. Sequence Preview ไม่ได้จอง Sales Code; การจอง/จัดสรรแบบ Atomic ต้องผ่าน Domain contract แยกในอนาคต

## Verification

- R7.2.4C targeted interaction: **8/8 ผ่าน**
- Product R2–R7.2.4C regression: **115/115 ผ่าน**
- TypeScript: ผ่านด้วย `tsc --noEmit --incremental false`
- Authenticated Desktop Light บน Route จริง:
  - ตรวจ Live uppercase และโหมด Sync ทั้งสาม Identifier
  - ตรวจ Available result จาก Server จริง
  - ตรวจ Stale state หลังแก้ Identifier
  - ตรวจ Sequence preview `A001 → A002` โดยไม่มี Reservation
  - ตรวจ Known duplicate แล้วพบ `SKU Code RNG-TY-GD-5` และ `Sales Code A001`
- ไม่สร้าง Product/SKU, ไม่เขียนข้อมูลทดสอบ และล้าง Browser Draft identifier กลับเป็นค่าว่างหลังทดสอบ

Node แสดงเฉพาะ `MODULE_TYPELESS_PACKAGE_JSON` warning เดิมของ Test runner ซึ่งไม่ทำให้การทดสอบล้มเหลว

## Scope Boundary

- ไม่เริ่ม SKU Staging Interaction
- ไม่เริ่ม Validation/Security Summary Interaction
- ไม่เริ่ม Success/Recovery Interaction
- ไม่แก้ Atomic Product Creation contract, Image lifecycle หรือ Inventory boundary
- ไม่ apply Supabase Preview/Production
- ไม่ commit, push หรือ deploy ใน Part นี้

## Next Gate

Owner อนุมัติ R7.2.4C และอนุมัติเริ่ม **R7.2.4D — SKU Staging Interaction** แยกแล้ว โดยผลของ Part D บันทึกในเอกสาร Part ของตัวเอง

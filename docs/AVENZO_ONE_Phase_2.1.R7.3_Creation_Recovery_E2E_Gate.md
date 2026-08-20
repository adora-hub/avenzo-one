# AVENZO ONE — Phase 2.1.R7.3 Creation Recovery & E2E Gate

วันที่: 15 สิงหาคม 2026
สถานะ: **Completed on AVENZO ONE PREVIEW / Production untouched**

## Outcome

R7.3 ปิด Creation/Recovery Gate ของ Unified Product Creation ด้วย Controlled data เฉพาะ Supabase project `AVENZO ONE PREVIEW` (`kenhlerbirchcpzgnfsh`) และ Organization `69408fd5-4f58-4546-9ab4-5b92009bd241`

ทดสอบครบทั้ง Atomic create, idempotent retry, duplicate rollback, image fail/retry/finalize, Product read model, audit และ cleanup โดยไม่สร้าง Inventory Balance หรือ Stock Movement และไม่ได้แตะ Supabase Production

## Preview schema gate

ระหว่าง discovery พบว่า Preview มี R6 แล้ว แต่ยังไม่มี R5 และ R7.1 ที่ R7.3 ต้องใช้ จึง apply migration ที่อนุมัติไว้เดิมตามลำดับเฉพาะ Preview:

1. `phase_2_1_r5_product_domain_extension`
2. `phase_2_1_r7_1_atomic_product_creation`

Migration list รอบสุดท้ายยืนยันทั้ง R5, R6 และ R7.1 อยู่ใน Preview แล้ว ไม่มีการ apply, merge หรือเปลี่ยนค่าใน Production

## Controlled E2E evidence

### Atomic Product creation

- Product: `9a0fe12b-5126-4bce-be95-72dfb1b48b53`
- SKU: `5b1c43a8-751e-4747-8266-fa21e126fb23`
- SKU Code: `R73-E2E-0815-1`
- Sales Code: `R73E2E001`
- Barcode: `9900000081501`
- Create command: `5c49fcd3-f126-4baf-a1b1-d0c73e58e101`

ผลที่ยืนยัน:

- retry ด้วย Command ID เดิมคืน Product/SKU ID เดิม
- command ใหม่ที่ใช้ identifier ซ้ำถูก rollback โดยไม่สร้าง Product/SKU หรือ command row ค้างเพิ่ม
- Product และ SKU เริ่มเป็น `draft`
- `inventory_rows = 0` และ `stock_movements = 0`

### Image recovery

ทดสอบ lifecycle จริงตาม R6:

1. `prepare` ภาพแรก
2. จำลอง `fail`
3. `prepare` ภาพใหม่ด้วย Product ID เดิม
4. upload PNG ที่ปลอดภัยไป private bucket `product-images` โดย `upsert: false`
5. `finalize` เป็น Ready/Cover
6. `reorder` และอ่านกลับผ่าน Products read model

Authenticated Products Workspace แสดง Product, SKU, Sales Code, Draft status และ signed cover image ที่กู้คืนสำเร็จ โดยไม่มี Stock

## Recovery and interaction gate

- pending recovery ตรวจ UUID, bounded Product name, valid timestamp และหมดอายุภายใน 24 ชั่วโมง
- retry รูปใช้ Product ID เดิมและไม่เรียก Atomic Product command ซ้ำ
- Command ID อยู่จนรูปทั้งหมดสำเร็จ จึงล้าง Browser Draft/pending state
- Success dialog เปิดหลัง `failedCount === 0` เท่านั้น รองรับ Focus trap, Escape และคืน focus
- Success copy ระบุความจริงว่า Product/SKU ยังเป็น Draft และยังไม่เพิ่ม Stock

## Cleanup evidence

หลังทดสอบได้ archive Controlled Product, SKU, Category และ Product Images พร้อมลบ Storage object แบบเจาะจง โดยผลตรวจรอบสุดท้ายเป็น:

| รายการ | ผล |
|---|---:|
| Product status | `archived` |
| SKU status | `archived` |
| Category status | `archived` |
| Non-archived Product Images | 0 |
| Storage objects ของ Controlled Product | 0 |
| Inventory Balance rows | 0 |
| Stock Movement rows | 0 |
| Target-level audit rows | 6 |

เก็บ immutable command/event/audit history ไว้ตามข้อกำหนดระบบ แต่ไม่มี Active/Draft test data หรือไฟล์ทดสอบค้าง

## Automated verification

- R7.3 targeted gate: **10/10 ผ่าน**
- Products R1–R7.3 regression: **171/171 ผ่าน**
- TypeScript: **ผ่าน** ด้วย `tsc --noEmit --incremental false`
- Preview cleanup query: **ผ่าน**

ไฟล์หลักฐาน:

- `web/scripts/test-products-r7-creation-e2e-gate.mjs`
- `web/scripts/run-products-r7-preview-storage.mjs`
- `web/src/app/organizations/[id]/products/new/unified-product-creation-form.tsx`

## Browser evidence limitation

Chrome extension ปฏิเสธ native file chooser เพราะยังไม่ได้เปิด `Allow access to file URLs` จึงไม่สามารถบันทึกหลักฐานการเลือกไฟล์จาก UI จริงในรอบนี้ได้ อย่างไรก็ตามได้ทดสอบ Storage lifecycle จริง, authenticated Products read model จริง และ deterministic interaction contracts ครบแล้ว ข้อจำกัดนี้เป็นข้อจำกัดของ browser automation evidence ไม่ใช่ Product/Image backend failure

หากต้องการหลักฐาน native picker เพิ่ม ให้เปิดสิทธิ์ดังกล่าวแล้วทำ Browser-only evidence rerun โดยไม่ต้องสร้าง Migration ใหม่

## Advisor record

หลัง apply DDL ได้ตรวจ Security และ Performance advisors แล้ว พบ advisory debt เดิมของโครงการ เช่น intentional deny tables, Security Definer warnings, leaked-password protection และ index recommendations ซึ่งไม่ใช่ regression ที่เกิดจาก R7.3 และไม่ขยาย scope เพื่อแก้ใน Gate นี้

- [Supabase Database Linter](https://supabase.com/docs/guides/database/database-linter)
- [Password strength and leaked password protection](https://supabase.com/docs/guides/auth/password-security#password-strength-and-leaked-password-protection)

## Release boundary

- R7.3 ปิดเฉพาะ Local + AVENZO ONE PREVIEW gate
- ยังไม่มี commit, push, Vercel deploy หรือ Supabase Production apply ใน Part นี้
- งานถัดไปต้องเปิดแผนและขออนุมัติใหม่ ห้ามตีความการปิด R7.3 เป็น Production deployment approval

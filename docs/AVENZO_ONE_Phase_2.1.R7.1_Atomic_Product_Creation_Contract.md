# Phase 2.1.R7.1 — Atomic Product Creation Contract

Status: **Owner Approved / Completed Locally / Applied to AVENZO ONE PREVIEW during R7.3; Production untouched**
Date: 15 August 2026

## Outcome

R7.1 เพิ่ม command `product.create_with_initial_sku` สำหรับสร้าง Product และ SKU แรกใน PostgreSQL transaction เดียว จึงไม่เกิด Product ค้างโดยไม่มี SKU เมื่อรหัสซ้ำหรือข้อมูลส่วนใดล้มเหลว

Command นี้สร้างข้อมูลเป็น `draft` เท่านั้น และคืน `product_id` กับ `sku_id` เพื่อให้ R7.2 ดำเนินการอัปโหลดรูปผ่าน R6 และทำขั้นตอนตรวจสอบก่อน Activate

## Atomic boundary

รายการต่อไปนี้สำเร็จหรือ rollback พร้อมกัน:

- Product พร้อม Category, Brand, Structure type และ Internal note
- Product Tags สูงสุด 12 รายการ โดยต้องเป็น Active master ของ Organization เดียวกัน
- SKU แรก พร้อม SKU Code, Sales Code, Barcode และ Base Unit
- ราคาขาย ภาษี น้ำหนัก ขนาดสินค้า/กล่อง และนโยบายเติมสินค้า
- ราคาต้นทุน (เมื่อส่งค่า)
- Selling/Packaging Units สูงสุด 50 รายการ
- Bundle Components สูงสุด 100 รายการ เมื่อ Product เป็น `bundle`
- Foundation command, domain event และ audit log อย่างละหนึ่งชุด

## Deliberately separate workflows

### Product images

ไฟล์ภาพไม่สามารถอยู่ใน Database transaction เดียวกับ Storage upload ได้อย่างปลอดภัย จึงไม่รวม binary upload ใน R7.1:

1. R7.1 สร้าง Product/SKU เป็น Draft
2. R7.2 ใช้ R6 `prepare → upload → finalize` สำหรับภาพ 1–9 ภาพ
3. หาก upload ล้มเหลว ให้ cleanup object ที่อัปโหลดแล้วและคง Draft ไว้ให้ Retry
4. ห้าม Activate จนกว่าจะมีภาพ Ready ตามข้อกำหนดของ Form

ผลลัพธ์ของ R7.1 จึงระบุ `image_upload_required: true`

### Inventory

R7.1 ไม่เขียน Stock balance และไม่สร้าง Stock Movement ค่า `Available` ยังคงเป็น Derived read model ทุกการรับสินค้า/ปรับยอด/โอนต้องใช้ Inventory Command หลัง resolve เป็น `sku_id` แล้วเท่านั้น ผลลัพธ์จึงระบุ `inventory_posted: false`

## Command contract

RPC: `public.server_execute_product_creation_command(...)`

- `SECURITY DEFINER` พร้อม `search_path = ''`
- Execute ได้เฉพาะ `service_role`
- ตรวจ `product.manage` ของ Actor ใน Organization
- ใช้ `foundation_commands` เป็น durable idempotency envelope
- Command ID เดิม + payload/hash/actor เดิม คืนผลเดิม
- Command ID เดิม + ข้อมูลต่างกัน คืน `command_payload_conflict`
- Category, Brand, Tags และ Bundle component ต้องอยู่ใน Organization เดียวกัน

ค่าหลักที่จำเป็น:

- `name`
- `category_id`
- `sku_name`
- `sku_code`
- `base_unit_code`

ระบบไม่รับ `status`, Product ID หรือ SKU ID จาก Browser ใน payload นี้ เพราะ Server เป็นผู้สร้าง identity และบังคับสถานะ Draft

## Failure behavior

- SKU Code, Sales Code, Barcode หรือ Selling Unit Barcode ซ้ำ: rollback ทั้ง Product/SKU/metadata/command/event/audit
- Master data ไม่พบ, ถูกเก็บถาวร หรือเป็นคนละ Organization: rollback ทั้งหมด
- Bundle components ถูกส่งให้ Product ที่ไม่ใช่ Bundle: reject
- Collection เกินเพดาน, Tax/Reorder range ไม่ถูกต้อง หรือ payload มี field ที่ไม่อนุญาต: reject ก่อนเข้า repository

## Files

- Migration: `supabase/migrations/20260815103024_phase_2_1_r7_1_atomic_product_creation.sql`
- SQL behavior test: `supabase/tests/phase_2_1_r7_1_atomic_product_creation.sql`
- TypeScript contract: `web/src/lib/foundation/contracts.ts`
- Repository route: `web/src/lib/foundation/supabase-repository.ts`
- Contract tests: `web/scripts/test-products-r7-atomic-creation.mjs`

## Verification evidence

- R7.1 targeted contract tests: **5/5 passed**
- Products R1–R7.1 regression: **40/40 passed**
- TypeScript: **passed** with incremental output disabled because the active dev process holds `tsconfig.tsbuildinfo`
- Transactional SQL behavior: **passed** (`PHASE_2_1_R7_1_ATOMIC_PRODUCT_CREATION_OK`)
- Duplicate SKU Code, Sales Code and Barcode rollback: verified Product and command count remain zero
- Test transaction cleanup: verified no R7.1 test command remains in Local DB
- Supabase DB lint: no schema error; one pre-existing warning remains for unused `v_payment` in `platform_simulate_sandbox_payment_event`
- Preview Security/Performance Advisors reviewed; notices are existing project baseline because R7.1 has not been applied to Preview

The Local CLI migration history is older than the current schema, so `migration up --local` attempted to replay an existing policy. R7.1 was therefore validated by applying the migration and behavior test inside one explicit Local transaction and rolling it back. Local user data was not reset or deleted.

## Deployment boundary

- R7.1 migration is **not applied to AVENZO ONE PREVIEW**
- Supabase Production is **not touched**
- No commit, push, Vercel deployment or UI route was created in this Part

## Next approved sequence

The next Part is **2.1.R7.2 — Unified Product Creation Form Integration**. It must consume this single atomic command and the R6 image pipeline; it must not call `product.create` followed by `sku.create` as separate browser-visible operations.

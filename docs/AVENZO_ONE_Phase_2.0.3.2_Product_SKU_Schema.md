# Phase 2.0.3.2 — Product/SKU Schema

วันที่: 13 สิงหาคม 2026

สถานะ: **Owner Approved / Completed Locally**

ขอบเขต: Product/SKU master schema และ permanent identifiers ตาม D-201–D-204, D-206, D-211 และ D-217 บน local Supabase เท่านั้น ไม่ apply หรือแก้ Production

## 1. ผลลัพธ์

สร้าง migration `20260813124837_phase_2_0_3_2_product_sku_schema.sql` โดยใช้ Supabase CLI `2.114.0` และเพิ่ม:

- `public.products` เป็น aggregate root ระดับ Organization
- `public.skus` เป็น stock identity ภายในที่อ้าง Product ด้วย composite tenant FK
- UUID primary keys และ composite unique keys สำหรับ tenant-safe foreign keys ใน phase ถัดไป
- indexes สำหรับ organization/product, status, updated time และ permanent identifiers
- trigger guards สำหรับ canonicalization, immutable fields, lifecycle และ hard delete
- RLS แบบ deny-by-default โดยยังไม่มี Data API grant หรือ read policy จนถึง Phase 2.0.3.5

## 2. Identifier contract

| Identifier | Canonical form | Uniqueness | Authority |
|---|---|---|---|
| `id` / `sku_id` | UUID | Global primary key | stock identity และ foreign key ที่แท้จริง |
| `sku_code` | trim + uppercase | `(organization_id, sku_code)` | permanent lookup; ต้อง resolve เป็น `sku_id` |
| `barcode` | trim | `(organization_id, barcode)` เมื่อไม่เป็น null | lookup/scan; ต้อง resolve เป็น `sku_id` |
| `sales_code` | trim + uppercase | `(organization_id, sales_code)` เมื่อไม่เป็น null | customer-facing lookup; เปลี่ยนหรือนำกลับไปใช้ไม่ได้เมื่อกำหนดแล้ว |

`cf_code` และ `order_item_code` ไม่ใช่คอลัมน์บน SKU และยังไม่อยู่ใน schema นี้ ตาม D-217 ทั้งสองชนิดต้อง resolve เป็น `sku_id` ผ่าน context ของ Live Session/Order ใน phase ของ domain นั้น

## 3. Tenant และ lifecycle invariants

- Product และ SKU เปลี่ยน `organization_id` ไม่ได้
- SKU เปลี่ยน `product_id`, `base_unit_code` หรือ `quantity_scale` ไม่ได้
- composite FK `(organization_id, product_id)` ปฏิเสธ cross-tenant reference
- Product/SKU ใช้ `draft → active → archived` หรือ `draft → archived`; ห้ามย้อนกลับ
- Product จะเปลี่ยนเป็น active ได้เมื่อมี active SKU อย่างน้อยหนึ่งรายการ
- archived row แก้ไขไม่ได้และทุก Product/SKU ห้าม hard delete
- Product/SKU names ซ้ำกันได้ตาม Domain Contract

## 4. Security boundary

- เปิด RLS บน `public.products` และ `public.skus`
- ถอน privilege ทั้งหมดจาก `public`, `anon` และ `authenticated`
- ไม่มี policy ที่เปิดข้อมูลก่อน permission matrix จะผ่าน Phase 2.0.3.5
- trigger functions อยู่ใน `private`, ใช้ `SECURITY INVOKER`, fix `search_path` และไม่เปิด execute ให้ Data API roles
- ไม่มี `service_role` browser exposure และไม่มี Production mutation

การเลือก deny-by-default สอดคล้องกับ Supabase Data API behavior รุ่นปัจจุบันที่ table ใหม่ไม่ควรถูก auto-expose และช่วยไม่ให้ schema phase นี้เปิดข้อมูลก่อน RLS/permission review

## 5. Verification evidence

ทดสอบกับ local Supabase Postgres 17 ที่ replay baseline แล้ว:

```text
PHASE_2_0_3_2_PRODUCT_SKU_TESTS_PASSED
```

ชุดทดสอบ `supabase/tests/phase_2_0_3_2_product_sku_schema.sql` ครอบคลุม:

1. trim/uppercase/lowercase canonicalization
2. unique `sku_code`, `barcode`, `sales_code` ภายใน Organization
3. อนุญาต code เดียวกันในคนละ Organization
4. ปฏิเสธ cross-tenant Product/SKU FK
5. `sales_code`, base unit และ quantity scale permanence
6. forward-only lifecycle และ Product activation guard
7. archived immutability และ hard-delete denial
8. RLS enabled และไม่มี `anon`/`authenticated` SELECT grants

Supabase Advisors:

```text
supabase db advisors --local
No issues found
```

Baseline archive validator ยังคงผ่าน `90/90 canonical SQL files + 7 bridges` และ migration ใหม่ไม่แก้ไฟล์ baseline เดิม

## 6. Rollback/compensation boundary

- Local verification ใช้ transaction สำหรับ test data และ rollback หลังจบ
- Migration ยังไม่ถูก apply Production จึงไม่มี Production rollback
- ก่อน Production release ต้องทำ clean rebuild และ rollback rehearsal ใน Phase 2.0.3.6
- หาก migration ยังไม่มี business data การ rollback candidate คือถอน trigger/functions/indexes แล้ว drop `skus` ก่อน `products`; หลังมีข้อมูลให้ใช้ forward compensation เท่านั้นและต้องผ่าน approval ใหม่

## 7. Gate ถัดไป

Phase 2.0.3.2 ปิดได้จากหลักฐาน local ข้างต้น ขั้นถัดไปคือ **Phase 2.0.3.3 Warehouse/Location Schema** ซึ่งต้องได้รับอนุมัติแยก และยังไม่อนุญาตให้ apply Supabase Production

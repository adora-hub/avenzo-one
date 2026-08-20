# AVENZO ONE — Phase 2.1.R7.4.1 Product Field Contract Freeze

วันที่: 16 สิงหาคม 2569
สถานะ: **Completed / Owner approved — Sequential gate passed**
ขอบเขต: Contract/Documentation/Test only; ไม่มี Migration, Database write, Production UI change หรือ Supabase Production apply

## Outcome

ล็อกเส้นทางข้อมูลจริงจาก `Unified Product Creation` ไปยัง Atomic command, Supabase tables, Products Read Model, Data Grid และ Quick View ก่อนเริ่ม R7.4.2 เพื่อไม่ให้ UI แสดงข้อมูลจำลองหรือสร้างความหมายใหม่ที่ Domain ไม่รองรับ

ผลตรวจยืนยันว่า Form และ Atomic command บันทึก Product/SKU metadata ได้มากกว่า Read Model ปัจจุบัน แต่ Products Read Model ยังอ่านเพียง Product, SKU identifiers, ready images และ Inventory balances ดังนั้น Category, Brand, Tags, price/tax, physical/packaging, replenishment, sell units และ Bundle ยังไม่ถึง Data Grid/Quick View

## Source of truth ที่ตรวจ

- Approved Products mockup: `docs/mockups/phase-2.1-products-workspace-ui.html`
- Approved creation mockup: `docs/mockups/phase-2.1-unified-product-creation-form.html`
- Form payload: `web/src/app/organizations/[id]/products/new/unified-product-creation-form.tsx`
- Atomic create contract: `supabase/migrations/20260815103024_phase_2_1_r7_1_atomic_product_creation.sql`
- Product domain schema: `supabase/migrations/20260815083258_phase_2_1_r5_product_domain_extension.sql`
- Product image schema: `supabase/migrations/20260815090201_phase_2_1_r6_product_image_gate.sql`
- Inventory authority: `supabase/migrations/20260813131250_phase_2_0_3_4_inventory_ledger_balance.sql`
- Repository/read types: `web/src/lib/foundation/repositories.ts`
- Workspace builders: `web/src/lib/foundation/product-workspace-read-model.ts`, `product-detail-read-model.ts`
- Supabase reads: `web/src/lib/foundation/supabase-repository.ts`
- Production grid: `web/src/app/organizations/[id]/products/products-data-grid.tsx`
- Quick View: `web/src/app/organizations/[id]/products/product-detail-sheet.tsx`

## สถานะ Field Contract

| สถานะ | ความหมาย |
|---|---|
| `READ_NOW` | บันทึกและอ่านถึง Production UI ได้แล้ว |
| `PERSISTED_NOT_READ` | Atomic command บันทึกแล้ว แต่ Products Read Model ยังไม่โหลด |
| `DERIVED` | ห้ามกรอกหรือเขียนตรง ต้องคำนวณจากแหล่ง Authority |
| `PERMISSION_GATED` | โหลด/แสดงได้เฉพาะเมื่อมี Permission ที่กำหนด |
| `SEPARATE_FLOW` | ใช้ Workflow แยกจาก Atomic Product creation |
| `UI_DRAFT_ONLY` | มีใน Form interaction แต่ยังไม่ใช่ Business data ที่บันทึกจริง |
| `DEFERRED` | ต้องเปิด Domain/Command gate ใหม่ ห้ามแอบรวมใน R7.4.2–R7.4.5 |

## Field Mapping — Product และ Master Data

| UI field | Payload/source | Database authority | Current read/UI | Target gate |
|---|---|---|---|---|
| ชื่อสินค้า | `name` | `products.name` | `READ_NOW` Grid/Quick View/Search | คงเดิม |
| คำอธิบาย | `description` | `products.description` | `READ_NOW` | คงเดิม |
| หมวดหมู่ | `category_id` | `products.category_id → product_categories` | `PERSISTED_NOT_READ` | R7.4.2 Read Model; R7.4.4 Optional column; R7.4.5 Quick View |
| แบรนด์ | `brand_id` | `products.brand_id → product_brands` | `PERSISTED_NOT_READ` | R7.4.2/R7.4.4/R7.4.5 |
| รูปแบบสินค้า | `structure_type` | `products.structure_type` | `PERSISTED_NOT_READ` | R7.4.2/R7.4.5 |
| หมายเหตุภายใน | `internal_note` | `products.internal_note` | `PERSISTED_NOT_READ`; ห้ามแสดงใน Default Grid | R7.4.2/R7.4.5 พร้อม permission-safe placement |
| Tags | `tag_ids` | `product_tag_assignments → product_tags` | `PERSISTED_NOT_READ` | R7.4.2/R7.4.4/R7.4.5 |
| สถานะสินค้า | Server lifecycle | `products.status` | `READ_NOW` | Grid/Quick View ต้องใช้ safe lifecycle action เดิม |
| Version | Server | `products.version` | `READ_NOW` | ใช้ optimistic conflict; ไม่แสดงเป็น editable field |
| วันที่สร้าง | Server | `products.created_at` | Read Model มีแล้ว แต่ Grid ไม่มี | R7.4.4 Optional; R7.4.5 Quick View |
| แก้ไขล่าสุด | Server | `products.updated_at` | `READ_NOW` Default Grid | คงเดิม |
| ผู้สร้าง | Server actor | `products.created_by → organization_members.display_name` | มีเพียง User ID ใน Read Model | R7.4.2 resolve แบบ Organization-scoped; R7.4.4/R7.4.5 |

## Field Mapping — SKU, ราคา และ Physical Profile

| UI field | Payload/source | Database authority | Current read/UI | Target gate |
|---|---|---|---|---|
| ชื่อ SKU/ตัวเลือก | `sku_name` | `skus.name` | `READ_NOW` ใน Preview/Quick View | คงเดิม |
| SKU Code | `sku_code` | `skus.sku_code` | `READ_NOW`; unique ต่อ Organization | คงเดิม |
| รหัส CF / Sales Code | `sales_code` | `skus.sales_code` | `READ_NOW`; unique ต่อ Organization | คงเดิม |
| Barcode | `barcode` | `skus.barcode` | `READ_NOW` ใน Search/Quick View แต่ยังไม่เป็น Optional Grid column | R7.4.4 |
| Base Unit | `base_unit_code` | `skus.base_unit_code` | `READ_NOW`; immutable Stock authority | คงเดิม |
| วิธีนับจำนวน | `quantity_behavior` | `sku_product_profiles.quantity_behavior` | `PERSISTED_NOT_READ` | R7.4.2/R7.4.4/R7.4.5 |
| ราคาขาย | `sale_price` | `sku_product_profiles.sale_price` | `PERSISTED_NOT_READ` | R7.4.2; **Default Grid ใน R7.4.3**; Quick View R7.4.5 |
| สกุลเงิน | `currency_code` | `sku_product_profiles.currency_code` | `PERSISTED_NOT_READ` | R7.4.2; ห้ามสมมติ THB ตอนอ่าน |
| หมวด/อัตราภาษี | `tax_category`, `tax_rate` | `sku_product_profiles` | `PERSISTED_NOT_READ` | R7.4.2/R7.4.4/R7.4.5 |
| ราคาต้นทุน | `cost_price` | `sku_cost_profiles.cost_price` | `PERMISSION_GATED` ด้วย `product.cost.read` | R7.4.2 โหลดเมื่อมีสิทธิ์เท่านั้น; R7.4.4 Optional; R7.4.5 safe detail |
| น้ำหนัก/ขนาดสินค้า | `product_*` | `sku_product_profiles.product_*` | `PERSISTED_NOT_READ` | R7.4.2/R7.4.5 |
| น้ำหนัก/ขนาดกล่อง | `package_*` | `sku_product_profiles.package_*` | `PERSISTED_NOT_READ` | R7.4.2/R7.4.5 |
| Safety/Min/Max | `safety_stock`, `reorder_min`, `reorder_max` | `sku_product_profiles` | `PERSISTED_NOT_READ`; เป็น Policy ไม่ใช่ Stock | R7.4.2/R7.4.4/R7.4.5 |
| หน่วยขาย/หน่วยบรรจุ | `sell_units` | `sku_sell_units` | `PERSISTED_NOT_READ` | R7.4.2/R7.4.5 |
| Bundle/Kit components | `bundle_components` | `sku_bundle_components` | `PERSISTED_NOT_READ` | R7.4.2/R7.4.5 |

## Field Mapping — รูปภาพ, Stock และสาขา

| UI field | Database authority | Contract ที่ล็อก | Target gate |
|---|---|---|---|
| รูปสินค้า 1–9 รูป | `product_images` + private Storage | `SEPARATE_FLOW`; Atomic creation คืน `image_upload_required=true`; Grid อ่านเฉพาะ ready cover | R7.4.2 คง signed URL contract; R7.4.5 แสดง gallery |
| On hand | `inventory_balances.on_hand` จาก immutable Stock Movement | `DERIVED`; ห้ามเขียนจาก Product form | R7.4.3 Default Grid/R7.4.5 |
| Allocated | `inventory_balances.allocated` | `DERIVED`; read-only | R7.4.5 และ Optional summary ที่ไม่ทำให้เข้าใจผิด |
| Available | `inventory_balances.available` | `DERIVED`; read-only; ห้ามใช้ `on_hand - safety_stock` แทนค่า Ledger | R7.4.3/R7.4.5 |
| สาขาที่มียอด Stock | Balance `branch_id → branches.code` | `DERIVED`; หมายถึงมี Balance ไม่ใช่สิทธิ์ขาย | R7.4.2/R7.4.4/R7.4.5 |
| สาขาที่อนุญาตให้ขาย | Form `selectedBranchIds` | `UI_DRAFT_ONLY`; R7.1 ไม่รับ field นี้ | **DEFERRED ไป R7.5 Branch Sales Scope** |

## Aggregate Rules สำหรับ Product ที่มีหลาย SKU

1. `skuCount` นับ SKU จริงทั้งหมดใน Product; Preview จำกัดจำนวนอย่าง bounded และต้องบอกเมื่อ aggregate ถูก cap
2. Sales Code/SKU/Barcode ใช้รายการ SKU ที่เรียงแบบ deterministic; ห้ามถือว่า SKU แรกคือ Primary โดยไม่มี Domain field
3. ราคาขาย:
   - SKU เดียว: แสดงราคาของ SKU นั้น
   - หลาย SKU ราคาเท่ากันและสกุลเดียว: แสดงราคาเดียว
   - หลายราคาและสกุลเดียว: แสดงช่วง `min–max`
   - คนละสกุลหรือไม่มีราคาทั้งหมด: แสดงสถานะตรงไปตรงมา ห้ามบวก/แปลงเอง
4. Stock รวมได้เฉพาะ SKU ที่มี Base Unit เดียวกัน; คนละ Base Unit แสดง `หลายหน่วย` และไปดูต่อ SKU
5. Tags เป็น Product-level relation; price/tax/physical/replenishment เป็น SKU-level profile ห้ามคัดลอกค่าจาก SKU แรกแล้วอ้างว่าเป็นค่าร่วมของทุก Variant

## Grid Contract ที่ล็อกสำหรับ R7.4.3–R7.4.4

### Default columns — ต้องตรง Approved Mockup

1. สินค้า + รูปปก
2. รหัส CF
3. SKU / ตัวเลือก
4. สต็อก + Available
5. หน่วยนับ
6. ราคาขาย
7. สถานะ
8. แก้ไขล่าสุด
9. Row actions

### Optional columns — ผ่าน Customize เท่านั้น

- หมวดหมู่, แบรนด์, Tags และ Barcode
- วิธีนับจำนวน, ภาษี, Safety Stock, Reorder Min/Max
- สาขาที่มียอด Stock
- วันที่สร้างและผู้สร้าง
- ราคาต้นทุนเฉพาะผู้มี `product.cost.read`; ผู้ไม่มีสิทธิ์ต้องไม่ได้รับข้อมูลตั้งแต่ Server ไม่ใช่แค่ซ่อน CSS

Column preference ยังคงเป็น Presentation data แยก Organization/ผู้ใช้ รองรับ allowlist, show/hide, width, order, pin สูงสุด 3 และ F5 persistence แต่ไม่มีสิทธิ์เปลี่ยน Business data

## Quick View Contract ที่ล็อกสำหรับ R7.4.5

Quick View ต้องอ่านจาก Detail Read Model จริงและจัดกลุ่ม:

- Overview: Product, Category, Brand, Structure, Tags, status
- Images: ready images ตาม sort order พร้อม cover
- SKU/Identifiers: ทุก SKU แบบ bounded, SKU Code, CF, Barcode, Base Unit
- Pricing/Tax: price summary และรายละเอียดต่อ SKU; cost เฉพาะ permission
- Inventory: On hand/Allocated/Available และสาขาที่มี Balance
- Physical/Packaging: น้ำหนัก ขนาดกล่อง และ Sell Units
- Bundle: component SKU และ quantity
- Metadata: created/updated/creator/version
- Internal note: แสดงเฉพาะพื้นที่รายละเอียดที่เหมาะสม ไม่ส่งไป Default Grid/Export โดยอัตโนมัติ

## Gap ที่ R7.4.2 ต้องแก้เท่านั้น

R7.4.2 ขยาย Repository และ serializable read types แบบ bounded batch queries เพื่ออ่าน:

- Category/Brand/Tags
- SKU profiles และ price summary
- Cost profiles เมื่อ `product.cost.read`
- Sell Units/Bundle components สำหรับ Detail
- Creator display name จาก `organization_members` ภายใน Organization เดียวกัน

ห้ามทำ N+1, ห้ามส่ง privileged key ไป Browser, ห้าม query cost ก่อนผ่าน permission และห้ามเปลี่ยน UI ใน R7.4.2

## Explicit deferred boundaries

- Multi-SKU staging มีใน Browser Draft แต่ R7.1 Atomic command บันทึกเฉพาะ `skuDrafts[0]`; Form ต้องป้องกัน submit หลาย SKU ต่อไปจน R7.6
- Branch sales selection ยังไม่ถูกบันทึก; รอ R7.5
- Excel Import/Export จริงและ Bulk mutation รอ R8
- Product creation ไม่สร้าง Stock; Stock ต้องผ่าน Inventory command แยก
- R7.4.1–R7.4.5 ใช้ AVENZO ONE PREVIEW สำหรับการตรวจจริงภายหลังเท่านั้น และไม่อนุญาต Supabase Production apply

## Sequential Gate

1. **R7.4.1** Field Contract Freeze — Part นี้เท่านั้น
2. **R7.4.2** Products Read Model Expansion — เริ่มได้หลัง Owner อนุมัติผล R7.4.1
3. **R7.4.3** Default Data Grid Alignment — เริ่มได้หลัง R7.4.2 ผ่าน test และ Owner review
4. **R7.4.4** Optional Columns & Customize — เริ่มได้หลัง R7.4.3 ผ่าน visual parity
5. **R7.4.5** Product Quick View Alignment — เริ่มได้หลัง R7.4.4 ผ่าน

ห้ามทำ Part พร้อมกัน และทุก Part ต้องปิด targeted test, Product regression, TypeScript และหลักฐานตามชนิดงานก่อนขออนุมัติ Part ถัดไป

## Acceptance evidence

- [x] Mapping ครบ Form → Payload → Database → Read Model → Grid/Quick View
- [x] แยก Product-level, SKU-level, derived Inventory และ permission-gated cost ชัดเจน
- [x] ล็อก Default/Optional Grid columns ให้ตรง Approved Mockup
- [x] ล็อก multi-SKU, Branch sales, Excel และ Production เป็น Deferred boundary
- [x] ไม่มี Migration, UI/TSX, Database write หรือ Supabase Production apply
- [x] เพิ่ม deterministic contract test สำหรับ R7.4.1

## Next gate

Owner อนุมัติ R7.4.1 แล้ว และ R7.4.2–R7.4.5 ดำเนินการตาม Sequential gate ครบถ้วน

# Phase 2.1.R0 — Products Contract & Gap Freeze

วันที่: 15 สิงหาคม 2569
สถานะ: **Owner Approved / Completed Locally — R1 may start**
ขอบเขต: Documentation/contract only; ไม่มี Migration, Production UI, Command หรือ RLS change

## เป้าหมาย

ล็อกขอบเขตการนำ Products Mockup ไปใช้จริง โดยเทียบ UI ที่อนุมัติกับ Product/SKU/Inventory contract ปัจจุบัน แบ่งข้อมูลเป็น `NOW`, `DERIVED`, `LATER` และ `HIDDEN` เพื่อไม่ให้ R1–R3 แสดงข้อมูลปลอม หรือเปลี่ยน Domain โดยไม่ได้รับอนุมัติ

## แหล่งอ้างอิงที่ตรวจ

- Production route: `web/src/app/organizations/[id]/products/page.tsx`
- Current interaction: `web/src/app/organizations/[id]/products/product-sku-workspace.tsx`
- Read contracts: `web/src/lib/foundation/repositories.ts`
- Server command boundary: `web/src/app/actions/foundation.ts`, `web/src/lib/foundation/contracts.ts`
- Product/SKU schema: `supabase/migrations/20260813124837_phase_2_0_3_2_product_sku_schema.sql`
- Inventory schema: `supabase/migrations/20260813131250_phase_2_0_3_4_inventory_ledger_balance.sql`
- Approved mockups: `docs/mockups/phase-2.1-products-workspace-ui.html`, `docs/mockups/phase-2.1-unified-product-creation-form.html`

## คำจำกัดความสถานะ

| สถานะ | ความหมาย |
|---|---|
| `NOW` | Schema/command/read contract รองรับแล้ว หรือเป็น Presentation-only preference ที่ไม่เปลี่ยน Business data |
| `DERIVED` | คำนวณได้จาก Product/SKU/Inventory ปัจจุบันใน R2 โดยไม่เพิ่ม Migration และต้องไม่เกิด N+1 |
| `LATER` | ต้องมี Domain decision, additive migration, command, RLS/audit และ test แยกก่อนใช้จริง |
| `HIDDEN` | ห้ามแสดงเป็นช่องว่างหรือ Mock data ใน R1–R3; เปิดได้เมื่อ Gate ที่เกี่ยวข้องผ่าน |

## Current Contract ที่ยืนยันแล้ว

### Product

- `id`, `organization_id`, `name`, `description`, `status`
- `created_by`, `updated_by`, `created_at`, `updated_at`
- `version` จาก Server/Application Foundation
- Lifecycle `draft → active → archived`; archived immutable และห้าม hard delete

### SKU

- `product_id`, `sku_code`, `name`, `barcode`, `sales_code`, `base_unit_code`, `quantity_scale`, `status`
- `created_by`, `updated_by`, timestamps และ `version`
- `sku_code`, `barcode`, `sales_code` unique ต่อ Organization หลัง canonicalization
- `sales_code` ถาวรเมื่อกำหนดแล้ว, `base_unit_code` เปลี่ยนไม่ได้ และ identifier ทุกชนิดต้อง resolve เป็น `sku_id` ก่อน Stock Command

### Inventory

- Balance อยู่ระดับ SKU + Location และมี `on_hand`, `allocated`, `available`
- Stock Movement เป็น immutable ledger; UI ห้ามแก้ Balance โดยตรง
- R1–R3 อ่าน aggregate เท่านั้น; mutation ของ Stock ยังคงอยู่ Warehouse & Stock workspace

## Field Matrix — Mockup เทียบระบบจริง

| Mockup field/column | Owner/source | R0 state | พฤติกรรมที่ล็อกสำหรับ R1–R3 | Gate ภายหลัง |
|---|---|---|---|---|
| Product name | Product | NOW | แสดงและค้นหาได้ | — |
| Product description | Product | NOW | แสดงใน Detail; ไม่ใช้แทน Category/Brand | — |
| Product status | Product | NOW | Combobox/Action ต้องเรียก lifecycle command ไม่เขียนค่าโดยตรง | — |
| Version | Product/SKU | NOW | ส่งไปกับ update/lifecycle เพื่อจับ conflict | — |
| Updated at | Product/SKU | NOW | ISO string จาก Server; แสดงเวลา Asia/Bangkok | — |
| Created at / Created by (ผู้สร้าง) | Product/SKU | NOW | DB มีแล้ว; R2 เพิ่มเข้า serializable read model | R2 |
| Product image/cover (รูปสินค้า/ภาพปก) | Product Image | LATER + HIDDEN | R1–R3 ใช้ neutral placeholder เท่านั้นและไม่แกล้งเป็นรูปจริง | R6 Image Gate |
| Category (หมวดหมู่) | New Product master | LATER + HIDDEN | ไม่แสดงคอลัมน์/ตัวกรองจนมี Domain contract | R5 |
| Brand (แบรนด์) | New Product master | LATER + HIDDEN | ไม่อนุมานจากชื่อหรือ description | R5 |
| Tags | New Product relation | LATER + HIDDEN | Saved Tags ใน Prototype ยังไม่ใช่ข้อมูลจริง | R5 |
| Internal product note (หมายเหตุสินค้า) | New Product metadata | LATER + HIDDEN | ห้ามใช้ description เป็น note ภายใน | R5 |
| SKU Code | SKU | NOW | Copy/search/detail ได้; immutable identity policy เดิม | — |
| Sales Code / รหัส CF | SKU | NOW | Copy/search ได้; ห้าม inline edit เมื่อกำหนดแล้วเพราะ permanent | — |
| Barcode | SKU | NOW | Copy/search/detail ได้; exact match สำหรับ scan/code search | — |
| Base Unit | SKU | NOW | Read-only ใน Data Grid; ห้าม inline edit | — |
| SKU / Variants count | SKU aggregate | DERIVED | นับ SKU ต่อ Product; ไม่ถือว่า SKU แรกคือ Primary โดยอัตโนมัติ | R2 |
| Identifier preview | SKU aggregate | DERIVED | แสดง SKU ที่เรียง `sku_code` แบบ deterministic + จำนวนที่เหลือ; Detail แสดงทั้งหมด | R2 |
| On hand / Available | Inventory aggregate | DERIVED | รวมได้เมื่อ SKU ใน Product ใช้ Base Unit เดียวกัน; ถ้าหลายหน่วยแสดง `หลายหน่วย` และดูแยกต่อ SKU | R2 |
| Branches (สาขา) | Inventory/location aggregate | DERIVED | แสดงเฉพาะสาขาที่มี Balance; ไม่ตีความว่าเป็น Product assignment | R2 |
| Available quantity | Inventory Balance | DERIVED | Read-only เท่านั้น | R2 |
| Sale price (Price/ราคาขาย) | Pricing domain | LATER + HIDDEN | นำ Price column ออกจาก Default Production Grid จนมี contract | R5 |
| Cost price | Cost/permission domain | LATER + HIDDEN | ไม่มี cost permission ปัจจุบัน จึงห้าม query/render/export | R5 |
| Tax category/rate (อัตราภาษี) | Tax domain | LATER + HIDDEN | ไม่ใส่ VAT default แบบ Mock data | R5 |
| Quantity behavior | Unit domain | LATER + HIDDEN | `quantity_scale = 6` ปัจจุบันไม่เท่ากับ discrete/weight/volume enum | R5 |
| Weight/dimensions (น้ำหนักและขนาด) | Physical domain | LATER + HIDDEN | ไม่เก็บใน description หรือ JSON ชั่วคราว | R5 |
| Packaging/sell units | Unit conversion domain | LATER + HIDDEN | Base Unit เดียวยังคงเป็น Ledger authority | R5 |
| Bundle/Kit components | Bundle domain | LATER + HIDDEN | ห้ามสร้าง Product/SKU ปลอมแทน component relation | R5 |
| Safety Stock / reorder min/max | Inventory policy | LATER + HIDDEN | ไม่คำนวณ Low stock จากค่าจำลอง | R5 |
| Initial stock in create form | Inventory Command | NOW แต่ HIDDEN ใน R1–R3 | การรับ Stock ต้องเป็น command แยก; R7 ต้องออกแบบ orchestration/compensation ก่อนรวม UX | R7 |
| Column width/order/show/hide/pin | UI preference | NOW | versioned local storage, validate allowlist/min/max และ pin ไม่เกิน 3 | R3 |
| Export/Excel tools | Export domain | HIDDEN | ยังไม่เปิดใน R3 แม้ Prototype มีปุ่ม | R8 |
| Live Sale code reservation | Sales Code allocation | HIDDEN | แยกจาก Data Grid และรอ atomic creation contract | หลัง R7 |

## R1 Scope Freeze — Production Workspace Shell

R1 ทำเฉพาะ Presentation composition ภายใน Application Shell เดิม:

- Breadcrumb, Products heading, SKU count badge, action hierarchy และ responsive content width `48 / 32 / 24 / 14px`
- Data Grid shell, toolbar placement, loading/error/empty/read-only/permission states
- Light/Dark tokens จากระบบจริง; ไม่มี Theme/Reset control ของ Prototype
- ใช้ route และ auth/permission logic เดิม; ไม่แก้ Repository, Command, Migration หรือ RLS
- ยังไม่ย้าย advanced grid behavior และยังไม่เพิ่ม field ที่เป็น `LATER/HIDDEN`

## R2 Read Model Freeze

เพิ่ม read contract แบบ serializable plain object โดยไม่ส่ง `Date`, `Map`, class instance หรือ function ข้าม Server/Client boundary:

```ts
type ProductWorkspaceRow = {
  id: string
  name: string
  description: string | null
  status: string
  version: number
  createdAt: string
  updatedAt: string
  createdBy: string | null
  skuCount: number
  skuPreview: Array<{
    id: string
    skuCode: string
    name: string
    salesCode: string | null
    barcode: string | null
    baseUnitCode: string
    status: string
  }>
  stock: {
    mode: 'single-unit' | 'mixed-units' | 'no-balance'
    baseUnitCode: string | null
    onHand: number | null
    allocated: number | null
    available: number | null
    branchCodes: string[]
  }
}
```

ข้อบังคับ R2:

- Page Products เป็น Server Component และเริ่ม independent reads แบบขนาน
- Repository ใช้ bounded product page แล้ว batch-load SKU/Balance/Branch เป็นจำนวน query คงที่; ห้าม query ต่อแถว
- Cursor ต้องอิง Product `updated_at + id` เหมือนเดิม
- Search รองรับ Product name และ exact/normalized SKU Code, Sales Code, Barcode; multi-code search จำกัดจำนวนและความยาว
- RLS/Organization scope ต้องทำงานทุก query และ Browser ห้ามได้รับ privileged credential
- ถ้า aggregate คนละ Base Unit ห้ามบวกตัวเลขรวม

## R3 Data Grid Freeze

### Default columns ที่ใช้ข้อมูลจริง

1. Product + neutral image placeholder
2. Sales Code preview
3. SKU / Variants
4. Stock summary
5. Base Unit
6. Status
7. Updated at
8. Row actions

Optional columns รอบ R3: Barcode, Created at, Created by และ Branches ที่ derive จาก Balance เท่านั้น

### Behavior ที่อนุมัติ

- Search/filter/cursor อยู่ใน URL เพื่อ reload, share และ browser back ได้
- Copy SKU/Sales Code/Barcode, Quick View และ Status action ตาม permission
- Column resize/show/hide/order/pin เป็น Client interaction; preference payload ต้องใช้ allowlist, bounded width และ pin ไม่เกิน 3
- Sorting ทำเฉพาะ field ที่ Repository รองรับทั้ง result set; ห้าม sort เฉพาะข้อมูล 20 แถวใน Client แล้วทำให้ผู้ใช้เข้าใจว่าเป็นทั้งระบบ
- Stock และ Base Unit read-only; Sales Code permanent; archived entity ไม่มี edit action
- Mobile ใช้ priority columns/card presentation และไม่บังคับตาราง Desktop ให้ย่อจนอ่านไม่ได้

## Security & Failure Contract

- Server เป็น authority สำหรับ validation, Organization, actor, permission, canonicalization และ uniqueness
- `product.read` ควบคุมหน้า/read model; `product.manage` ควบคุม lifecycle; stock aggregate ต้องมี `inventory.read` ตาม policy ที่อนุมัติ
- Cost ไม่ query หากไม่มี Domain/permission contract
- Error ฝั่ง UI ใช้ safe mapped code และไม่เปิด SQL/RLS/internal detail
- Version conflict ต้องให้ refresh/review ห้าม overwrite เงียบ
- Local preferences เป็น Presentation data เท่านั้น ห้ามเก็บ access token, business payload หรือรูปภาพ

## Acceptance Gate ของ R0

- [x] ตรวจ Current Product/SKU/Inventory schema และ command boundary
- [x] ทำ Field Matrix ครบ Default/Optional/Create-form fields ที่ Mockup ใช้
- [x] กำหนด NOW/DERIVED/LATER/HIDDEN และห้าม Mock data ใน Production
- [x] ล็อก R1 scope, R2 read model และ R3 grid behavior
- [x] กำหนด permission, concurrency, identifier และ stock aggregation safety
- [x] Clinic Mockup ถูกพักไว้หลัง Products Production Adoption
- [x] ไม่มี Migration, Production TS/TSX, RLS, Command หรือ Database change ใน R0

## ผลลัพธ์และงานถัดไป

R0 ผ่าน Gate ตามคำอนุมัติให้ทำ R0→R3 แบบลำดับ งานถัดไปคือ `2.1.R1 — Production Workspace Shell` เท่านั้น ห้ามเริ่ม R2 หรือ R3 พร้อม R1

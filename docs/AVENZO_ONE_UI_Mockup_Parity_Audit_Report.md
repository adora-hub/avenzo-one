# AVENZO ONE UI Mockup Parity Audit Report

วันที่ตรวจ: 20 สิงหาคม 2026  
Branch ที่ตรวจ: `codex/workstream-ui`  
ขอบเขต: Products, Product Creation และ Initial Stock UI เท่านั้น

## Status

**สถานะรวม: CONDITIONAL / Visual Parity ยังไม่ผ่าน Owner Approval**

ตรวจแบบ read-only และไม่แก้โค้ด, API, Database หรือ Transaction

- Mockup และ UI contract tests หลายชุดผ่าน
- TypeScript ผ่าน
- Production build ผ่าน
- ยังไม่มีหลักฐาน Owner approval ของ Production parity ในรอบนี้
- พบ visible deviation ระหว่าง Mockup กับ Production โดยเฉพาะ Section ลำดับและ Initial Stock subsection
- เอกสาร `AVENZO_ONE_Phase_T_Initial_Stock_Integration.md` ไม่มีอยู่ใน working tree ของ `codex/workstream-ui`; อ่านจาก Git ref `codex/workstream-domain-qa` เพื่อใช้เป็น Source of Truth ที่ผู้ใช้ระบุ

## เอกสารและ Mockup ที่อ่าน

- [Design System V1](AVENZO_ONE_Design_System_and_UIUX_Standards_V1.md)
- [Implementation Starter Plan V7](AVENZO_ONE_Codex_Implementation_Starter_Plan_V7.md)
- [Phase T Initial Stock Integration](AVENZO_ONE_Phase_T_Initial_Stock_Integration.md) — อ่านจาก `codex/workstream-domain-qa` เนื่องจากไม่อยู่ใน branch ปัจจุบัน
- [Product Variant Sales Code and Live CF Guide](AVENZO_ONE_Product_Variant_Sales_Code_and_Live_CF_Development_Guide_V1.md)
- [Products Mockup](mockups/phase-2.1-products-workspace-ui.html)
- [Product Creation Mockup](mockups/phase-2.1-unified-product-creation-form.html)
- [Live Sales Code Mockup](mockups/phase-2.1-live-sales-code-reservation.html)
- [Mockup Design QA](mockups/design-qa.md)
- [Warehouse Stock Reference](mockups/warehouse-stock-current-reference.png)
- Evidence images ใน `docs/mockups/evidence/`

## จุดที่ไม่ตรง Mockup

### Products

| ระดับ | จุดตรวจ | หลักฐาน |
|---|---|---|
| P1 | Mockup กำหนดโครงสร้าง Products Workspace แบบ Products heading, SKU count, create menu, search/bulk search, toolbar, selection/bulk actions, data grid, expandable SKU rows, column customization, quick view และ pagination ใน surface เดียว | `docs/mockups/phase-2.1-products-workspace-ui.html:1494-1860` |
| P1 | Production ใช้ `ApplicationShell`/`OperationsPageHeader` และ `ProductSkuWorkspace` เป็นโครงสร้างจริง ต้องตรวจ side-by-side ที่ runtime เพื่อยืนยันขนาด/ตำแหน่ง/spacing ไม่ใช่อาศัย contract test อย่างเดียว | `web/src/app/organizations/[id]/products/page.tsx:1-220` |
| P2 | Contract tests ยืนยัน toolbar, bulk edit, responsive styles และ safe commands ผ่าน แต่ยังไม่ใช่ screenshot diff กับ Mockup | `web/scripts/test-products-r7-visual-parity.mjs`, `web/scripts/test-products-r7-page-structure.mjs` |

### Product Creation

| ระดับ | จุดตรวจ | หลักฐาน |
|---|---|---|
| P1 | Mockup วางลำดับ Section เป็น 1 General, 2 Images, 3 SKU, 4 Pricing, 5 Physical, 6 Packaging/Bundle, 7 Inventory, 8 Metadata | `docs/mockups/phase-2.1-unified-product-creation-form.html:543-682` |
| P1 | Production วาง Inventory เป็น Section 5 และ Packaging เป็น Section 6; ลำดับและเลข Section ไม่ตรงกับ Mockup ที่อ่าน | `web/src/app/organizations/[id]/products/new/unified-product-creation-form.tsx:3060-3108` |
| P1 | Production เพิ่ม Initial Stock subsection ที่มองเห็นได้ในหน้า แต่ Mockup Creation ที่อ่านมี Inventory Policy, Safety/Min/Max/Derived Available และไม่ได้มี subsection Initial Stock แบบเดียวกัน | `web/src/app/organizations/[id]/products/new/unified-product-creation-form.tsx:3048-3105`; `docs/mockups/phase-2.1-unified-product-creation-form.html:658-670` |
| P2 | Mockup มี summary rail/timeline และ action order ที่ contract tests ตรวจแล้ว แต่ runtime screenshot comparison ยังไม่ถูกปิด | `docs/mockups/phase-2.1-unified-product-creation-form.html:678-682`; `web/scripts/test-products-r7-responsive-visual-matrix.mjs` |

### Initial Stock

| ระดับ | จุดตรวจ | หลักฐาน |
|---|---|---|
| P1 | UI ปัจจุบันแสดง Branch → Warehouse → Location, bulk quantity, quantity ต่อ SKU, validation และ total summary ซึ่งเป็น extension ของ Mockup Inventory Policy ไม่ใช่ element ที่ปรากฏใน Mockup Creation ที่อ่าน | `web/src/app/organizations/[id]/products/new/unified-product-creation-form.tsx:3077-3095` |
| P1 | UI มีข้อความ `ยังไม่บันทึกสต็อกจริง` และยืนยันว่าไม่ส่ง Backend/ไม่สร้าง Movement; จึงยังไม่ใช่ Initial Stock production workflow ตาม Phase T T3/T4 | `web/src/app/organizations/[id]/products/new/unified-product-creation-form.tsx:3095` |
| P1 | Bundle Pre-assembled แสดง Warehouse/Location แบบตัวเลือกจำลอง (`main`, `storefront`, `live`; `available`, `receiving`, `reserve`) ต่างจาก T2 ที่ต้องใช้ Warehouse/Location จริงและเลือกตาม Permission | `web/src/app/organizations/[id]/products/new/unified-product-creation-form.tsx:3066-3075`; Phase T T2 |
| P0 | Utility workflow คืนสถานะ `partial` เมื่อบาง SKU สำเร็จและบาง SKU ล้มเหลว ขัดกับ Phase T ที่กำหนด Batch all-or-nothing และห้าม Partial Success หากนำ utility นี้ไปเชื่อม UI จริง | `web/src/lib/foundation/initial-stock-workflow.ts:3-35`; Phase T T4 |

## จุดที่ผิด Design System

- Mandatory Mockup-First Gate กำหนดให้ Approved Mockup เป็น Page-level Source of Truth 100%; visible Initial Stock extension และ Section order ที่ต่างกันต้องมี Deviation/Owner approval ก่อนปิดงาน — Design System V1.6, §1.1 และ §13
- Form Page ต้องเรียง Breadcrumb → Title/Status → Validation summary → Form sections → Actions; Production มีโครงสร้างหลักนี้ แต่ต้องปรับ Section mapping ให้ตรง Approved Mockup — Design System §6.3
- ทุกหน้าต้องมี Loading, Empty, Error, Success, Disabled, Permission denied และ Offline/Retry ตามบริบท; Products มีหลาย state และ Initial Stock มี loading/error/retry/empty/permission coverage จาก tests แต่ยังไม่พบ UI state สำหรับ all-or-nothing batch conflict ใน Product Creation — Design System §5.6
- Data table ต้องจัดจำนวน/เงินชิดขวา, status/action ตำแหน่งคงที่, รองรับ mobile fallback และไม่ซ่อนข้อมูลสำคัญไว้หลัง Hover; tests ครอบคลุมส่วนใหญ่ แต่ต้องตรวจ screenshot จริงของ Products และ SKU expanded rows — Design System §5.3
- Expanded SKU rows ต้องใช้ column preference ชุดเดียวกับตารางหลัก, action อยู่ขวา และใช้ SKU-level value จริง; source มี implementation และ contract coverage แต่ต้องยืนยัน visual alignment runtime — Design System §5.3
- ปุ่ม standard ต้องสูง 44px, compact 38px; mobile touch target อย่างน้อย 44×44px; responsive contract ผ่าน แต่ยังไม่มี runtime evidence ในรายงานนี้ — Design System §5.1 และ §7
- Feature page ต้องใช้ semantic token และไม่ hard-code style เฉพาะหน้า; `globals.css` มี semantic layer แล้ว แต่ยังมี compatibility aliases/raw values บางจุด จึงต้องตรวจเฉพาะ selectors ของ Products/Creation ก่อนแก้จริง — `web/src/app/globals.css`
- Initial Stock ต้องแยก Product/SKU creation ออกจาก Stock write ตาม Phase T และ Guide; UI guard ทำถูกในปัจจุบัน แต่ต้องไม่แสดงพฤติกรรมที่ทำให้ผู้ใช้เข้าใจว่าจะ post Stock ใน Flow เดียวก่อน T5 ได้รับอนุมัติ

## ไฟล์ที่เกี่ยวข้อง

### Mockup/Design

- `docs/mockups/phase-2.1-products-workspace-ui.html`
- `docs/mockups/phase-2.1-unified-product-creation-form.html`
- `docs/mockups/phase-2.1-live-sales-code-reservation.html`
- `docs/mockups/design-qa.md`
- `docs/mockups/warehouse-stock-current-reference.png`
- `docs/AVENZO_ONE_Design_System_and_UIUX_Standards_V1.md`
- `docs/AVENZO_ONE_Codex_Implementation_Starter_Plan_V7.md`
- `docs/AVENZO_ONE_Product_Variant_Sales_Code_and_Live_CF_Development_Guide_V1.md`
- `docs/AVENZO_ONE_Phase_T_Initial_Stock_Integration.md` จาก `codex/workstream-domain-qa`

### Production UI

- `web/src/app/organizations/[id]/products/page.tsx`
- `web/src/app/organizations/[id]/products/product-sku-workspace.tsx`
- `web/src/app/organizations/[id]/products/products-data-grid.tsx`
- `web/src/app/organizations/[id]/products/new/page.tsx`
- `web/src/app/organizations/[id]/products/new/unified-product-creation-form.tsx`
- `web/src/app/organizations/[id]/products/new/variant-creation-builder.tsx`
- `web/src/app/organizations/[id]/inventory/page.tsx`
- `web/src/app/organizations/[id]/inventory/inventory-workspace.tsx`
- `web/src/lib/foundation/initial-stock-workflow.ts`
- `web/src/app/globals.css`

### Verification scripts

- `web/scripts/test-products-r7-visual-parity.mjs`
- `web/scripts/test-products-r7-page-structure.mjs`
- `web/scripts/test-products-r7-inventory-components.mjs`
- `web/scripts/test-products-initial-stock-t2-read.mjs`
- `web/scripts/test-products-initial-stock-t3-workflow.mjs`
- `web/scripts/test-products-r7-unified-creation.mjs`
- `web/scripts/test-products-r7-responsive-visual-matrix.mjs`

## UI States ที่ขาดหรือยังไม่ปิด

### Products

- Runtime screenshot evidence สำหรับ loading/empty/error/permission/mobile/dark และ expanded SKU alignment
- Visual diff evidence ของ toolbar, sticky pagination, column customization, quick view และ bulk SKU dialog

### Product Creation

- State ที่สื่อชัดเจนว่า Initial Stock เป็น UI-only ก่อน T5 และไม่ใช่การบันทึก Stock จริงใน action หลัก
- State สำหรับ batch conflict/all-or-nothing หากเปิดใช้ Initial Stock write ในอนาคต
- State สำหรับ rollback/recovery ที่อธิบายผลกระทบต่อ Product, SKU และ Stock แยกกัน
- Owner-approved resolution ของ Section order และ Initial Stock visible extension

### Initial Stock

- Batch preview ที่แสดงทุก SKU, Location, Unit, quantity และผลที่จะ post ก่อนยืนยัน ตาม Phase T T3/T4
- Partial-success prevention state; ปัจจุบัน utility มี `partial` outcome ซึ่งไม่ควรเปิดเป็น production UI
- Duplicate idempotency result state ที่แสดงว่าเป็นผลเดิมและไม่เพิ่มยอดซ้ำ
- Concurrent conflict state ที่อธิบายว่าไม่มีรายการใดถูก post เมื่อ batch conflict
- Audit/reference confirmation state หลัง receive สำเร็จ

## Test ที่ตรวจได้

### ผ่าน

- `node web/scripts/test-products-r7-visual-parity.mjs` — 6/6
- `node web/scripts/test-products-r7-page-structure.mjs` — 4/4
- `node web/scripts/test-products-r7-inventory-components.mjs` — 16/16
- `node web/scripts/test-products-initial-stock-t2-read.mjs` — 4/4
- `node web/scripts/test-products-initial-stock-t3-workflow.mjs` — 4/4
- `node web/scripts/test-products-r7-unified-creation.mjs` — 7/7
- `node web/scripts/test-products-r7-responsive-visual-matrix.mjs` — 13/13
- TypeScript `tsc --noEmit` — ผ่าน
- `npm.cmd run build` — ผ่าน, Next.js 15.5.22, static generation 24/24

### ข้อจำกัดของผลทดสอบ

- Test scripts ส่วนใหญ่เป็น source/contract assertions ไม่ใช่ Playwright screenshot diff กับไฟล์ Mockup
- Build route output ที่เก็บได้ระหว่างตรวจไม่แสดง Products/Inventory routes ครบทุกครั้ง เนื่องจาก workspace ถูก process อื่นสลับ branch ระหว่างการตรวจ จึงต้อง rerun จาก clean `codex/workstream-ui` ก่อน PM sign-off
- ยังไม่ได้รัน authenticated browser visual QA แบบ side-by-side ในรอบนี้

## Risks

| ระดับ | ความเสี่ยง | ผลกระทบ |
|---|---|---|
| P0 | Branch ถูกสลับโดย process อื่นระหว่าง audit | รายงานหรือ test อาจอ้าง source คนละ branch หากไม่ lock workspace ก่อน rerun |
| P0 | `partial` Initial Stock workflow ขัดกับ Phase T all-or-nothing | อาจทำให้ Batch มี Stock บาง SKU สำเร็จและบาง SKU ล้มเหลว |
| P1 | Production Initial Stock UI เพิ่มองค์ประกอบนอก Approved Mockup | Visual parity/Owner approval ไม่ผ่าน และผู้ใช้อาจเข้าใจผิดเรื่อง write behavior |
| P1 | Section order Production ไม่ตรง Mockup | Navigation/timeline และ mental model ของผู้ใช้ไม่ตรงกัน |
| P1 | Mockup/Phase T document ไม่อยู่ใน branch เดียวกัน | Source of Truth ไม่ deterministic สำหรับ implementation/review |
| P2 | Static contract tests ผ่านแต่ไม่มี screenshot diff | ความคลาดเคลื่อนด้าน spacing, sizing, overlay และ responsive อาจหลุดรอด |
| P2 | Bundle initial stock มีตัวเลือกจำลอง | เสี่ยงนำ mock values ไปใช้เป็น real Warehouse/Location โดยไม่ผ่าน permission/tenant contract |

## UI Work Plan แบ่งเป็น Part

### Part 0 — Repository and Source-of-Truth Freeze

- ทำให้ `codex/workstream-ui` เป็น branch เดียวที่ใช้ตรวจ
- นำ Phase T และ Mockup version ที่อนุมัติไว้ใน branch เดียวกัน
- ยืนยัน Owner approval และ version ของ Products/Product Creation Mockup
- ห้ามแก้โค้ดจนกว่า mapping จะผ่าน

### Part 1 — Products Workspace Parity

- ทำ Mockup-to-Production mapping ราย element
- ตรวจ heading, toolbar, filter, bulk actions, grid, expanded SKU, quick view, pagination และ responsive states
- รัน authenticated screenshot matrix ที่ 1280, 1024, 768, 390 และ Light/Dark
- ปิดเฉพาะ visual deviation ที่ PM/Owner อนุมัติ

### Part 2 — Product Creation Structure Parity

- แก้/ยืนยัน Section order ให้ตรง Mockup ก่อน implementation ใด ๆ
- ตรวจ summary rail, timeline, form actions, modal layering, focus และ mobile stacking
- แยก Future contract/Prototype note ให้ตรง Mockup และไม่เพิ่ม UX เอง

### Part 3 — Initial Stock UI Contract Alignment

- ตัดสินใจโดย PM/Owner ว่า Initial Stock visible UI จะอยู่ใน Mockup version ใด
- คง UI-only/read-only boundary จนกว่า T4/T5 จะอนุมัติ
- ตรวจ Branch → Warehouse → Location cascading, permission, lazy loading, empty/error/retry
- เพิ่ม Preview, duplicate, conflict และ all-or-nothing states ใน Mockup ก่อน production UI

### Part 4 — Visual Regression and Accessibility Gate

- ทำ screenshot diff กับ Approved Mockup
- ตรวจ keyboard, focus-visible, accessible names, dialogs, mobile touch targets และ 200% zoom
- ตรวจ semantic tokens, status colors, table alignment และ dark mode
- บันทึก Before/After และ Owner decision ทุก deviation

### Part 5 — PM/Owner Release Gate

- PM ตรวจรายงานและอนุมัติ Part ทีละส่วน
- ห้ามแตะ Database/API/Transaction ใน UI parity task นี้
- หลัง PM อนุมัติเท่านั้นจึงค่อยสร้าง implementation task ที่แยก scope ชัดเจน

## Next Action

1. PM ยืนยัน branch/source-of-truth และนำ Phase T document เข้า `codex/workstream-ui` หรืออนุมัติ reference จาก domain branch
2. PM/Owner ยืนยัน Mockup version ที่ใช้ตัดสิน Section order และ Initial Stock subsection
3. ล็อก workspace ไม่ให้ process อื่นสลับ branch ระหว่าง rerun
4. ทำ authenticated screenshot parity run แบบ read-only
5. เปิด implementation เฉพาะ Part ที่ PM อนุมัติ; รายงานนี้ยังไม่อนุมัติให้แก้โค้ด

## Scope Guard

รายงานนี้ไม่แก้โค้ด ไม่สร้าง API ไม่แก้ Database ไม่แก้ Transaction และไม่ Push

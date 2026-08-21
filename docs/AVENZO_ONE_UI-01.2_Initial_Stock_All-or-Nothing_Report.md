# AVENZO ONE UI-01.2 — Initial Stock All-or-Nothing UI Report

วันที่ตรวจ: 20 สิงหาคม 2026
Branch: `codex/workstream-ui`
Localhost: `http://127.0.0.1:3000/`

## Status

**IMPLEMENTED LOCALLY / TESTS PASS / WAITING FOR PM APPROVAL**

UI-01.2 ถูกพัฒนาเฉพาะ UI และ Client State ใน `web` โดยใช้ Mock timer/local state ไม่มีการสร้างหรือแก้ API, RPC, Database, Migration หรือ Stock Transaction และยังไม่มี Commit/Push

## Authority และ Scope

- ใช้ Mockup, Design System และ UI Correction Plan เป็น UI authority
- คง Owner-approved Section Order: General → Images → SKU → Pricing → Inventory → Packaging/Bundle → Physical → Metadata
- Initial Stock UI เป็น simulation เท่านั้น ไม่อ้างว่า Stock ถูกเพิ่มจริง
- Backend T4/transaction integration อยู่นอก scope

## Implementation

### Batch model

- ใช้สถานะ UI: `idle`, `loading`, `success`, `error`, `duplicate`
- ไม่มี `partial` ใน UI batch status
- Batch fingerprint รวม Batch ID, Branch, Warehouse, Location, SKU, Base Unit และ quantity
- Retry ใช้ Batch ID เดิม; Batch revision เปลี่ยนเมื่อเริ่มสินค้ารายการใหม่เท่านั้น
- Duplicate UI result ใช้ fingerprint ของ Batch ที่ผ่านครั้งก่อนและไม่อ้างว่ามีการเพิ่ม Stock ซ้ำ

### Validation และ rollback presentation

- ตรวจ destination และทุก SKU พร้อมกันก่อนสรุป outcome
- หาก destination หรือ SKU ใดไม่ผ่าน UI แสดง Batch Error และสถานะ Rollback ทั้ง Batch
- แสดงข้อความ `ไม่มี SKU ใดถูกเพิ่มสต็อก`
- แสดงข้อความ `แก้ไขรายการที่มีปัญหา แล้วลองบันทึกทั้งชุดอีกครั้ง`
- แถว SKU ที่ผิดมี `data-batch-invalid="true"`, danger surface และข้อความ error ระดับแถว
- Success แสดงเฉพาะเมื่อทุก validation ผ่าน
- Success copy ระบุว่าเป็น UI Simulation และยังไม่มี Stock Movement จริง

### Loading, disabled, retry และ duplicate

- ปุ่มยืนยันใช้ `disabled` และ `aria-busy` ระหว่าง loading
- Destination selectors, quantity inputs และ bulk action ถูก disable ระหว่าง loading เพื่อรักษา Batch snapshot
- หลัง error ผู้ใช้แก้ข้อมูลแล้ว retry ด้วย Batch ID เดิม
- กดตรวจ Batch ที่ผ่านแล้วซ้ำจะแสดง Duplicate UI state
- Mock processing delay 650ms ใช้เพื่อแสดง Loading/Disabled state ใน localhost เท่านั้น

## Files

### แก้ใน UI-01.2

- `web/src/app/organizations/[id]/products/new/unified-product-creation-form.tsx`
- `web/src/app/globals.css`
- `web/src/lib/foundation/initial-stock-batch-ui.ts`
- `web/scripts/test-products-initial-stock-all-or-nothing-ui.mjs`

### Worktree change จาก UI-01.1B ที่คงไว้

- `web/scripts/test-products-r7-inventory-components.mjs` — Owner-approved exact Section Order test

### รายงาน

- `docs/AVENZO_ONE_UI_Correction_Plan.md` — Owner Authority/Correction Plan เดิม
- `docs/AVENZO_ONE_UI-01.2_Initial_Stock_All-or-Nothing_Report.md`

## Tests

### TypeScript

- `node_modules/.bin/tsc.cmd --noEmit` — PASS

### UI/Contract Tests

- รวม 78 tests — PASS 78, FAIL 0
- UI-01.2 tests ใหม่ 6 tests ครอบคลุม:
  - Batch success เมื่อทุก validation ผ่าน
  - SKU invalid และ Rollback ทั้ง Batch
  - Batch-level error copy และ row-level SKU error
  - Duplicate outcome
  - Retry ด้วย Batch ID เดิม
  - Loading, disabled และ `aria-busy`
  - semantic state styles และ Owner Section Order regression
- Existing Initial Stock T2/T3, Product Creation, Pricing, Packaging, Physical, responsive และ visual contract tests ผ่าน
- Node แสดง non-blocking `MODULE_TYPELESS_PACKAGE_JSON` warning จากการ import `.ts` ใน test runtime; test result ยัง PASS

### Production Build

- `npm.cmd run build` — PASS
- Next.js 15.5.22
- Compile, type validation และ static generation 39/39 ผ่าน

### Diff และ Localhost

- `git diff --check` — PASS
- `http://127.0.0.1:3000/` — HTTP 200
- Owner Section Order source check — PASS
- Forbidden tracked scope changes (API/Supabase/Migration/Database/RPC) — 0

## Visual/Interaction States

| State | UI Result |
|---|---|
| Idle | อธิบายว่าจะตรวจทุก SKU เป็น Batch เดียว |
| Loading | แสดงกำลังตรวจสอบทั้ง Batch ปิด controls และป้องกัน double-click |
| Error | Rollback ทั้ง Batch ไม่มี SKU ใดถูกเพิ่มสต็อก พร้อมรายการแก้ไข |
| Row Error | Highlight แถว SKU และแสดงสาเหตุเฉพาะแถว |
| Success | ทุก SKU ผ่าน UI validation; ระบุชัดว่าไม่มี Stock write จริง |
| Duplicate | พบ Batch เดิมและไม่ดำเนินการซ้ำในเชิง UI |
| Retry | ใช้ Batch ID เดิมหลังผู้ใช้แก้ข้อมูล |

## Remaining Issues

- Backend T4 all-or-nothing transaction ยังไม่มีใน scope นี้ จึงไม่มีการเพิ่ม Stock จริง
- Existing `initial-stock-workflow.ts` และ T3 test ยังมี domain outcome แบบ `partial`; UI-01.2 ไม่ได้เรียก workflow นี้และไม่ได้แก้ Stock Logic ตามข้อห้าม
- Authenticated browser screenshot/interaction evidence ยังไม่ได้บันทึกในรอบนี้; localhost health และ source/contract gates ผ่าน
- Bundle Pre-assembled ใช้ UI ทดลองเดิมและยังไม่เข้า standard/variant batch panel ใน Part นี้

## Risks

- UI simulation ไม่สามารถรับรอง atomicity ของ Backend ในอนาคตได้ ต้องเชื่อมกับ T4 contract ก่อน Production stock write
- หากนำ legacy partial workflow มาเชื่อมตรงกับ UI นี้ในอนาคต จะขัดกับ all-or-nothing presentation
- Duplicate state ปัจจุบันอิง local fingerprint ไม่ใช่ server idempotency result
- Browser refresh จะเริ่ม local batch state ใหม่ เพราะ Part นี้ไม่เพิ่ม persistence/API

## Commit/Push Status

- Commit: NONE
- Push: NONE

## Next Action

1. PM ตรวจ UI-01.2 และผล tests
2. ทำ authenticated localhost interaction/visual review หาก PM ต้องการ evidence เพิ่ม
3. ห้ามเริ่ม UI-01.3 จนกว่า PM อนุมัติ
4. Backend T4/transaction work ต้องเป็น task แยกและไม่อยู่ใน UI workstream นี้

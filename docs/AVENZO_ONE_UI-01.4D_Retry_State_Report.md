# AVENZO ONE — UI-01.4D Retry State Report

## Status

- Implementation: Complete.
- Owner verification: Passed / Owner Accepted.
- Branch: `codex/workstream-ui`.
- Scope: UI/client state in `web` only.
- Commit/Push: Completed by Root PM as `a9382ed` on `codex/workstream-ui`.

## Scope Delivered

- แสดงปุ่ม `ลองอีกครั้ง` หลัง Initial Stock Batch ตรวจสอบล้มเหลว
- Retry สร้าง Batch revision ใหม่และแสดง Batch ID ใหม่
- ค่าจำนวน สาขา คลัง และตำแหน่งเดิมไม่ถูก reset เมื่อ Retry
- ใช้ in-flight guard ร่วมกับ Loading/Disabled state เพื่อป้องกันการกดซ้ำ
- Loading state แสดงข้อความ `กำลังลองอีกครั้งด้วย Batch ใหม่…`
- Error state ยืนยันว่า `ไม่มี SKU ใดถูกเพิ่มสต็อก` และไม่แสดง Partial Success
- ผลลัพธ์ยังเป็น UI Simulation และไม่อ้างว่ามี Stock write จริง
- Section order ที่ Owner อนุมัติยังคงเดิม: General, Images, SKU, Pricing, Inventory, Packaging/Bundle, Physical, Metadata

## UI / Client-State Design

1. เมื่อ Batch ล้มเหลว `initialStockLastAttemptFailed` ถูกตั้งเป็น `true` และ UI แสดงปุ่ม `ลองอีกครั้ง`
2. เมื่อกด Retry ระบบเพิ่ม `initialStockBatchRevision` หนึ่งครั้ง แล้วตรวจด้วย revision ใหม่ทันที
3. Fingerprint และ result summary ของการตรวจถูกสร้างจาก Batch ID ใหม่
4. Retry handler ไม่เรียก setter ของ `initialStockQuantities`, `initialStockBranchId`, `initialStockWarehouse` หรือ `initialStockLocation`
5. `initialStockBatchInFlightRef` ป้องกัน double-submit แบบ synchronous และปุ่มใช้ `disabled`/`aria-busy`
6. เมื่อ Batch ผ่านหรือเข้าสู่ Duplicate state ค่า failed-attempt ถูกล้าง
7. เมื่อเริ่มสินค้ารายการใหม่ ค่า retry state ถูก reset ตาม lifecycle เดิม

## Design System Check

- ใช้ button classes เดิมของระบบ: `button compact product-primary-action`
- ใช้ loading spinner และ semantic status surface เดิม
- Error ใช้ `role="alert"`; Loading ใช้ `role="status"`, `aria-live="polite"`, `aria-atomic="true"`
- ไม่มีการเพิ่มสี spacing หรือ component pattern ใหม่
- Responsive behavior ใช้ style เดิมของ Initial Stock panel และ footer

## Files Changed

- `web/src/app/organizations/[id]/products/new/unified-product-creation-form.tsx`
  - เพิ่ม failed-attempt client state
  - เพิ่ม Retry handler ที่สร้าง Batch revision ใหม่
  - แยก click handler ออกจาก revision-aware validation เพื่อความถูกต้องของ TypeScript/React
  - ปรับ Loading, Error และ Retry copy ภาษาไทย
  - คงค่าจำนวนและปลายทางเดิมระหว่าง Retry
- `web/scripts/test-products-initial-stock-all-or-nothing-ui.mjs`
  - อัปเดต contract เดิมที่เคยกำหนดให้ใช้ Batch ID เดิม
  - เพิ่ม UI-01.4D regression สำหรับ new Batch ID, preserved values, Loading/Disabled guard และ no partial success
- `docs/AVENZO_ONE_UI-01.4D_Retry_State_Report.md`
  - รายงานฉบับนี้

## Tests

| Check | Result |
| --- | --- |
| `npx tsc --noEmit` | PASS |
| `npm run build` | PASS — Next.js 15.5.22, 39 static pages generated |
| Focused Initial Stock contract | PASS — 13/13 |
| Product Creation + Initial Stock UI regression | PASS — 66/66 |
| Complete Products R7 regression | 233/235 PASS; 2 baseline contract mismatches outside UI-01.4D |
| `git diff --check` | PASS; line-ending warning only |
| Localhost HTTP | PASS — `http://localhost:3000/` returned HTTP 200 |

### UI-01.4D Test Cases Added

- Batch failure exposes `ลองอีกครั้ง`
- Retry increments Batch revision and validates with the new revision
- Retry does not reset quantity, branch, warehouse, or location state
- Retry handler blocks when an Initial Stock Batch is already in flight/loading
- Retry control exposes Disabled/Busy semantics
- Loading copy identifies that a new Batch is being retried
- Source contains no Partial Success or `สำเร็จบางส่วน` presentation

### Baseline Regression Issues Outside Scope

- `R7.2.4D persists staged rows and sequence offset in the versioned Browser Draft`
  - Existing test expects `DRAFT_MAX_BYTES = 1024 * 1024`; current product code uses `256 * 1024`
- `R7.2.4F opens the approved success dialog only after image completion`
  - Existing test expects old success-dialog copy `พร้อม {creationSuccess.skuCount} SKU ถูกสร้างเป็นฉบับร่าง`
- Neither failure is in the Retry handler, Initial Stock state, or files changed for API/Database behavior.

## Visual / Localhost

- Dev server restarted from the verified `web` workspace and is ready at `http://localhost:3000/`
- Root URL returned HTTP 200 after restart
- Automated in-app Browser visual inspection could not run because the Windows ACL blocked the Browser runtime outside the workspace
- Owner should verify the authenticated Product Creation route manually, focusing on failure → edit → Retry → new Batch ID

## Risks

- Retry remains UI Simulation only; Backend T4 stock transaction behavior is not implemented or claimed
- Owner visual test passed; automated Browser access remained blocked by the local Windows ACL
- The two broad baseline regression mismatches should be reconciled separately; changing them is outside UI-01.4D
- New Batch ID is client-session revision state and is not a Backend transaction identifier

## API / Database Boundary

- No API, RPC, Database, Migration, RLS, Stock Transaction, or Stock Logic file was changed
- No network write was added to Retry
- No claim of real stock success was added

## Next Action

UI-01.4D is Owner Accepted and was committed/pushed by Root PM as `a9382ed`. Proceed to UI-01.4E without recommitting UI-01.4D work.

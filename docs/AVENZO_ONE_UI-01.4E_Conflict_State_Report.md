# AVENZO ONE — UI-01.4E Conflict State Report

## Status

- Implementation: Complete in local working tree.
- Owner visual verification: Passed / Owner Accepted.
- Branch: `codex/workstream-ui`.
- Base commit: `a9382ed` — UI-01.4D accepted and committed/pushed by Root PM.
- Commit/Push for UI-01.4E: Not performed.

## Scope Delivered

- เพิ่ม `conflict` เป็น Initial Stock Batch UI state
- แสดง concurrent conflict เป็น `Rollback ทั้ง Batch`
- ยืนยันว่าไม่มี SKU ใดถูกเพิ่มสต็อกและแสดงผลกระทบ `0 SKU ที่บันทึก`
- ระบุสาเหตุว่าข้อมูลปลายทางหรือยอดอ้างอิงถูกแก้ไขระหว่างตรวจ Batch
- บังคับให้ตรวจสอบข้อมูลปัจจุบันก่อนเปิด Retry
- หาก Review พบ Validation error จะเปลี่ยนไปใช้ Error/Validation state เดิมแทน Conflict
- Retry หลัง Review ยังใช้ Batch ID ใหม่ตาม UI-01.4D
- ค่าจำนวน สาขา คลัง และตำแหน่งเดิมไม่ถูก reset
- Conflict และ Validation panel ไม่แสดงซ้อนกัน
- เพิ่ม Local UI Simulation trigger หลัง Batch อยู่ใน Success หรือ Duplicate state เพื่อให้ Owner ตรวจ visual ได้

## UI State Flow

1. Batch ต้องผ่านเป็น Success หรือ Duplicate ก่อน จึงจะแสดงปุ่ม `จำลอง Conflict`
2. เมื่อกด ระบบ local state แสดง `พบข้อมูล Initial Stock เปลี่ยนแปลงพร้อมกัน — Rollback ทั้ง Batch`
3. ปุ่ม `ลองอีกครั้ง` ถูก Disable จนกด `ตรวจสอบข้อมูลอีกครั้ง`
4. Review ตรวจ destination, SKU, unit และ quantity จาก client state ปัจจุบัน
5. หากข้อมูลไม่ผ่าน จะเปลี่ยนเป็น Error state และแสดง field/batch validation เดิม
6. หากข้อมูลผ่าน จะแสดง `ตรวจสอบข้อมูลล่าสุดแล้ว` และเปิด Retry
7. Retry เพิ่ม Batch revision และตรวจด้วย Batch ID ใหม่ โดยไม่ล้าง input หรือ destination

## Design System Check

- Conflict ใช้ danger surface เดิมสำหรับผล Rollback
- Review-required note ใช้ `--status-warning-*`; reviewed note ใช้ `--status-info-*`
- ใช้ button hierarchy เดิม: secondary สำหรับ Review/Simulation และ primary สำหรับ Retry
- Retry มี `disabled`, `aria-busy` และ `aria-describedby`
- Conflict ใช้ `role="alert"`; review status ใช้ `role="status"`
- Footer รองรับหลาย action ด้วย flex-wrap และ mobile action เดิมยังเต็มความกว้าง
- ไม่เพิ่ม hard-coded color, radius หรือ spacing token ใหม่

## Files Changed

- `web/src/lib/foundation/initial-stock-batch-ui.ts`
  - เพิ่ม `conflict` ใน client UI status type เท่านั้น
- `web/src/app/organizations/[id]/products/new/unified-product-creation-form.tsx`
  - เพิ่ม conflict/review client state, local simulation, review gate และ Retry guard
  - เพิ่ม Rollback copy, impact summary และ accessible actions
- `web/src/app/globals.css`
  - เพิ่ม semantic conflict review styles และ footer wrapping
- `web/scripts/test-products-initial-stock-all-or-nothing-ui.mjs`
  - เพิ่ม UI-01.4E conflict regression 4 cases
- `docs/AVENZO_ONE_UI-01.4D_Retry_State_Report.md`
  - อัปเดตเป็น Owner Accepted และบันทึก commit `a9382ed`
- `docs/AVENZO_ONE_UI-01.4E_Conflict_State_Report.md`
  - รายงานฉบับนี้

## Tests

| Check | Result |
| --- | --- |
| `npx tsc --noEmit` | PASS |
| `npm run build` | PASS — Next.js 15.5.22, 39 static pages generated |
| Focused Initial Stock contract | PASS — 18/18 |
| Product Creation + Initial Stock UI regression | PASS — 71/71 |
| Complete Products R7 regression | 238/240 PASS; same 2 baseline mismatches outside UI-01.4E |
| `git diff --check` | PASS; line-ending warnings only |
| Localhost HTTP | PASS — `http://localhost:3000/` returned HTTP 200 |

### UI-01.4E Test Cases Added

- Conflict status and Rollback copy exist without Partial Success
- Conflict reports affected SKU count and `0 SKU ที่บันทึก`
- Review is required before Retry is enabled
- Review reuses existing client Validation collectors
- Conflict and Validation panels are mutually exclusive
- Retry after Review preserves new-Batch behavior
- Local simulation does not call API, Supabase, fetch, or stock commands
- Local simulation does not reset quantity, branch, warehouse, or location
- Conflict styles use semantic warning/info tokens and responsive actions

### Known Baseline Regression Issues Outside Scope

- `R7.2.4D persists staged rows and sequence offset in the versioned Browser Draft`
  - Existing test expects `DRAFT_MAX_BYTES = 1024 * 1024`; current code uses `256 * 1024`
- `R7.2.4F opens the approved success dialog only after image completion`
  - Existing test expects old success-dialog copy
- Both failures were present before UI-01.4E and are unrelated to Initial Stock Conflict state

## Owner Visual Test Steps

1. เปิด Product Creation บน `http://localhost:3000/`
2. เปิด Initial Stock และกรอก Batch ที่ผ่าน Validation
3. กดตรวจสอบจนเห็น Success หรือ Duplicate
4. กด `จำลอง Conflict`
5. ตรวจว่าแสดง Rollback ทั้ง Batch, `0 SKU ที่บันทึก`, สาเหตุ และ Retry ถูก Disable
6. กด `ตรวจสอบข้อมูลอีกครั้ง`
7. ตรวจว่าแสดง `ตรวจสอบข้อมูลล่าสุดแล้ว` และ Retry เปิดใช้งาน
8. กด `ลองอีกครั้ง` และตรวจว่า Batch ID เปลี่ยน แต่จำนวน/สาขา/คลัง/ตำแหน่งยังอยู่
9. ยืนยันว่าไม่มีข้อความ Partial Success และไม่มีการอ้างว่า Stock ถูกบันทึกจริง

## Risks

- Conflict เป็น Local UI Simulation เท่านั้น ไม่ใช่ผลจาก Backend concurrency contract
- ปุ่ม `จำลอง Conflict` เป็น test affordance ในแผงที่ระบุ `UI Simulation`; ต้องทบทวนการถอดออกเมื่อ Backend T4 พร้อม
- Batch ID เป็น client-session revision ไม่ใช่ Backend transaction identifier
- Automated authenticated visual QA ยังไม่ได้ทำ; Owner visual test เป็น acceptance gate

## API / Database Boundary

- ไม่แก้ API, RPC, Database, Migration, RLS, Stock Transaction หรือ Stock Logic
- Local conflict/review handlers ไม่เรียก Server Action, Supabase หรือ `fetch`
- ไม่เพิ่ม Stock write และไม่อ้างผลสำเร็จจริง

## Next Action

UI-01.4E is Owner Accepted. Proceed to UI-01.4F Empty State without recommitting accepted work; keep Commit/Push blocked until PM approval.

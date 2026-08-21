# AVENZO ONE — UI-01.4E Blocking Bug: Variant Identifier Check

## Status

- Blocking bug fix: Complete in local working tree.
- Owner retest: Passed / Owner Accepted.
- Branch: `codex/workstream-ui`.
- Base commit: `a9382ed`.
- Commit/Push: Not performed.

## Blocking Bug

ปุ่มตรวจสอบ SKU Code และรหัสขาย/CF ของ Variant ค้างที่ `กำลังตรวจ…` เมื่อ Promise จากการตรวจรหัส reject หรือไม่จบ ทำให้ปุ่มไม่กลับมากดได้และขวาง Owner acceptance ของ UI-01.4E

## Root Cause

- `checkVariantIdentifiers()` เรียก Server Action ด้วย `await` โดยไม่มี `try/catch/finally`
- ไม่มี timeout สำหรับ Promise ที่ไม่ resolve/reject
- loading ผูกกับ `identifierCheck.tone === 'checking'` โดยไม่มี state cleanup ที่รับประกัน
- ไม่มี mounted/stale-request guard สำหรับ Promise ที่จบหลัง component unmount หรือ identifier เปลี่ยน
- ไม่มี synchronous ref guard จึงยังมีช่องให้กดซ้ำก่อน React render disabled state

## Fix

- เพิ่ม `try/catch/finally` ให้ async handler
- คืน `isIdentifierChecking` และ in-flight ref ใน `finally` สำหรับ request ปัจจุบันเสมอ
- เพิ่ม timeout 12 วินาทีผ่าน `withVariantIdentifierCheckTimeout()`
- แยกข้อความ API/Promise error และ timeout เป็นภาษาไทยที่มี next action
- เพิ่ม `isMountedRef` และ request revision guard เพื่อไม่ set state หลัง unmount หรือใช้ผล request เก่า
- เพิ่ม synchronous `checkInFlightRef` ป้องกัน double-click
- ปุ่มใช้ `disabled` และ `aria-busy` จาก loading state แยก
- เมื่อจบหรือผิดพลาด ปุ่มกลับเป็น `ตรวจรหัสอีกครั้ง`
- ไม่เรียก `setCombinations` หรือ `setGroups` ใน handler/error path จึงไม่ล้างค่าหรือรายการ Variant
- ไม่เปลี่ยน layout, class, button hierarchy หรือ Design System

## User-Facing Error States

- API/Promise error: `เชื่อมต่อระบบตรวจรหัสไม่สำเร็จ กรุณากด “ตรวจรหัสอีกครั้ง”`
- Timeout: `การตรวจรหัสใช้เวลานานเกินไป กรุณากด “ตรวจรหัสอีกครั้ง”`
- API response ไม่สำเร็จ: `ตรวจรหัสไม่สำเร็จ กรุณากด “ตรวจรหัสอีกครั้ง”`
- Duplicate: คงข้อความจำนวนรหัสซ้ำในฟอร์ม/มีในระบบแล้ว และปุ่มกลับมากดได้
- Success: คงข้อความจำนวนรหัสที่ตรวจผ่านและแจ้ง parent ว่า Variant identifiers พร้อม

## Files Changed for This Bug

- `web/src/app/organizations/[id]/products/new/variant-creation-builder.tsx`
  - แก้ async lifecycle, loading state, stale/unmount guard และ retry state
- `web/src/lib/foundation/variant-identifier-check-ui.ts`
  - เพิ่ม timeout wrapper และ user-facing error classification แบบ client-only
- `web/scripts/test-products-variant-identifier-async-ui.mjs`
  - เพิ่ม regression สำหรับ Success, Duplicate, API Error, Timeout และ lifecycle contract
- `docs/AVENZO_ONE_UI-01.4E_Blocking_Bug_Variant_Identifier_Check_Report.md`
  - รายงานฉบับนี้

งาน UI-01.4E Conflict State ที่ยังไม่ Commit ใน working tree ถูกเก็บรักษาและไม่ได้แก้ scope เพิ่มเติมใน blocking-bug fix นี้

## Regression Tests

| Case | Result |
| --- | --- |
| Success response settles before timeout | PASS |
| Duplicate collision response preserved | PASS |
| API/Promise rejection becomes retryable error | PASS |
| Unresolved Promise times out and becomes retryable | PASS |
| `finally` releases loading/in-flight state | PASS |
| Stale request and component unmount do not update state | PASS |
| Double-click blocked while checking | PASS |
| Variant values/combinations are not reset | PASS |
| Existing B5 Variant contracts | PASS |
| Scoped Variant/Identifier/Product Creation/UI-01.4E suite | PASS — 57/57 |
| TypeScript `npx tsc --noEmit` | PASS |
| Production Build `npm run build` | PASS — 39 static pages generated |
| `git diff --check` | PASS; existing line-ending warnings only |
| Localhost | PASS — `http://localhost:3000/` returned HTTP 200 after verified dev-server restart |

## Owner Retest

1. เปิด Product Creation และเลือกสินค้าแบบ Variant
2. กรอก SKU Code และรหัสขาย/CF ให้ครบ
3. กด `ตรวจรหัสอีกครั้ง` และยืนยันว่าปุ่มเปลี่ยนเป็น `กำลังตรวจ…` พร้อม Disable
4. ทดสอบ Success และ Duplicate แล้วตรวจว่าปุ่มกลับมากดได้
5. ทดสอบ API error/ปิดการเชื่อมต่อ แล้วตรวจข้อความพร้อมปุ่ม `ตรวจรหัสอีกครั้ง`
6. ทดสอบ Promise ช้าเกิน 12 วินาที แล้วตรวจ timeout message และปุ่มกลับมากดได้
7. ยืนยันว่าค่าที่กรอกและรายการ Variant ไม่หาย

## Scope Guard

- ไม่แก้ API, Server Action contract, Database, RPC, Migration หรือ Transaction
- ไม่เปลี่ยน Design System, layout หรือ UX flow
- ไม่แก้ Initial Stock behavior หรือ UI-01.4E Conflict contract
- ไม่มี Commit/Push

## Risks

- Timeout ยกเลิกการรอใน UI แต่ไม่สามารถ abort Server Action Promise ที่เริ่มแล้ว; stale-result guard ป้องกันผลลัพธ์เก่ากลับมาเปลี่ยน UI
- Owner ต้อง retest error/timeout ใน browser environment จริงเพื่อปิด blocking bug

## Next Action

Blocking Bug is Owner Accepted. Proceed to UI-01.4F Empty State; do not Commit/Push until PM approval.

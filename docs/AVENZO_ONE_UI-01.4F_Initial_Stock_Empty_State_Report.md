# AVENZO ONE UI-01.4F — Initial Stock Empty State Report

## Status

- Implementation: Complete on `codex/workstream-ui` from base commit `6661a21`.
- Verification: TypeScript, Production Build, scoped regression, HTTP 200 and `git diff --check` passed.
- Owner visual verification: Pending.
- Commit/Push: Not performed.

## Scope Delivered

- เพิ่ม Initial Stock Empty State ฝั่ง UI/Client State สำหรับ 4 กรณี:
  - ยังไม่มี SKU หรือ SKU Variant ที่เปิดใช้งาน
  - ยังไม่มีคลังที่พร้อมใช้งาน
  - สาขาที่เลือกไม่มีคลัง
  - คลังที่เลือกไม่มีตำแหน่งจัดเก็บ
- แต่ละ State แสดงหัวข้อ เหตุผล ขั้นตอนถัดไป และย้ำว่าเป็น `UI Simulation` โดยไม่มี Stock write จริง
- ใช้ warning semantic surface ตาม Design System และไม่ใช้ danger/red error treatment
- ปิดปุ่มตรวจสอบ/Retry/Review ของ Batch เมื่อข้อมูลสำหรับ Batch ยังไม่พร้อม
- เพิ่ม `aria-describedby` เชื่อม action ที่ถูกปิดกับ Empty State
- ใช้ `role="status"`, `aria-live="polite"` และ `aria-atomic="true"` สำหรับ Screen Reader
- เพิ่มปุ่ม secondary ที่นำ Keyboard focus ไปยังจุดแก้ไขในหน้า ได้แก่ SKU, สาขา, คลัง หรือสวิตช์ Initial Stock
- รักษาค่าจำนวน สาขา คลัง ตำแหน่ง และ Variant เดิมไว้; handler ของ Empty State ไม่มีคำสั่งล้างค่า
- รองรับ mobile stacking โดยใช้ spacing, Button และ semantic tokens เดิม

## Files Changed

- `web/src/app/organizations/[id]/products/new/unified-product-creation-form.tsx`
- `web/src/app/globals.css`
- `web/scripts/test-products-initial-stock-all-or-nothing-ui.mjs`
- `docs/AVENZO_ONE_UI-01.4F_Initial_Stock_Empty_State_Report.md`

## UI State Contract

| State | Reason | Next action in UI | Batch action |
| --- | --- | --- | --- |
| No SKU | ยังไม่มี SKU/Variant ที่พร้อมใช้ | ไปที่ส่วน SKU | Disabled |
| No warehouse | ไม่มีคลังและตำแหน่งพร้อมรับ Initial Stock | โฟกัสสวิตช์เพื่อปิด Initial Stock และสร้างสินค้าไว้ก่อน หรือจัดเตรียมคลัง | Disabled |
| Branch has no warehouse | สาขาที่เลือกไม่มีคลัง | โฟกัส Branch selector เพื่อเลือกสาขาอื่น | Disabled |
| Warehouse has no location | คลังที่เลือกไม่มีตำแหน่งจัดเก็บ | โฟกัส Warehouse selector เพื่อเลือกคลังอื่น | Disabled |

## Accessibility and Design System Check

- Native Button ใช้งานด้วย Keyboard และคง focus-visible จาก shared Button
- Focus navigation ใช้ `scrollIntoView` และ `focus` กับ control ที่แก้ได้
- Empty State มี live region และข้อความ ไม่พึ่งสีหรือ icon เพียงอย่างเดียว
- Disabled Batch action อ้างอิงคำอธิบายผ่าน `aria-describedby`
- ใช้ `--status-warning-border`, warning surface เดิม และ shared `.button.compact.secondary`
- Mobile action กว้างเต็ม container ที่ breakpoint เดิม
- ไม่เพิ่ม hard-coded color, radius หรือ spacing value ใหม่

## Test Results

| Check | Result |
| --- | --- |
| `npx tsc --noEmit --incremental false` | PASS |
| Focused Initial Stock regression | PASS — 21/21 |
| Scoped Product Creation / Initial Stock / Blocking Bug regression | PASS — 49/49 |
| Production Build `npm run build` | PASS — Next.js 15.5.22, 39 static pages |
| `git diff --check` | PASS; existing line-ending warnings only |
| Partial Success copy/state scan | PASS — ไม่พบ Partial Success/สำเร็จบางส่วน |
| Owner section order contract | PASS — General → Images → SKU → Pricing → Inventory → Packaging/Bundle → Physical → Metadata |
| Localhost HTTP | PASS — `http://localhost:3000/` returned HTTP 200 |

## Scope Guard

- ไม่แก้ API, Server Action, Database, RPC, Migration, RLS หรือ Stock Logic
- ไม่เพิ่ม Stock write และไม่อ้างว่าสต็อกถูกบันทึกจริง
- ไม่เปลี่ยน Section Order หรือดีไซน์ส่วนอื่น
- ไม่เริ่ม UI-01.4G
- ไม่มี Commit/Push

## Risks

- Browser automation ถูก Windows workspace ACL ปฏิเสธก่อนเปิดหน้า จึงยังไม่มี automated visual screenshot/interaction evidence ในรอบนี้
- Owner ต้องตรวจ visual, focus movement และ Screen Reader announcement บน browser จริงก่อนอนุมัติ
- การเพิ่ม/เปิดใช้งานคลังหรือตำแหน่งเป็นงานนอก Product Creation; UI จึงแนะนำให้เลือกปลายทางอื่นหรือปิด Initial Stock เพื่อสร้างสินค้าไว้ก่อน

## Owner Visual Test Steps

1. เปิด `http://localhost:3000/` และเข้า Product Creation
2. เปิด Initial Stock โดยยังไม่กรอก SKU; ตรวจ Empty State, warning tone และปุ่ม `ไปที่ส่วน SKU`
3. กดปุ่มด้วย Keyboard; ตรวจว่า focus ไปยัง control ในส่วน SKU และค่าที่กรอกเดิมไม่หาย
4. ทดสอบข้อมูลปลายทางแบบไม่มีคลัง; ตรวจข้อความเหตุผล ขั้นตอนถัดไป และปุ่ม Batch ถูก Disable
5. เลือกสาขาที่ไม่มีคลัง; ตรวจปุ่ม `เลือกสาขาอื่น` นำ focus กลับ Branch selector
6. เลือกคลังที่ไม่มีตำแหน่ง; ตรวจปุ่ม `เลือกคลังอื่น` นำ focus กลับ Warehouse selector
7. ตรวจด้วย Screen Reader ว่า Empty State ถูกประกาศและ Batch action อ้างคำอธิบายเดียวกัน
8. ตรวจ mobile width ว่าข้อความไม่ล้นและปุ่ม action กว้างเต็ม container
9. ยืนยันว่า UI ระบุ `UI Simulation เท่านั้น · ไม่มี Stock write จริง` และไม่แสดง Partial Success

## Next Action

หยุดรอ Owner Visual Test สำหรับ UI-01.4F ห้ามเริ่ม UI-01.4G และห้าม Commit/Push จนกว่า PM/Owner อนุมัติ

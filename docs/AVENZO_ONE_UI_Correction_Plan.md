# AVENZO ONE UI Correction Plan

วันที่จัดทำ: 20 สิงหาคม 2026
Branch: `codex/workstream-ui`
ฐานอ้างอิง: `docs/AVENZO_ONE_UI_Mockup_Parity_Audit_Report.md`

## Status

**สถานะ: APPROVED / UI-01.1B–UI-01.3 COMPLETE / UI-01.4 NEXT**

เอกสารนี้ได้รับ Owner/PM อนุมัติแล้ว และใช้ติดตามการพัฒนา UI ทีละ Part โดย UI-01.1B, UI-01.2 และ UI-01.3 ผ่าน Owner test แล้ว งานชุดนี้ไม่อนุญาตให้แก้ API, Database หรือ Transaction

ข้อสรุปหลัก:

- Product Creation ต้องใช้ลำดับ Section ตาม Owner Authority ที่อนุมัติสำหรับ UI-01.1B ซึ่งมีผลเหนือกว่าลำดับเดิมใน Mockup
- Initial Stock ต้องสื่อและรองรับผลลัพธ์แบบ All-or-Nothing เท่านั้น ห้ามแสดง Partial Success
- Error ต้องระบุชัดว่า Rollback ทั้ง Batch และไม่มีรายการใดถูกบันทึกสำเร็จบางส่วน
- ต้องกำหนด Loading, Validation, Duplicate, Retry และ Conflict state ให้ครบก่อน implementation
- ต้องตรวจ Button, Modal, Tooltip, Table และ Spacing ด้วย semantic token และกติกาใน Design System
- Initial Stock UI ที่อยู่ใน Mockup/Production ไม่ตรงกัน ต้องได้รับ PM/Owner decision ก่อนลงมือ

## Scope และข้อห้าม

อยู่ในขอบเขตเฉพาะ UI/Frontend ของ Products, Product Creation และ Initial Stock ได้แก่ โครงสร้างหน้า, visual states,ข้อความ, interaction states, accessibility, responsive behavior และ visual regression tests

อยู่นอกขอบเขต: การแก้ API, Database, Transaction, RLS, stock posting หรือ domain workflow จริง การเปลี่ยนแปลงใด ๆ ในส่วนเหล่านี้ต้องแยกเป็น dependency และรอ PM อนุมัติ

## Correction Plan

### ### Part 1 — Product Creation Section Order

จัด DOM order, section number, timeline/summary mapping และ mobile stacking ตาม Owner Authority ที่อนุมัติสำหรับ UI-01.1B ดังนี้:

1. General
2. Images
3. SKU
4. Pricing
5. Inventory
6. Packaging/Bundle
7. Physical
8. Metadata

Owner Authority นี้มีผลเหนือกว่าลำดับเดิมใน Mockup สำหรับ UI-01.1B และห้ามเปลี่ยนลำดับอีกโดยไม่มี Owner approval

Acceptance criteria:

- heading และเลข Section ตรงลำดับข้างต้นทั้ง desktop และ mobile
- ไม่ย้ายหรือเพิ่ม UX นอก Owner Authority/Mockup โดยไม่มี PM/Owner approval
- breadcrumb, title/status, validation summary, sections และ actions ยังอยู่ตาม Form Page pattern
- section navigation, summary rail และ action orderอ้างอิง section เดียวกัน
Part 2 — Initial Stock: Partial Success → All-or-Nothing

กำหนด UI contract ใหม่ให้หนึ่ง batch มีผลลัพธ์เพียง `Success`, `Rolled back`, `Duplicate result` หรือ `Retryable conflict/error` ห้ามเปิดเผยหรือใช้สถานะ Partial Success

ลำดับ UI ที่ต้องวางแผน:

1. แสดง batch preview ครบทุก SKU, warehouse/location, unit และ quantity
2. ตรวจ validation ครบทั้ง batch ก่อนเปิดปุ่มยืนยัน
3. ระหว่างยืนยัน ล็อกปุ่มและแสดง loading ระดับ batch
4. เมื่อสำเร็จ แสดงผลสำเร็จของทั้ง batch และ reference/audit summary
5. เมื่อรายการใดไม่ผ่าน แสดงผล `Rolled back` ของทั้ง batch ไม่แสดง SKU สำเร็จแยกเป็นบางส่วน

หมายเหตุ: `web/src/lib/foundation/initial-stock-workflow.ts` มี `partial` result ในปัจจุบัน จึงเป็น dependency/contract review ที่ต้องให้ PM อนุมัติแยกต่างหาก ไม่ได้อนุญาตให้แก้ในงาน UI Plan นี้

### Part 3 — Batch Rollback Error State

กำหนดข้อความและโครงสร้าง error state ให้ผู้ใช้เข้าใจผลกระทบในทันที:

- หัวข้อ: “บันทึก Initial Stock ไม่สำเร็จ — Rollback ทั้ง Batch”
- ระบุว่าไม่มี SKU ใดใน batch ถูกบันทึกสำเร็จบางส่วน
- แสดงสาเหตุที่แก้ได้ เช่น SKU ไม่พบ, location ไม่มีสิทธิ์, quantity ไม่ถูกต้อง, unit ไม่ตรง หรือ concurrent conflict
- แสดงจำนวน SKU ที่ได้รับผลกระทบและรายการที่ต้องแก้
- ปุ่มหลัก: แก้ไขข้อมูล / ตรวจสอบอีกครั้ง
- ปุ่มรอง: Retry เมื่อเป็น retryable error
- ห้ามใช้สีหรือข้อความที่ทำให้เข้าใจว่า partial write สำเร็จ

### Part 4 — Required UI States

| State | สิ่งที่ต้องแสดง | เงื่อนไขสำคัญ |
|---|---|---|
| Loading | skeleton/aria-busy และ loading ที่ batch action | ป้องกัน double-click และคง layout ไม่กระโดด |
| Validation | field-level error + batch summary | ตรวจ SKU, location, quantity, unit และ required fields ก่อนยืนยัน |
| Duplicate | “พบคำสั่งซ้ำ — แสดงผลลัพธ์เดิม” | ไม่เพิ่มยอดซ้ำ และแยกจาก success ใหม่ |
| Retry | สาเหตุ, ปุ่ม Retry, ข้อมูลเดิมยังอยู่ | retry ต้องไม่สร้าง batch ใหม่โดยไม่ตั้งใจ |
| Rolled back | แจ้ง rollback ทั้ง batch | ไม่มี partial success และมี next action |
| Conflict | แจ้ง concurrent conflict และ rollback | ให้ refresh/review ก่อน retry |
| Empty/Permission | ไม่มี location หรือไม่มีสิทธิ์ | ไม่ให้ยืนยันจนกว่าจะเลือกข้อมูลที่ใช้ได้ |
| Success | ผลรวมทั้ง batch + reference | สรุปจำนวน SKU/location/quantity ที่สำเร็จ |

### Part 5 — Design System Correction Checklist

ตรวจและแก้เฉพาะเมื่อเทียบ Approved Mockup และ semantic tokens แล้วพบ deviation:

- Button: standard 44px, compact 38px, mobile touch target อย่างน้อย 44×44px, primary/secondary/destructive hierarchy, disabled/loading width คงที่
- Modal: overlay, radius, header/footer, focus trap, Escape, focus restore, destructive confirmation และไม่ซ้อนผิดชั้น
- Tooltip: ใช้กับข้อมูลที่ต้องการคำอธิบายเท่านั้น, accessible name, keyboard focus และไม่ใช้แทนข้อความสำคัญ
- Table: numeric/quantity ชิดขวา, status/action ตำแหน่งคงที่, header/sticky behavior, loading/empty/error, row selection, expanded SKU alignment และ mobile fallback
- Spacing: ใช้ token ตาม Design System, รักษา rhythm ระหว่าง section/field/table/action, ตรวจ 360–390, 768, 1280+ และ 200% zoom
- สี, typography, border, radius และ focus ring ต้องใช้ semantic token ไม่สร้างค่าเฉพาะหน้าโดยไม่มี approval

## ไฟล์ที่ต้องแก้ในรอบ Implementation หลัง PM อนุมัติ

รายการนี้เป็น impact list เท่านั้น ยังไม่มีไฟล์ใดถูกแก้ในรอบจัดทำแผน:

- `web/src/app/organizations/[id]/products/new/unified-product-creation-form.tsx` — section order, Initial Stock states, batch summary/error, buttons, modal/table/spacing
- `web/src/app/organizations/[id]/products/new/page.tsx` — ตรวจและปรับ page-level state/props mapping หากจำเป็น
- `web/src/app/organizations/[id]/products/product-sku-workspace.tsx` — Products workspace state และ interaction parity
- `web/src/app/organizations/[id]/products/products-data-grid.tsx` — table alignment, loading/empty/error, expanded rows และ responsive fallback
- `web/src/app/organizations/[id]/products/page.tsx` — page composition/navigation หาก section or workspace shell ต้องปรับ
- `web/src/app/globals.css` — เฉพาะ semantic token/selector ที่พิสูจน์แล้วว่าไม่ตรง Design System
- `web/src/lib/foundation/initial-stock-workflow.ts` — dependency review only; ห้ามแก้ใน UI task จน PM อนุมัติ scope/domain contract

Mockup/เอกสารที่ต้องตรวจร่วมกันก่อน implementation:

- `docs/mockups/phase-2.1-products-workspace-ui.html`
- `docs/mockups/phase-2.1-unified-product-creation-form.html`
- `docs/mockups/design-qa.md`
- `docs/AVENZO_ONE_Design_System_and_UIUX_Standards_V1.md`
- `docs/AVENZO_ONE_Phase_T_Initial_Stock_Integration.md` (ปัจจุบันอ่านจาก `codex/workstream-domain-qa` ตาม Audit เดิม)

## Test Case ที่ต้องเพิ่ม/ปรับ

### Structure และ visual parity

- ตรวจลำดับ heading/section ใน DOM เป็น General → Images → SKU → Pricing → Inventory → Packaging/Bundle → Physical → Metadata
- screenshot/visual diff ของ Products และ Product Creation ที่ 390, 768, 1280 และ 200% zoom
- ตรวจ button height/touch target, disabled/loading width และ semantic token usage
- ตรวจ modal focus trap, Escape, focus restore, overlay และ responsive stacking
- ตรวจ tooltip accessible name, keyboard focus และไม่บังข้อมูลสำคัญ
- ตรวจ table numeric alignment, action column, sticky header, expanded SKU, loading/empty/error และ mobile fallback

### Initial Stock all-or-nothing

- batch สำเร็จหลาย SKU: แสดง success รวมทั้ง batch
- SKU หนึ่งรายการไม่ผ่าน: แสดง Rollback ทั้ง Batch และไม่แสดง partial success
- missing SKU, invalid quantity, unit mismatch, location ไม่มีสิทธิ์: validation/error ระดับ field และ batch ครบถ้วน
- empty warehouse/location และ permission denied: ปิดปุ่มยืนยันพร้อมข้อความที่แก้ไขได้
- duplicate idempotency key: แสดงผลลัพธ์เดิม ไม่เพิ่ม movement/ยอดซ้ำ
- double-click และ retry: มี loading/disabled guard และไม่สร้าง duplicate batch
- concurrent conflict: rollback ทั้ง batch พร้อมปุ่ม review/retry
- retryable network/error: เก็บ input/preview เดิมและ retry ได้อย่างปลอดภัย
- success: แสดง reference/audit summary และสถานะของทุก SKU/location

### Regression ที่ต้อง rerun

- `web/scripts/test-products-r7-visual-parity.mjs`
- `web/scripts/test-products-r7-page-structure.mjs`
- `web/scripts/test-products-r7-inventory-components.mjs`
- `web/scripts/test-products-initial-stock-t2-read.mjs`
- `web/scripts/test-products-initial-stock-t3-workflow.mjs` — ต้องปรับ assertion ที่คาดหวัง `partial`
- `web/scripts/test-products-r7-unified-creation.mjs`
- `web/scripts/test-products-r7-responsive-visual-matrix.mjs`
- เพิ่ม `web/scripts/test-products-initial-stock-all-or-nothing-ui.mjs` สำหรับ state/ข้อความ/interaction contract โดยไม่เรียก API จริง
- TypeScript check, local build และ authenticated browser visual QA หลังมี implementation เท่านั้น

## Risks และ Guardrails

- Mockup ปัจจุบันไม่มี Initial Stock subsection แบบเดียวกับ Production: ต้องให้ PM/Owner ตัดสินใจว่าจะปรับ Mockup, ย้ายตำแหน่ง หรือเอาออกก่อน implementation
- การเปลี่ยนจาก Partial Success เป็น All-or-Nothing อาจมี dependency กับ workflow/domain contract; UI ต้องไม่อ้างผลลัพธ์ที่ backend ยังไม่รับรอง
- ห้ามแก้หรือสร้าง API/Database/Transaction ในแผนนี้
- Contract test ที่ผ่านไม่เท่ากับ visual parity; ต้องมี screenshot evidence กับ Approved Mockup
- รักษา untracked files เดิมใน workspace และไม่แก้ไขไฟล์นอก impact list โดยไม่มีอนุมัติ

## Acceptance Criteria

- Section order ใช้ Owner Authority UI-01.1B: General → Images → SKU → Pricing → Inventory → Packaging/Bundle → Physical → Metadata; การเปลี่ยนลำดับอีกครั้งต้องได้รับ Owner approval
- ไม่มี UI copy หรือ state ใดสื่อ Partial Success
- Rollback error ระบุชัดว่า rollback ทั้ง batch และมี next action
- ครบ Loading, Validation, Duplicate, Retry, Conflict, Empty/Permission และ Success
- Button, Modal, Tooltip, Table, Spacing ผ่าน checklist และ visual diff
- Test cases ใหม่ผ่าน รวม TypeScript, local build และ authenticated visual QA
- ไม่มีการเปลี่ยน API, Database หรือ Transaction โดยเป็นส่วนหนึ่งของ UI correction

## Next Action

1. `UI-01.1B` Section Order — Complete / Owner Passed
2. `UI-01.2` Initial Stock All-or-Nothing — Complete / Owner Passed
3. `UI-01.3` Batch Rollback Error State — Complete / Owner Passed
4. `UI-01.4` Required UI States — Next: Loading, Validation, Duplicate, Retry, Conflict, Empty/Permission และ Success
5. ทุก Part ต้องรัน TypeScript, Product UI regression, Build และ Owner visual test ก่อนเริ่ม Part ถัดไป

**Commit/Push เฉพาะ branch `codex/workstream-ui`; ไม่รวม Domain worktree หรือ Database implementation**

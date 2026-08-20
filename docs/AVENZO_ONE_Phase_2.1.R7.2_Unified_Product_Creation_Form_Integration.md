# AVENZO ONE — Phase 2.1.R7.2 Unified Product Creation Form Integration

วันที่: 15 สิงหาคม 2026

สถานะ: **Completed / R7.3 Preview E2E Gate Closed**

## Outcome

R7.2 เชื่อม Unified Product Creation contract กับ Route จริงที่
`/organizations/[id]/products/new` และเชื่อมจากเมนู `Products → สร้างสินค้า → สร้างสินค้าปกติ`
โดยคง Application Shell, Organization scope, permission และข้อมูลจริงของระบบ

Backend/Form integration และ Production UI ผ่าน Approved Mockup parity ตาม R7.2.1–R7.2.5 แล้ว และปิด Creation/Recovery E2E ผ่าน R7.3

## Contract ที่ใช้

1. Product + SKU แรก + metadata ถูกสร้างด้วย R7.1 command
   `product.create_with_initial_sku` เพียงคำสั่งเดียวและเริ่มเป็น Draft ทั้งคู่
2. รูป 1–9 ภาพใช้ R6 lifecycle ตามลำดับ `prepare → authenticated Storage upload → finalize`
   และใช้ cleanup compensation เมื่อ upload/finalize ล้มเหลว
3. Browser ใช้ publishable client และ Storage RLS เท่านั้น; service role อยู่ฝั่ง Server
4. ฟอร์มไม่เขียน On hand, Available, Inventory Balance หรือ Stock Movement
   โดย Safety/Reorder เป็น policy metadata และการรับ Stock ต้องทำผ่าน Inventory Command ภายหลัง

## Form ที่ส่งจริง

- ข้อมูลทั่วไป: ชื่อ, หมวดหมู่, แบรนด์, structure, quantity behavior, Tags, description และ internal note
- รูปสินค้า: JPEG/PNG/WebP สูงสุด 9 ภาพ ภาพละไม่เกิน 5 MiB, preview 1:1, reorder และ cover-first
- SKU แรก: ชื่อตัวเลือก, SKU Code, Sales Code/รหัส CF, Barcode และ Base Unit
- ราคา/ภาษี: sale price, protected cost profile, currency THB, tax category/rate
- Physical/Package: น้ำหนักและขนาดสินค้าแยกจากกล่องบรรจุ
- Packaging/Bundle: sell-unit conversion และ component SKU สำหรับ Bundle/Kit
- Inventory policy: Safety Stock, Reorder Min/Max พร้อมข้อความยืนยันว่าไม่ใช่ยอด Stock
- System metadata: Organization, actor และสถานะ Draft แบบ read-only

Category, Brand และ Tag สามารถเพิ่มผ่าน trusted `product.master.upsert` ได้จากฟอร์ม
และ Tag สามารถเลือกจาก Master หรือแนะนำคำที่ตรงกับชื่อสินค้าได้

## Draft recovery

- ก่อน submit ฟอร์มเก็บเฉพาะข้อความ/ตัวเลือกแบบ versioned ใน Local Storage ของ Organization
- Command ID ถูกคงไว้สำหรับ retry แบบ idempotent
- หลัง Atomic command สำเร็จ ระบบเก็บ `product_id` และ `sku_id` เป็น pending Draft
- หากรูปบางภาพล้มเหลว Product/SKU จะไม่ถูกสร้างซ้ำ; ผู้ใช้เลือกไฟล์ใหม่และกด `อัปโหลดต่อ`
- ไฟล์จริงไม่ถูก persist ใน Local Storage และต้องเลือกใหม่หลัง refresh

## Validation และ Security

- ฟิลด์ข้อความ/ตัวเลขมี max length, min/max และ allowlist ตาม command contract
- Category ต้องเป็น active tenant master; Tag สูงสุด 12 รายการ
- Base Unit ใช้รหัส canonical และ SKU/Sales Code/Barcode ตรวจ uniqueness ที่ Database
- รูปตรวจ MIME และขนาดทั้ง Client, Command, Storage bucket และ finalize metadata
- Read route ตรวจ session, active Organization membership, `product.read` และ `product.manage`

## Verification

- R7.2 targeted contract: 6/6
- R1–R7.2 regression: 46/46
- TypeScript: ผ่านด้วย `tsc --noEmit --incremental false`
- Authenticated Chrome: Desktop Light/Dark และ Mobile 390px ผ่าน
- Runtime console: ไม่พบ error/warning จากหน้า R7.2

หลักฐานข้างต้นยืนยัน Functional/Contract baseline เท่านั้น ไม่ใช่หลักฐานว่า Visual Parity ผ่าน

ไม่สร้างข้อมูลทดสอบ, ไม่ apply Supabase Preview/Production, ไม่ commit/push/deploy ใน Part นี้
และยังไม่เริ่ม R7.3

## Closure sequence

1. R7.2.1 Visual Parity Audit ปิด Gap Freeze แล้วตาม `AVENZO_ONE_Phase_2.1.R7.2.1_Visual_Parity_Audit.md`
2. Owner อนุมัติ R7.2.2 Page Structure แล้ว
3. Owner อนุมัติ R7.2.3A Section 1 `ข้อมูลทั่วไป` แล้ว
4. Owner อนุมัติ R7.2.3B Section 2 `รูปสินค้า` แล้ว
5. Owner อนุมัติ R7.2.3C Section 3 `SKU แรกและรหัสสินค้า` แล้ว
6. Owner อนุมัติ R7.2.3D Section 4 `ราคาและภาษี` แล้ว
7. Owner อนุมัติ R7.2.3E Section 5 `น้ำหนักและขนาด` แล้ว
8. Owner อนุมัติ R7.2.3F Section 6 `หน่วยบรรจุและ Bundle` แล้ว
9. Owner อนุมัติ R7.2.3G Section 7 `สาขาและนโยบายสต๊อก` แล้ว
10. Owner อนุมัติ R7.2.3H Section 8 `ข้อมูลระบบ` แล้ว ตาม `AVENZO_ONE_Phase_2.1.R7.2.3H_Metadata_Security_Form_Components.md`
11. Owner อนุมัติ R7.2.4A Dialog จัดการหมวดหมู่/แบรนด์แล้ว ตาม `AVENZO_ONE_Phase_2.1.R7.2.4A_Context_Master_Data_Interaction.md`
12. Owner อนุมัติ R7.2.4B Saved Tags Interaction แล้ว: Quick menu, Search/Multi-select modal, Empty state, 12-Tag limit, Create preview และ Tag manager ผ่าน targeted 8/8, Product regression 107/107 และ TypeScript ตาม `AVENZO_ONE_Phase_2.1.R7.2.4B_Saved_Tags_Interaction.md`
13. Owner อนุมัติ R7.2.4C Identifier Assistant แล้ว: Live sync/stale state, Client validation, Authenticated Server advisory duplicate check ภายใต้ RLS, Async stale-response guard และ Sequence preview-only ผ่าน targeted 8/8, Product regression 115/115, TypeScript และ authenticated Desktop Light แบบไม่เขียนข้อมูล ตาม `AVENZO_ONE_Phase_2.1.R7.2.4C_Identifier_Assistant_Interaction.md`
14. Owner อนุมัติ R7.2.4D SKU Staging แล้ว ตาม `AVENZO_ONE_Phase_2.1.R7.2.4D_SKU_Staging_Interaction.md`
15. R7.2.4E Validation Summary ถูก Implement Local แล้ว: top alert, issue navigation/focus, Timeline count, cross-section validation และ Server-authority boundary ผ่าน targeted 10/10, Product regression 139/139, TypeScript และ authenticated Desktop Light แบบไม่เขียนข้อมูล ตาม `AVENZO_ONE_Phase_2.1.R7.2.4E_Validation_Summary_Interaction.md`
16. R7.2.4F Success & Recovery ถูก Implement Local แล้ว: validated pending record, retry ด้วย Product ID เดิมโดยไม่สร้างซ้ำ, accessible Success dialog และ truthful Draft/No-stock destinations ผ่าน targeted 10/10, Product regression 149/149, TypeScript และ authenticated route verification ตาม `AVENZO_ONE_Phase_2.1.R7.2.4F_Success_Recovery_Interaction.md`
17. R7.2.5 ปิด Local Visual/Responsive Gate แล้ว: Responsive Matrix 12/12, Product regression 161/161, TypeScript และ authenticated 1920 Light/Dark ไม่มี horizontal overflow ตาม `AVENZO_ONE_Phase_2.1.R7.2.5_Visual_Parity_Responsive_QA.md`
18. **2.1.R7.3 — Creation Recovery & E2E Gate ปิดแล้ว** ด้วย Controlled data เฉพาะ AVENZO ONE PREVIEW: Atomic retry/rollback, image fail-retry-finalize, authenticated read model, cleanup, Product regression 171/171 และ TypeScript ผ่าน โดย Supabase Production ไม่ถูกแตะ

## Correction Record — 15 สิงหาคม 2026

หลัง Owner ตรวจระบบจริง พบความแตกต่างด้าน Layout, Visual และ Interaction จาก Mockup ที่อนุมัติ จึงยกเลิกสถานะ `Owner Approved / Local Gate Completed` ของ R7.2 และเปิด Part เดิมใหม่ โดยล็อกกฎดังนี้:

- Approved Mockup เป็น Page-level Source of Truth
- ห้ามเปลี่ยนดีไซน์เองหรือใช้ Functional test แทน Visual approval
- Backend/Form integration และ Local Visual/Responsive Gate ผ่านแล้ว
- Owner อนุมัติ Production parity และ R7.3 ปิด Preview E2E Gate แล้ววันที่ 15 สิงหาคม 2026

# Phase 2.1.R1 — Products Production Workspace Shell

วันที่: 15 สิงหาคม 2569
สถานะ: **Owner Approved / Completed Locally**

## ขอบเขตที่ทำ

- ปรับหน้า Production route `/organizations/[id]/products` ไม่ใช่ Standalone Mockup
- เพิ่ม Breadcrumb `Home → Workspace → Products`
- เปลี่ยน Heading เป็น `Products` พร้อม inverse count badge ที่ระบุชัดว่าเป็นจำนวนในหน้าปัจจุบัน
- ใช้คำอธิบายและ permission badge จาก Organization/session จริง
- ยกเลิก Summary Cards ที่ทำให้หน้า Products ซับซ้อนกว่ารูปแบบ Mockup ที่อนุมัติ
- ขยาย Workspace ตาม Available width พร้อม max `1920px`
- Responsive gutter: Desktop `32px`, ≥1600px `48px`, Laptop `24px`, Mobile `14px`
- รองรับ Light/Dark จาก Theme ของระบบจริง; ไม่มี Theme/Reset control ของ Prototype
- รักษา Product/SKU route, repository, command, permission และ RLS boundary เดิม

## ไฟล์ที่เปลี่ยนใน R1

- `web/src/app/organizations/[id]/products/page.tsx`
- `web/src/app/globals.css`
- `web/scripts/test-products-r1-workspace-shell.mjs`

## สิ่งที่ R1 ไม่ได้ทำ

- ไม่เพิ่ม `ProductWorkspaceRow` หรือ aggregate query ของ R2
- ไม่เปลี่ยน Product/SKU/Inventory schema, migration, command, RLS หรือ permission
- ไม่ย้าย Advanced Data Grid behavior ของ R3
- ไม่แสดง Price/Image/Category/Brand/Tags/Bundle แบบข้อมูลจำลอง

## Test Evidence

- R1 workspace shell tests: `4/4 passed`
- Existing Product/SKU vertical slice regression: `3/3 passed`
- TypeScript: `npm exec tsc -- --noEmit --incremental false` passed
- Next.js local server compile: passed; `/` responded without Console Error/Warning
- Authenticated Products route: passed บน `AVENZO ONE PREVIEW`
- Browser viewport 1920px: full-width workspace shell แสดงถูกต้อง
- Browser viewport 1280px: ไม่มี page overflow; ตารางใช้ internal horizontal scroll
- Browser viewport 760px: mobile card layout แสดงและใช้งานได้
- Browser theme: Light mode ผ่าน; shell ใช้ token ของระบบและไม่มี prototype theme/reset control

## Gate Result

Authenticated browser gate ผ่านเมื่อ 15 สิงหาคม 2569 และอนุญาตให้เริ่ม R2 ตามลำดับได้

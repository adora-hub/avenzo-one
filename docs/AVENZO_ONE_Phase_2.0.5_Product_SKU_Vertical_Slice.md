# Phase 2.0.5 — Product/SKU Vertical Slice

วันที่: 13 สิงหาคม 2026

สถานะ: **Owner Approved / Completed Locally**

## เป้าหมาย

เชื่อม Product/SKU แบบครบเส้นทาง UI → Server Action → Application Authorization → Database Command → Domain Event/Audit → RLS Read Model → Test โดยใช้ Operations UI Foundation และ Server/Application Foundation ที่อนุมัติไว้แล้ว

## Route และ Navigation

- Route: `/organizations/[id]/products`
- Organization-scoped เท่านั้น ไม่สร้าง Platform Admin mutation override
- เพิ่มเมนู `Product & SKU` ใน Workspace navigation เมื่อทราบ Organization context
- เพิ่มปุ่มทางลัดจากหน้า Organization เมื่อผู้ใช้มี `product.read`

## UI Contract

- Product/SKU tabs
- URL-based Search และ Status filter
- Keyset pagination สูงสุด 20 รายการต่อหน้า
- Desktop Data Table และ Mobile Priority Card List
- Create Product, Create SKU, Edit Product และ Edit SKU
- Activate/Archive lifecycle action พร้อม version conflict protection
- Product/SKU Detail Sheet
- Loading, Empty, Error, Permission-denied และ Read-only state
- SKU แสดง `sku_code`, `sales_code`, `barcode`, base unit และ Product parent ชัดเจน
- Light/Dark token-based surfaces และ button contrast ตาม Design System

## Security และ Data Flow

```text
Server Component
  → user-scoped Supabase client
  → RLS Product/SKU read repository

Client command
  → executeFoundationCommandAction
  → verified actor + product.manage
  → service-role-only database RPC
  → optimistic version + idempotency
  → entity + immutable event + audit ใน transaction เดียวกัน
```

- UI ไม่มี `.from('products')` หรือ `.from('skus')` mutation
- query IDs ถูกตรวจ UUID ก่อนส่ง repository
- input ใช้ allowlist ตาม command type และ error ที่ UI แสดงเป็น stable safe code
- ผู้มีเฉพาะ `product.read` เห็น UI แบบอ่านอย่างเดียว
- ผู้ไม่มี `product.read` ได้ permission-denied state โดยไม่โหลด Product/SKU data

## Test Evidence

ผ่านเมื่อ 13 สิงหาคม 2026:

- `npm run test:product-sku-slice` — 3/3 ผ่าน
- `npm run test:foundation-application` — 3/3 ผ่าน
- `npm exec tsc -- --noEmit --incremental false` — ผ่าน
- `npm run build` — Production Build ผ่าน 37 static pages และ route `/organizations/[id]/products`
- `git diff --check` — ผ่าน

Authenticated local browser verification:

- canonical baseline replay 90/90 + bridges 7/7 และ Foundation migrations 2.0.3.2–2.0.4 บนฐาน local เท่านั้น
- สร้าง Product ผ่าน UI สำเร็จ
- สร้าง Active SKU พร้อม Sales Code และ Barcode ผ่าน UI สำเร็จ
- Search `CF-ESS-M` + Active filter คืน SKU ถูกต้อง
- Detail Sheet แสดง SKU/Product/Sales Code/Barcode/Base Unit/Version ถูกต้อง
- Dark mode ทำงานและคงอยู่หลัง navigation/reload
- Mobile viewport 390×844 ซ่อน Desktop Table และแสดง Mobile Card List/Detail Sheet
- Browser console ไม่มี error หรือ warning
- Database evidence หลัง flow: `foundation_commands = 2`, `foundation_domain_events = 2`, `organization_audit_logs = 2`

## ขอบเขตที่ยังไม่รวม

- Warehouse/Location และ Stock Ledger UI — Phase 2.0.6
- Inventory Receive/Adjust/Transfer UI — Phase 2.0.6
- Vercel Preview, full E2E matrix และ release evidence pack — Phase 2.0.7
- Production migration, commit, push และ deploy ไม่ได้รวมโดยอัตโนมัติในการอนุมัติ Phase นี้

## Local Cleanup

- Browser test ใช้ user/organization/product/SKU fixture เฉพาะ Supabase local
- หลังเก็บ evidence ให้หยุด local stack ด้วย `--no-backup` เพื่อไม่เก็บ fixture เป็น baseline
- ไม่มี Supabase Production mutation

## Gate ถัดไป

Phase 2.0.6 Warehouse & Stock Movement Slice ต้องได้รับอนุมัติเริ่มงานแยก และต้องใช้ Inventory Command boundary จาก Phase 2.0.4 โดยทุก `cf_code`, `sales_code` หรือ `barcode` ต้อง resolve เป็น `sku_id` ก่อน Stock Command/Movement เสมอ

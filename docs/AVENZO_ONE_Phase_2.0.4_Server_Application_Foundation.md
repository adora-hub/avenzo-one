# Phase 2.0.4 — Server/Application Foundation

วันที่: 13 สิงหาคม 2026

สถานะ: **Owner Approved / Completed Locally**

## เป้าหมาย

สร้างขอบเขต Server/Application ที่ปลอดภัยและนำกลับมาใช้ซ้ำได้สำหรับ Product/SKU, Warehouse/Location และ Inventory Command ก่อนเริ่มสร้างหน้าจอ Product/SKU ใน Phase 2.0.5 โดยทุก mutation ต้องตรวจ actor, tenant, branch scope และ permission ซ้ำทั้งชั้น application และ database

## สถาปัตยกรรมที่ส่งมอบ

```text
Server Component read
  → user-scoped Supabase client
  → RLS-protected keyset read repository

Client form
  → Server Action (public endpoint)
  → parse/validate untrusted input
  → auth.getUser() + current organization access
  → application authorization + branch scope
  → service-role command repository
  → service-role-only RPC
  → database authorization + transaction + event/audit
```

- Read path ใช้ user-scoped client และ RLS; ไม่ใช้ service-role เพื่อข้าม read policy
- Mutation path ใช้ Server Action เป็น transport เท่านั้น และ re-authenticate ด้วย `auth.getUser()` ทุกครั้ง
- Application service ตรวจ membership, permission และ branch scope ก่อนเรียก repository
- Database RPC ตรวจ actor, tenant, permission และ branch scope ซ้ำก่อนเขียนข้อมูล
- Direct Data API mutation และการเรียก RPC จาก `authenticated` ถูกปฏิเสธ
- ไม่ส่ง database detail, constraint internals หรือ secret กลับ UI

## Application Contract

เพิ่ม typed commands สำหรับ:

- `product.create`, `product.update`, `product.activate`, `product.archive`
- `sku.create`, `sku.update`, `sku.activate`, `sku.archive`
- `warehouse.create`, `warehouse.update`, `warehouse.inactivate`, `warehouse.archive`
- `location.create`, `location.update`, `location.inactivate`, `location.archive`
- Inventory receive/adjust/transfer เชื่อมต่อ server primitive จาก Phase 2.0.3.5 ผ่าน repository เดียวกัน

ทุก command ต้องมี UUID command ID, Organization ID และ validated payload ส่วน update/lifecycle command ต้องส่ง `expected_version` เพื่อทำ optimistic concurrency control

Stable UI-safe error codes ได้แก่ `authentication_required`, `tenant_access_denied`, `permission_denied`, `branch_scope_denied`, `validation_failed`, `entity_not_found`, `entity_inactive`, `version_conflict`, `command_payload_conflict`, `insufficient_stock`, identifier-specific duplicate codes และ `foundation_command_failed`

## Database Contract

Migration: `20260813135745_phase_2_0_4_server_application_foundation.sql`

- เพิ่ม `version bigint` ให้ Product, SKU, Warehouse และ Location พร้อม trigger increment
- เพิ่ม durable `foundation_commands` สำหรับ command envelope และ idempotent replay
- เพิ่ม immutable `foundation_domain_events` สำหรับ machine-readable evidence
- เพิ่ม service-role-only `server_execute_foundation_command(...)`
- ใช้ command ID + canonical request hash + actor + payload เพื่อปฏิเสธ key reuse ที่ข้อมูลไม่ตรงกัน
- command, entity mutation, domain event และ organization audit อยู่ใน transaction เดียวกัน
- event/command history มี trigger ป้องกัน update/delete และไม่มี write grant ให้ browser roles
- read event ผ่าน RLS ตาม `product.read` หรือ branch-scoped `warehouse.read`

## Test Evidence

ผ่านเมื่อ 13 สิงหาคม 2026:

- `npm run test:foundation-application` — 3/3 ผ่าน
- `npm exec tsc -- --noEmit --incremental false` — ผ่าน
- SQL integration/security test `phase_2_0_4_server_application_foundation.sql` — ผ่านและ rollback fixture สำเร็จ
- idempotent replay คืนผลเดิมและสร้าง event เพียงครั้งเดียว
- payload/hash reuse, stale version, cross-branch actor, browser RPC และ direct command write ถูกปฏิเสธ
- entity version เพิ่มจาก 1 เป็น 2 และ command/event/audit มีจำนวนตรงกันแบบ atomic
- immutable event tampering ถูกปฏิเสธ
- `supabase db lint --local --level warning` — ไม่มี warning ใหม่จาก Phase 2.0.4; พบ warning เดิมเรื่องตัวแปร `v_payment` ที่ไม่ถูกอ่านใน `platform_simulate_sandbox_payment_event`
- `npm run build` — Production Build ผ่าน 37 static pages หลังรันนอก filesystem sandbox; build ใน sandbox ค้างที่ Next.js banner เพราะข้อจำกัด cache/telemetry ของ environment ไม่ใช่ compiler error

## Rollback / Compensation

- ยังไม่มีการ apply Supabase Production
- Local test fixture ใช้ transaction และ rollback แล้ว
- ก่อน Production apply ต้องทำ migration backup/rehearsal และอนุมัติ Release Gate แยก
- เมื่อมีข้อมูลจริง ห้าม destructive down migration กับ command/event history; ใช้ application rollback และ forward corrective migration

## สิ่งที่ยังไม่รวม

- Product/SKU UI, Grid, Form และ Detail Sheet — Phase 2.0.5
- Warehouse/Location UI และ Stock Ledger — Phase 2.0.6
- Vercel Preview, E2E, accessibility/responsive release evidence — Phase 2.0.7
- Production migration, commit, push และ deploy ยังไม่ได้รับอนุมัติจากข้อความอนุมัติ Phase นี้โดยอัตโนมัติ

## Gate ถัดไป

Phase 2.0.5 Product/SKU Vertical Slice ต้องได้รับอนุมัติเริ่มงานแยก โดยใช้ read repository, Server Action, error contract และ database command boundary ชุดนี้ ห้ามให้ UI เขียนตาราง Product/SKU โดยตรง

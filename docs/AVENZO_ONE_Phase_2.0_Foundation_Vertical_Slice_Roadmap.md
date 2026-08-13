# Phase 2.0 — Foundation Vertical Slice Roadmap

วันที่: 13 สิงหาคม 2026

สถานะ: **Phase 2.0.1–2.0.6 Completed Locally; Phase 2.0.7 Owner Approved / Local Release Candidate Passed / Vercel Preview Pending**

## เป้าหมาย

สร้างฐาน Product/SKU, Warehouse และ Stock Movement แบบ Vertical Slice ที่เชื่อม UI → Server → Database → Event/Audit → Permission/RLS → Test โดยแบ่งงานเป็นส่วนเล็กที่ตรวจและย้อนกลับได้ ห้ามเริ่ม Schema หรือ Business Logic จนกว่า Discovery และ Decision Record ที่เกี่ยวข้องจะได้รับอนุมัติ

Operations UI Foundation จาก Phase 1.3.6.4 เป็น Presentation Foundation ของ Slice นี้ แต่ไม่กำหนด Domain Model หรือ Business Rule แทน Decision Record

## ลำดับงาน

| Part | Phase | ผลส่งมอบหลัก | Gate ก่อนผ่าน |
|---|---|---|---|
| 1 | Phase 2.0.1 Current-State Discovery & Decisions | **Approved / Completed** — Repository/Schema/Auth/RLS/Audit inventory, Gap analysis, MVP boundary และ Decision Register | Findings Decision Gate ผ่าน; ไม่มี Migration |
| 2 | Phase 2.0.2 Domain Contract | **Approved / Completed** — Organization → Branch → Warehouse/Location, Product → SKU, Inventory Balance และ Stock Movement contract | Domain Decision Gate D-201–D-217 ผ่าน; ไม่มี Migration |
| 3 | Phase 2.0.3 Database, RLS & Migration | **Approved / Completed Locally — Phase 2.0.3.1–2.0.3.6:** baseline, domain schema, Permission/RLS, rollback rehearsal และ clean rebuild สองรอบผ่านด้วย fingerprint ตรงกัน | Local Migration Gate ผ่าน; ห้าม Production apply โดยไม่มีอนุมัติแยก |
| 4 | Phase 2.0.4 Server/Application Foundation | **Approved / Completed Locally** — Repository/service, RLS read model, typed commands, durable idempotency, authorization, optimistic concurrency และ safe error mapping | Contract 3/3, TypeScript, SQL integration/security test, DB lint และ Production Build ผ่าน |
| 5 | Phase 2.0.5 Product/SKU Vertical Slice | **Approved / Completed Locally** — Product/SKU tabs, Search/Filter/Keyset Pagination, Create/Edit/Lifecycle, Detail Sheet, responsive states และ navigation | Contract 3/3, Foundation regression 3/3, TypeScript, Build และ authenticated browser flow ผ่าน |
| 6 | Phase 2.0.6 Warehouse & Stock Movement Slice | **Approved / Completed Locally** — Warehouse/Location, Balance, immutable Stock Ledger, Receive/Adjust/Transfer, low/out stock และ inventory audit | Contract 4/4, SQL regression, TypeScript, Build, Local Advisors และ authenticated browser flow ผ่าน |
| 7 | Phase 2.0.7 Hardening & Release Gate | **Owner Approved / Local Gate Passed / Preview Pending** — clean replay, rollback, regression, security, accessibility, responsive QA, build และ evidence pack ผ่านใน Local | Vercel Preview verification และ final Release Gate ต้องอนุมัติ deploy แยกก่อนเริ่ม Purchasing/Reorder Queue |

แต่ละ Part ต้องมี Commit, Test Evidence และ Approval แยก ห้ามรวมหลาย Part เพื่อข้าม Decision Gate

## Phase 2.0.1 — Current-State Discovery & Decisions

### ตรวจสอบ

- Organization, Branch, Member และ tenant scope ปัจจุบัน
- Product, SKU, Order, Inventory, Warehouse และ Supplier schema/code ที่มีอยู่
- Auth, Permission, Platform Admin, Organization Role, AAL2 และ RLS conventions
- Audit Log, Domain Event, Idempotency และ command patterns
- Operations UI components และ responsive/accessibility contracts
- Migration history, indexes, naming convention และ Supabase security constraints

### ผลส่งมอบ

1. Current-state report พร้อม file/schema references
2. Gap analysis ระหว่างของเดิมกับ Foundation Slice
3. MVP boundary และรายการที่ยังไม่รวม
4. Decision Register พร้อม owner/status/ผลกระทบ
5. Draft acceptance criteria และ test matrix

### ห้ามทำใน Part นี้

- สร้างหรือแก้ Migration
- เปลี่ยน Business Logic, Permission หรือ RLS
- สร้าง Product/Inventory mock data เพื่อเติม UI
- เดาค่า uniqueness, unit, negative stock หรือ warehouse topology

### ผลการตรวจวันที่ 13 สิงหาคม 2026

- ตรวจ repository และ Supabase Production แบบ read-only แล้ว
- ยืนยันว่า Product, SKU, Warehouse, Location, Inventory, Stock Movement, Supplier, Purchase Order และ Commerce Order domain ยังไม่มี
- Tenant/RBAC/RLS/AAL2/Audit/Operations UI foundation พร้อมใช้ต่อ แต่ต้องเพิ่ม domain permission และ command contract
- พบ Migration Baseline drift: repository 93 ไฟล์, Production history 90 รายการ, Git ขาด Phase 0.1 จำนวน 3 migrations และ Phase 1.0.2 tables มีจริงแต่ชื่อ migration ไม่อยู่ใน Production history
- กำหนด Migration Baseline Gate เป็น blocker ก่อน Phase 2.0.3
- จัดทำ Decision Register D-201–D-216 และ Draft Test Matrix แล้ว
- เจ้าของระบบอนุมัติ Findings และปิด Decision Gate เมื่อวันที่ 13 สิงหาคม 2026
- รายงานฉบับเต็ม: `AVENZO_ONE_Phase_2.0.1_Current_State_Discovery_and_Decisions.md`

## Phase 2.0.2 — Domain Contract

Domain baseline ที่ต้องยืนยัน:

```text
Organization
└─ Branch
   └─ Warehouse / Location
      └─ Inventory Balance
         └─ Stock Movement

Product
└─ SKU / Variant
   └─ Inventory Balance
```

Decision ที่ต้องอนุมัติอย่างน้อย:

- Product และ SKU identity/ownership
- SKU code และ barcode unique ระดับ organization หรือ global
- Branch ต่อ Warehouse/Location เป็น one-to-many หรือไม่
- Base unit, sell unit, conversion และ decimal precision
- Product/SKU state: Draft, Active, Archived และ transition
- On hand, Allocated, Available และ reserved quantity formula
- Negative stock policy และ override authority
- Stock adjustment/transfer reason และ approval requirement
- Archive behavior เมื่อมี movement/order history

### Draft Contract วันที่ 13 สิงหาคม 2026

- Product/SKU เป็น Organization-owned; SKU code/barcode unique ต่อ Organization
- Branch 1:N Warehouse และ Warehouse 1:N Location; stock ต้องระบุ Location เสมอ
- base unit เดียวต่อ SKU, `numeric(20,6)`, ไม่มี unit conversion ใน MVP
- `on_hand` มาจาก immutable ledger; `allocated = 0`; `available = on_hand`
- negative stock เป็น deny-all และไม่มี override
- Receive/Adjust/Transfer ผ่าน Server Command พร้อม idempotency และ reason contract
- Platform Admin ตรวจ evidence แบบ AAL2 ได้ แต่ห้ามแก้ tenant stock โดยตรง
- เพิ่ม permission proposal 8 codes สำหรับ Product, Warehouse และ Inventory
- เพิ่ม D-217: ทุก `cf_code`, `sales_code`, `barcode` หรือ fulfillment code ต้อง resolve เป็น `sku_id` ก่อน Stock Command/Movement; เจ้าของระบบเห็นชอบแล้ว
- Migration Baseline drift ยังคงเป็น blocker ก่อน Phase 2.0.3
- เอกสาร: `AVENZO_ONE_Phase_2.0.2_Domain_Contract.md`
- เจ้าของระบบอนุมัติ Resolution D-201–D-217 และปิด Phase เมื่อวันที่ 13 สิงหาคม 2026

## Phase 2.0.3 — Database, RLS & Migration

### สถานะ Phase 2.0.3.1 วันที่ 13 สิงหาคม 2026

- เจ้าของระบบอนุมัติให้เริ่ม Migration Baseline Recovery แล้ว
- ตรวจพบ Production 90 migrations เทียบ Git เดิม 93 files: ตรงทั้งชื่อและ timestamp เพียง 2, ชื่อเหมือนแต่ timestamp ต่าง 82, Production-only names 6 และ Git-only names 9
- กู้ canonical SQL จาก Production statement history แบบ read-only ครบ 90/90 และ hash ตรง 90/90
- เก็บ archive แยกที่ `supabase/production-baseline/`; ไม่แก้ migration เดิมและไม่ apply Production
- local validator ผ่าน: `node supabase/production-baseline/verify.mjs`
- ติดตั้ง Docker Desktop/WSL 2 และ Supabase CLI `2.114.0` แบบ pinned พร้อม local Postgres 17 แล้ว
- clean replay จากฐานว่างผ่าน 90/90 canonical migrations พร้อม recovered bridges 7 รายการ
- normalized schema fingerprint ตรง Production 7/7 หมวด: tables, columns, constraints, indexes, policies, functions และ triggers
- Migration Baseline Gate ผ่านและปิด Phase 2.0.3.1 แล้ว; Phase 2.0.3.2 ได้รับอนุมัติและปิด local schema gate แล้ว
- รายงาน: `AVENZO_ONE_Phase_2.0.3.1_Migration_Baseline_Recovery.md`

### สถานะ Phase 2.0.3.2 วันที่ 13 สิงหาคม 2026

- เจ้าของระบบอนุมัติให้เริ่ม Product/SKU Schema แล้ว
- สร้าง migration ด้วย Supabase CLI: `20260813124837_phase_2_0_3_2_product_sku_schema.sql`
- เพิ่ม `products` และ `skus` พร้อม composite tenant FK เพื่อปฏิเสธ Product/SKU ข้าม Organization
- บังคับ `sku_code`, `barcode` และ `sales_code` unique ต่อ Organization หลัง canonicalization; `sales_code` ถาวรเมื่อกำหนดแล้ว
- บังคับ base unit และ quantity scale 6 เปลี่ยนไม่ได้, lifecycle ไปข้างหน้าเท่านั้น และห้าม hard delete
- เปิด RLS พร้อมถอน grant จาก `public`, `anon`, `authenticated` แบบ deny-by-default; reviewed read policies อยู่ใน Phase 2.0.3.5
- local invariant tests ผ่าน และ `supabase db advisors --local` รายงาน `No issues found`
- ไม่มีการ apply หรือแก้ Supabase Production
- รายงาน: `AVENZO_ONE_Phase_2.0.3.2_Product_SKU_Schema.md`

### สถานะ Phase 2.0.3.3 วันที่ 13 สิงหาคม 2026

- เจ้าของระบบอนุมัติให้เริ่ม Warehouse/Location Schema แล้ว
- สร้าง migration ด้วย Supabase CLI: `20260813130312_phase_2_0_3_3_warehouse_location_schema.sql`
- เพิ่ม `warehouses` และ `locations` พร้อม composite tenant FKs ป้องกัน Organization/Branch/Warehouse ข้าม scope
- สร้าง active Default Location อัตโนมัติใน transaction เดียวกับ Warehouse
- ใช้ partial unique index และ deferred constraint triggers บังคับ exactly one active default ต่อ non-archived Warehouse เมื่อจบ transaction
- บังคับ code canonicalization/uniqueness, immutable topology keys, terminal archive และห้าม hard delete
- เปิด RLS พร้อมถอน grant จาก `public`, `anon`, `authenticated` แบบ deny-by-default; reviewed policies อยู่ Phase 2.0.3.5
- local topology tests ผ่าน, FK indexes ครบ 9/9 และ `supabase db advisors --local` รายงาน `No issues found`
- ไม่มีการ apply หรือแก้ Supabase Production
- รายงาน: `AVENZO_ONE_Phase_2.0.3.3_Warehouse_Location_Schema.md`

### สถานะ Phase 2.0.3.4 วันที่ 13 สิงหาคม 2026

- เจ้าของระบบอนุมัติให้เริ่ม Inventory Ledger & Balance แล้ว
- สร้าง migration ด้วย Supabase CLI: `20260813131250_phase_2_0_3_4_inventory_ledger_balance.sql`
- เพิ่ม `inventory_commands`, immutable `stock_movements`, derived `inventory_balances` และ immutable `inventory_domain_events`
- เพิ่ม private atomic posting primitive สำหรับ Receive, Adjustment และ Transfer โดยยังไม่ expose ให้ `authenticated` หรือ `service_role`
- บังคับ signed movement, `numeric(20,6)`, non-negative on-hand, base-unit snapshot, transfer pair/correlation และ deterministic balance locking
- บังคับ idempotency จาก `(organization_id, command_id)` + request hash; replay คืน outcome เดิมและ payload conflict fail closed
- Balance มี `allocated = 0`, `available = on_hand`, monotonic version และ last movement reference
- local flow/reconciliation tests ผ่าน, FK indexes ครบ 18/18, RLS เปิดครบ 4/4 และ `supabase db advisors --local` รายงาน `No issues found`
- ไม่มีการ apply หรือแก้ Supabase Production
- รายงาน: `AVENZO_ONE_Phase_2.0.3.4_Inventory_Ledger_Balance.md`

### สถานะ Phase 2.0.3.5 วันที่ 13 สิงหาคม 2026

- เจ้าของระบบอนุมัติ Permission, RLS & Security Tests แล้ว
- สร้าง migration `20260813132549_phase_2_0_3_5_permission_rls_security.sql`
- เพิ่ม permission catalog 8 รายการและ seed ให้ built-in `owner`/`admin` แบบ explicit; role อื่น deny-by-default
- เพิ่ม SELECT policies แบบ Organization/Branch scope ครบ 8 ตาราง โดยยังปิด direct INSERT/UPDATE/DELETE จาก Data API
- เพิ่ม server-only inventory posting boundary ที่ตรวจ actor, tenant, active membership, permission และ scope ทั้งสอง branch สำหรับ Transfer
- เพิ่ม AAL2 Platform Admin evidence RPC แบบ read-only โดยไม่ให้ tenant operator หรือ stock override
- local tenant/branch/suspended/direct-write/server-boundary/Platform Admin abuse tests ผ่าน
- database lint ไม่พบ warning ใหม่จาก Phase นี้; Production baseline validator และ `git diff --check` ผ่าน
- ไม่มีการ apply หรือแก้ Supabase Production
- รายงาน: `AVENZO_ONE_Phase_2.0.3.5_Permission_RLS_Security_Tests.md`

### สถานะ Phase 2.0.3.6 วันที่ 13 สิงหาคม 2026

- เจ้าของระบบอนุมัติ Migration Verification แล้ว
- เพิ่ม local verification harness ที่ล็อกเป้าหมายเฉพาะ `supabase_db_avenzo-one-local`
- clean replay canonical baseline 90/90 + recovered bridges 7/7 ผ่านสองรอบ
- transactional rollback rehearsal ของ Phase 2.0.3.2–2.0.3.5 ผ่านและไม่เหลือ Foundation object หลัง rollback
- forward migration 4/4 และ test suites 4/4 ผ่านทั้งสองรอบ
- normalized schema fingerprint สองรอบตรงกัน: `ac4edb9c3db0824b295ecdf98ff2d74cde5203aa3c8fdec6313814bbdee6f756`
- Supabase Security/Performance Advisors รายงาน `No issues found`; lint ไม่มี warning ใหม่จาก Phase 2.0.3
- ยืนยัน compensation strategy แบบ application rollback + additive forward fix และห้าม destructive down migration เมื่อมี ledger/data
- ไม่มีการ apply หรือแก้ Supabase Production
- รายงาน: `AVENZO_ONE_Phase_2.0.3.6_Migration_Verification.md`

แบ่งงานเพื่อไม่ให้ Baseline Recovery ปะปนกับ Domain Schema:

1. **Phase 2.0.3.1 Migration Baseline Recovery** — reconcile Git/Production history, clean replay และ schema diff โดยไม่เพิ่ม Product table
2. **Phase 2.0.3.2 Product/SKU Schema** — master data และ permanent identifiers
3. **Phase 2.0.3.3 Warehouse/Location Schema** — topology และ tenant constraints
4. **Phase 2.0.3.4 Inventory Ledger & Balance** — immutable movement, derived balance และ command/idempotency tables
5. **Phase 2.0.3.5 Permission, RLS & Security Tests** — grants, policies, tenant/branch isolation และ direct-write denial
6. **Phase 2.0.3.6 Migration Verification** — clean rebuild, forward/rollback evidence และ Advisors

แต่ละส่วนต้องมี Evidence/Approval แยก และห้าม Apply Production โดยไม่มีอนุมัติชัดเจน

ผลส่งมอบขั้นต่ำ:

- Product/SKU master tables
- Warehouse/Location tables
- Inventory balance/read model
- Immutable stock movement ledger
- Constraints, indexes และ tenant keys
- RLS/Grant matrix สำหรับ Platform Admin, Organization Staff และ service role
- Audit/domain event records
- Forward migration, rollback/compensation plan และ data backfill plan

ห้ามแก้ balance โดยตรงจาก UI; balance ต้องเปลี่ยนผ่าน movement/command ที่ตรวจสิทธิ์และ idempotency

## Phase 2.0.4 — Server/Application Foundation

- Server-side repository/service boundary
- Paginated/filterable read models สำหรับ Operations Data Grid
- Product/SKU create/update/archive commands
- Receive/adjust/transfer stock commands
- Transaction, locking/concurrency และ idempotency
- Server authorization และ tenant scope
- Structured validation/error mapping ที่ UI แสดงได้โดยไม่เปิดข้อมูลภายใน

### สถานะวันที่ 13 สิงหาคม 2026

- เจ้าของระบบอนุมัติให้เริ่ม Phase 2.0.4 และปิดงาน local แล้ว
- สร้าง user-scoped RLS read repositories พร้อม keyset cursor สำหรับ SKU, Warehouse และ Stock Movement
- สร้าง typed Server Action/service boundary ที่ใช้ `auth.getUser()` และตรวจ Organization/Branch/Permission ซ้ำใน application layer
- สร้าง service-role-only RPC พร้อม durable command envelope, canonical request hash, optimistic version และ immutable domain event
- Product/SKU และ Warehouse/Location command เขียน entity + event + audit ใน transaction เดียวกัน
- contract test 3/3, TypeScript, SQL integration/security test, DB lint และ Production Build 37 หน้า ผ่าน
- ไม่มี Production apply, commit, push หรือ deploy จากการอนุมัติ Phase นี้
- รายงาน: `AVENZO_ONE_Phase_2.0.4_Server_Application_Foundation.md`

## Phase 2.0.5 — Product/SKU Vertical Slice

- Operations Page Header, Filter Bar, Data Grid และ Status Badge
- Search, Filter, Sort และ Pagination
- Create/Edit ผ่าน Operations Form Section
- Detail ผ่าน Operations Detail Sheet
- Empty, Loading, Error, Disabled และ Permission-denied state
- Mobile Priority Column/Card List
- Audit event และ RLS test ของทุก command

### สถานะวันที่ 13 สิงหาคม 2026

- เจ้าของระบบอนุมัติให้เริ่ม Phase 2.0.5 และปิดงาน local แล้ว
- เพิ่ม route `/organizations/[id]/products` พร้อม Workspace navigation และทางลัดจากหน้า Organization
- Reads ใช้ Server Component + user-scoped RLS repository พร้อม URL filter และ keyset pagination
- Mutations ใช้ Foundation Server Action เท่านั้น ครบ Create/Edit/Activate/Archive ของ Product/SKU
- Desktop Table, Mobile Card List, Detail Sheet, Loading/Empty/Error/Permission/Read-only states และ Light/Dark ผ่าน
- browser flow สร้าง Product/SKU, Search/Filter, Detail Sheet, Dark persistence และ Mobile 390×844 ผ่านโดยไม่มี console error
- command/event/audit evidence จาก browser flow ตรงกัน 2/2/2
- ไม่มี Production apply, commit, push หรือ deploy จากการอนุมัติ Phase นี้
- รายงาน: `AVENZO_ONE_Phase_2.0.5_Product_SKU_Vertical_Slice.md`

## Phase 2.0.6 — Warehouse & Stock Movement Slice

### สถานะวันที่ 13 สิงหาคม 2026

- เจ้าของระบบอนุมัติและปิด local gate แล้ว
- เพิ่ม Warehouse/Location directory, Search/Filter/Keyset Pagination, Detail Sheet และ lifecycle actions
- เพิ่ม On hand/Allocated/Available balance view และ immutable Stock Movement Ledger
- Receive, Adjust และ Transfer ส่งผ่าน Foundation Server Action พร้อม actor, reason, idempotency และ negative-stock deny-all
- เพิ่ม service-role-only branch scope resolver แบบ fail-closed และ hardened deferred default-location trigger โดยไม่คืนสิทธิ์ direct table access
- เพิ่ม immutable human-readable Organization Audit Log จาก inventory domain event แบบหนึ่งต่อหนึ่ง
- Contract 4/4, Foundation/Product/Operations regression 10/10, SQL integration/security test, TypeScript, Production Build และ Local Security/Performance Advisors ผ่าน
- Authenticated browser flow ผ่าน Warehouse/Location/Receive/Adjust/Transfer, balance reconciliation, negative stock, filters, Dark persistence และ Mobile 390×844 โดยไม่พบ console error
- ไม่มี Production apply, commit, push หรือ deploy จากการอนุมัติ Phase นี้
- รายงาน: `AVENZO_ONE_Phase_2.0.6_Warehouse_Stock_Movement_Slice.md`

- Warehouse/Location directory
- Stock Ledger ตาม SKU และ Location
- Receive, Adjust และ Transfer พร้อม reason/actor
- On hand, Allocated และ Available
- Low-stock/out-of-stock indicator ที่ไม่แก้ ledger
- Duplicate command protection
- Immutable movement/audit timeline และ reconciliation

ยังไม่รวม Reorder Queue, Suggested PO, Supplier/PO lifecycle หรือ Receiving PO จนกว่า Ledger Gate ผ่าน

## Phase 2.0.7 — Hardening & Release Gate

### สถานะวันที่ 14 สิงหาคม 2026

- เจ้าของระบบอนุมัติให้เริ่ม Phase 2.0.7 แล้ว
- Local clean replay ผ่าน canonical baseline 90/90 + bridges 7/7 + Foundation forward tests
- rollback rehearsal, schema/security invariant และ balance/ledger reconciliation ผ่าน
- automated application/security/theme contracts 91/91, TypeScript และ Production Build ผ่าน
- authenticated browser flow ผ่าน Product/SKU → Warehouse/Location → Receive/Adjust/Transfer → Balance/Ledger/Audit
- Local schema fingerprint: `576080ff1018957e7cbae31fa5aff8d3e2cdb9d3e63815eb7dbb8c7a57cc4404`
- Local Release Candidate Gate ผ่าน แต่ Vercel Preview ยังไม่ถูกรันเพราะ deploy ต้องอนุมัติแยก
- ยังไม่มี commit, push, Preview deployment, Production migration หรือ Production deploy
- รายงาน: `AVENZO_ONE_Phase_2.0.7_Hardening_Release_Gate.md`

- Unit/Integration/RLS/E2E tests
- Cross-tenant, unauthorized, duplicate, concurrency และ negative-stock abuse cases
- Ledger invariant และ balance reconciliation
- Light/Dark, keyboard, screen reader, Desktop/Tablet/Mobile QA
- TypeScript และ Production Build
- Vercel Preview verification
- Migration evidence, rollback rehearsal และ release evidence pack

## Exit Criteria ของ Phase 2.0

1. Product/SKU และ Warehouse/Stock เชื่อมครบ Vertical Slice
2. ทุก mutation ตรวจ tenant, permission และ idempotency ฝั่ง Server/Database
3. Stock balance อธิบายย้อนกลับจาก movement ledger ได้
4. ไม่มี cross-tenant access และไม่มี direct balance mutation จาก UI
5. Operations UI ผ่านภาษาไทย, accessibility และ responsive contract
6. Production Build, Preview และ Evidence Pack ผ่าน
7. เจ้าของระบบอนุมัติ Release Gate ก่อนเริ่ม Purchasing/Reorder Queue

## ขั้นถัดไปที่อนุญาต

Phase 2.0.1–2.0.6 ปิดครบและ Phase 2.0.7 ผ่าน Local Release Candidate Gate แล้ว ขั้นถัดไปคือ **commit/push และสร้าง Vercel Preview เพื่อปิด Preview verification** ซึ่งต้องได้รับอนุมัติแยก การ apply Supabase Production หรือ Production deploy ยังไม่อนุญาต และยังห้ามเริ่ม Purchasing/Reorder Queue ก่อน final Release Gate

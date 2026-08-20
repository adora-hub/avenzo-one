# Phase 2.0.1 — Current-State Discovery & Decisions

วันที่ตรวจ: 13 สิงหาคม 2026

สถานะ: **Approved / Completed**

ขอบเขต: ตรวจแบบอ่านอย่างเดียว ไม่สร้าง Migration, ไม่แก้ Production, ไม่เปลี่ยน Business Logic, Permission, RLS หรือ Auth Configuration และไม่สร้าง Product/Inventory mock data

Supabase Project: `AVENZO ONE` (`eigrllibviqjddenjuch`) — `ap-southeast-1` — PostgreSQL 17 — `ACTIVE_HEALTHY`

## 1. Executive Summary

ระบบมี Foundation ที่นำมาต่อยอดได้จริงในด้าน Multi-tenant, Organization/Branch, Membership, RBAC, Platform Admin + AAL2, RLS, Private Audit และ Operations UI แต่ยัง **ไม่มี Product, SKU, Warehouse, Location, Inventory, Stock Movement, Supplier, Purchase Order หรือ Order domain** ในฐานข้อมูลและ application code ปัจจุบัน

Phase 2.0 จึงเป็นการสร้าง Domain Foundation ใหม่บน Tenant/Security Foundation เดิม ไม่ใช่การขยายตาราง Product/Inventory ที่มีอยู่

ก่อนเริ่ม Phase 2.0.3 ต้องปิด Migration Baseline Gate เพราะ repository มี migration 93 ไฟล์ แต่ Production migration history มี 90 รายการและไม่ได้เป็นชุดที่ replay ตรงกัน:

- Production มี Phase 0.1 จำนวน 3 migrations แต่ repository ไม่มีไฟล์เหล่านี้
- repository มี Phase 1.0.2 Plans/Prices และ Phase 1.0.2.1 Plan Lifecycle แต่ชื่อดังกล่าวไม่อยู่ใน Production migration history แม้ตารางจริงมีอยู่
- timestamp ของ migration files หลายรายการไม่ตรงกับ version ที่ Production บันทึก

ห้ามสร้างหรือ apply Phase 2.0.3 migration จนกว่าจะมีฐาน schema ที่สร้างใหม่ได้ตั้งแต่ศูนย์และเทียบกับ Production ได้โดยไม่แก้ข้อมูล Production

## 2. หลักฐานที่ตรวจ

### 2.1 Repository และ Runtime

- Next.js App Router 15.5, React 19.1 และ TypeScript 5.9
- Supabase SSR ใช้ Publishable Key ฝั่ง Browser/Server Component
- Service/Secret Key อยู่ใน `server-only` module และใช้เฉพาะ server path
- Middleware ใช้ `auth.getClaims()` สำหรับ route gate และตรวจ App Session ผ่าน `app_current_session_status`
- หน้า Organization ตรวจผู้ใช้ด้วย `auth.getUser()` แล้วอ่านข้อมูลผ่าน RLS/RPC
- Mutations ปัจจุบันมีทั้ง Browser → Table โดยตรง, Browser → RPC, Server Action และ API Route → Admin/RPC จึงยังไม่มี application command boundary แบบเดียวทั้งระบบ

ไฟล์อ้างอิง:

- `web/src/lib/supabase/server.ts`
- `web/src/lib/supabase/browser.ts`
- `web/src/lib/supabase/admin.ts`
- `web/src/lib/supabase/middleware.ts`
- `web/src/app/organizations/[id]/page.tsx`
- `web/src/app/components/create-branch-form.tsx`
- `web/src/app/api/billing/payment-exceptions/resolve/route.ts`

### 2.2 Tenant และ Organization Model ปัจจุบัน

| ส่วน | Current state | สิ่งที่ใช้ต่อใน Phase 2.0 |
|---|---|---|
| Organization | `organizations.id` เป็น UUID; slug unique แบบ global; status active/inactive; timezone/currency | ใช้ `organization_id` เป็น tenant key ของทุก domain table |
| Branch | อยู่ใต้ Organization เดียว; `(organization_id, code)` unique; active/inactive | ใช้เป็น operational scope แต่ยังไม่สรุป topology กับ Warehouse |
| Membership | User เดียวอยู่หลาย Organization ได้; `(organization_id, user_id)` unique | ใช้ตรวจ tenant membership และ lifecycle |
| Branch scope | `scope = organization/branch`; branch assignment ผ่าน `member_branches` | ใช้เป็นฐาน branch-aware authorization |
| Role/Permission | Role แยกต่อ Organization; Permission catalog กลาง; role/member mapping | เพิ่ม Product/Inventory permissions โดยไม่ใช้ชื่อ Role เป็น authorization โดยตรง |
| Platform Admin | แยกจาก Organization RBAC; active status; role code | Control Plane ต้องคงแยกจาก Tenant Operation |

ข้อสังเกต: `member_branches` บังคับ FK ของ Membership และ Branch แต่ไม่มี composite FK ที่ยืนยันว่าอยู่ Organization เดียวกัน การเขียนปัจจุบันอาศัย RLS/RPC ตรวจความสัมพันธ์ ดังนั้น Phase 2.0 ต้องกำหนด tenant key และ constraint ให้ตรวจข้าม tenant ได้ที่ Database ด้วย ไม่อาศัย UI หรือ Server อย่างเดียว

### 2.3 Permission, AAL2 และ RLS Convention

Permission catalog ปัจจุบันมี 13 codes เฉพาะ Organization, Branch, Member, Role, Audit และ Billing ยังไม่มี Product, Warehouse หรือ Inventory permission

Convention ที่ใช้ได้ต่อ:

- RLS เปิดทุกตารางใน `public` และ `private`
- Policy ระบุ `TO authenticated` และมี tenant/permission predicate
- `UPDATE` ใช้ทั้ง `USING` และ `WITH CHECK`
- `private.has_org_permission(organization_id, permission_code, branch_id)` เป็นแกน Organization RBAC
- Platform Admin ใช้ `private.is_platform_admin()` ซึ่งรวม active status และ AAL2
- `anon` ไม่มี policy และถูกถอน table grants จาก core tenant tables แล้ว
- Internal/private tables ใช้ deny-by-default หรือไม่มี policy พร้อม revoke direct access

Security Advisor ณ วันที่ตรวจ:

- 48 รายการ: INFO 5, WARN 43
- WARN 42 รายการเป็น `SECURITY DEFINER` application allowlist ที่เปิดให้ authenticated โดยตั้งใจและต้องตรวจซ้ำเมื่อเพิ่ม RPC ใหม่
- WARN 1 รายการคือ Leaked Password Protection ที่เจ้าของระบบ defer ไว้จนกว่าจะอัปเกรด Supabase Pro
- Performance Advisor มี INFO 113 รายการ: unindexed foreign keys 16 และ unused indexes 97; ห้ามลบ index ตาม Advisor โดยไม่วัด workload

Advisor references:

- [Signed-in users can execute SECURITY DEFINER function](https://supabase.com/docs/guides/database/database-linter?lint=0029_authenticated_security_definer_function_executable)
- [RLS enabled with no policy](https://supabase.com/docs/guides/database/database-linter?lint=0008_rls_enabled_no_policy)

### 2.4 Audit, Domain Event และ Idempotency

ของที่มีอยู่:

- `private.organization_audit_logs` เป็น append-only, direct access ถูก deny และอ่านผ่าน RPC
- `(source_type, source_id, source_event)` unique ป้องกัน audit event ซ้ำ
- Audit category ปัจจุบันรับเฉพาะ `organization`, `branch`, `member`, `invitation`, `subscription`, `moderation`, `security`
- Billing ใช้ audit/event/command tables แยกตาม bounded context
- Subscription และ Billing มีตัวอย่าง `command_id`/idempotency key ที่บังคับ unique
- Payment Exception มี API Route ฝั่ง Server, UUID command, AAL2/permission check, immutable command history และ safe error mapping

ช่องว่าง:

- ยังไม่มี Domain Event กลางสำหรับ Product/Inventory
- organization audit category ยังรับ `product`, `warehouse`, `inventory` หรือ `stock` ไม่ได้
- ไม่มีมาตรฐานเดียวว่า mutation ใดเรียก Browser RPC ได้และ mutation ใดต้องผ่าน Server Command
- ไม่มี transaction/concurrency/idempotency contract สำหรับ Stock Movement

### 2.5 Operations UI Foundation

พร้อมใช้เป็น Presentation Foundation:

- Page/Panel Header
- Filter Bar
- Data Grid และ Empty State
- Status Badge
- Summary Card
- Responsive Card List
- Form Section
- Detail Sheet

Contract ปัจจุบันกำหนด Semantic Token, Light/Dark, ภาษาไทย, keyboard/accessibility และ Mobile fallback แล้ว แต่ component เป็น presentational foundation ยังไม่มี Product/Inventory data contract, loading/error abstraction, selection/bulk-command contract หรือ URL state contract ที่สมบูรณ์

ไฟล์อ้างอิง:

- `web/src/app/components/operations-ui.tsx`
- `web/src/app/globals.css`
- `web/scripts/test-operations-ui-foundation.mjs`
- `docs/AVENZO_ONE_Phase_1.3.6.4_Operations_UI_Foundation.md`

### 2.6 Product/Inventory Domain Inventory

ผลค้นจาก local migrations, `web/src` และ Production table inventory:

| Domain | Schema/Table | Server/Application | สถานะ |
|---|---|---|---|
| Product | ไม่มี | ไม่มี | ต้องออกแบบใหม่ |
| SKU/Variant | ไม่มี | ไม่มี | ต้องออกแบบใหม่ |
| Warehouse | ไม่มี | ไม่มี | ต้องออกแบบใหม่ |
| Location | ไม่มี | ไม่มี | ต้องออกแบบใหม่ |
| Inventory Balance | ไม่มี | ไม่มี | ต้องออกแบบใหม่ |
| Stock Movement/Ledger | ไม่มี | ไม่มี | ต้องออกแบบใหม่ |
| Stock Reservation/Allocation | ไม่มี | ไม่มี | ต้องตัดสินใจขอบเขต |
| Supplier | ไม่มี | ไม่มี | ไม่รวม Phase 2.0 |
| Purchase Order/Reorder | ไม่มี | ไม่มี | ไม่รวมจนผ่าน Phase 2.0.7 |
| Commerce Order/Order Item | ไม่มี | ไม่มี | ไม่รวม Phase 2.0 |

คำว่า Product/Order ที่พบในโค้ดปัจจุบันเป็น Stripe product metadata, Billing invoice/payment หรือข้อความใน roadmap ไม่ใช่ Commerce Product/Order domain

## 3. Gap Analysis

| Capability | Current | Target ของ Foundation Slice | Gap/ผลกระทบ |
|---|---|---|---|
| Tenant key | Organization/Branch พร้อม | ทุก Product/Stock row มี tenant ownership ชัด | ต้องออกแบบ composite uniqueness/FK และ RLS |
| Product/SKU master | ไม่มี | identity, lifecycle, validation, search | ต้องมี Domain Contract ก่อน schema |
| Warehouse/Location | ไม่มี | topology และ branch ownership | ต้องตัดสิน one-to-many/optional location |
| Quantity/Unit | ไม่มี | precision, base/sell unit, conversion | ห้ามเดา; เป็น Decision Gate |
| Stock source of truth | ไม่มี | immutable movement ledger | ต้องกำหนด invariant/transaction/concurrency |
| Balance read model | ไม่มี | on hand/allocated/available | Order/Reservation ยังไม่มี ทำให้ allocated semantics ยังเปิด |
| Permissions | ไม่มี product/inventory codes | read/manage/adjust/transfer ตาม branch scope | ต้องอนุมัติ permission matrix |
| Audit/Event | Foundation หลายรูปแบบ | Product/Stock event + operator timeline | ต้องเลือก event/audit boundary |
| Idempotency | มีตัวอย่างใน Billing | บังคับทุก stock command | ต้องกำหนด command envelope และ unique scope |
| Server boundary | หลาย pattern | mutation ผ่าน application command boundary | ต้องมาตรฐานก่อน UI mutation |
| UI | Presentational foundation พร้อม | real data, URL state, responsive states | ทำได้หลัง Domain/API contract |
| Migration | Live และ Git ไม่ replay ตรงกัน | clean rebuild + drift evidence | เป็น blocker ก่อน Phase 2.0.3 |

## 4. MVP Boundary

### รวมใน Phase 2.0

- Product master และ SKU/Variant ขั้นต่ำ
- Warehouse/Location ตาม topology ที่อนุมัติ
- Inventory Balance read model
- Immutable Stock Movement สำหรับ Receive, Adjust และ Transfer
- Organization/Branch tenant isolation
- Permission/RLS สำหรับ read, manage และ stock commands
- Command idempotency, transaction boundary และ duplicate protection
- Audit/Event/actor/reason timeline
- Product/SKU และ Warehouse/Stock Operations UI
- Search, filter, pagination, loading, empty, error, disabled และ permission-denied states
- Reconciliation ระหว่าง Movement Ledger กับ Balance

### ยังไม่รวม

- Supplier master, Suggested PO, Purchase Order, Receiving PO และ Reorder Queue
- Commerce Order, Order Item, Fulfillment, Return และ Reservation จาก Order
- Costing method เช่น FIFO, LIFO, weighted average, landed cost และ COGS
- Serial number, lot/batch, expiry date และ FEFO
- Multi-unit conversion ที่ซับซ้อน หากยังไม่ผ่าน Unit Decision
- Barcode printing, label designer, scanner/offline mode
- Marketplace/POS sync, import bulk และ external ERP integration
- Promotion, Customer, Loyalty, Referral และ Analytics
- Mock data ที่ทำให้ UI ดูเสร็จก่อน domain จริง

## 5. Decision Register

สถานะใช้ `Proposed` เมื่อมีข้อเสนอแนะนำ, `Open` เมื่อห้ามเดา และ `Locked by roadmap` เมื่อแผนอนุมัติหลักการไว้แล้วแต่ยังต้องลงรายละเอียดใน Domain Contract

| ID | Decision | ข้อเสนอ/ตัวเลือก | Owner | Status | ผลกระทบ |
|---|---|---|---|---|---|
| D-201 | Tenant ownership | ทุก business table มี `organization_id`; เพิ่ม `branch_id` เมื่อเป็น operational scope; FK/constraint ต้องกัน cross-tenant | System Owner | Proposed | Schema, RLS, index, API |
| D-202 | Product/SKU ownership | Product และ SKU เป็น organization-owned; identity แยก UUID ภายในจาก code/barcode | System Owner | Proposed | Entity และ import/integration ในอนาคต |
| D-203 | SKU/barcode uniqueness | เลือก unique ระดับ Organization หรือ Global; barcode nullable/หลาย barcode หรือหนึ่งค่า | System Owner | Open | Constraint และ conflict UX |
| D-204 | Product/SKU lifecycle | Draft → Active → Archived; ห้าม hard delete เมื่อมี movement | System Owner | Proposed | State transition และ audit |
| D-205 | Branch/Warehouse topology | Branch มี Warehouse ได้กี่แห่ง; Warehouse ไม่มี Branch ได้หรือไม่; Location จำเป็นตั้งแต่ MVP หรือ optional | System Owner | Open | FK, RLS และ transfer semantics |
| D-206 | Unit model | base unit, sell unit, conversion, decimal precision และ rounding | System Owner | Open | Numeric type และ stock invariant |
| D-207 | Quantity formula | นิยาม on hand, allocated/reserved และ available เมื่อ Order/Reservation ยังไม่อยู่ใน scope | System Owner | Open | Balance schema และ UI KPI |
| D-208 | Negative stock | deny เสมอ, allow ตาม permission หรือ allow บาง movement พร้อม approval | System Owner | Open | Transaction guard และ abuse tests |
| D-209 | Stock command policy | reason code/free text, approval threshold และสิทธิ์ Receive/Adjust/Transfer | System Owner | Open | Permission และ workflow |
| D-210 | Ledger authority | Movement เป็น immutable source of truth; Balance เป็น derived/read model และ UI ห้ามเขียนตรง | System Owner | Locked by roadmap | Transaction/reconciliation |
| D-211 | Mutation boundary | Product/Stock mutation ผ่าน Server Command/API; Browser อ่านผ่าน RLS/read model ได้; service role ไม่รับ tenant id โดยไม่ตรวจ actor | System Owner | Proposed | Security และ testability |
| D-212 | Idempotency envelope | UUID `command_id`, unique อย่างน้อยตาม organization + command type; replay คืนผลเดิมไม่ post movement ซ้ำ | System Owner | Proposed | API, index และ retry behavior |
| D-213 | Audit/Event boundary | แยก immutable domain event/stock ledger จาก human-readable organization audit; timeline รวมผ่าน read model | System Owner | Proposed | Tables, RPC และ retention |
| D-214 | Platform Admin authority | Platform Admin + AAL2 ดู/แก้เฉพาะ Control Plane หรืออนุญาต tenant stock override ด้วยเหตุผล/approval | System Owner | Open | Separation of duty และ RLS |
| D-215 | Migration baseline | กู้ exact Phase 0.1 SQL/ประวัติ direct SQL, สร้าง replayable baseline และ schema-diff gate ก่อน Phase 2.0.3 | System Owner + Engineering | Proposed / Blocking | Migration safety และ CI |
| D-216 | Permission codes | แยก product.read/manage, inventory.read/receive/adjust/transfer และ warehouse.manage; map ให้ role ภายหลัง | System Owner | Proposed | RBAC/RLS/UI action |

## 6. Draft Acceptance Criteria

Phase 2.0.1 ถือว่าผ่านเมื่อ:

1. Current-state report อ้างอิง repository และ Production schema จริงครบ
2. ยืนยันชัดว่าไม่มี Product/Inventory domain เดิมให้ migrate หรือ reuse
3. ระบุ Migration Baseline drift และบังคับ Gate ก่อน Phase 2.0.3
4. แยก MVP/Out-of-scope โดยไม่ดึง Purchasing หรือ Order เข้ามาก่อนเวลา
5. Decision Register ระบุ Owner, Status และผลกระทบ
6. Decision ที่ยัง Open ไม่ถูกแปลงเป็น schema, mock data หรือ business logic
7. เจ้าของระบบอนุมัติ Findings และระบุคำตอบของ D-201–D-216 ที่ต้องปิดใน Phase 2.0.2

## 7. Draft Test Matrix สำหรับ Phase 2.0.2–2.0.7

| ชั้นทดสอบ | กรณีขั้นต่ำ | Gate |
|---|---|---|
| Migration | clean rebuild, forward apply, schema diff, rollback/compensation | Production-equivalent schema ไม่มี drift |
| Constraint | duplicate SKU/barcode, invalid state/unit/quantity, cross-tenant FK | Database ปฏิเสธทุก invariant ที่ผิด |
| RLS | own tenant, other tenant, branch scope, suspended member, anon, Platform Admin AAL1/AAL2 | ไม่มี BOLA/IDOR หรือ scope leak |
| Permission | read/manage/receive/adjust/transfer แยกกัน | UI ซ่อนเพื่อ usability และ Server/DB บังคับจริง |
| Command | duplicate command, stale version, invalid reason, unauthorized actor | ไม่ post movement ซ้ำและ error ปลอดภัย |
| Concurrency | receive/adjust/transfer พร้อมกัน, competing decrements | balance ไม่ติดลบหรือคลาดจาก policy |
| Ledger | immutable update/delete denial, reversal/compensation | ทุก balance อธิบายย้อนจาก movement ได้ |
| Reconciliation | aggregate movement เทียบ balance/read model | mismatch ถูกตรวจและไม่ถูกซ่อน |
| API/Application | validation, tenant context, idempotent retry, safe error mapping | ไม่เชื่อ tenant id จาก client |
| UI | search/filter/sort/pagination และทุก async state | URL/state และภาษาไทยถูกต้อง |
| Accessibility | keyboard, focus, name/label, status not color-only | ผ่าน contract เดิม |
| Responsive/Theme | Desktop/Tablet/Mobile, Light/Dark | ไม่มี overflow/contrast regression |
| Regression | Organization, Membership, Billing, Session Security | Foundation เดิมไม่เสีย |
| Build/Preview | TypeScript, tests, production build, authenticated preview QA | Evidence pack พร้อมอนุมัติ |

## 8. Recommended Gate ก่อน Phase 2.0.2

อนุมัติ Findings ชุดนี้ก่อน แล้วใช้ Phase 2.0.2 ปิด Decision ตามลำดับ:

1. D-201–D-205: identity, ownership, uniqueness และ topology
2. D-206–D-209: unit, quantity, negative stock และ command policy
3. D-210–D-214: ledger, server boundary, idempotency, audit และ Platform Admin authority
4. D-215: อนุมัติแนวทางซ่อม Migration Baseline แต่ยังไม่ apply Production
5. D-216: permission matrix

Phase 2.0.2 ยังเป็นงาน Contract/Decision ก่อน และ Phase 2.0.3 ต้องได้รับอนุมัติแยกอีกครั้งก่อนสร้าง/apply Migration

## 9. ผลการตัดสิน Decision Gate

เจ้าของระบบอนุมัติ Findings ของ Phase 2.0.1 เมื่อวันที่ 13 สิงหาคม 2026

- ยอมรับ Current-state inventory, Gap analysis และ MVP boundary เป็นฐานของ Phase 2.0.2
- ยอมรับ Decision Register D-201–D-216 เป็นรายการที่ต้องปิดผ่าน Domain Contract
- ยืนยัน Migration Baseline drift เป็น blocker ก่อน Phase 2.0.3
- ปิด Phase 2.0.1 โดยไม่มี Migration, Production change หรือ Business Logic change
- Phase 2.0.2 เป็นขั้นถัดไปที่เข้า Gate ได้ แต่ยังต้องได้รับอนุมัติเริ่มงานแยก

## 10. สิ่งที่ไม่ได้เปลี่ยนใน Phase นี้

- ไม่มีไฟล์ใน `supabase/migrations` ถูกสร้างหรือแก้
- ไม่มี SQL DDL/DML ถูก execute กับ Production
- ไม่มี Permission, RLS, Function Grant หรือ Auth Configuration ถูกเปลี่ยน
- ไม่มี Product/Inventory code หรือ mock data ถูกสร้าง
- ไม่มี Commit, Push หรือ Deploy จนกว่าจะได้รับอนุมัติแยก

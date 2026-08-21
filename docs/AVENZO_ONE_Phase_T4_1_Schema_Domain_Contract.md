# AVENZO ONE — Phase T4.1 Schema & Domain Contract

**สถานะ:** Approved Contract
**วันที่:** 20 สิงหาคม 2026
**วันที่อนุมัติ:** 20 สิงหาคม 2026
**ผู้อนุมัติ:** Project Manager (PM)
**Approval Decision:** อนุมัติ Decision Matrix ทั้ง 8 ข้อ โดย `Warehouse.branch_id` ต้องเป็น Required; ไม่รองรับ Warehouse ที่ไม่มี Branch ในขอบเขต T4
**PM Amendment:** 21 สิงหาคม 2026 — Batch cardinality เปลี่ยนเป็น 1–100 Items เพื่อให้ SKU เดี่ยวและหลาย SKU ใช้ RPC เดียวกัน
**Source of Truth:** `docs/AVENZO_ONE_Phase_T_Initial_Stock_Integration.md`
**Branch ที่ตรวจ:** `codex/workstream-domain-qa`
**Implementation Status:** T4.4B Approved/Closed ที่ commit `382b2a6` เมื่อ 21 สิงหาคม 2026
**ข้อจำกัดปัจจุบัน:** T5.1 เป็น Documentation/Integration Preflight เท่านั้น; ห้าม Apply PREVIEW/Production, Deploy, Commit หรือ Push จนกว่า PM อนุมัติขั้นถัดไป

---

## 1. Current Schema Findings

ตรวจจาก tracked files ใน `supabase/migrations`, `web/src` และ `web/package.json` บน branch นี้ ผลเป็นดังนี้:

| Domain Structure | มีใน tracked Migration | หมายเหตุ |
|---|---:|---|
| Product | ไม่มี | พบเพียงคำอ้าง `product.create` ใน untracked temp fixture |
| SKU | ไม่มี | พบเพียงคำอ้าง `sku.create`/`sku_code` ใน untracked temp fixture |
| Warehouse | ไม่มี | ไม่พบ Table, FK, RPC หรือ API |
| Location | ไม่มี | ไม่พบ Inventory Location Table |
| Inventory Movement | ไม่มี | ไม่พบ Movement Ledger |
| Batch Receive | ไม่มี | ไม่พบ Batch Header/Item |
| Inventory Idempotency Record | ไม่มี | Billing มี idempotency แต่ไม่ใช่ Inventory Contract |

`supabase/.temp/phase-2-0-6-browser-fixture.sql` ไม่ใช่ tracked Migration และไม่พบ Definition ของ RPC ที่ fixture เรียก จึงไม่นับเป็น Schema ที่มีอยู่จริง

รายงานนี้ยืนยันเฉพาะ Schema-as-code ใน Git ไม่ได้ยืนยัน Remote Supabase โดยตรง

Foundation ที่มีและใช้เป็น pattern ภายหลังได้:

- `public.organizations`, `public.branches` ซึ่งถูก Migration ปัจจุบันอ้างด้วย FK
- `public.permissions`, `public.organization_roles`, `public.role_permissions`, `public.member_roles`
- `private.has_org_permission(organization_id, permission_code, branch_id)`
- Organization audit foundation
- Unique idempotency และ `SELECT ... FOR UPDATE` pattern ใน Billing

ไฟล์อ้างอิง:

- `supabase/migrations/20260805200000_phase_0_2_role_permission.sql`
- `supabase/migrations/20260805201000_phase_0_2_harden_security.sql`
- `supabase/migrations/20260807120000_phase_0_9_security_audit.sql`
- `supabase/migrations/20260808123000_phase_1_1_2_payment_gateway_sandbox.sql`

---

## 2. Missing Domain Tables

Candidate tables ที่ T4 ต้องมีหลังผ่าน Approval:

1. `public.products`
2. `public.skus`
3. `public.warehouses`
4. `public.inventory_locations`
5. `public.inventory_receive_batches`
6. `public.inventory_receive_batch_items`
7. `public.inventory_movements`
8. `private.inventory_idempotency_records` เฉพาะหาก PM เลือกแยกจาก Batch Header

`inventory_receive_batch_items` จำเป็นเพื่อเก็บ 1–N SKU/Location/Quantity ใน Batch เดียว
โดย PM แก้ไข cardinality เมื่อ 21 สิงหาคม 2026 เพื่อให้ Product ปกติ 1 SKU
และ Product แบบ Variant หลาย SKU ใช้ Atomic Receive RPC เดียวกัน

ยังไม่กำหนด Balance Table เพราะ Phase T ล็อกว่า Balance ต้องเกิดจาก Movement และห้ามแก้ยอดคงเหลือโดยตรง วิธีทำ Read Model/Projection เป็น Decision แยก

---

## 3. Proposed PK, FK และ Unique Contract

ชื่อและ Field ต่อไปนี้เป็น Candidate ที่รอ PM อนุมัติ

### 3.1 Product

`public.products`

- PK: `id uuid`
- FK: `organization_id → organizations.id`
- Required: `name`, `status`, `product_type`, `created_by`, `created_at`, `updated_at`
- Unique: `(id, organization_id)` สำหรับ Composite Tenant FK
- Rule: Draft Product ห้ามรับ Stock
- Rule: Product type ต้องแยก Physical, Virtual Bundle และ Preassembled Bundle หรือค่าที่ PM อนุมัติ

### 3.2 SKU

`public.skus`

- PK: `id uuid`
- FK: `(product_id, organization_id) → products(id, organization_id)`
- FK: `organization_id → organizations.id`
- Required: `sku_code`, `name`, `base_unit_code`, `status`, timestamps/actor
- Unique: `(organization_id, sku_code)`
- Unique: `(id, organization_id)`
- Rule: SKU เป็นตัวตนที่ใช้ใน Stock และ Order
- Rule: SKU ต้อง Active และ Parent Product ต้องรับ Stock ได้

### 3.3 Warehouse

`public.warehouses`

- PK: `id uuid`
- FK: `organization_id → organizations.id`
- Candidate FK: Tenant-safe `branch_id → branches.id`
- Required: `code`, `name`, `status`, timestamps/actor
- Unique: `(organization_id, code)`
- Unique: `(id, organization_id)`
- Rule: Warehouse ที่ใช้รับ Stock ต้อง Active และอยู่ใน scope ของ Actor

### 3.4 Inventory Location

`public.inventory_locations`

- PK: `id uuid`
- FK: `(warehouse_id, organization_id) → warehouses(id, organization_id)`
- FK: `organization_id → organizations.id`
- Required: `code`, `name`, `status`, timestamps/actor
- Unique: `(warehouse_id, code)`
- Unique: `(id, organization_id)`
- Rule: Location ที่ใช้รับ Stockต้อง Active

### 3.5 Receive Batch

`public.inventory_receive_batches`

- PK: `id uuid`
- FK: `organization_id → organizations.id`
- FK: `requested_by → auth.users.id`
- Required: `idempotency_key`, `request_hash`, `batch_type`, `reference`, `reason`, `status`, `created_at`, `committed_at`
- Unique: `(organization_id, batch_type, idempotency_key)`
- Unique: `(id, organization_id)`
- Rule: T4 ใช้ `batch_type = initial_receive`
- Rule: Key เดิม + hash เดิมคืนผลเดิม; hash ต่างต้อง conflict

### 3.6 Receive Batch Item

`public.inventory_receive_batch_items`

- PK: `id uuid`
- FK: `(batch_id, organization_id) → inventory_receive_batches(id, organization_id)`
- FK: `(sku_id, organization_id) → skus(id, organization_id)`
- FK: `(location_id, organization_id) → inventory_locations(id, organization_id)`
- Required: `quantity`, `unit_code`, `created_at`
- Candidate Unique: `(batch_id, sku_id, location_id)`
- Unique: `(id, organization_id)`
- Check: `quantity > 0`

### 3.7 Inventory Movement

`public.inventory_movements`

- PK: `id uuid`
- FK: `(sku_id, organization_id) → skus(id, organization_id)`
- FK: `(location_id, organization_id) → inventory_locations(id, organization_id)`
- FK: `(batch_id, organization_id) → inventory_receive_batches(id, organization_id)`
- FK: `(batch_item_id, organization_id) → inventory_receive_batch_items(id, organization_id)`
- FK: `actor_user_id → auth.users.id`
- Required: `movement_type`, `quantity_delta`, `unit_code`, `reference`, `reason`, `occurred_at`, `created_at`
- Unique: `(batch_item_id)` เพื่อให้ Initial Receive Item สร้าง Movement เดียว
- Check: T4 ใช้ `movement_type = initial_receive` และ `quantity_delta > 0`
- Rule: Ledger immutable; Client ห้าม Update/Delete

### 3.8 Separate Idempotency Record — Optional

`private.inventory_idempotency_records` ใช้เฉพาะหาก PM ไม่เลือก Batch Header เป็น Idempotency Authority

- PK: `id uuid`
- FK: `organization_id → organizations.id`
- FK: Candidate `(batch_id, organization_id) → inventory_receive_batches(id, organization_id)`
- Required: `operation`, `idempotency_key`, `request_hash`, `status`, timestamps
- Optional: `result_payload`
- Unique: `(organization_id, operation, idempotency_key)`
- Access: revoke จาก `public`, `anon`, `authenticated`

---

## 4. Relationship Contract

```text
Organization
 ├─ Product
 │   └─ SKU
 ├─ Warehouse
 │   └─ Inventory Location
 └─ Inventory Receive Batch
     ├─ Batch Item ── SKU + Inventory Location
     └─ Inventory Movement ── Batch Item + SKU + Inventory Location

Optional Idempotency Record ── Receive Batch
```

Cardinality:

- Organization 1 → N Product
- Product 1 → N SKU
- Organization 1 → N Warehouse
- Warehouse 1 → N Location
- Receive Batch 1 → 1–N Batch Item สำหรับ T4
- Batch Item 1 → 1 SKU + 1 Location
- Batch Item 1 → 1 Initial Receive Movement
- Idempotency Key 1 → 1 Logical Batch Result ภายใน Tenant/Operation scope

Tenant rule:

- ทุก Child มี `organization_id`
- Domain FK ใช้ `(entity_id, organization_id)` เพื่อป้องกัน cross-tenant reference ที่ชั้น Database
- SKU/Location ทุกตัวต้องอยู่ Organization เดียวกับ Batch

Balance rule:

- Movement เป็น Source of Truth
- On hand คำนวณจาก Movement ที่ Commit แล้ว
- Available = On hand - Reserved - Committed ตาม Phase T
- Reservation/Committed Ledger อยู่นอก T4.1 และต้องมี Contract แยก

---

## 5. Batch และ Idempotency Fields

Batch input ที่จำเป็น:

- `organization_id`
- `idempotency_key` หรือ `client_request_id`
- `reference`
- `reason`
- Actor จาก authenticated server context ห้ามเชื่อ Actor จาก Client

Item input ที่จำเป็น:

- `sku_id`
- `location_id`
- `quantity`
- `unit_code` หรือ `base_unit`

Validation ก่อนเขียน:

1. Actor เป็นสมาชิก Active ของ Organization
2. Actor มี `inventory.receive`
3. SKU ทุกตัวอยู่ Tenant เดียวกันและรับ Stock ได้
4. Product Parent ไม่เป็น Draft
5. Virtual Bundle ไม่รับยอดโดยตรง
6. Location/Warehouse อยู่ Tenant และ permission scope เดียวกัน
7. Quantity และ Unit ถูกต้อง
8. ไม่มี SKU Code conflict
9. Idempotency Key ไม่ถูกใช้กับ Payload อื่น
10. ทุก validation ผ่านก่อนสร้าง Movement แรก

---

## 6. Permission และ RLS

Source of Truth ระบุ:

- `warehouse.read`
- `inventory.receive`

ปัจจุบันยังไม่พบ Permission Code ทั้งสองใน tracked Migration

RLS baseline:

- Enable RLS ทุก Public Domain Table
- Read เฉพาะ Active Organization membership และ approved permission
- Warehouse/Location read ใช้ `warehouse.read` พร้อม Branch scope
- Mutation ของ Batch/Item/Movement ผ่าน Server-authorized boundary เท่านั้น
- Revoke direct `insert/update/delete` จาก Browser roles
- Movement immutable และห้าม direct update/delete
- Private Idempotency/Audit records ไม่เปิดให้ Browser role
- Error ห้ามเปิดเผยว่า Foreign SKU/Location มีอยู่จริงหรือไม่

Permission name สำหรับ Product/SKU read และ Movement read ยังรอ PM ตัดสินใจ

---

## 7. Expected Migration Plan

ยังไม่มีการสร้าง Migration รายการนี้เป็น Candidate เท่านั้น:

1. `supabase/migrations/<timestamp>_phase_t4_1_product_sku_foundation.sql`
2. `supabase/migrations/<timestamp>_phase_t4_1_warehouse_location_foundation.sql`
3. `supabase/migrations/<timestamp>_phase_t4_1_inventory_movement_batch_foundation.sql`
4. `supabase/migrations/<timestamp>_phase_t4_1_inventory_permissions_rls_audit.sql`

Dependency order:

```text
Product/SKU → Warehouse/Location → Batch/Movement → Permission/RLS/Audit
```

T4.1 ไม่รวม RPC/API/Test Migration และห้ามสร้างจนกว่า PM อนุมัติ Part ถัดไป

---

## 8. Risks

1. Domain branch ไม่มี Product/Inventory Migration แต่ temp fixture อ้าง RPC ที่ไม่มี Definition
2. Remote Supabase อาจมี Schema นอก Git และชนกับ Candidate Migration
3. FK แบบ ID เดี่ยวเสี่ยงอ้าง SKU/Location ข้าม Tenant
4. Check-then-insert โดยไม่มี Unique Constraint/lock เสี่ยงรับ Stock ซ้ำ
5. Batch/Item/Movement คนละ Transaction เสี่ยง Partial Success
6. ไม่เก็บ Request Hash เสี่ยง reuse Key กับ Payload ใหม่
7. Unit/decimal policy ไม่ชัดทำให้ Balance ผิด
8. Warehouse ownership/Branch scope ยังไม่ล็อก
9. Bundle stockability ต้องบังคับที่ Database boundary
10. Movement immutability และ Balance projection ยังไม่อนุมัติ
11. Branch ปัจจุบันไม่มี Unit/Integration/E2E test runner สำหรับ Contract นี้

---

## 9. Decision Matrix สำหรับ Open Decisions ทั้ง 8 ข้อ

Recommendation ทุกข้อเป็นข้อเสนอเพื่อ PM Review ไม่ใช่ Contract ที่อนุมัติ

### Decision 1 — Table Names และ Schema Placement

| ตัวเลือก | ข้อดี | ข้อเสีย | ความเสี่ยง |
|---|---|---|---|
| A. ใช้ normalized candidate tables ใน `public`; private table เฉพาะ Idempotency/Audit | Domain ชัด, แยก Command/Input/Ledger, รองรับ RLS | Table/FK มากขึ้น | อาจชน Remote Schema |
| B. รวม Batch Item/Movement/Idempotency | Schema น้อย | lifecycle ปะปน | Audit/Retry/Concurrency ยาก |
| C. ใช้ชื่อ generic `stock_*` | สั้น | ไม่แยก Movement/Reservation/Receive | เสี่ยงแก้ Balance ตรง |

**Recommendation:** A พร้อม read-only remote reconciliation ก่อน Migration

**ผลต่อ T4.2–T4.5:** T4.2 ใช้ Warehouse/Location FK; T4.3 มี Header/Item สำหรับ Preview; T4.4 แยก Command/Input/Ledger ใน Transaction; T4.5 ทดสอบ RLS/FK/immutability แยกได้

### Decision 2 — Idempotency Storage และ Lifecycle

| ตัวเลือก | ข้อดี | ข้อเสีย | ความเสี่ยง |
|---|---|---|---|
| A. Batch Header เป็น Idempotency Record | Atomic ง่าย, ไม่มีสองแหล่ง | processing/failed lifecycle จำกัด | Timeout ระหว่าง processing ตอบสถานะยาก |
| B. แยก Private Idempotency Record | รองรับ claim/status/replay | ซับซ้อน | Idempotency commit แต่ Batch rollback อาจ orphan |
| C. เก็บเฉพาะ API/cache | ไม่เพิ่ม Table | ไม่ทน restart/multi-instance | รับ Stock ซ้ำ |

**Recommendation:** A สำหรับ T4 รุ่นแรก; ใช้ B เมื่อมี approved requirement สำหรับ persist failed/in-progress

**ผลต่อ T4.2–T4.5:** T4.2 ไม่มีผลต่อ selector; T4.3 reuse Key ตอน Retry; T4.4 claim Batch ด้วย Unique Constraint; T4.5 test replay/timeout/concurrency

### Decision 3 — Key Type, Scope และ Payload Mismatch

| ตัวเลือก | ข้อดี | ข้อเสีย | ความเสี่ยง |
|---|---|---|---|
| A. UUID + tenant/batch scope + request hash | สอดคล้อง Billing, index เล็ก | Client ต้องรักษา UUID | Key ใหม่ทุก Retry ยังรับซ้ำได้ |
| B. Text จำกัด format/length | รองรับ external key | ต้อง normalize | case/space ทำ logical duplicate |
| C. Global unique ไม่รวม Tenant | Query ง่าย | Tenant ชนกัน | ข้อมูล Key ข้าม Tenant รั่ว |

**Recommendation:** A; hash เดิมคืนผลเดิม, hash ต่าง deterministic conflict โดยไม่เปิดข้อมูล Tenant อื่น

**ผลต่อ T4.2–T4.5:** T4.2 ไม่มีผลต่อ read; T4.3 Form รักษา UUID; T4.4 claim ก่อน Movement; T4.5 test replay/changed payload/cross-tenant/concurrency

### Decision 4 — Duplicate SKU/Location ใน Batch

| ตัวเลือก | ข้อดี | ข้อเสีย | ความเสี่ยง |
|---|---|---|---|
| A. Reject duplicate pair | Input/Movement 1:1, audit ชัด | Client ต้องแก้รายการ | UX ต้องชี้ row ซ้ำ |
| B. Aggregate ที่ Server | ยืดหยุ่น | Result ไม่ตรง raw input | รวม Unit/reason ผิด |
| C. หลาย Movement ต่อ pair | เก็บ raw rows | Ledger แตกโดยไม่จำเป็น | duplicate row กลายเป็น Stock |

**Recommendation:** A พร้อม `unique (batch_id, sku_id, location_id)` และ Database เป็น final guard

**ผลต่อ T4.2–T4.5:** T4.2 สร้าง pair identity; T4.3 Preview ปฏิเสธ row ซ้ำ; T4.4 validate + constraint; T4.5 test duplicate/reorder/rollback

### Decision 5 — Quantity Precision และ Unit Policy

| ตัวเลือก | ข้อดี | ข้อเสีย | ความเสี่ยง |
|---|---|---|---|
| A. Base unit only; precision ตาม SKU/Unit | Contract แคบ | ยังรับ pack/carton ไม่ได้ | ไม่มี scale policy อาจรับเศษหน่วยผิด |
| B. Unit Conversion ใน T4 | UX ยืดหยุ่น | ต้องมี conversion/rounding snapshot | Conversion เปลี่ยนทำ Balance drift |
| C. Integer ทุก SKU | ง่าย | ใช้กับ kg/litre/metre ไม่ได้ | สินค้าชั่งตวงเก็บ Stock ไม่ได้ |

**Recommendation:** A; เก็บ Movement เป็น Base Unit และล็อก quantity scale/allow-fraction ก่อน Migration; Conversion เป็น Contract แยก

**ผลต่อ T4.2–T4.5:** T4.2 คืน unit/precision; T4.3 input ตาม rule; T4.4 validate ไม่ convert; T4.5 test integer/fraction/overflow/mismatch

### Decision 6 — Warehouse Ownership และ Location Uniqueness

| ตัวเลือก | ข้อดี | ข้อเสีย | ความเสี่ยง |
|---|---|---|---|
| A. Warehouse ต้องมี Branch; Location unique ต่อ Warehouse | Scope ชัด | ไม่รองรับคลังกลาง | ต้อง migrate หากเพิ่ม central warehouse |
| B. Branch optional | รองรับคลังกลาง | RLS ซับซ้อน | nullable branch เปิดสิทธิ์กว้าง |
| C. Organization only | Model ง่าย | Branch permission ใช้ไม่เต็มที่ | Staff เข้าถึงคลังผิด scope |

**Approved Decision:** A — `Warehouse.branch_id` เป็น Required, ใช้ tenant-safe Branch FK และ Location code unique ต่อ Warehouse; central warehouse ที่ไม่มี Branch อยู่นอกขอบเขต T4

**ผลต่อ T4.2–T4.5:** T4.2 lazy load/filter ตาม Branch; T4.3 reset Location deterministic; T4.4 ตรวจ branch access; T4.5 test cross-branch/cross-warehouse/tenant

### Decision 7 — Product Lifecycle และ Bundle Stockability

| ตัวเลือก | ข้อดี | ข้อเสีย | ความเสี่ยง |
|---|---|---|---|
| A. Product status/type + SKU status | Database guard ชัด | ต้องล็อก enum/state transition | State race ระหว่าง Preview/Commit |
| B. Boolean `is_stockable` | ง่าย | ไม่อธิบาย Bundle lifecycle | drift จาก status/type |
| C. Client ตัดสิน | Schema น้อย | Server ไม่เป็น Authority | Draft/Bundle รับ Stock ผ่าน API ได้ |

**Recommendation:** A; รับเฉพาะ Active stockable SKU ของ Active physical Product; Virtual Bundle ห้ามรับตรง; Preassembled block จนมี Assembly Contract

**ผลต่อ T4.2–T4.5:** T4.2 คืน eligible SKU; T4.3 แสดงเหตุผล; T4.4 revalidate ใน Transaction; T4.5 test Draft/inactive/Virtual/Preassembled/state race

### Decision 8 — Permission/RLS, Movement Read Model และ Schema Authority

| ตัวเลือก | ข้อดี | ข้อเสีย | ความเสี่ยง |
|---|---|---|---|
| A. Public tables Select ผ่าน RLS; immutable Movement; Balance read view; reconcile Remote | ใช้ pattern เดิม, audit ได้, ลด drift | Policy/view ต้องละเอียด | Policy ผิด expose Ledger |
| B. Private Movement อ่านผ่าน RPC/View | Surface ต่ำ | Reporting ซับซ้อน | hidden coupling |
| C. ใช้ Git โดยไม่ตรวจ Remote | เร็ว | ไม่เห็น object นอก Git | Migration ชน/Environment drift |

**Recommendation:** A; ใช้ `warehouse.read`/`inventory.receive`, ให้ PM ตั้ง permission สำหรับ Product/SKU/Movement read, revoke direct Movement writes และ reconcile Remote แบบ read-only

**ผลต่อ T4.2–T4.5:** T4.2 selector RLS; T4.3 Preview ผ่าน approved view/DTO; T4.4 Server-authorized RPC + immutable Ledger; T4.5 RLS/direct-write/cross-tenant/audit/balance/schema-drift tests เป็น gate

### 9.1 Recommendation Summary

| Decision | Recommendation |
|---:|---|
| 1 | Normalized Domain Tables แยก Command/Input/Ledger |
| 2 | Batch Header เป็น Idempotency Record ใน T4 รุ่นแรก |
| 3 | UUID + tenant/operation scope + canonical request hash |
| 4 | Reject duplicate SKU/Location pair |
| 5 | Base unit only พร้อม precision policy |
| 6 | Warehouse ผูก Branch แบบ required; Location unique ต่อ Warehouse |
| 7 | Product status/type + SKU status เป็น stockability guard |
| 8 | Public RLS read, immutable Movement, balance view และ remote reconciliation |

---

## 10. Approval Record และ Handoff

PM อนุมัติ Decision ทั้ง 8 ข้อเมื่อวันที่ 20 สิงหาคม 2026 โดยมีข้อยืนยันเพิ่มเติมว่า Warehouse ต้องผูก Branch แบบ Required

ผลที่ล็อกสำหรับ Part ถัดไป:

- ใช้ normalized Domain Tables แยก Command/Input/Ledger
- Batch Header เป็น Idempotency Authority ของ T4 รุ่นแรก
- UUID key + tenant/operation scope + canonical request hash
- Reject duplicate SKU/Location pair
- Base unit only พร้อม precision policy
- Warehouse ผูก Branch แบบ Required; Location code unique ต่อ Warehouse
- Product status/type + SKU status เป็น stockability guard
- Public read ผ่าน RLS, Movement immutable และทำ remote reconciliation แบบ read-only ก่อน Migration

Implementation reconciliation ณ commit `382b2a6` (ไม่เปลี่ยน Owner-locked Contract):

- ชื่อ Physical schema ที่นำกลับมาใช้จริงคือ `public.products`, `public.skus`, `public.warehouses`, `public.locations`, `public.stock_movements` และ `public.inventory_balances`
- T4.2C ปิด Permission/RLS/Constraint cutover และ T4.3B ปิด Individual Permission Overrides แล้ว
- T4.4B เพิ่มเฉพาะ Batch authority ที่อนุมัติ ได้แก่ `public.inventory_receive_batches`, `public.inventory_receive_batch_items` และ `public.server_receive_inventory_batch`
- Candidate names และ Current Schema Findings ด้านบนคงไว้เป็นหลักฐาน ณ เวลาจัดทำ T4.1; ห้ามนำไปสร้าง Schema ซ้ำหรือใช้แทนชื่อ Physical schema ที่ reconcile แล้ว

Handoff ไป T4.2: จัดทำ Permission, RLS & Constraints Plan โดยยังห้ามสร้าง Migration/RPC/API/Test Code

**สถานะสุดท้าย:** T4.1 Approved Contract — Owner-locked Decisions ทั้ง 8 ข้อยังคงเดิม;
T4.4B Approved/Closed ที่ commit `382b2a6`; เอกสารฉบับนี้ถูกปรับเฉพาะสถานะและ
implementation reconciliation สำหรับ T5.1 โดยไม่แก้ Schema/Domain Contract

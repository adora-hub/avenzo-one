# AVENZO ONE — Phase T4.2 Permission, RLS & Constraints Plan

**สถานะ:** Approved Plan — Pending Pre-Implementation Gates  
**วันที่:** 20 สิงหาคม 2026  
**Approval:** PM อนุมัติ T4.2 Plan เมื่อวันที่ 20 สิงหาคม 2026 โดยกำหนด Pre-Implementation Gates คือ Role Assignment Matrix และ T4.2A Remote Schema Reconciliation  
**อ้างอิง Contract:** `docs/AVENZO_ONE_Phase_T4_1_Schema_Domain_Contract.md` — Approved Contract  
**Source of Truth:** `docs/AVENZO_ONE_Phase_T_Initial_Stock_Integration.md`  
**Branch ที่ตรวจ:** `codex/workstream-domain-qa`  
**ข้อจำกัด:** Plan เท่านั้น ห้ามสร้าง Migration, RPC, API, Test Code หรือแก้ระบบจริง และห้าม Commit/Push จนกว่า PM อนุมัติ

---

## 1. Status และ Current Findings

T4.1 ได้รับอนุมัติทั้ง 8 Decisions เมื่อวันที่ 20 สิงหาคม 2026 และล็อกให้ Warehouse ต้องผูก Branch แบบ Required

Current repository findings:

- มี Permission catalog และ role assignment foundation
- มี `private.has_org_permission(organization_id, permission_code, branch_id)` ซึ่งรองรับ Organization/Branch scope
- มี RLS, explicit grant/revoke และ private audit patterns ใน Migration เดิม
- มี `member_branches` สำหรับจำกัดสมาชิกตาม Branch
- ยังไม่มี Product/SKU/Warehouse/Location/Batch/Movement tables ใน tracked Migration ของ branch นี้
- ยังไม่มี Permission codes ของ Product/Inventory
- ยังไม่มี Inventory RLS policies, constraints หรือ immutability guard
- Remote Supabase schema ยังไม่ได้ introspect ใน T4.2 เพราะไม่มี authenticated Supabase MCP/remote binding ที่ยืนยันใน context นี้ และ Part นี้อนุญาตเฉพาะแผน read-only reconciliation

Security baseline จาก Supabase/Postgres ที่ใช้ใน Plan:

- Object grants และ RLS เป็นคนละชั้นและต้องกำหนดทั้งคู่
- Table ใน exposed schema ต้อง Enable RLS
- Policy ต้องระบุ target role เช่น `TO authenticated` และต้องมี authorization predicate ไม่ใช่ตรวจแค่ role
- Private helper/`SECURITY DEFINER` ต้องอยู่นอก exposed schema, ตรวจ caller identity, ล็อก `search_path` และ revoke execute ที่ไม่จำเป็น
- Columns ที่ใช้ใน RLS/FK ต้องมี indexes
- Browser ห้ามมี service role credential
- View ที่ Browser อ่านต้องใช้ security-invoker behavior หรือไม่อยู่ใน exposed schema

---

## 2. Permission Code Plan

ใช้รูปแบบเดิม `resource.action` และหลัก least privilege

| Permission Code | Resource | Action | ขอบเขต | ใช้กับ |
|---|---|---|---|---|
| `product.read` | `product` | `read` | Organization | Product list/detail ที่ไม่ใช่ PII |
| `sku.read` | `sku` | `read` | Organization | SKU, SKU code, base unit, stockability state |
| `warehouse.read` | `warehouse` | `read` | Branch required | Warehouse ภายใน Branch ที่สมาชิกมีสิทธิ์ |
| `location.read` | `location` | `read` | Branch required | Location ภายใต้ Warehouse ที่เข้าถึงได้ |
| `inventory_batch.read` | `inventory_batch` | `read` | Branch required | Receive Batch และ Batch Items |
| `inventory_movement.read` | `inventory_movement` | `read` | Branch required | Movement Ledger และ read model |
| `inventory.receive` | `inventory` | `receive` | Branch required | อนุญาต future server transaction สำหรับ Initial Receive |
| `inventory_audit.read` | `inventory_audit` | `read` | Branch required | Inventory audit history ผ่าน approved read model |

Rules:

- T4.2 ยังไม่กำหนด `create/update/delete` permission สำหรับ Product/SKU/Warehouse/Location
- `inventory.receive` ไม่แปลว่า Browser ได้ INSERT table โดยตรง
- `inventory_audit.read` แยกจาก broad `audit.read` เพื่อรักษา least privilege
- Permission assignment ให้ Role จริงเป็นงานหลัง PM อนุมัติ; Plan นี้ยังไม่ seed หรือ assign
- Product/SKU เป็น Organization-wide catalog; Branch-scoped member ที่ได้รับ permission สามารถอ่าน catalog ภายใน Organization เพื่อใช้ receive แต่เขียน Stock ได้เฉพาะ Branch ของตน


### 2.1 Role Assignment Matrix — Least Privilege

สัญลักษณ์: `✓` = assign ได้ตาม scope ที่ระบุ, `—` = ไม่ assign โดยค่าเริ่มต้น

| Business Role | product.read | sku.read | warehouse.read | location.read | inventory_batch.read | inventory_movement.read | inventory.receive | inventory_audit.read | Scope |
|---|---:|---:|---:|---:|---:|---:|---:|---:|---|
| Catalog Viewer | ✓ | ✓ | — | — | — | — | — | — | Organization catalog |
| Inventory Viewer | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | — | — | Assigned Branch เท่านั้น |
| Inventory Receiver | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | — | Assigned Branch เท่านั้น |
| Inventory Auditor | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | — | ✓ | Assigned Branch เท่านั้น |
| Branch Inventory Manager | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | Assigned Branch; เป็น operational exception ที่ต้องมี owner approval |
| Organization Inventory Admin | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | Organization-wide assignment; ทุก operation ยังต้องระบุและตรวจ Branch |

Assignment rules:

- Default deny: Role ที่ไม่อยู่ใน matrix หรือ permission ที่ไม่ถูก assign ถือว่าไม่มีสิทธิ์
- แยกหน้าที่ Receiver กับ Auditor เป็นค่าเริ่มต้น; ผู้ใช้ที่รับสินค้าไม่ควรได้ `inventory_audit.read` โดยอัตโนมัติ
- `Branch Inventory Manager` ที่รวม receive และ audit เป็นข้อยกเว้นเชิงปฏิบัติการ ต้องมีผู้อนุมัติและรอบทบทวนสิทธิ์
- Product/SKU read เป็น Organization scope; Warehouse/Location/Batch/Movement/Receive/Audit ต้องตรวจ Branch scope เสมอ
- Branch-scoped role ต้องมี active membership และ active `member_branches` assignment
- Organization-wide role ไม่ bypass RLS; helper ต้องตรวจ Organization membership และ Branch ของ row
- ไม่มี Role ใดได้ direct table write บน Batch/Item/Movement หรือ private audit/idempotency data
- Browser ใช้ได้เฉพาะ `authenticated` session และ explicit permission; ห้ามใช้ `service_role`
- ไม่ใช้ชื่อ Business Role เป็น authorization predicate โดยตรง ให้ policy ตรวจ Permission code เพื่อไม่ผูก schema กับชื่อ role
- การเพิ่ม role, temporary elevation, expiry หรือ delegation เป็น Open Governance item หาก foundation schema ยังไม่รองรับ; T4.2 ไม่สร้างโครงสร้างใหม่

### 2.2 T4.3 Individual Permission Override — Approved Requirement

PM/Owner อนุมัติให้ T4.3 รองรับการกำหนดสิทธิ์รายบุคคล โดยยังคง Role เป็นสิทธิ์พื้นฐาน เช่น Admin มีสิทธิ์สร้างสินค้าเป็นค่าเริ่มต้น แต่ Owner สามารถถอนเฉพาะ `product.create` จาก Admin คนหนึ่งได้โดยไม่กระทบ Admin คนอื่น

Effective permission:

`Role baseline + User allow override - User deny override` โดย **Deny ชนะ Allow และ Role เสมอ**

ข้อกำหนด:

- รองรับ `allow` และ `deny` รายสมาชิก ภายใน Organization และกำหนด Branch scope ได้เมื่อ permission เกี่ยวข้องกับสาขา
- Product permission ต้องแยกอย่างน้อยเป็น `product.read`, `product.create`, `product.update`, `product.archive` และสิทธิ์ลบตามนโยบาย Soft Delete ที่อนุมัติในอนาคต
- การถอน `product.create` ต้องไม่ถอน `product.read` หรือสิทธิ์อื่นโดยปริยาย
- ผู้ใช้ห้ามเพิ่มสิทธิ์ให้ตนเอง และห้ามแก้สิทธิ์ของผู้มีอำนาจสูงกว่าตาม Governance hierarchy
- ต้องมี Owner protection เพื่อป้องกันการถอนสิทธิ์จน Organization ไม่มีผู้ดูแลที่กู้คืนระบบได้
- ทุกการเพิ่ม ถอน เปลี่ยน scope หรือหมดอายุต้องบันทึก Audit Log พร้อมผู้ดำเนินการ เหตุผล เวลา และค่าก่อน/หลัง
- Backend permission helper, Server boundary และ RLS เป็นผู้บังคับใช้จริง; UI มีหน้าที่แสดง/ซ่อน/disable ตาม effective permission เท่านั้น
- โครงสร้าง candidate `member_permission_overrides` เป็นข้อเสนอสำหรับ T4.3 ไม่ใช่ Schema ที่อนุมัติให้สร้างใน T4.2C
- Candidate fields: organization/member, permission code, effect (`allow`/`deny`), optional branch scope, reason, actor, effective/expiry time และ audit timestamps
- T4.2C ต้องไม่แก้ Migration หรือ Test เพื่อรองรับ requirement นี้ก่อนเปิด T4.3

T4.3 acceptance tests ขั้นต่ำ:

- Deny `product.create` รายบุคคลชนะ Admin role และ Admin คนอื่นยังสร้างสินค้าได้
- ถอนสิทธิ์หนึ่งรายการแล้วสิทธิ์อื่นของสมาชิกเดิมไม่เปลี่ยน
- Branch override ใช้ได้เฉพาะ Branch ที่กำหนด และ cross-tenant/cross-branch ถูกปฏิเสธ
- Expired override ไม่ถูกนำมาคำนวณ และการเปลี่ยนทุกครั้งตรวจสอบย้อนหลังได้
- สมาชิกเพิ่มสิทธิ์ตนเองไม่ได้, Browser ข้าม Backend enforcement ไม่ได้ และ Owner safety rule ทำงาน

**สถานะ:** Approved Requirement — Deferred to T4.3 Design/Implementation; ยังไม่มี Migration, RLS, API หรือ UI Permission Manager ในขอบเขต T4.2C

### 2.3 Role Assignment Gate Acceptance

- PM/Owner ยืนยัน role owner และผู้มีอำนาจ assign/revoke
- ยืนยันว่า Branch Inventory Manager เป็นข้อยกเว้นหรือจะแยก Receiver/Auditor อย่างเคร่งครัด
- ยืนยัน Organization Inventory Admin ว่าจำเป็นจริงและกำหนด review cadence
- ทุก assignment มี Organization scope และ Branch scope ที่ตรวจสอบย้อนหลังได้
- ไม่มี default grant ให้สมาชิกใหม่ และไม่มี implicit permission inheritance ที่อยู่นอก matrix


---

## 3. RLS Policy Matrix

### 3.1 Read / Receive / Audit Matrix

| Table/Read Model | Read Policy | Receive/Write Policy | Audit Policy |
|---|---|---|---|
| `products` | `product.read` + Active Organization membership | ไม่มี direct Browser write | Changes ส่ง audit ภายใต้ Product contract ในอนาคต |
| `skus` | `sku.read` + Organization match | ไม่มี direct Browser write | Changes ส่ง audit ภายใต้ SKU contract ในอนาคต |
| `warehouses` | `warehouse.read` + required `branch_id` + member branch scope | ไม่มี direct Browser write | Warehouse audit ไม่รวมใน raw Browser access |
| `inventory_locations` | `location.read` + required `branch_id` + parent Warehouse scope | ไม่มี direct Browser write | Location audit ผ่าน approved audit read model |
| `inventory_receive_batches` | `inventory_batch.read` + branch scope | Browser ไม่มี INSERT/UPDATE/DELETE; future server boundary ตรวจ `inventory.receive` | Batch status/result อยู่ใน Inventory audit trail |
| `inventory_receive_batch_items` | inherit `inventory_batch.read` + batch/branch/tenant match | Browser ไม่มี direct write | Item details เปิดผ่าน Batch audit/read model ตาม permission |
| `inventory_movements` | `inventory_movement.read` + branch scope | Browser ไม่มี INSERT/UPDATE/DELETE; future receive boundary insert เท่านั้น | `inventory_audit.read` ผ่าน read model; raw ledger immutable |
| Private audit/idempotency data | ไม่มี direct Browser select | ไม่มี Browser write | อ่านผ่าน approved view/function ที่ตรวจ `inventory_audit.read` |

### 3.2 Policy Predicate Rules

- ทุก policy ใช้ `TO authenticated`
- ห้ามใช้ `TO authenticated` โดยไม่มี Organization/Permission predicate
- Organization catalog policy ใช้ Organization membership + `product.read`/`sku.read`
- Branch tables ใช้ `private.has_org_permission(organization_id, permission_code, branch_id)` หรือ approved equivalent
- Branch ID ต้องมาจาก row ที่ถูก constraint แล้ว ห้ามรับ Branch ID จาก Client เป็น authorization authority
- Warehouse/Location/Batch/Movement policies ต้อง filter `organization_id` และ `branch_id`
- Policy helper ต้องตรวจ `(select auth.uid())`, membership status, organization status และ member branch assignment
- RLS helper ใช้ private schema, fixed search path และ explicit execute grants เท่านั้น
- ไม่สร้าง INSERT/UPDATE/DELETE policies ให้ `anon` หรือ `authenticated` สำหรับ Batch/Item/Movement
- Read view สำหรับ Balance/Movement ต้องเป็น security-invoker view หรือ private/non-exposed view

---

## 4. Branch Scope Contract

Warehouse ต้องผูก Branch แบบ Required ตาม Approval:

- `warehouses.branch_id` not null
- Warehouse ต้องอยู่ Organization เดียวกับ Branch
- Location สืบทอด Organization และ Branch จาก Warehouse
- Receive Batch ต้องมี required `branch_id`
- ทุก Batch Item ต้องอ้าง Location ใน Branch เดียวกับ Batch
- Movement ต้องบันทึก required `branch_id` เป็น immutable scope snapshot
- T4 Batch หนึ่งรายการรับได้เฉพาะ Location ภายใน Branch เดียว
- Multi-Branch Receive ใน Batch เดียวอยู่นอกขอบเขต T4

Authorization behavior:

- Organization-scoped member ผ่านได้ทุก Branch ใน Organization เมื่อ Role scope เป็น Organization
- Branch-scoped memberผ่านได้เฉพาะ Branch ที่อยู่ใน `member_branches`
- `inventory.receive` ต้องตรวจด้วย Batch Branch
- Product/SKU read เป็น Organization catalog แต่ Receive ยังถูกจำกัดด้วย Branch
- เปลี่ยน Warehouse ใน T4.3 ต้อง clear Location ที่ไม่อยู่ Warehouse/Branch เดิม

RLS performance:

- เก็บ `branch_id` บน Warehouse/Location/Batch/Batch Item/Movement เพื่อลด deep joins ใน policy
- Index equality columns `organization_id`, `branch_id` ก่อน range/order columns
- หลีกเลี่ยง policy ที่ join หลาย table ต่อทุก row หากใช้ constraint-backed branch snapshot ได้

---

## 5. Composite Tenant-Safe Foreign Keys

ทุก parent ต้องมี matching unique key ก่อน child FK

| Child | Composite FK | Parent Unique Requirement | Purpose |
|---|---|---|---|
| Warehouse | `(branch_id, organization_id)` | Branch `(id, organization_id)` | ห้าม Warehouse อ้าง Branch คนละ Tenant |
| Location | `(warehouse_id, organization_id, branch_id)` | Warehouse `(id, organization_id, branch_id)` | ล็อก Tenant + Branch + Warehouse |
| SKU | `(product_id, organization_id)` | Product `(id, organization_id)` | ห้าม SKU อ้าง Product ข้าม Tenant |
| Receive Batch Item | `(batch_id, organization_id, branch_id)` | Batch `(id, organization_id, branch_id)` | Item อยู่ Batch/Branch เดียวกัน |
| Receive Batch Item | `(sku_id, organization_id)` | SKU `(id, organization_id)` | SKU อยู่ Tenant เดียวกัน |
| Receive Batch Item | `(location_id, organization_id, branch_id)` | Location `(id, organization_id, branch_id)` | Location อยู่ Tenant/Branch เดียวกับ Batch |
| Movement | `(batch_id, organization_id, branch_id)` | Batch `(id, organization_id, branch_id)` | Movement ผูก Batch scope |
| Movement | `(batch_item_id, organization_id, branch_id)` | Batch Item `(id, organization_id, branch_id)` | Movement ผูก Input row ที่ถูกต้อง |
| Movement | `(sku_id, organization_id)` | SKU `(id, organization_id)` | Movement ห้ามอ้าง SKU ข้าม Tenant |
| Movement | `(location_id, organization_id, branch_id)` | Location `(id, organization_id, branch_id)` | Movement ห้ามอ้าง Location ข้าม Branch |

Additional FK rules:

- FK columns ทุกชุดต้องมี supporting index ตาม query/delete behavior
- ใช้ `ON DELETE RESTRICT` สำหรับ Product/SKU/Warehouse/Location/Batch/Movement เพื่อรักษา ledger history
- ห้าม cascade delete เข้า Movement Ledger
- Actor FK ใช้ `ON DELETE RESTRICT` หรือ approved retention behavior; ห้ามทำลาย audit identity
- Remote reconciliation ต้องยืนยันว่า Branch มี unique `(id, organization_id)` ก่อนออก Migration

---

## 6. Unique Constraints และ Index Plan

### 6.1 Required Unique Constraints

| Object | Constraint |
|---|---|
| Product tenant identity | `unique (id, organization_id)` |
| SKU code | `unique (organization_id, sku_code)` หลัง canonical normalization |
| SKU tenant identity | `unique (id, organization_id)` |
| Warehouse code | `unique (organization_id, code)` |
| Warehouse branch identity | `unique (id, organization_id, branch_id)` |
| Location code | `unique (warehouse_id, code)` |
| Location branch identity | `unique (id, organization_id, branch_id)` |
| Batch idempotency | `unique (organization_id, batch_type, idempotency_key)` |
| Batch branch identity | `unique (id, organization_id, branch_id)` |
| Batch item identity | `unique (id, organization_id, branch_id)` |
| Duplicate item guard | `unique (batch_id, sku_id, location_id)` |
| Movement per batch item | `unique (batch_item_id)` |

### 6.2 Required Checks

- Warehouse/Location/Batch/Item/Movement `branch_id` not null
- SKU code และ Warehouse/Location code ต้องผ่าน canonical format ที่อนุมัติ
- Quantity > 0
- Base unit/precision ตรง SKU policy
- Initial receive uses approved `movement_type`
- Request hash เป็น canonical SHA-256 format หรือ approved equivalent
- Batch status/committed timestamp consistent
- Draft/Inactive/Virtual/Preassembled stockability ถูกตรวจที่ transaction boundary; static checks ใช้เฉพาะเมื่อไม่ต้อง join table

### 6.3 Index Access Paths

- Product: `(organization_id, status)`
- SKU: `(organization_id, product_id, status)`
- Warehouse: `(organization_id, branch_id, status)`
- Location: `(organization_id, branch_id, warehouse_id, status)`
- Batch list: `(organization_id, branch_id, created_at desc, id)`
- Batch item lookup: `(batch_id)` และ `(organization_id, branch_id, sku_id, location_id)`
- Movement ledger: `(organization_id, branch_id, sku_id, location_id, occurred_at, id)`
- Movement by Batch: `(batch_id, batch_item_id)`
- RLS membership/branch lookup: ยืนยัน index ของ member organization/user/status และ `member_branches(membership_id, branch_id)` ใน remote reconciliation

Index plan ต้องตรวจด้วย query plan หลัง Implement; T4.2 ยังไม่สร้าง index จริง

---

## 7. Movement Immutability Plan

ใช้ defense in depth หลายชั้น:

1. Movement เป็น append-only ledger
2. `anon` และ `authenticated` ไม่มี INSERT/UPDATE/DELETE grants
3. ไม่มี Browser write RLS policies
4. Future receive transaction เป็นช่องทาง insert เดียวที่ได้รับอนุมัติ
5. เพิ่ม database guard ใน Migration ภายหลังเพื่อ reject UPDATE/DELETE แม้ privileged application codeเรียกผิด
6. Correction/Cancel/Return ต้องสร้าง compensating/reversal Movement ใหม่ ห้ามแก้ Movement เดิม
7. `organization_id`, `branch_id`, `sku_id`, `location_id`, `batch_id`, `batch_item_id`, quantity, unit, actor และ timestamps เป็น immutable
8. Delete parent entity ใช้ RESTRICT เพื่อรักษา ledger history
9. Audit บันทึก batch command/result แต่ไม่เก็บ Token หรือข้อมูลเกินจำเป็น

Service role ไม่ถือเป็น browser authorization และห้าม expose ใน `NEXT_PUBLIC_*` หรือ Client bundle

---

## 8. Browser Role Restrictions

| Role | Allowed | Denied |
|---|---|---|
| `anon` | ไม่มี Domain table access | SELECT/INSERT/UPDATE/DELETE/Function execute ทั้งหมดของ T4 |
| `authenticated` | SELECT เฉพาะ object ที่ explicit grant + RLS permission ผ่าน | Direct INSERT/UPDATE/DELETE บน Batch/Item/Movement/Idempotency/Audit |
| Browser client | เรียก read model ที่อนุมัติ | service role key, raw private schema, direct receive write |
| Server trusted path ใน Part ถัดไป | เรียก approved transaction boundary หลังตรวจ user/session/permission | bypass business validation หรือเชื่อ actor/org/branch จาก client |
| `service_role` | ใช้เฉพาะ trusted server environment | ห้ามส่งไป Browser หรือใช้แทน RLS authorization โดยไม่มี explicit checks |

Grants plan:

- Revoke default access ก่อน explicit grant
- Public domain tables grant SELECT เฉพาะ `authenticated` เมื่อมี RLS ครบ
- No table write grant สำหรับ Browser roles
- Private schema revoke usage/access จาก Browser roles
- Future function execute grant ต้องระบุ role เฉพาะและ revoke จาก `PUBLIC`

---

## 9. Cross-Tenant Error Behavior

เป้าหมายคือป้องกัน enumeration และข้อมูลรั่ว:

| Situation | Behavior |
|---|---|
| SKU/Location/Warehouse ID ไม่มีจริง | Generic `resource_not_found_or_not_accessible` |
| ID มีจริงแต่เป็น Tenant/Branch อื่น | Error เดียวกับ not found |
| Actor ไม่เป็นสมาชิก Organization | Generic organization access denied; ไม่ตรวจ/เปิดเผย resource ต่อ |
| Actor เป็นสมาชิกแต่ไม่มี `inventory.receive` | `inventory_receive_forbidden` หลังยืนยัน Organization context แล้ว |
| Idempotency key เดิมใน Tenant อื่น | มองไม่เห็นและไม่ conflict ข้าม Tenant |
| Key เดิมใน Tenant เดิม + hash ต่าง | Deterministic idempotency conflict โดยไม่คืน payload เดิม |
| Concurrent batch conflict | Generic retryable conflict; ไม่เปิด lock/internal schema detail |
| Direct Browser write | Permission denied; API layer ภายหลัง map เป็น stable domain response |

Validation order:

1. Authenticated session
2. Organization membership/status
3. Permission + Branch scope
4. Resource lookup constrainedด้วย Organization/Branch
5. Business validation
6. Idempotency/transaction execution

Log ภายในอาจเก็บ diagnostic code และ correlation ID แต่ response ห้ามคืน foreign organization/branch identifiers

---

## 10. T4.2A Remote Schema Reconciliation — SELECT-only Plan

### 10.1 Approval State

- ยังไม่มีการเชื่อมต่อ Remote Database และยังไม่มี Metadata Query ถูก execute
- Environment ที่แนะนำให้ตรวจเป็นลำดับแรกคือ **Preview**
- สถานะ Environment: **Pending Owner Approval**; คำว่า Preview ในเอกสารเป็น recommendation ไม่ใช่ authorization
- Production จะตรวจได้ต่อเมื่อ Owner ระบุ Production อย่างชัดเจน พร้อมยืนยันเหตุผลและ access path แบบ read-only
- หากไม่มี Preview ให้หยุดและขอ Owner ตัดสินใจ ห้ามสลับไป Production เอง
- แผนฉบับเต็ม: `docs/AVENZO_ONE_Phase_T4_2A_Remote_Schema_Reconciliation_Plan.md`

### 10.2 Reconciliation Scope

ตรวจเฉพาะ metadata ของ schemas, tables/views, columns, constraints, indexes, RLS flags/policies, grants, function signatures/security attributes, triggers และ migration identifiers ที่เกี่ยวข้องกับ Foundation และ T4 เท่านั้น

ห้ามอ่าน:

- Row data จาก Product, SKU, Warehouse, Location, Inventory, Order, CRM, User หรือ Domain table ใด ๆ
- `auth.users`, identity/profile records, customer data หรือ PII
- Vault, environment variables, connection strings, API keys, tokens หรือ Secret
- Logs, SQL text ของ active sessions, Storage object data หรือ function source body
- Function execution, DDL/DML, migration apply/pull/push หรือ advisor auto-fix

Metadata Query allowlist และ output classification อยู่ใน T4.2A; ทุก query เป็น draft เพื่อรอ Owner อนุมัติ Environment ก่อน

### 10.3 Pre-Implementation Gates

| Gate | Requirement | Current State |
|---|---|---|
| G1 | PM รับรอง Role Assignment Matrix และ Separation of Duties | Prepared — pending gate acceptance |
| G2 | Owner ระบุ Environment ที่อนุญาต: Preview แนะนำ หรือ Production แบบ explicit | Pending Owner Approval |
| G3 | Owner/Platform Owner อนุมัติ read-only access path โดยไม่ส่ง Secret ในแชท | Pending |
| G4 | Metadata Query allowlist และ no-PII/no-Secret boundary ได้รับอนุมัติ | Prepared in T4.2A — pending |
| G5 | T4.2A reconciliation ถูก execute และจัด drift เป็น match/missing/extra/conflict/unknown | Not started |
| G6 | PM review Drift Report และปิด conflict/unknown ก่อน implementation | Not started |

ห้ามเริ่ม Migration, RPC, API หรือ Test Code จนกว่า G1–G6 ผ่านและมีคำสั่ง PM แยก


---

## 11. Risks และ Stop Gates

### Risks

1. Remote schema drift อาจทำให้ Migration ชน object ที่ไม่อยู่ใน Git
2. Existing `private.has_org_permission` ต้อง review search path, execute grants และ performance ก่อน reuse
3. Branch snapshot columns อาจ drift หากไม่มี Composite FK ครบ
4. RLS policy ที่ join ลึกอาจช้าเมื่อ Movement โต
5. Grant SELECT โดยไม่มี RLS หรือ policy ที่ใช้เพียง `TO authenticated` เสี่ยง BOLA/IDOR
6. Service role ใน Browser ทำให้ RLS protections ใช้ไม่ได้ตามเจตนา
7. View ที่ไม่เป็น security-invoker อาจ bypass underlying RLS
8. Missing FK indexes ทำให้ parent update/delete และ joins scan table
9. Movement guard ที่ป้องกันเฉพาะ Browser ไม่พอสำหรับ privileged code
10. Error ที่แยก foreign/not-found ทำให้ enumerate SKU/Location ข้าม Tenant

### Stop Gates ก่อน T4.3/T4.4

- Role Assignment Matrix/Separation of Duties ยังไม่ผ่าน Gate G1
- Owner ยังไม่อนุมัติ Environment/read-only access หรือ Remote reconciliation ยังไม่ผ่าน
- Branch composite FK chain ยังไม่ครบ
- Movement direct-write denial/immutability plan ยังไม่อนุมัติ
- RLS matrix ยังไม่มี owner และ testable acceptance criteria
- Error behavior ยังไม่ล็อก
- Data API exposure/default grants ยังไม่ยืนยัน

---

## 12. Acceptance Criteria ของ T4.2 Plan

- Permission codes ครบ Product/SKU/Warehouse/Location/Batch/Movement/Receive/Audit
- Role Assignment Matrix ใช้ least privilege และแยก Receiver/Auditor เป็นค่าเริ่มต้น
- RLS matrix แยก Read/Receive/Audit ชัดเจน
- Warehouse ผูก Branch แบบ Required ทุก access path
- Composite FK ป้องกัน cross-tenant และ cross-branch reference
- Unique constraints ครบ SKU, Warehouse, Location, Batch idempotency, Batch item และ Movement
- Browser roles ไม่มี direct receive/movement write
- Movement immutable และ correction ใช้ compensating entry
- Cross-tenant error ไม่เปิดเผย resource existence
- Remote reconciliation มี SELECT-only procedure, Metadata Query allowlist, no-PII/no-Secret boundary และ stop-on-conflict
- Environment แนะนำ Preview แต่ยังไม่ถือว่าอนุมัติจนกว่า Owner ระบุอย่างชัดเจน
- ไม่มี Migration/RPC/API/Test Code ถูกสร้างใน T4.2

---

## 13. References

- Supabase Row Level Security: `https://supabase.com/docs/guides/database/postgres/row-level-security`
- Supabase Securing the Data API: `https://supabase.com/docs/guides/api/securing-your-api`
- Supabase Database Functions Security: `https://supabase.com/docs/guides/database/functions`
- PostgreSQL Constraints: `https://www.postgresql.org/docs/current/ddl-constraints.html`
- PostgreSQL Row Security: `https://www.postgresql.org/docs/current/ddl-rowsecurity.html`

---

## 14. Next Action

1. PM/Owner รับรอง Role Assignment Matrix โดยเฉพาะ Separation of Duties และ operational exceptions
2. Owner ระบุว่าจะอนุญาตให้ตรวจ **Preview (แนะนำ)** หรือ **Production**
3. Owner/Platform Owner อนุมัติ read-only access path และ Metadata Query allowlist ใน T4.2A
4. หลังได้รับอนุมัติ Environment จึง execute T4.2A แบบ SELECT-only และส่ง Drift Report
5. PM ปิดรายการ `conflict`/`unknown` ก่อนอนุญาต implementation

**สถานะสุดท้าย:** Approved Plan — Pending Pre-Implementation Gates; หยุดรอ Owner/PM ไม่มี Remote Connection, Migration, RPC, API, Test Code, Code Change, Commit หรือ Push


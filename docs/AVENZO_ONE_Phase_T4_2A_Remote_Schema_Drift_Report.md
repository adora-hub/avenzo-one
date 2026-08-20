# AVENZO ONE — Phase T4.2A Remote Schema Drift Report

**สถานะ:** Q01–Q14 Completed — Known SKU Conflict Retained — Pending PM Review  
**วันที่ตรวจ:** 20 สิงหาคม 2026  
**Environment ที่ Owner อนุมัติ:** Preview  
**Project ที่ยืนยันผ่าน Supabase MCP:** AVENZO ONE PREVIEW  
**Project Status ขณะตรวจ:** ACTIVE_HEALTHY  
**Parent Plan:** docs/AVENZO_ONE_Phase_T4_2A_Remote_Schema_Reconciliation_Plan.md  
**Contract:** docs/AVENZO_ONE_Phase_T4_2_Permission_RLS_Constraints_Plan.md — Approved Plan, Pending Pre-Implementation Gates  
**Data Handling:** รายงานนี้บันทึกเฉพาะ metadata summary; ไม่มี Secret, Connection String, API key, Token, PII หรือ Domain row data

---

## 1. Executive Result

Supabase MCP authentication สำเร็จและยืนยันเป้าหมายเป็น Project **AVENZO ONE PREVIEW** ก่อนรัน SQL โดยไม่ได้เชื่อม Project **AVENZO ONE** ซึ่งเป็น Production

รันเฉพาะ Metadata/Catalog SELECT ตาม allowlist Q01–Q14:

- Q01–Q08 รันในรอบแรกและหยุดเมื่อพบ SKU permission conflict
- PM ยืนยันว่า sku.read เป็น Permission Authority และอนุมัติให้รัน Q09–Q14 ต่อ
- Q09–Q14 รันบน AVENZO ONE PREVIEW เท่านั้น
- ไม่พบ conflict ใหม่ที่ต้องหยุดก่อน Q14
- Known conflict ยังคงเดิม: Remote SKU SELECT policy ใช้ product.read แทน approved sku.read
- Product และ Warehouse ยังคงเป็น extra เพราะมีบน Remote แต่ไม่มี tracked migration ใน branch ปัจจุบัน

ไม่มี DDL, DML, RPC, Migration Apply, db push, db pull, advisor auto-fix, Test Code, Commit หรือ Push

---

## 2. Environment and Authentication Evidence

| Check | Result | Status |
|---|---|---|
| Supabase MCP authentication | Management calls สำเร็จ | match |
| Project name | AVENZO ONE PREVIEW | match |
| Environment | Preview ตาม Owner approval | match |
| Project health | Active/healthy ขณะตรวจ | match |
| Production isolation | ไม่เรียก SQL กับ Project AVENZO ONE | match |
| Secret handling | ไม่อ่านหรือแสดง .env, key, token หรือ connection string | match |
| SQL boundary | ส่งเฉพาะ Metadata/Catalog SELECT ใน Q01–Q14 | match |
| Session read-only flag | Q01 รายงาน transaction_read_only = off; execution ถูกจำกัดด้วย approved SELECT statements และไม่มี write statement | unknown-risk |

Project reference, database host และ connection details ไม่ถูกบันทึกในรายงานนี้เพื่อลด metadata exposure

---

## 3. Query Execution Ledger

| Query | Purpose | Execution | Result |
|---|---|---|---|
| Q01 | Environment fingerprint/read-only state | Completed | Engine context confirmed; session flag not forced read-only |
| Q02 | Schema existence | Completed | auth, private, public, supabase_migrations present |
| Q03 | Foundation/T4 object inventory | Completed | Foundation + Product/SKU/Warehouse found; named Location/Batch/Item/Movement not found |
| Q04 | Column metadata | Completed | Column definitions reviewed; no row data read |
| Q05 | PK/FK/Unique/Check metadata | Completed | Tenant-safe Product/SKU/Warehouse keys found |
| Q06 | Index metadata | Completed | Supporting Foundation/Product/SKU/Warehouse indexes found |
| Q07 | RLS flags | Completed | All returned public tables have RLS enabled; force RLS is off |
| Q08 | Policy metadata | Completed | Known SKU permission conflict retained |
| Q09 | Table/view grants | Completed | T4 Product/SKU/Warehouse grant SELECT to authenticated; no anon grants returned |
| Q10 | Function security metadata | Completed | private.has_org_permission metadata inspected without reading function body |
| Q11 | Trigger metadata | Completed | Product/SKU/Warehouse and Foundation trigger definitions summarized |
| Q12 | Routine grants | Completed | has_org_permission EXECUTE granted to authenticated only among queried browser roles |
| Q13 | Migration identifiers | Completed | Read only version/name; no SQL statements or rollback payload read |
| Q14 | Extension metadata | Completed | Names/versions/schema only; no extension data read |

No Remote query outside Q01–Q14 was executed.

---

## 4. Classification Rules

รายงานใช้ precedence ต่อ object ดังนี้:

1. conflict — definition/security behavior ขัด Approved Contract
2. extra — Remote มี object/migration แต่ tracked branch ไม่มี
3. missing — Approved T4 Contract ต้องใช้แต่ชื่อ object ที่กำหนดไม่มี
4. unknown — allowlist ไม่พอพิสูจน์ definition หรือผลถูกจำกัดด้านความปลอดภัย
5. match — metadata dimensions ที่ตรวจตรงกับ tracked foundation/approved contract

สถานะ match ไม่หมายถึงการอนุมัติ implementation และไม่อนุญาตให้แก้ Remote

---

## 5. Object Drift Matrix

| Object | Remote Evidence | Tracked/Approved Expectation | Status | Notes |
|---|---|---|---|---|
| public.organizations | Table, PK, constraints, RLS และ scoped policies present | Existing foundation | match | Foundation table grants มี risk แยกใน Section 10 |
| public.branches | Table, PK, tenant unique key, RLS และ branch policies present | Existing foundation; tenant-safe parent key required | match | Remote key order (organization_id, id) ใช้งาน tenant-safe ได้ |
| public.organization_members | Table, membership constraints/indexes, RLS present | Existing foundation | match | Q09 returned authenticated SELECT |
| public.member_branches | Composite PK, branch index และ RLS present | Branch assignment foundation | match | Supporting branch lookup index present |
| public.permissions | Permission catalog table, PK และ RLS present | Permission foundation | match | ไม่อ่าน permission rows |
| public.products | Table, tenant key/FK, checks, indexes, RLS, grants and triggers present | Product required by T4; absent from tracked migrations on current branch | extra | Definition Summary ใน Section 7 |
| public.skus | Table, tenant-safe Product FK, unique SKU code, indexes, RLS, grants and triggers present | Approved read authority is sku.read; absent from tracked migrations | conflict | Policy uses product.read; conflict takes precedence over extra |
| public.warehouses | Table; branch required; tenant-safe Branch FK; indexes, RLS, grants and triggers present | Warehouse required/Branch required; absent from tracked migrations | extra | Definition Summary ใน Section 8 |
| public.inventory_locations | Not returned by Q03–Q12 | Required Location object name in Approved T4 Contract | missing | Remote migration names indicate warehouse/location work but allowlist did not prove this exact object |
| public.inventory_receive_batches | Not returned | Required Batch Receive aggregate | missing | No batch/idempotency boundary found under approved name |
| public.inventory_receive_batch_items | Not returned | Required Multi-SKU item inputs | missing | No item uniqueness/FK checks available |
| public.inventory_movements | Not returned | Required immutable movement ledger | missing | Migration name indicates inventory ledger work, but exact object absent from Q03 result |
| Batch idempotency record/object | Not conclusively identified | Required idempotency key/hash/result fields | unknown | Approved query list did not establish a concrete object |
| Inventory audit/read model | Not conclusively identified | Required audit access boundary | unknown | Q09–Q12 covered only named T4/Foundation objects and has_org_permission |
| private.has_org_permission | SECURITY DEFINER, stable, fixed search_path, private schema, restricted ACL | Approved helper candidate | match-with-risk | Function body/auth.uid check intentionally not read; search_path includes public |
| Warehouse default-location behavior | Trigger metadata present | Must integrate with approved Location contract | extra | Automatic create/enforce behavior was not present in tracked branch |

---

## 6. Permission, RLS and Grants

| Area | Remote Metadata | Approved T4.2 Contract | Status |
|---|---|---|---|
| Product read | Product SELECT policy uses product.read | product.read | match |
| SKU read | SKU SELECT policy uses product.read | sku.read | conflict |
| Warehouse read | Warehouse SELECT policy uses warehouse.read + row branch_id | warehouse.read + Branch scope | match |
| Location read | Named Location table/policy not found | location.read | missing |
| Batch read | Named Batch table/policy not found | inventory_batch.read | missing |
| Movement read | Named Movement table/policy not found | inventory_movement.read | missing |
| Receive | No approved receive boundary found | inventory.receive; no browser direct write | missing |
| Inventory audit | Not established by approved query scope | inventory_audit.read | unknown |
| RLS enablement | Every table returned by Q07 has RLS enabled | Exposed tables require RLS | match |
| Product Browser grants | authenticated SELECT only; no anon grant returned | Read only | match |
| SKU Browser grants | authenticated SELECT only; no anon grant returned | Read only, gated by sku.read | conflict at policy layer |
| Warehouse Browser grants | authenticated SELECT only; no anon grant returned | Read only + Branch scope | match |
| private.has_org_permission execute | authenticated EXECUTE; no anon/PUBLIC row returned | Explicit narrow execute grant | match |
| Browser Service Role | Metadata inspected only; no browser use occurred | Service Role prohibited in Browser | match-operational |

### Known Conflict: SKU Permission Authority

PM Decision:

- sku.read remains the Permission Authority
- Remote SKU policy using product.read remains conflict
- No Remote fix is authorized

Observed metadata:

- Object: public.skus
- Policy: skus_permission_select
- Command/role: SELECT to authenticated
- Authorization helper receives product.read

Risk:

- A user granted only product.read can potentially read SKU rows despite not receiving sku.read
- Role Assignment Matrix cannot enforce independent SKU visibility
- Future T4 receive roles may receive broader catalog visibility than approved

**Recommendation retained:** Future approved reconciliation must change the SKU policy to sku.read rather than weaken the Approved Contract. This report does not implement that change.

---

## 7. Product Definition Summary — extra

### Columns

- Identity/tenant: id UUID primary identity; organization_id UUID required
- Business: name required; description optional; status default draft
- Classification: category_id and brand_id optional; structure_type default standard
- Internal: internal_note optional
- Audit/version: created_by, updated_by, created_at, updated_at, version default 1
- Approved status values visible in metadata: draft, active, archived
- Approved structure values visible in metadata: standard, variant, bundle

### Integrity

- Primary key on id
- Tenant identity unique on (organization_id, id)
- Organization FK uses delete restrict
- Category and Brand use composite tenant-safe FKs
- Actor FKs target auth.users with delete restrict
- Checks enforce trimmed name/description/internal note and version >= 1

### Indexes

- Organization/status/updated-time list path
- Partial tenant indexes for Category and Brand when not null
- Actor indexes for created_by and updated_by
- Unique tenant identity index

### Security

- RLS enabled; force RLS off
- SELECT policy checks product.read through private.has_org_permission
- authenticated has SELECT only among returned grants
- No anon grant returned

### Triggers

- prepare_product_write before insert/update
- prevent_product_delete before delete
- increment version before update

### Drift Status

extra — Remote schema and migration history contain Product implementation but current tracked branch does not contain its creating migration

---

## 8. Warehouse Definition Summary — extra

### Columns

- Identity/tenant/branch: id UUID, organization_id UUID required, branch_id UUID required
- Business: code and name required; status default active
- Audit/version: created_by, updated_by, created_at, updated_at, version default 1
- Approved status values visible in metadata: active, inactive, archived

### Integrity

- Primary key on id
- Tenant/Branch FK: (organization_id, branch_id) references branches (organization_id, id) with delete restrict
- Tenant/Branch identity unique on (organization_id, branch_id, id)
- Warehouse code unique within Organization
- Organization and actor FKs use delete restrict
- Checks enforce canonical uppercase code, trimmed name and version >= 1
- branch_id is NOT NULL, matching Approved T4.1 required Branch decision

### Indexes

- Organization/Branch/status/updated-time list path
- Unique Organization/code
- Unique Organization/Branch/id
- Actor indexes for created_by and updated_by

### Security

- RLS enabled; force RLS off
- SELECT policy checks warehouse.read with row branch_id
- authenticated has SELECT only among returned grants
- No anon grant returned

### Triggers

- prepare_warehouse_write before insert/update
- create_default_warehouse_location after insert
- enforce_warehouse_default_from_warehouse as deferred constraint trigger
- prevent_nonzero_warehouse_archive before update
- prevent_warehouse_delete before delete
- increment version before update

### Integration Impact

- Automatic default-location creation/enforcement must be reconciled with the approved inventory_locations contract before T4 implementation
- Trigger function bodies were not read or executed
- Exact target Location object remains unknown under the approved query allowlist

### Drift Status

extra — Remote schema and migration history contain Warehouse/Location implementation but current tracked branch does not contain its creating migration

---

## 9. Function and Trigger Security Summary

### private.has_org_permission

- Schema: private
- Signature: organization UUID, permission code text, optional Branch UUID
- SECURITY DEFINER: true
- Volatility: stable
- Fixed search_path metadata: public, pg_catalog
- ACL metadata: postgres owner and authenticated EXECUTE
- Q12 confirms authenticated EXECUTE is not grantable
- No anon/PUBLIC execute row returned
- Function source body was not read and function was not invoked

Risk:

- Including public in SECURITY DEFINER search_path is less strict than an empty search_path with fully-qualified objects
- Q10 cannot prove the function performs an explicit auth.uid caller check because function source was intentionally excluded
- Treat caller identity validation as unknown until a separately approved, non-sensitive review method exists

### Trigger Definitions

Q11 returned only trigger metadata. No trigger was executed. Product and Warehouse trigger summaries are in Sections 7–8. SKU triggers include write preparation, SKU-code immutability, nonzero-inventory archive guard, delete prevention, identifier registry sync and version increment.

---

## 10. Grant Risks Outside T4 Domain Tables

Q09 returned no anon grants for queried objects and authenticated received only SELECT on Product/SKU/Warehouse.

Foundation metadata also showed authenticated table-level privileges beyond SELECT on selected Foundation tables:

- organizations and branches: INSERT, UPDATE, REFERENCES, TRIGGER, TRUNCATE plus SELECT
- permissions: REFERENCES, TRIGGER, TRUNCATE plus SELECT
- member tables: SELECT in the returned scope

These grants are not a new T4 Product/SKU/Warehouse conflict because the Foundation has its own approved policies and scope, but they are a least-privilege risk:

- TRUNCATE is table-level and is not a row-scoped operation
- REFERENCES/TRIGGER are not required for ordinary browser reads
- A separate Foundation security review should confirm whether these grants are intentional and reachable through any client path

No grant was changed or revoked.

---

## 11. Migration Identifier Drift — Q13

Q13 read only migration version and name. It did not read statements, rollback payload, created_by or idempotency values.

Relevant Remote migration names include:

- phase_2_0_3_2_product_sku_schema
- phase_2_0_3_3_warehouse_location_schema
- phase_2_0_3_4_inventory_ledger_balance
- phase_2_0_3_5_permission_rls_security
- phase_2_0_4_server_application_foundation
- phase_2_0_6_warehouse_command_trigger_security
- later Product/Variant domain migrations through Phase 2.1

Current tracked branch has no migration creating Product, SKU, Warehouse, Location or Inventory Movement objects. Therefore Preview migration history is materially ahead of Git.

Classification:

- Remote Phase 2 Product/Warehouse/Inventory migrations: extra
- Exact mapping from migration names to current object definitions: unknown because migration SQL body was intentionally not read
- SKU policy authority mismatch: conflict
- Migration collision risk for future T4 implementation: high

No db pull, migration repair or alternative synchronization method was used.

---

## 12. Extension Metadata — Q14

| Extension | Version | Schema | Status |
|---|---|---|---|
| pg_stat_statements | 1.11 | extensions | match-metadata |
| pgcrypto | 1.3 | extensions | match-metadata |
| plpgsql | 1.0 | pg_catalog | match-metadata |
| supabase_vault | 0.3.1 | vault | match-metadata |
| uuid-ossp | 1.1 | extensions | match-metadata |

Only extension names, versions and schemas were read. No Vault content, Secret or extension-owned data was queried.

---

## 13. Risks

1. SKU policy conflicts with the approved sku.read Permission Authority.
2. Preview is ahead of tracked Git for Product/SKU/Warehouse/Location/Inventory migrations.
3. Creating T4 migrations without reconciling Remote migration ownership may collide with existing objects/triggers.
4. Warehouse auto-creates/enforces a default location whose exact table contract is not established by the allowlist.
5. Foundation authenticated grants include table-level privileges broader than ordinary browser needs.
6. private.has_org_permission is SECURITY DEFINER and includes public in search_path; body-level caller validation remains unknown.
7. Q01 showed transaction_read_only off even though only approved SELECT statements were submitted.
8. Named inventory_locations and inventory_movements objects required by the contract were not returned despite Remote inventory migration identifiers.

---

## 14. Required PM Review

1. Accept the retained SKU conflict and keep sku.read as authority.
2. Decide ownership/source for Remote Phase 2 migrations that are absent from the branch.
3. Decide whether T4 contract should reuse/rename/reconcile the existing Warehouse default-location behavior.
4. Route broad Foundation grants to a separate security review without changing them in T4.2A.
5. Decide whether a new allowlist is required to identify the actual Location/Inventory object names and definitions.
6. Do not authorize T4 implementation until object ownership and migration drift are resolved.

---

## 15. Completion Record

Q01–Q14 are complete on AVENZO ONE PREVIEW under the approved allowlist. No new conflict was found after the retained SKU permission conflict.

**Final Status:** Remote Reconciliation Complete with Known Conflict and Extra Schema — Waiting for PM Review


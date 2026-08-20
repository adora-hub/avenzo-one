# AVENZO ONE — Phase T4.2B Baseline Reconciliation Report

**สถานะ:** Prepared — Pending PM Approval; No Implementation  
**วันที่:** 20 สิงหาคม 2026  
**Git Baseline:** codex/phase-2.1-products-workspace  
**Baseline Commit:** df53136f242916c5cf72236833c2034f849eecd6  
**Remote Environment:** AVENZO ONE PREVIEW only  
**Parent Reports:** docs/AVENZO_ONE_Phase_T4_2A_Remote_Schema_Drift_Report.md และ docs/AVENZO_ONE_Phase_T4_2_Permission_RLS_Constraints_Plan.md  
**Source of Truth:** docs/AVENZO_ONE_Phase_T_Initial_Stock_Integration.md  
**ข้อจำกัด:** Reconciliation/Corrective Migration Plan เท่านั้น; ไม่มี DDL, DML, RPC execution, Migration file, Production connection, Commit หรือ Push

---

## 1. Executive Decision

T4.2A เดิมเทียบ Preview กับ origin/main จึงจัด Product และ Warehouse เป็น extra และจัดชื่อ inventory_locations/inventory_movements เป็น missing

เมื่อเปลี่ยน baseline เป็น codex/phase-2.1-products-workspace ตาม PM Decision พบว่า:

- Product, SKU, Warehouse, Location และ Inventory schema มี migration ต้นทางอยู่ใน baseline จริง
- Preview tables, policies และ triggers ที่ตรวจตรงกับ Phase 2 migration family
- Product และ Warehouse ต้องเปลี่ยนจาก extra เป็น Existing
- Location ชื่อจริงคือ public.locations ไม่ใช่ public.inventory_locations
- Inventory Balance ชื่อจริงคือ public.inventory_balances
- Inventory Ledger และ Movement table ชื่อจริงคือ public.stock_movements
- Command/idempotency primitive ชื่อจริงคือ public.inventory_commands
- Multi-SKU Batch Receive header/items และ batch-level idempotency ยังไม่มี
- SKU policy ที่ใช้ product.read ตรงกับ baseline migration แต่ขัด Approved T4.2 Contract ที่กำหนด sku.read จึงเป็น True Contract Drift
- ห้ามสร้าง schema ซ้ำสำหรับ objects ที่ baseline มีอยู่แล้ว

---

## 2. Baseline Evidence

Baseline branch ยืนยันได้ใน Local Git:

- Branch: codex/phase-2.1-products-workspace
- Commit: df53136f242916c5cf72236833c2034f849eecd6
- Commit date: 2026-08-19
- Baseline ถูกอ่านด้วย git object inspection เท่านั้น
- ไม่มี checkout, merge, rebase, cherry-pick หรือ file mutation บน baseline branch

Relevant migration files:

1. supabase/migrations/20260813124837_phase_2_0_3_2_product_sku_schema.sql
2. supabase/migrations/20260813130312_phase_2_0_3_3_warehouse_location_schema.sql
3. supabase/migrations/20260813131250_phase_2_0_3_4_inventory_ledger_balance.sql
4. supabase/migrations/20260813132549_phase_2_0_3_5_permission_rls_security.sql
5. supabase/migrations/20260813135745_phase_2_0_4_server_application_foundation.sql
6. supabase/migrations/20260813162443_phase_2_0_6_warehouse_command_trigger_security.sql
7. supabase/migrations/20260815083258_phase_2_1_r5_product_domain_extension.sql
8. supabase/migrations/20260816103853_phase_2_1_a3_variant_data_model.sql
9. supabase/migrations/20260816105113_phase_2_1_a4_atomic_sales_code_allocator.sql
10. supabase/migrations/20260816163000_phase_2_1_b5_variant_trigger_privilege_fix.sql

Preview Q13 migration names contain corresponding Phase 2 names แม้ Remote version identifiers ถูก bridge/resequenced จึงห้ามเทียบ timestamp อย่างเดียว ต้องเทียบ migration name และ resulting metadata

---

## 3. Remote Safety Evidence

- Supabase MCP authentication สำเร็จ
- Project ยืนยันเป็น AVENZO ONE PREVIEW และสถานะ active/healthy ก่อน query
- ไม่เชื่อม AVENZO ONE Production
- ใช้เฉพาะ catalog/information_schema SELECT
- ไม่อ่าน Domain rows, Customer, Product data, Order, PII, Secret, Vault content หรือ .env
- ไม่ใช้ Service Role ใน Browser
- ไม่รัน DDL/DML/RPC, migration apply, db push, db pull หรือ auto-fix

---

## 4. Canonical Object Names

| Domain Concept | Approved T4 Planned Name | Baseline/Preview Actual Name | Decision |
|---|---|---|---|
| Product | products | public.products | Existing |
| SKU | skus | public.skus | Existing |
| Warehouse | warehouses | public.warehouses | Existing |
| Location | inventory_locations | public.locations | Rename/Reuse |
| Inventory Balance | not locked in T4.1 table list | public.inventory_balances | Existing/Reuse |
| Inventory Ledger | inventory_movements concept | public.stock_movements | Rename/Reuse |
| Movement | inventory_movements | public.stock_movements | Rename/Reuse |
| Single-SKU command envelope | idempotency record concept | public.inventory_commands | Existing/Reuse as lower-level primitive only |
| Inventory domain event | audit/event concept | public.inventory_domain_events | Existing/Reuse |
| Foundation command envelope | foundation command concept | public.foundation_commands | Existing |
| Foundation domain event | foundation audit/event concept | public.foundation_domain_events | Existing |
| Multi-SKU Batch header | inventory_receive_batches | none | Missing |
| Multi-SKU Batch item | inventory_receive_batch_items | none | Missing |
| Batch-level idempotency | batch idempotency record | none | Missing |

### Naming Decision

T4 Implementation must reuse baseline names:

- Use locations, not create inventory_locations
- Use stock_movements as immutable ledger/movement, not create inventory_movements
- Use inventory_balances as derived current balance
- Use inventory_commands/private posting primitive only as a lower-level single-SKU mechanism
- Do not rename existing tables in T4.2; document contract aliases instead
- New Batch objects may be introduced only after PM approves their relationship to existing inventory_commands

---

## 5. Preview Table-to-Migration Mapping

| Preview Table | Creating/Extending Baseline Migration | Preview Evidence | Classification |
|---|---|---|---|
| products | Phase 2.0.3.2; extended by Phase 2.0.4, R5 and later Phase 2.1 | Table, RLS, Product columns, version and triggers present | Existing |
| skus | Phase 2.0.3.2; extended by Phase 2.0.4, inventory guards, A3/A4 | Table, RLS, identifier/immutability triggers present | Existing + Contract Drift |
| warehouses | Phase 2.0.3.3; extended by Phase 2.0.4, inventory archive guard and Phase 2.0.6 | Required branch, RLS, default-location and archive/delete triggers present | Existing |
| locations | Phase 2.0.3.3; extended by Phase 2.0.3.4 and Phase 2.0.4 | Tenant/branch/warehouse columns, RLS and lifecycle triggers present | Existing; Rename/Reuse |
| inventory_commands | Phase 2.0.3.4 | Single SKU, source/destination, quantity, request_hash, status/result present | Existing/Reuse |
| stock_movements | Phase 2.0.3.4 | Immutable movement columns and guard triggers present | Existing; Rename/Reuse |
| inventory_balances | Phase 2.0.3.4 | Tenant/branch/location/SKU balance columns and guarded writes present | Existing/Reuse |
| inventory_domain_events | Phase 2.0.3.4; audit trigger from Phase 2.0.6 | Event table, immutable guards and audit trigger present | Existing/Reuse |
| foundation_commands | Phase 2.0.4 | Idempotent Foundation command envelope and mutation guards present | Existing |
| foundation_domain_events | Phase 2.0.4 | Immutable Foundation events and read policy present | Existing |

### Table Definition Match

Preview metadata confirms key column shapes from baseline:

- locations: organization_id, branch_id, warehouse_id, code, is_default, status and version
- inventory_commands: one sku_id, one quantity, source/destination locations, request_hash, processing/completed result
- stock_movements: organization/branch/warehouse/location/SKU, movement_type, quantity_delta, command sequence, actor and timestamps
- inventory_balances: organization/branch/warehouse/location/SKU, on_hand, allocated, available, version and last_movement_id
- inventory_domain_events: organization/branch, command, SKU, event, metadata and immutable timestamps

No duplicate schema is required for these concepts.

---

## 6. Preview Policy-to-Migration Mapping

All returned policies target authenticated and use permission helper predicates.

| Preview Policy | Baseline Source | Current Authority | T4.2 Authority | Classification |
|---|---|---|---|---|
| products_permission_select | Phase 2.0.3.5 | product.read | product.read | Existing/Match |
| skus_permission_select | Phase 2.0.3.5 | product.read | sku.read | True Drift |
| warehouses_permission_select | Phase 2.0.3.5 | warehouse.read + Branch | warehouse.read + Branch | Existing/Match |
| locations_permission_select | Phase 2.0.3.5 | warehouse.read + Branch | location.read + Branch | True Contract Drift |
| stock_movements_permission_select | Phase 2.0.3.5 | inventory.read + Branch | inventory_movement.read + Branch | True Contract Drift |
| inventory_balances_permission_select | Phase 2.0.3.5 | inventory.read + Branch | approved read model requires granular inventory authority | Decision Required |
| inventory_commands_permission_select | Phase 2.0.3.5 | helper using inventory.read by source/destination Branch | inventory_batch.read for Batch; existing command read is lower-level | Rename/Reuse + Decision |
| inventory_domain_events_permission_select | Phase 2.0.3.5 | inventory.read + Branch | inventory_audit.read for audit path | True Contract Drift |
| foundation_domain_events_permission_select | Phase 2.0.4 | product/sku share product.read; warehouse/location share warehouse.read | sku.read/location.read must be separable | True Contract Drift |

### Preview-to-Baseline Result

Preview policy definitions match the baseline migrations reviewed. Therefore the policies are not unexplained Remote drift.

### Baseline-to-Approved-Contract Result

The permission model in baseline is coarser than Approved T4.2:

- Product and SKU are grouped under product.read
- Warehouse and Location are grouped under warehouse.read
- Command, Movement, Balance and Event are grouped under inventory.read

These are Contract drifts, not missing schema.

---

## 7. SKU-Related Secondary Read Surfaces

Baseline and Preview also use product.read on SKU-related supporting tables:

- sku_product_profiles
- sku_sell_units
- sku_bundle_components
- sku_option_assignments
- sku_variant_images
- sku_identifier_registry
- sku_identifier_bindings

Other related decisions:

- sku_cost_profiles uses product.cost.read and should not be changed by the core sku.read correction
- product categories, brands, tags and option definitions remain Product-owned and should keep product.read
- sales code sequence/reservation/event tables currently use product.read but mix allocation operations with SKU identifiers; authority requires a separate PM decision
- product_domain_events mixes Product/SKU domain events and cannot be blindly switched to sku.read without an entity/event predicate design

The minimum correction for T4.2 is public.skus plus every read model that directly exposes SKU identity required by T4 receive. Expanded SKU-surface migration scope must be approved before implementation.

---

## 8. Preview Trigger-to-Migration Mapping

### Product

| Trigger | Baseline Migration | Result |
|---|---|---|
| prepare_product_write | Phase 2.0.3.2 | Existing |
| prevent_product_delete | Phase 2.0.3.2 | Existing |
| zz_increment_product_version | Phase 2.0.4 | Existing |

### SKU

| Trigger | Baseline Migration | Result |
|---|---|---|
| prepare_sku_write | Phase 2.0.3.2 | Existing |
| prevent_sku_delete | Phase 2.0.3.2 | Existing |
| prevent_nonzero_sku_archive | Phase 2.0.3.4 | Existing |
| zz_increment_sku_version | Phase 2.0.4 | Existing |
| enforce_sku_code_immutable | Phase 2.1 A3/A4 | Existing |
| sync_sku_identifier_registry | Phase 2.1 A4; privilege hardening in B5 fix | Existing |

### Warehouse and Location

| Trigger | Baseline Migration | Result |
|---|---|---|
| prepare_warehouse_write | Phase 2.0.3.3 | Existing |
| create_default_warehouse_location | Phase 2.0.3.3 | Existing |
| enforce_warehouse_default_from_warehouse | Phase 2.0.3.3; SECURITY DEFINER hardening Phase 2.0.6 | Existing |
| prevent_warehouse_delete | Phase 2.0.3.3 | Existing |
| prevent_nonzero_warehouse_archive | Phase 2.0.3.4 | Existing |
| zz_increment_warehouse_version | Phase 2.0.4 | Existing |
| prepare_location_write | Phase 2.0.3.3 | Existing |
| enforce_warehouse_default_from_location | Phase 2.0.3.3; function hardening Phase 2.0.6 | Existing |
| prevent_location_delete | Phase 2.0.3.3 | Existing |
| prevent_nonzero_location_archive | Phase 2.0.3.4 | Existing |
| zz_increment_location_version | Phase 2.0.4 | Existing |

### Inventory

| Trigger | Baseline Migration | Result |
|---|---|---|
| guard_inventory_movement_insert | Phase 2.0.3.4 | Existing |
| prevent_stock_movement_update_delete | Phase 2.0.3.4 | Existing/Immutable |
| guard_inventory_balance_write | Phase 2.0.3.4 | Existing |
| prevent_inventory_balance_delete | Phase 2.0.3.4 | Existing |
| guard_inventory_command_update | Phase 2.0.3.4 | Existing |
| prevent_inventory_command_delete | Phase 2.0.3.4 | Existing |
| guard_inventory_event_insert | Phase 2.0.3.4 | Existing |
| prevent_inventory_event_update_delete | Phase 2.0.3.4 | Existing/Immutable |
| audit_inventory_domain_event | Phase 2.0.6 | Existing |

Preview trigger set matches the baseline files reviewed. No unexplained trigger drift was found in T4 core objects.

---

## 9. Reconciliation Classification

### 9.1 Existing

- products
- skus
- warehouses
- locations
- inventory_commands
- stock_movements
- inventory_balances
- inventory_domain_events
- foundation_commands
- foundation_domain_events
- RLS enablement and authenticated SELECT grants
- Product/Warehouse/Inventory lifecycle and immutability triggers
- Existing single-SKU receive command type and inventory.receive server authorization

### 9.2 Rename/Reuse

| Planned Concept | Reuse |
|---|---|
| inventory_locations | public.locations |
| inventory_movements | public.stock_movements |
| Inventory Ledger | public.stock_movements |
| Inventory Balance | public.inventory_balances |
| Per-item stock receive primitive | public.inventory_commands + private.post_inventory_command under trusted server boundary |
| Inventory audit source | public.inventory_domain_events plus Organization audit trigger |

Rename/Reuse means update contract terminology and FK targets in future T4 plans; it does not authorize physical table rename.

### 9.3 Missing

- Multi-SKU receive batch header
- Multi-SKU receive batch items
- Batch-level unique idempotency key scoped by Organization/batch type
- Batch request hash/result/status that represents all SKU lines atomically
- Batch-to-movement correlation contract
- Multi-SKU transaction boundary that rolls back all lines together
- Batch-specific read/audit model
- Approved granular permission catalog entries: sku.read, location.read, inventory_batch.read, inventory_movement.read and inventory_audit.read

Existing inventory_commands is not a Batch replacement because each command requires one sku_id and one quantity. Calling it N times would not guarantee all-or-nothing semantics across a Multi-SKU Batch.

### 9.4 True Drift

#### Preview vs Baseline

No unexplained True Drift was found for the inspected T4 core tables, policies and triggers. Preview matches codex/phase-2.1-products-workspace at the metadata level reviewed.

#### Approved T4.2 Contract vs Baseline/Preview

- skus read policy uses product.read instead of sku.read
- SKU-related read surfaces mostly use product.read
- locations uses warehouse.read instead of location.read
- stock movements/balances/commands/events use broad inventory.read instead of granular T4.2 permissions
- foundation events group Product/SKU and Warehouse/Location under shared authorities
- baseline role seeding grants broad domain permission bundles to owner/admin rather than the complete Approved T4.2 Role Assignment Matrix

The SKU authority drift is approved for correction planning now. Other granular permission drifts require separate PM scope confirmation before implementation.

---

## 10. Corrective Migration Plan — SKU Authority

**สถานะ:** Plan only; no migration created or applied

### 10.1 Objective

Make sku.read the authoritative read permission for SKU master data without creating duplicate schema, losing existing effective access, exposing Browser writes or touching Production.

### 10.2 Proposed Future Migration Scope

One future transactional migration, working name:

- phase_t4_2_sku_read_authority

The actual timestamp/filename must be created with the approved migration workflow only after PM authorizes implementation.

### 10.3 Transaction Order

1. Verify implementation branch contains baseline commit or an approved descendant.
2. Add permission catalog entry sku.read with resource sku and action read.
3. Preserve current effective access by backfilling sku.read to roles that currently possess product.read.
4. Update owner/admin future-role seeding logic so newly created built-in roles receive sku.read when their approved matrix requires it.
5. Change skus_permission_select predicate from product.read to sku.read.
6. Split foundation_domain_events_permission_select so Product events use product.read and SKU events use sku.read.
7. Update approved SKU identity read surfaces to sku.read within the same transaction.
8. Keep authenticated table grants at SELECT only; do not add INSERT/UPDATE/DELETE.
9. Leave Product-owned catalog tables on product.read.
10. Leave sku_cost_profiles on product.cost.read.
11. Commit only if all policy/role metadata verification passes; otherwise rollback the transaction.

### 10.4 Compatibility Backfill Rationale

Copying current product.read role assignments to sku.read during the transition does not broaden current effective access because those roles can already read SKU through the conflicting policy. It prevents an outage when the policy switches.

After migration:

- New assignments can grant/revoke Product and SKU independently
- Existing roles retain behavior until PM performs a least-privilege role review
- No user/PII rows need to be copied; only role-permission relationships are affected

Alternative strict cutover without backfill is not recommended because existing Product readers would unexpectedly lose SKU access.

### 10.5 Mandatory Policy Targets

- public.skus / skus_permission_select
- public.foundation_domain_events / SKU entity branch of foundation_domain_events_permission_select

### 10.6 Candidate SKU Surface Targets Requiring PM Scope Confirmation

Recommended to move to sku.read because they directly expose SKU identity/use in receive:

- sku_product_profiles_read
- sku_sell_units_read
- sku_bundle_components_read
- sku_option_assignments_read
- sku_variant_images_read
- sku_identifier_registry_read
- sku_identifier_bindings_read

Do not automatically change:

- product_categories_read
- product_brands_read
- product_tags_read
- Product option definition policies
- sku_cost_profiles_read
- sales-code allocator policies
- mixed product_domain_events_read

Mixed/allocator surfaces need an explicit Product-vs-SKU authority decision to avoid accidental loss or expansion of access.

### 10.7 RLS and Grant Invariants

- Policies remain SELECT to authenticated
- Every predicate includes Organization authorization through private.has_org_permission
- SKU authority is Organization-scoped
- No anon grants
- No direct Browser write grants
- No Service Role credential in Browser
- Existing Product, Warehouse, Location, Movement and Balance tables remain unchanged
- Existing immutable movement triggers remain unchanged

### 10.8 Verification Matrix for Future Implementation

| Case | Expected |
|---|---|
| Role has product.read only | Product visible; SKU and approved SKU surfaces denied |
| Role has sku.read only | SKU identity surfaces visible; Product root denied unless separately granted |
| Role has both | Product and SKU visible |
| Role has neither | Both denied |
| Cross-Organization SKU ID | No rows; resource existence not disclosed |
| authenticated direct SKU write | Denied |
| anon SKU read | Denied |
| Existing role backfilled from product.read | No user-visible regression at cutover |
| New role granted product.read after migration | Does not inherit sku.read implicitly |
| Foundation Product event | product.read required |
| Foundation SKU event | sku.read required |
| SKU cost data | product.cost.read remains required |

No Test Code is created in T4.2B; this matrix is for the future authorized implementation.

### 10.9 Rollback/Failure Strategy

- All catalog insert, role backfill and policy changes must occur in one transaction
- Any failed validation rolls back the entire migration
- Do not delete sku.read after partial deployment if dependencies exist
- Prefer a forward corrective migration over destructive permission removal
- Never repair Preview manually outside migration history
- Production remains out of scope

---

## 11. T4 Multi-SKU Integration Implications

Existing single-SKU primitive can be reused below the Batch boundary but cannot be called independently per line without a common transaction.

Future T4 design must decide one approved pattern:

1. Batch wrapper inserts/locks one Batch aggregate and posts all line movements in one database transaction using shared internal primitives, or
2. Extend the internal posting layer to accept a validated array of lines and produce one batch result atomically

Required invariants:

- One Organization and one Branch per Batch
- 2–N SKU lines
- Every line resolves to existing skus and locations
- Duplicate SKU/location line rejected before writes
- One batch-level idempotency key and canonical request hash
- Same key/same hash returns prior result
- Same key/different hash returns deterministic conflict
- Any invalid line rolls back Batch, movements, balances and events
- stock_movements remains immutable source of truth
- inventory_balances remains derived state
- inventory_commands may be reused only if a parent Batch correlation preserves one atomic transaction and one replay result

No Batch schema or transaction function is created by this report.

---

## 12. Risks and Open Decisions

1. Correcting only public.skus leaves secondary SKU surfaces under product.read.
2. Backfilling all product.read roles preserves compatibility but requires later least-privilege review.
3. Strict cutover without backfill risks immediate authorization regressions.
4. Mixed Product/SKU event tables need predicates capable of separating entity authority.
5. Granular Location/Movement/Audit permissions approved in T4.2 still differ from baseline.
6. Existing inventory_commands cannot guarantee Multi-SKU atomicity when invoked once per line.
7. Remote migration version timestamps differ from baseline filenames because Preview uses bridged migration history; name/metadata mapping must remain the comparison method.
8. Creating inventory_locations or inventory_movements would duplicate existing locations/stock_movements and is prohibited.
9. Warehouse default-location triggers must remain part of any Location integration plan.
10. Future implementation branch must reconcile baseline ownership before authoring a new migration.

Open PM Decisions:

- Approve mandatory SKU scope only or the recommended SKU identity surface scope
- Approve compatibility backfill from product.read to sku.read
- Decide authority for mixed product_domain_events and sales-code allocator read models
- Decide whether Location/Movement/Audit granular permission correction belongs in T4.2 implementation or a later part
- Approve Batch wrapper model before T4.3/T4.4 implementation

---

## 13. Files Expected in Future Implementation

No files are created or changed in T4.2B except this report.

After separate PM approval, expected areas are:

- One new Supabase migration for sku.read permission/role/policy reconciliation
- Existing migration lineage remains untouched; do not edit applied migrations
- Future Batch migration only for genuinely Missing Batch objects
- Future server boundary/API/Test files only in their separately approved T4 parts
- T4.2/T4.1 documents may need terminology update from inventory_locations/inventory_movements to locations/stock_movements without changing physical schema

Exact migration filename and implementation files remain pending PM approval.

---

## 14. Recommendation

Approve the new baseline and reclassifications:

- Product/SKU/Warehouse/Location/Inventory core = Existing
- inventory_locations to locations = Rename/Reuse
- inventory_movements/ledger to stock_movements = Rename/Reuse
- Multi-SKU Batch aggregate/idempotency = Missing
- SKU product.read to sku.read = True Contract Drift

Approve a single transactional SKU-authority corrective migration plan with compatibility backfill and mandatory policy targets. Decide the expanded SKU surface list before code is written.

**Final Status:** T4.2B Baseline Reconciliation Prepared — Waiting for PM Approval; No Remote Mutation, Migration, Commit or Push


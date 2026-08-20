# AVENZO ONE — Phase T4.2C Migration Draft and Test Plan

**Status:** Conditionally Approved — Baseline Merged; Waiting for PM Review before Local Migration/Test Run  
**Date:** 20 August 2026  
**Working branch:** `codex/workstream-domain-qa`  
**Approved comparison baseline:** `codex/phase-2.1-products-workspace` at `df53136f242916c5cf72236833c2034f849eecd6`  
**Remote activity:** None; PREVIEW and Production were not connected or mutated.

## 1. Outcome

T4.2C is drafted as one transactional local migration and one rollback-based SQL regression test. It reuses the actual Phase 2 inventory model:

- Inventory Location = `public.locations`
- Inventory Movement/Ledger = `public.stock_movements`
- Inventory Balance = `public.inventory_balances`
- Existing single-SKU command envelope = `public.inventory_commands`

No Product, SKU, Warehouse, Location, Movement, Balance, Batch, Batch Item, idempotency or atomic Batch RPC schema is created.

## 2. Files for PM Review

| File | Purpose | State |
|---|---|---|
| `supabase/migrations/20260820074733_phase_t4_2c_permission_rls_contract.sql` | Permission catalog, compatibility backfill, RLS correction, role-seed compatibility and browser grant boundary | Drafted; not applied |
| `supabase/tests/phase_t4_2c_permission_rls_contract.sql` | Tenant/Branch isolation, RLS, anon denial, browser write denial and permission compatibility | Drafted; not run |
| `docs/AVENZO_ONE_Phase_T4_2C_Migration_and_Test_Plan.md` | PM review record and test matrix | This document |

No previously applied migration was edited.

## 3. Baseline Gate

The approved Phase 2.1 baseline commit `df53136f242916c5cf72236833c2034f849eecd6` was merged into `codex/workstream-domain-qa` with merge commit `8019084cd49653028f1b27c13aa383fb748adc46`. The merge has two parents and no rebase was used.

Local drafts, including untracked files, were protected with `git stash --include-untracked` before the merge and restored afterward without conflict. The baseline object-ordering gate is now satisfied at source level. No migration or test has been run; runtime verification remains behind the next PM gate.

## 4. Transaction Boundary

The migration uses one explicit `BEGIN`/`COMMIT` transaction:

1. Verify required baseline relations, helper and SELECT policies.
2. Reject duplicate aliases `inventory_locations` and `inventory_movements`.
3. Reconcile the granular permission catalog.
4. Reconcile `inventory_batch.read` to existing Owner roles only, preserving the foundation Owner-all invariant; do not grant it to Admin.
5. Backfill replacement permissions only from authorities that already provided equivalent access, then update future Owner/Admin domain-role seeding for the non-Batch split authorities.
6. Replace SKU, Location, Movement, Balance, Command Audit, Inventory Event and Foundation Event read predicates.
7. Reassert browser grants for command/ledger/balance/event tables.
8. Run postflight catalog, backfill, policy and grant assertions.
9. Commit only if every assertion succeeds; otherwise PostgreSQL rolls back all changes.

## 5. Permissions and Compatibility

| Permission | Scope | T4.2C use |
|---|---|---|
| `sku.read` | Organization | SKU and approved SKU identity surfaces |
| `location.read` | Branch required | `locations` |
| `inventory_batch.read` | Branch required | Catalog entry plus Owner-only inheritance reconciliation; Admin denied and no Batch policy before T4.3 |
| `inventory_movement.read` | Branch required | `stock_movements` and `inventory_balances` |
| `inventory_audit.read` | Branch required | `inventory_commands` helper and `inventory_domain_events` |

Compatibility mapping:

| Existing effective authority | Replacement copied to the same roles | Rationale |
|---|---|---|
| `product.read` | `sku.read` | Existing policy already allowed SKU read |
| `warehouse.read` | `location.read` | Existing policy already allowed Location read |
| `inventory.read` | `inventory_movement.read`, `inventory_audit.read` | Existing policies already allowed Movement, Balance, Command and Event read |

`inventory_batch.read` remains in the catalog by PM decision. The migration reconciles it to every existing Owner role so the foundation Owner-all invariant remains true, while the existing owner-all seed grants it to future Owners. It is not granted to Admin and is not included in Admin domain seeding. Tests cover existing and future Owner = granted, existing and future Admin = denied, and confirm that no Batch table, RLS policy or `public`/`private` function activates this permission before T4.3.

New assignments after migration are independent. Granting `product.read`, `warehouse.read` or `inventory.read` later does not automatically grant its granular replacement.

## 6. RLS Corrections

| Surface | Previous | Draft authority |
|---|---|---|
| `skus` | `product.read` | `sku.read` |
| SKU profile/sell-unit/bundle/options/images/identifier read policies | `product.read` | `sku.read` |
| `locations` | `warehouse.read` | `location.read` + row Branch |
| `stock_movements` | `inventory.read` | `inventory_movement.read` + row Branch |
| `inventory_balances` | `inventory.read` | `inventory_movement.read` + row Branch |
| `inventory_commands` read helper | `inventory.read` | `inventory_audit.read` on source/destination Branch |
| `inventory_domain_events` | `inventory.read` | `inventory_audit.read` + non-null row Branch |
| `foundation_domain_events` | Product/SKU and Warehouse/Location grouped | entity-specific Product, SKU, Warehouse and Location permissions |

Unchanged and out of scope:

- Product-owned categories, brands, tags and option definitions remain on `product.read`.
- SKU cost remains on `product.cost.read`.
- Mixed `product_domain_events` and sales-code allocator surfaces await a separate authority decision.
- Existing trusted write commands and immutability triggers remain unchanged.

## 7. Browser and Ledger Boundary

For `inventory_commands`, `stock_movements`, `inventory_balances` and `inventory_domain_events`:

- `anon` receives no table access.
- `authenticated` keeps SELECT only and remains subject to RLS.
- `authenticated` has no INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES or TRIGGER privilege.
- No browser write policy is added.
- Existing private/server posting primitives and immutability triggers remain unchanged.
- No service-role capability is added to browser code.

## 8. Test Matrix

| ID | Scenario | Expected |
|---|---|---|
| T42C-01 | Permission catalog | Five granular codes exist |
| T42C-02 | Existing Product-reader compatibility | Every pre-cutover `product.read` role also has `sku.read` |
| T42C-03 | Existing Warehouse-reader compatibility | Every pre-cutover `warehouse.read` role also has `location.read` |
| T42C-04 | Existing Inventory-reader compatibility | Every pre-cutover `inventory.read` role also has Movement/Audit reads |
| T42C-05 | New `product.read` only | Product visible; SKU denied |
| T42C-06 | New `sku.read` only | Same-tenant SKU visible; Product root denied |
| T42C-07 | Cross-tenant SKU | No foreign-Organization rows |
| T42C-08 | Location Branch scope | Only assigned Branch rows |
| T42C-09 | Movement/Balance Branch scope | Only assigned Branch rows |
| T42C-10 | Command/Event Audit Branch scope | Only assigned Branch rows |
| T42C-11 | Browser Movement writes | INSERT/UPDATE/DELETE denied |
| T42C-12 | Browser Balance write | INSERT denied |
| T42C-13 | Anonymous reads | SKU, Location, Movement, Balance and Event denied |
| T42C-14 | Policy metadata | SELECT/authenticated and expected permission predicates |
| T42C-15 | RLS enablement | Seven required relations have RLS enabled |
| T42C-16 | Owner/Admin Batch catalog split | Existing/future Owner has `inventory_batch.read`; existing/future Admin does not |
| T42C-17 | No Batch surface | No Batch tables, Batch RLS predicate or `public`/`private` function uses `inventory_batch.read` |

Fixtures run inside one transaction and finish with `ROLLBACK`.

## 9. Validation State

- Static scope check passed: one migration `BEGIN`/`COMMIT`, no `CREATE TABLE`, no Batch RPC.
- Test draft contains tenant isolation, RLS metadata, anon denial, browser write denial, existing/future Owner/Admin split and no-Batch-surface checks, ending in one `ROLLBACK`.
- Approved Phase 2.1 baseline is present through merge commit `8019084cd49653028f1b27c13aa383fb748adc46`; no rebase was used and stash restore had no conflict.
- SQL migration/test runtime has not been executed, as required pending PM review of this updated Test Plan.
- No PREVIEW/Production connection or apply occurred. T4.2C drafts remain uncommitted and nothing was pushed.

## 10. Risks and PM Review Points

1. **Baseline merge size:** the approved baseline is now integrated as a large merge commit; PM should review the two-parent commit and restored draft status before local execution.
2. **One-time compatibility:** later broad grants do not implicitly add granular grants; this is intentional separation.
3. **Legacy broad permissions:** old codes remain because other existing surfaces/commands still use them.
4. **Audit semantics:** existing `inventory_commands` is treated as audit evidence; Batch read remains T4.3.
5. **SKU scope:** direct SKU identity surfaces move to `sku.read`; mixed event/allocator surfaces do not.
6. **Owner-all inheritance:** PM accepted Owner access to catalog-only `inventory_batch.read`; migration reconciliation covers existing Owners, foundation seeding covers future Owners, and Admin remains denied until T4.3.
7. **Role review debt:** compatibility backfill preserves access but does not complete later least-privilege reassignment.

## 11. T4.3 Exclusions

Absent from this draft: Multi-SKU Batch header/items, Batch idempotency key/hash/result, Batch-to-Movement correlation, atomic receive RPC/function, Batch RLS policies, Batch API and integration code.

## 12. Next PM Gate

PM review is requested for:

1. Merge commit `8019084cd49653028f1b27c13aa383fb748adc46` as the approved `df53136` baseline integration.
2. Added assertions: Owner granted `inventory_batch.read`, Admin denied, and no active Batch surface.
3. Permission to run the migration and SQL tests locally only. Remote apply and Push remain prohibited.

**Final status:** T4.2C Conditional Requirements Updated — Waiting for PM Review before Local Migration/Test Run; No Remote Apply or Push.



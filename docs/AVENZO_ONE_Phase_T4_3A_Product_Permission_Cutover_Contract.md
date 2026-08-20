# AVENZO ONE — Phase T4.3A Product Permission Cutover Contract

**Status:** Approved/Closed — T4.3B Isolated Local QA PASS; No Remote Apply or Deploy
**Date:** 20 August 2026
**Working branch:** `codex/workstream-domain-qa`
**Scope:** Approved permission vocabulary plus T4.3B implementation and Local QA closeout record
**Remote/Deployment:** None; PREVIEW and Production were not connected, mutated or deployed

---

## 1. Contract Outcome

T4.3A establishes the approved permission vocabulary required before Individual Permission Override implementation:

- Product lifecycle authority cuts over from broad `product.manage` to `product.create`, `product.update` and `product.archive`.
- Every current permission catalog code and every approved T4.3 future code has one `scope_kind`: `organization` or `branch`.
- `permission_override.manage` is Owner-only in v1.
- Branch-scoped Allow never creates Branch membership.
- Individual override mutation is trusted-server-only, denies self-target and Owner-target mutations, and preserves Deny precedence.
- Audit retention is at least 5 years, with Legal Hold suspending disposal.
- Expiry is evaluated at statement time.
- No Batch schema, policy, function, API or Admin grant is authorized.

This document originally authorized no runtime change. PM subsequently approved the
forward-only T4.3B migration and test implementation, isolated Local Apply/QA, and
final closure on 20 August 2026. Historical migrations, T4.2C migration/RLS and
Production code were not edited.

---

## 2. Reconciled Sources

| Source | Reconciled state |
|---|---|
| `AVENZO_ONE_Phase_T4_1_Schema_Domain_Contract.md` | Approved Source of Truth copied into this worktree; source/target SHA-256 both `B1CF851678C0A63746F3DDA188E843A9F9D7F92A03A8AD3704097CA43C933700` |
| `AVENZO_ONE_Phase_T4_2_Permission_RLS_Constraints_Plan.md` | Approved permission, RLS, Branch and browser-boundary contract |
| `AVENZO_ONE_Phase_T4_2C_Migration_and_Test_Plan.md` | Reconciled to Approved and Closed; isolated QA PASS |
| `AVENZO_ONE_Phase_T4_3_Individual_Permission_Override_Design_Preflight.md` | D1–D12 approved as recommended; T4.3A gates updated |
| Current SQL catalog scan | 27 current permission codes; no current `scope_kind` column and no granular Product lifecycle codes |

---

## 3. Product Permission Cutover

### 3.1 Approved authority model

| Permission | `scope_kind` | Approved meaning |
|---|---|---|
| `product.create` | `organization` | Create a Product root and its initial approved creation envelope |
| `product.update` | `organization` | Mutate existing Product/SKU metadata, variants, identifiers, images and allocators without archiving the root lifecycle object |
| `product.archive` | `organization` | Archive Product or SKU lifecycle objects |
| `product.manage` | `organization` | Transitional legacy code; deprecated and inert after cutover, not an alias in the effective-permission helper |

### 3.2 Command-boundary mapping

| Existing command family | Authority after cutover |
|---|---|
| Product create, create with initial SKU, create with variants | `product.create` |
| Product/SKU update, activation and non-archive lifecycle maintenance | `product.update` |
| Standalone SKU creation under an existing Product | `product.update` |
| Product master/metadata, SKU profile/cost/sell-unit/bundle replacement | `product.update` |
| Variant image assign, prepare, finalize, fail, media archive and reorder | `product.update` |
| Sales-code allocation, preview and unified variant creation under an existing Product | `product.update` |
| Product archive and SKU archive | `product.archive` |

Media-record archive remains maintenance of an existing Product/SKU surface and therefore uses `product.update`; `product.archive` is reserved for Product/SKU lifecycle archive commands.

### 3.3 Forward-only cutover sequence delivered in T4.3B

1. Add the three granular Product permissions as Organization-scoped catalog entries.
2. Backfill all three codes only to roles that hold `product.manage` immediately before cutover.
3. Update future role seeding explicitly; do not rely on a wildcard or runtime alias.
4. Replace each trusted command check with its exact granular authority in one approved forward-only cutover.
5. Reconcile mixed Product domain-event and allocator read/write authority explicitly.
6. Keep `product.manage` in the catalog as deprecated and inert after cutover for historical references and rollback diagnosis.
7. Remove `product.manage` only in a separately approved later migration after repository search and regression gates prove no runtime dependency.

Individual override evaluation must never interpret `product.manage` as granting the three new codes. Compatibility is a one-time role backfill, not a permanent alias. Consequently, Deny on `product.create` affects only creation and preserves independent `product.read`, `product.update` and `product.archive` results.

### 3.4 Historical schema-as-code reconciled by T4.3B

The current `product.manage` references are in forward history and must not be edited in place:

- `supabase/migrations/20260813132549_phase_2_0_3_5_permission_rls_security.sql`
- `supabase/migrations/20260813135745_phase_2_0_4_server_application_foundation.sql`
- `supabase/migrations/20260815083258_phase_2_1_r5_product_domain_extension.sql`
- `supabase/migrations/20260815090201_phase_2_1_r6_product_image_gate.sql`
- `supabase/migrations/20260815103024_phase_2_1_r7_1_atomic_product_creation.sql`
- `supabase/migrations/20260816105113_phase_2_1_a4_atomic_sales_code_allocator.sql`
- `supabase/migrations/20260816111737_phase_2_1_b5_unified_variant_creation.sql`
- `supabase/migrations/20260820074733_phase_t4_2c_permission_rls_contract.sql`

T4.3B used a new forward-only migration to reconcile current function
definitions and future role seeds. Historical files above remained immutable.

---

## 4. `scope_kind` Contract

### 4.1 Definitions

- `organization`: authorization is evaluated against an active Organization membership. An override row must have no Branch.
- `branch`: authorization is evaluated against a specific active Branch in the same Organization. An applicable Organization-wide Deny also wins, while a Branch Allow requires pre-existing Branch eligibility.
- Every permission code must have exactly one non-null approved `scope_kind` before the canonical effective-permission helper is enabled.
- Unknown or unclassified permission codes fail closed.
- Browser code must not keep a separate scope list.

### 4.2 Complete permission catalog matrix

| # | Permission code | Domain/action | Catalog state | `scope_kind` | Contract note |
|---:|---|---|---|---|---|
| 1 | `audit.read` | audit/read | Current | `organization` | Organization security/audit projection read |
| 2 | `billing.manage` | billing/manage | Current | `organization` | Organization billing administration |
| 3 | `billing.read` | billing/read | Current | `organization` | Organization billing read |
| 4 | `branch.create` | branch/create | Current | `organization` | Creation occurs before a target Branch exists |
| 5 | `branch.read` | branch/read | Current | `branch` | Row Branch required; membership ceiling remains enforced |
| 6 | `branch.update` | branch/update | Current | `branch` | Exact Branch administration |
| 7 | `inventory_audit.read` | inventory_audit/read | Current | `branch` | Command/domain-event audit by Branch |
| 8 | `inventory_batch.read` | inventory_batch/read | Current, catalog-only | `branch` | Owner only; Admin denied; no Batch surface |
| 9 | `inventory_movement.read` | inventory_movement/read | Current | `branch` | Movement and balance read by Branch |
| 10 | `inventory.adjust` | inventory/adjust | Current | `branch` | Approved server boundary only |
| 11 | `inventory.read` | inventory/read | Current | `branch` | Broad inventory read retained where still used |
| 12 | `inventory.receive` | inventory/receive | Current | `branch` | Approved server boundary only |
| 13 | `inventory.transfer` | inventory/transfer | Current | `branch` | Source/destination Branch checks required |
| 14 | `location.read` | location/read | Current | `branch` | Exact Location row Branch required |
| 15 | `member.invite` | member/invite | Current | `organization` | Organization membership governance |
| 16 | `member.read` | member/read | Current | `organization` | Organization member directory |
| 17 | `member.update` | member/update | Current | `organization` | Owner protection remains separate invariant |
| 18 | `organization.read` | organization/read | Current | `organization` | Organization root read |
| 19 | `organization.update` | organization/update | Current | `organization` | Organization root update |
| 20 | `product.cost.read` | product/cost_read | Current | `organization` | Sensitive Product/SKU cost authority |
| 21 | `product.manage` | product/manage | Current, transitional | `organization` | Deprecated and inert only after approved cutover |
| 22 | `product.read` | product/read | Current | `organization` | Product root/catalog read |
| 23 | `role.manage` | role/manage | Current | `organization` | Organization role governance |
| 24 | `role.read` | role/read | Current | `organization` | Organization role read |
| 25 | `sku.read` | sku/read | Current | `organization` | Approved SKU read authority |
| 26 | `warehouse.manage` | warehouse/manage | Current | `branch` | Warehouse mutation requires exact Branch scope |
| 27 | `warehouse.read` | warehouse/read | Current | `branch` | Warehouse read requires exact Branch scope |
| 28 | `product.create` | product/create | Implemented in T4.3B | `organization` | Replaces create portion of `product.manage` |
| 29 | `product.update` | product/update | Implemented in T4.3B | `organization` | Replaces update/maintenance portion |
| 30 | `product.archive` | product/archive | Implemented in T4.3B | `organization` | Replaces Product/SKU lifecycle archive portion |
| 31 | `permission_override.manage` | permission_override/manage | Implemented in T4.3B | `organization` | Owner-only v1 trusted-server mutation authority |

Final T4.3B catalog classification: 27 pre-existing codes + 4 approved new codes
= 31 classified codes.

### 4.3 Enforcement reconciliation note

`scope_kind` defines permission semantics but does not itself establish Branch
membership. T4.3B verified that helpers and RLS require the row Branch and active
membership eligibility; C7 fails if a Branch-scoped permission is treated as
Organization-wide.

---

## 5. Approved T4.3 Decisions Applied

| Decision | Approved contract |
|---|---|
| Management | Owner-only v1 through `permission_override.manage` |
| Self-service | Actor cannot create, change, revoke, allow or deny an override for self |
| Owner protection | No override may target any active Owner |
| Effective result | Role baseline + applicable Allow − applicable Deny; any applicable Deny wins |
| Branch scope | Branch Allow does not create membership and cannot exceed assigned/Organization-wide Branch eligibility |
| Mutation boundary | Trusted server only; actor comes from verified server/session context |
| Browser boundary | No direct override/audit DML and no service-role credential in Browser |
| Audit | Reason, actor, time, before/after, scope, permission and idempotent command identity in one transaction |
| Retention | Minimum 5 years; active Legal Hold suspends disposal until released |
| Expiry | `statement_timestamp()` evaluation; effective on the next statement; no scheduler event in v1 |
| Concurrency | Expected revision plus idempotent command ID |
| Batch | `inventory_batch.read` remains Owner-only/catalog-only; Admin denied; no Batch surface |

---

## 6. T4.3B Acceptance Gates

| Gate | Required evidence before runtime approval |
|---|---|
| C1 Catalog completeness | Exactly all expected codes classified; null/unknown `scope_kind` rejected |
| C2 Compatibility backfill | Only roles holding `product.manage` before cutover receive all three granular Product codes |
| C3 No permanent alias | Effective helper does not derive granular Product authority from `product.manage` |
| C4 Exact command authority | Create/update/archive command families check only the mapped granular code |
| C5 Independent deny | Denying `product.create` leaves read/update/archive unchanged |
| C6 Owner protections | Self-target and Owner-target mutation rejected; non-Owner manager rejected in v1 |
| C7 Branch ceiling | Branch Allow without prior eligibility denied and creates no `member_branches` row |
| C8 Browser denial | `anon` and `authenticated` cannot mutate override/audit or Product/Inventory protected surfaces directly |
| C9 Audit/time | Atomic before/after audit, 5-year/Legal Hold metadata, statement-time expiry and retry idempotency verified |
| C10 Regression/no-Batch | T4.2C, Product/SKU/Warehouse/Inventory regressions pass; no Batch table/policy/function/Admin grant |

---

## 7. Risks and Controls

| Risk | Control |
|---|---|
| Partial Product cutover leaves one command on `product.manage` | Repository search plus exact command-authority acceptance tests before enabling overrides |
| One-time backfill accidentally broadens access | Snapshot pre-cutover role holders and assert set equality inside one transaction |
| `product.manage` alias bypasses an individual granular Deny | Keep legacy code inert; canonical helper has no alias expansion |
| Wrong `scope_kind` widens Branch data | Full 31-code matrix, fail-closed helper and Branch-negative tests |
| Branch Allow becomes hidden membership grant | Mutation validation plus assertion that `member_branches` is unchanged |
| Owner or actor can alter own recovery authority | Owner-target and self-target constraints at trusted boundary and storage layer |
| Trusted server bypasses RLS without actor checks | Server derives actor, invokes narrow command and re-authorizes Organization/Branch explicitly |
| Audit disposal violates Legal Hold | Retention process refuses disposal while a hold is active; no application hard delete |
| Expiry differs between helper calls | Use one `statement_timestamp()` value per statement and helper parity tests |
| T4.3A accidentally activates Batch | Explicit schema/policy/function/Admin-grant absence gate |

---

## 8. Pre-Implementation Gate Status

| Gate | Final status at T4.3B close |
|---|---|
| G1 D1–D12 approval | Complete |
| G2 T4.1 in approved worktree | Complete; SHA-256 matched; included in approved closeout scope |
| G3 T4.2C closure reconciliation | Complete |
| G4 Product permission/cutover contract | Complete; forward-only cutover implemented |
| G5 Full catalog `scope_kind` classification | Complete; catalog classification and fail-closed behavior verified |
| G6 Owner-only and Owner protection | Complete |
| G7 Trusted server/error/grant design | Complete; trusted boundary and direct-access denials verified |
| G8 Audit/retention/expiry/concurrency | Complete |
| G9 Migration/test implementation authorization | Complete; PM approved forward-only draft implementation |
| G10 Isolated local QA authorization | Complete; all approved Local QA gates passed |

---

## 9. T4.3B Approved/Closed QA Record

PM approved and closed T4.3B Local QA on 20 August 2026 with the following
evidence:

| Gate | Result |
|---|---|
| Auth/Storage bootstrap preflight | PASS — `auth.users`, `auth.jwt()`, `auth.uid()`, `storage.buckets` and `storage.objects` present |
| Canonical Production baseline verifier/replay | PASS — 90/90 migrations and 7/7 bridges |
| Approved Phase 2 forward migrations | PASS — 14/14 in order |
| T4.2C and T4.3B Local Apply | PASS |
| Existing regression suite | PASS — 13/13 |
| T4.3B acceptance matrix | PASS — C1–C10, 10/10 |
| Membership fixture boundary | PASS — five IDs prepared by `postgres`; `service_role` retained no direct `SELECT` on `organization_members` |
| No-Batch gate | PASS — no Batch table, policy, function or Admin activation |
| RLS/grant/security metadata gate | PASS |
| Database lint | PASS with one pre-existing unrelated unused-variable warning in `platform_simulate_sandbox_payment_event` |
| Cleanup/Main isolation | PASS — isolated containers, volumes and transient harness removed; Main core services remained healthy |

Delivered files are
`supabase/migrations/20260820152508_phase_t4_3b_individual_permission_overrides.sql`
and `supabase/tests/phase_t4_3b_individual_permission_overrides.sql`.
The migration remained forward-only. No PREVIEW/Production Apply, Remote
connection or deployment occurred.

**Next action:** T4.3B is Approved/Closed. Stop and wait for PM approval before
starting Phase T4.4.

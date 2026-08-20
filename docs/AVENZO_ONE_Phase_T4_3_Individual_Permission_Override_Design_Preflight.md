# AVENZO ONE — Phase T4.3 Individual Permission Override Design/Preflight

**Status:** Approved/Closed — T4.3B Isolated Local QA PASS; No Remote Apply or Deploy
**Date:** 20 August 2026
**Working branch:** `codex/workstream-domain-qa`
**Repository baseline:** `1bc4665` (`Close Phase T4.2C permission and RLS contract`)
**Scope:** Individual member permission `allow`/`deny` design and T4.3B closeout
**Remote/Deployment:** None; PREVIEW and Production were not connected, mutated or deployed
**Approval:** PM approved D1–D12 as recommended on 20 August 2026

---

## 1. Outcome

T4.3 Design/Preflight and D1–D12 are approved. T4.3A reconciled the
documentation and permission vocabulary, and the subsequently approved
forward-only T4.3B implementation passed every isolated Local QA gate. The
approved model is:

- Role assignments remain the baseline.
- A private current-state override store adds an individual `allow` or `deny` at Organization or Branch scope.
- Effective permission is `Role baseline + applicable Allow - applicable Deny`; any applicable Deny wins.
- Branch membership is an authorization ceiling. An override cannot create Branch membership or expand the member beyond assigned Branches.
- Existing browser and trusted-server helpers delegate to one canonical effective-permission evaluator so RLS and server commands cannot drift.
- Override mutation is server-boundary-only, rejects self-change, protects Owners and writes immutable audit evidence atomically.
- Browser roles receive no direct read or write access to override/audit storage.

This report remains the approved design contract and now records T4.3B closure.
It does not authorize PREVIEW/Production Apply, deployment or Phase T4.4 work.

---

## 2. Source of Truth Reviewed

| Source | State used by this report | Relevant contract |
|---|---|---|
| `AVENZO_ONE_Phase_T4_1_Schema_Domain_Contract.md` | Approved Contract dated 20 August 2026 | Tenant-safe relationships, required Branch scope, server-only mutation and audit principles |
| `AVENZO_ONE_Phase_T4_2_Permission_RLS_Constraints_Plan.md` | Approved Plan and explicit T4.3 requirement | Individual allow/deny, Deny precedence, Owner protection, no self-escalation and audit |
| `AVENZO_ONE_Phase_T4_2C_Migration_and_Test_Plan.md` | Approved and Closed; isolated local QA PASS | Granular read authorities, browser denial and compatibility boundaries |
| Current repository at `1bc4665` | Actual schema-as-code baseline | T4.2C migration/test are tracked and T4.2C is closed by PM instruction |

T4.3A reconciliation record:

- `docs/AVENZO_ONE_Phase_T4_1_Schema_Domain_Contract.md` was copied into this worktree from the approved main-workspace Source of Truth with matching SHA-256 `B1CF851678C0A63746F3DDA188E843A9F9D7F92A03A8AD3704097CA43C933700`.
- The T4.2C plan was reconciled to the closed QA result: Auth/Storage preflight PASS, baseline verifier/replay PASS, forward migrations `14/14`, tests `12/12`, no-Batch PASS and cleanup complete.
- `docs/AVENZO_ONE_Phase_T4_3A_Product_Permission_Cutover_Contract.md` records the approved Product cutover and complete permission `scope_kind` matrix.

Authority order for this report:

1. Current PM instruction defining T4.3 as Individual Permission Override.
2. Approved T4.2 section 2.2 requirement.
3. Approved T4.1/T4.2 contracts.
4. Current schema-as-code at `1bc4665`.
5. Approved D1–D12 decisions and the T4.3A reconciliation contract.

---

## 3. Current Repository Findings

### 3.1 Existing structures to reuse

| Existing object | Current behavior | T4.3 use |
|---|---|---|
| `public.permissions` | Permission catalog keyed by `code` | Permission FK and scope classification authority after PM decision |
| `public.organization_roles` | Organization-local roles including `owner`, `admin`, `manager`, `staff`, `viewer` | Role baseline and protected Owner identity |
| `public.role_permissions` | Role-to-permission baseline | Baseline grant set; remains unchanged by individual overrides |
| `public.organization_members` | One membership per Organization/user with active status and scope | Override target and active-membership gate |
| `public.member_roles` | Member-to-role assignment | Baseline permission source |
| `public.member_branches` | Branch assignments for Branch-scoped members | Maximum Branch scope; overrides cannot bypass it |
| `private.has_org_permission(uuid,text,uuid)` | Browser/RLS helper bound to `auth.uid()` | Must use canonical effective evaluation after implementation |
| `private.server_actor_has_org_permission(uuid,uuid,text,uuid)` | Explicit-actor trusted-server helper | Must use the same canonical effective evaluation |
| `private.current_user_is_organization_owner(uuid)` | Checks active Owner role | Owner-only management/protection pattern |
| `private.organization_audit_logs` | Private Organization audit evidence | Organization audit projection for override events |
| `private.append_organization_audit_log(...)` | Append helper with source uniqueness | Reuse for security/member audit projection |
| Member management RPC patterns | Organization lock, target lock, last-owner guard, before/after event | Transaction and Owner-protection reference pattern |

### 3.2 Missing structures and behavior

- No `member_permission_overrides` table or equivalent exists.
- No immutable override event/audit source exists.
- Both permission helpers currently calculate Role baseline only.
- `current_user_organization_access` and `current_user_org_permissions` return Role permissions only and would display stale effective access after overrides.
- Permission scope (`organization` versus `branch`) is documented but not encoded in `public.permissions`.
- Current Product write authority is `product.manage`; `product.create`, `product.update` and `product.archive` do not exist.
- Existing Product command boundaries check `product.manage`, so the required acceptance case “deny only `product.create`” cannot be meaningful until Product write authorities are split and their command checks are reconciled.
- No dedicated `permission_override.manage` authority exists.
- No database hierarchy exists beyond role codes and existing Owner-specific guards.
- No expiration scheduler exists. Effective-time evaluation can ignore expired rows, but a separate event at the instant of expiry is not currently available.

### 3.3 T4.2C boundaries that must remain unchanged

- `sku.read` remains the SKU authority.
- `location.read`, `inventory_movement.read` and `inventory_audit.read` remain granular authorities.
- `inventory_batch.read` remains catalog-only for Owner; Admin remains denied until a separate PM decision.
- No Batch table, Batch policy or Batch function is introduced by this T4.3 design.
- Browser direct writes to command, ledger, balance and audit surfaces remain denied.

---

## 4. Effective Permission Contract

For actor `U`, Organization `O`, permission `P` and optional Branch `B`:

```text
membership_ok = active user membership in active Organization O
branch_ok     = B is active in O and membership scope permits B
baseline      = at least one assigned Role grants P
allow         = at least one active applicable individual Allow grants P
deny          = at least one active applicable individual Deny denies P

effective(U,O,P,B) = membership_ok AND branch_ok AND NOT deny AND (baseline OR allow)
```

Precedence is fixed:

1. Invalid/inactive Organization, membership or Branch returns false.
2. Any applicable Deny returns false.
3. Otherwise Role baseline or applicable Allow returns true.
4. Otherwise default deny returns false.

“Applicable” means:

- Organization-scoped permission: evaluate only Organization override rows (`branch_id is null`).
- Branch-scoped permission at Branch `B`: evaluate Organization-wide rows plus exact-Branch rows for `B`.
- A Branch-specific Allow cannot override an Organization-wide Deny.
- A Branch-specific Deny can narrow an Organization-wide Role/Allow grant for that Branch.
- A Branch-scoped permission evaluated without `B` returns false; callers must supply the row Branch.
- A Branch override never creates Branch access. The target must already have Organization scope or an active `member_branches` assignment for `B`.
- Future-dated, expired and revoked rows do not participate.

### 4.1 Precedence examples

| Baseline | Organization override | Branch override | Requested scope | Effective |
|---:|---|---|---|---:|
| No | None | None | Organization | Deny |
| Yes | None | None | Organization | Allow |
| No | Allow | None | Organization | Allow |
| Yes | Deny | None | Organization | Deny |
| Yes | None | Deny B1 | Branch B1 | Deny |
| Yes | None | Deny B1 | Branch B2 | Allow if Branch-eligible |
| No | Allow | Deny B1 | Branch B1 | Deny |
| No | Deny | Allow B1 | Branch B1 | Deny |
| No | None | Allow B1 | Branch B1 | Allow only if Branch-eligible |
| No | None | Allow B1 | Branch B2 | Deny |

---

## 5. Approved Data Design — Implemented in T4.3B

### 5.1 Current-state override store

Implemented object name: `private.member_permission_overrides`

| Field | Purpose / rule |
|---|---|
| `id uuid` | Primary key |
| `organization_id uuid` | Required tenant key |
| `membership_id uuid` | Required target membership; tenant-safe FK with Organization |
| `permission_code text` | Required FK to `public.permissions(code)` |
| `branch_id uuid null` | Null = Organization scope; non-null = exact Branch scope |
| `effect text` | Required enum/check: `allow` or `deny` |
| `effective_from timestamptz` | Required; default at command time |
| `expires_at timestamptz null` | Optional; must be greater than `effective_from` |
| `reason text` | Required, trimmed, bounded length |
| `created_by uuid`, `created_at timestamptz` | Original actor/time |
| `updated_by uuid`, `updated_at timestamptz` | Last actor/time |
| `revoked_by uuid`, `revoked_at timestamptz` | Explicitly return to baseline without hard delete |
| `revision bigint` | Optimistic concurrency token starting at 1 |

Implemented constraints:

- Composite FK `(organization_id, membership_id)` to a matching unique key on `organization_members`.
- Composite FK `(organization_id, branch_id)` to `branches(organization_id, id)` when Branch is non-null.
- FK `permission_code` to the catalog with `ON DELETE RESTRICT`.
- Actor FKs use retention-safe `ON DELETE RESTRICT` or an approved actor-retention policy.
- `effect in ('allow','deny')`.
- Non-empty `reason`, recommended maximum 1,000 characters.
- `expires_at is null or expires_at > effective_from`.
- `revoked_at` and `revoked_by` must be both null or both non-null.
- One non-revoked logical row per `(membership_id, permission_code, branch_id)` using NULL-equal uniqueness.
- Supporting lookup index beginning with `(organization_id, membership_id, permission_code)` and including Branch/time columns needed by the helper.

### 5.2 Immutable audit event source

Implemented object name: `private.member_permission_override_events`

Required fields:

- `id`, `organization_id`, `override_id`, `membership_id`, `permission_code`, `branch_id`.
- `event_type`: `created`, `changed`, `scope_changed`, `revoked` or `expiry_changed`.
- `actor_user_id`, `reason`, `occurred_at`.
- `before_data jsonb`, `after_data jsonb` containing only authorization state.
- `command_id` or request identifier with a uniqueness rule for safe retry.
- Optional correlation ID for server observability; never Secret/token/connection data.

The event insert and current-state change must commit in one transaction. The same event should project to `private.organization_audit_logs` with category `security`, a stable action such as `permission_override.denied`, and the event row as the unique source.

No hard delete of audit events is allowed through the application boundary. Audit evidence is retained for at least 5 years; an active Legal Hold suspends expiry or disposal until the hold is explicitly released under the future approved retention process.

---

## 6. Permission Scope Authority

A generic helper cannot safely infer scope from naming conventions. The database needs one approved authority that states whether each permission is Organization- or Branch-scoped.

Implemented design: T4.3B adds explicit scope metadata to the existing permission
catalog, `scope_kind = 'organization' | 'branch'`. Browser code must not
maintain an independent hard-coded list. The complete 31-code classification is
recorded in `AVENZO_ONE_Phase_T4_3A_Product_Permission_Cutover_Contract.md`.

Approved classification families:

| Permission family | Scope |
|---|---|
| Product/SKU catalog read and Product lifecycle operations | Organization |
| Warehouse/Location read and manage | Branch |
| Inventory Batch/Movement/Receive/Audit/Adjust/Transfer | Branch |
| Organization/Role/Member governance | Organization unless separately approved |

The classification, runtime schema backfill and enforcement were implemented in
T4.3B and verified by the Branch ceiling and fail-closed acceptance gates.

---

## 7. Permission Helper Design

### 7.1 One canonical evaluator

Candidate internal helper:

```text
private.actor_has_effective_permission(
  actor_user_id,
  organization_id,
  permission_code,
  branch_id
) -> boolean
```

Required properties:

- `STABLE`, `SECURITY DEFINER`, empty/fixed `search_path`, fully qualified object names.
- No default `PUBLIC` execute; revoke from `public`, `anon`, `authenticated` and `service_role` unless a specific internal call path requires otherwise.
- Validate active Organization and active membership before permission lookup.
- Enforce permission scope metadata and Branch eligibility before overrides.
- Evaluate all active matching Denies before Role baseline/Allows.
- Use indexed `EXISTS` checks; do not aggregate every permission in each RLS row.
- Return false for malformed/cross-tenant/cross-Branch inputs without exposing resource existence.

Existing helpers become thin wrappers around the canonical evaluator:

- `private.has_org_permission(...)` supplies `(select auth.uid())` for RLS/browser reads.
- `private.server_actor_has_org_permission(...)` supplies the actor validated by the trusted server boundary.
- Inventory read helper and all command functions continue calling their existing wrapper names, gaining override behavior without policy-specific logic forks.

### 7.2 Permission summary functions

`current_user_organization_access` and `current_user_org_permissions` must eventually return effective permissions, not Role-only permissions. The response should distinguish:

- `effective_permissions` used by UI capability hints.
- Optional `role_baseline`, `allowed_overrides`, `denied_overrides` only for an authorized permission-management/audit view.

UI output is advisory only. Every read/write remains enforced by RLS or the server boundary.

---

## 8. Server Boundary

Implemented trusted command:
`public.server_set_member_permission_override(...)`. Direct Browser execution
is denied; only `service_role` receives execute authority.

Required input:

- Organization ID, target membership ID, permission code, effect and required reason.
- Optional Branch ID, effective time and expiry time.
- Expected revision for conflict detection.
- Idempotent command/request ID.
- Actor identity from the authenticated server/session context, never trusted from Browser payload.

Validation order:

1. Authenticate actor/session.
2. Resolve target membership inside the requested Organization using a tenant-constrained lookup.
3. Reject every actor = target override mutation before evaluating its effect.
4. Verify actor has the approved override-management authority.
5. Enforce hierarchy and Owner-protection rules.
6. Validate permission exists and its scope kind.
7. For Branch scope, validate Branch belongs to Organization, is active, actor may administer it and target is Branch-eligible.
8. Lock Organization and target membership, then lock the logical override row.
9. Validate expected revision and effective/expiry window.
10. Compute sanitized before/after state.
11. Upsert/revoke current state and append immutable audit event in the same transaction.
12. Return a minimal result without user email, foreign resource detail or internal schema information.

Approved exposure design:

- Browser has no direct table access and no direct function capable of accepting a caller-supplied actor ID.
- A trusted server route verifies the user session and invokes a narrowly granted command.
- If `service_role` is used, the command must explicitly authorize the real actor because RLS is not the authority on that path.
- Revoke function execution from `PUBLIC` and `anon`; grant only the approved trusted role.

---

## 9. Owner Protection, Self-Escalation and Hierarchy

Approved T4.3 v1 rules:

- Add a dedicated `permission_override.manage` authority and grant it to Owner only during initial rollout.
- Require both effective `permission_override.manage` and active Owner identity at mutation time.
- Reject all self-override mutations, not only self-Allow.
- Reject every override targeting a member who currently holds the Owner role.
- Never implement an “Owner bypasses Deny” branch in the effective helper; that would violate Deny precedence. Instead, prevent Owner override rows from entering valid state.
- Lock the Organization row for Owner-sensitive operations, following the existing member-management pattern.
- Admin/Manager cannot alter Owner or peer/higher authority in v1.
- Delegated non-Owner override management requires a separately approved role hierarchy/rank contract and is outside the recommended v1 boundary.
- A protected recovery set must include at least `permission_override.manage`, `role.manage` and `member.update`; any expansion is outside v1 and requires separate PM approval.

These rules allow an Owner to deny `product.create` for one Admin while preserving the Admin role and all unrelated permissions.

---

## 10. RLS and Grant Matrix

| Surface | `anon` | `authenticated` Browser | Trusted server | Enforcement |
|---|---|---|---|---|
| Override current-state table | No access | No direct SELECT/DML | Through approved command/helper only | Private schema, RLS defense in depth, explicit revoke |
| Override audit events | No access | No direct SELECT/DML | Append/read through approved boundary | Append-only guard and explicit revoke |
| Organization audit projection | No access | Existing approved audit function only | Append helper | Existing `audit.read`/approved security audit contract |
| Domain tables | Existing reviewed grants only | Existing SELECT + RLS | Existing command boundaries | Updated canonical helper applies overrides |
| Effective permission summary | No execute | Own context only | Approved DTO | Session-bound helper; no arbitrary target lookup |
| Override mutation command | No execute | No direct execute in recommended v1 | Narrow explicit execute | Actor/session, hierarchy, scope and audit checks |

Policy requirements:

- Do not add permissive `TO authenticated USING (true)` policy to override or audit storage.
- Do not grant direct `INSERT`, `UPDATE`, `DELETE`, `TRUNCATE`, `REFERENCES` or `TRIGGER` to Browser roles.
- Existing RLS policies should continue calling `private.has_org_permission`; changing the canonical helper is preferred over duplicating override joins across policies.
- No view may expose override rows directly. Any future view must be `security_invoker` or remain in a non-exposed schema with explicit grants.
- `service_role` must never be used in Browser code.

---

## 11. Transaction, Concurrency and Time Semantics

- One override mutation, its audit event and Organization audit projection form one transaction boundary.
- Lock order is fixed: Organization → target membership → logical override row to reduce deadlock risk.
- Use `expected_revision` to reject lost updates with a stable conflict error.
- Use a unique command ID to make retries return the prior result instead of appending duplicate audit events.
- Effective checks use `statement_timestamp()` consistently so permission changes and expiry take effect at the next database statement.
- `effective_from <= statement_timestamp()` and `(expires_at is null or expires_at > statement_timestamp())` define active time.
- Expiry automatically stops affecting permissions without DML. The original audit records who configured the expiry and when.
- If PM requires a separate “expired” event at the exact time of expiry, that needs an approved scheduler/worker and is outside the minimal design.
- Permission changes should take effect on the next database statement; authorization must not depend on stale JWT permission claims.

---

## 12. Error Contract

| Situation | Stable behavior |
|---|---|
| Target membership absent or belongs to another Organization | `member_not_found_or_not_accessible` |
| Branch absent, foreign or outside actor administration scope | `branch_not_found_or_not_accessible` |
| Actor lacks override-management authority | `permission_override_forbidden` |
| Actor targets self | `self_permission_override_forbidden` |
| Target is Owner | `owner_permission_override_forbidden` |
| Permission code absent | `permission_not_supported` without catalog detail leakage |
| Organization permission supplied with Branch | `permission_scope_invalid` |
| Branch permission supplied without Branch | `branch_scope_required` |
| Revision conflict | `permission_override_conflict` |
| Invalid time window | `permission_override_window_invalid` |
| Direct Browser table/function access | PostgreSQL permission denied; API maps to stable forbidden response |

Cross-tenant and not-found responses must be indistinguishable where revealing existence would enable enumeration.

---

## 13. Acceptance Test Plan

T4.3B SQL tests ran in an isolated local Supabase stack with Auth/Storage
bootstrap and finished with rollback where practical.

| ID | Scenario | Expected |
|---|---|---|
| T43-01 | No Role and no override | Default deny |
| T43-02 | Role baseline only | Existing permission allowed |
| T43-03 | Individual Allow without Role baseline | Permission allowed in approved scope |
| T43-04 | Individual Deny over Role baseline | Denied |
| T43-05 | Same permission has applicable Allow and Deny | Deny wins |
| T43-06 | Organization Deny plus Branch Allow | Denied at every Branch |
| T43-07 | Organization Allow plus one Branch Deny | Denied only at that Branch |
| T43-08 | Branch Allow for another Branch | No access outside exact Branch |
| T43-09 | Branch Allow but target lacks Branch assignment | Denied; override cannot create scope |
| T43-10 | Organization-scoped member and Branch override | Applies only to named active Branch |
| T43-11 | Cross-tenant membership/Branch IDs | Generic denial and no row created |
| T43-12 | Future-dated override | Ignored before effective time |
| T43-13 | Expired override | Ignored and baseline restored |
| T43-14 | Revoked override | Ignored and baseline restored |
| T43-15 | Suspended/removed member or inactive Organization | All effective permissions denied |
| T43-16 | Actor creates Allow for self | Rejected |
| T43-17 | Actor creates Deny/change for self | Rejected under recommended v1 rule |
| T43-18 | Admin/Manager attempts override mutation | Rejected in Owner-only v1 |
| T43-19 | Owner changes one Admin permission | Succeeds; other Admins unchanged |
| T43-20 | Owner targets an Owner | Rejected |
| T43-21 | Deny `product.create` for one Admin | Create denied; `product.read`, update/archive and other permissions unchanged |
| T43-22 | Existing Product command still checks `product.manage` | Gate must fail until granular authority cutover is complete |
| T43-23 | Browser direct SELECT/DML on override/audit tables | `anon` and `authenticated` denied |
| T43-24 | Browser calls trusted server-only command | Execute denied |
| T43-25 | Tampered actor ID in request | Ignored/rejected; session actor remains authority |
| T43-26 | Audit content | Actor, reason, time, before/after, scope and permission recorded atomically |
| T43-27 | Audit failure during mutation | Entire mutation rolls back |
| T43-28 | Same command ID replay | Same result; no duplicate event |
| T43-29 | Concurrent updates with same revision | One succeeds; one deterministic conflict |
| T43-30 | Browser helper versus trusted-server helper | Same effective result for same actor/context |
| T43-31 | Existing Product/SKU/Warehouse/Location/Inventory RLS | Deny/Allow affects only surfaces using that permission |
| T43-32 | T4.2C compatibility | SKU granular authority, Branch isolation, anon denial and browser write denial remain PASS |
| T43-33 | No Batch surface | No Batch table/policy/function is introduced |
| T43-34 | Permission summary | UI-facing effective list excludes denied and expired entries |
| T43-35 | Query-plan/index gate | Helper uses indexes and avoids per-row full permission aggregation |

Required regression suites executed during T4.3B Local QA:

- Phase 0 role/member/audit tests.
- Phase 2 Product/SKU/Warehouse/Inventory permission and RLS tests.
- T4.2C full regression test.
- New T4.3 override contract test.
- `anon` denial, browser direct-write denial and no-Batch checks.

---

## 14. Decision Matrix — Approved

PM approved D1–D12 exactly as recommended on 20 August 2026. The recommendation column is therefore the binding design choice for T4.3B planning.

| Decision | Options | Advantages / disadvantages | Risk | Recommendation | Impact after approval |
|---|---|---|---|---|---|
| D1 Storage schema | A: private current-state + private event; B: public RLS table; C: event-only | A minimizes Data API surface and keeps fast reads but needs approved functions; B is easier for UI but expands attack surface; C is auditable but queries are complex | Direct exposure or slow RLS | **A** | One private current table, one immutable event source; no Browser grants |
| D2 Scope authority | A: add `scope_kind` to permission catalog; B: private mapping table; C: hard-coded helper list | A gives one catalog authority but requires backfill; B avoids catalog change but duplicates truth; C is simplest but drifts | Branch-null access widening | **A** | Future migration must classify every permission before helper cutover |
| D3 Cross-scope precedence | A: Organization Deny applies to all Branches; B: exact scope only; C: most-specific wins | A preserves “Deny always wins”; B/C permit Branch Allow to bypass broad Deny | Privilege bypass | **A** | Helper checks all matching Denies before any grant |
| D4 Branch Allow semantics | A: Branch membership remains ceiling; B: override creates Branch access | A separates membership from permission; B is convenient but conflates two controls | Unauthorized Branch expansion | **A** | Server validates target Branch eligibility; no `member_branches` mutation |
| D5 Management authority | A: Owner-only v1 with `permission_override.manage`; B: Admin with hierarchy; C: any `role.manage` actor | A is safest but less flexible; B needs rank contract; C allows peer/higher manipulation | Self/peer escalation | **A** | Admin delegation deferred until hierarchy is approved |
| D6 Owner protection | A: prohibit all Owner-target overrides; B: protect only recovery permissions; C: allow Deny with last-owner count | A is simple and recoverable; B/C are flexible but can create hidden lockout | Organization takeover/lockout | **A** | No Owner override row is valid; no helper bypass required |
| D7 Product authority split | A: introduce create/update/archive and cut commands over; B: interpret `product.create` as alias of manage; C: keep manage only | A meets approved requirement but requires compatibility plan; B is ambiguous; C cannot test independent deny | False assurance from a code commands do not enforce | **A** | Granular catalog and command-boundary reconciliation must precede T43-21 |
| D8 Mutation exposure | A: trusted server-only command; B: authenticated RPC bound to `auth.uid()`; C: direct table RLS writes | A centralizes high-risk checks but must validate actor explicitly; B preserves session identity but exposes RPC; C has the largest attack surface | Spoofed actor or policy bypass | **A** | Explicit function grants, service boundary and actor/session verification |
| D9 Audit model | A: current-state + immutable event + Organization projection; B: Organization audit only; C: mutable row only | A gives full history and fast lookup; B is simpler but generic; C loses evidence | Missing before/after or retry duplication | **A** | Audit insert is in the same transaction with command uniqueness |
| D10 Expiry event | A: evaluate time only and audit configured expiry; B: scheduler emits expiry event | A needs no worker; B gives exact event but adds operations | Audit interpretation versus scheduler failure | **A** for v1 | Expired rows are ignored automatically; scheduler remains optional |
| D11 Conflict handling | A: revision + command ID; B: last write wins; C: table lock only | A is deterministic and retry-safe; B loses changes; C serializes but cannot detect stale UI | Lost updates/duplicate audit | **A** | Boundary requires expected revision and idempotent command ID |
| D12 Effective-permission caching | A: database statement-time evaluation; B: JWT claims; C: application cache | A is immediately consistent; B/C are faster but stale | Revoked permission remains usable | **A** | No permission authorization from mutable user metadata/JWT cache |

---

## 15. PM Approval Decision Record

All D1–D12 recommendations were approved on 20 August 2026. The following explicit operating decisions are binding:

1. T4.3 v1 override mutation is Owner-only through `permission_override.manage`.
2. Every override targeting an Owner is prohibited; every self-override mutation is prohibited.
3. `scope_kind` in the permission catalog is the single Organization/Branch classification authority.
4. Product lifecycle authority cuts over from `product.manage` to `product.create`, `product.update` and `product.archive` under the separate T4.3A contract.
5. A Branch Allow never creates or implies Branch membership.
6. Current state, immutable event and Organization audit projection are required; retention is 5 years minimum and Legal Hold suspends disposal.
7. Expiry is evaluated at `statement_timestamp()` in v1; no expiry scheduler/event is required.
8. Mutation is trusted-server-only; Browser roles have no direct mutation surface and cannot supply the authoritative actor identity.
9. `inventory_batch.read` remains Owner-only/catalog-only; T4.3A introduces no Batch table, policy, function or Admin grant.
10. T4.1 and T4.2C documentation reconciliation is complete in T4.3A.

---

## 16. Risks and Mitigations

| Risk | Impact | Mitigation / gate |
|---|---|---|
| Role-only helper remains on any path | Deny is bypassed | One canonical evaluator; helper parity tests and repository search gate |
| `product.create` exists only in documentation | Acceptance test passes the wrong surface or cannot run | Granular permission/command cutover decision before implementation |
| Organization versus Branch scope is not encoded | Null Branch may become organization-wide grant | Catalog `scope_kind`, validation and negative tests |
| Override expands Branch membership | Cross-Branch access | Membership remains a separate hard ceiling |
| Self-service mutation or actor spoofing | Privilege escalation | Server-derived actor, no direct Browser execute/write, self-target rejection |
| Owner or recovery permission denied | Tenant lockout | No Owner-target overrides in v1, Organization lock and Owner-only authority |
| Admin manages peer/higher user | Governance bypass | Owner-only v1; defer hierarchy delegation |
| Simultaneous updates overwrite each other | Lost authorization state | Revision check, lock order and command idempotency |
| Audit write is not atomic | Permission changes without evidence | Same transaction; audit failure rolls back mutation |
| Expired override remains cached | Revoked access persists | Database-time evaluation; no JWT/user-metadata authorization cache |
| SECURITY DEFINER or default execute is broad | Data/API privilege escalation | Private schema, fixed search path, revoke `PUBLIC`, explicit grants |
| Private table lacks useful indexes | RLS/helper latency grows with members | Equality-first indexes and query-plan acceptance gate |
| T4.1 copy later diverges from approved source | Reviewers implement against different contracts | SHA-256 reconciliation recorded; future changes require explicit review |
| T4.2C closure status regresses in later edits | Incorrect gate assumptions | Closed QA evidence and commit `1bc4665` are recorded in the reconciled plan |
| T4.3 name is confused with Batch work | Accidental Batch schema or Admin grant | Explicit no-Batch gate and separate future Batch phase approval |

---

## 17. T4.3B Delivered Files

PM approved the forward-only implementation and Local QA after this design was
completed:

| Delivered file | Purpose and state |
|---|---|
| `supabase/migrations/20260820152508_phase_t4_3b_individual_permission_overrides.sql` | Forward-only catalog scope, Product permission cutover, override/event structures, canonical helper, RLS/grants, command boundary and audit integration; isolated Local Apply PASS |
| `supabase/tests/phase_t4_3b_individual_permission_overrides.sql` | C1–C10 acceptance matrix plus Allow/Deny, Owner/self protection, Branch ceiling, audit, expiry, idempotency, browser/service-role and no-Batch assertions; PASS |
| `docs/AVENZO_ONE_Phase_T4_3A_Product_Permission_Cutover_Contract.md` | Approved contract and T4.3B QA closeout record |
| `docs/AVENZO_ONE_Phase_T4_3_Individual_Permission_Override_Design_Preflight.md` | This approved design/preflight and closure report |

Historical migrations, T4.2C migration/RLS and Production code were not edited.
No PREVIEW/Production Apply or deployment occurred.

---

## 18. Pre-Implementation Gates

| Gate | Requirement | Current state |
|---|---|---|
| G1 | PM approves Decision Matrix and Open Decisions | **Complete** — D1–D12 approved as recommended |
| G2 | T4.1 Source of Truth is present in the approved worktree/branch | **Complete** — copied with matching SHA-256 and included in approved closeout scope |
| G3 | T4.2C plan status is reconciled with closed QA state | **Complete** — isolated QA PASS and closure recorded |
| G4 | Product granular permission vocabulary and command cutover are approved | **Complete** — forward-only cutover implemented and regression-tested |
| G5 | Permission scope metadata and full catalog classification are approved | **Complete** — 31 codes classified and fail-closed behavior verified |
| G6 | Owner-only management/protection rules are approved | **Complete** — Owner-only v1, no self-target and no Owner-target override |
| G7 | Server boundary, actor source, grants and error contract are approved | **Complete** — trusted-server-only implementation and direct-access denials verified |
| G8 | Audit model, retention, time/expiry and concurrency semantics are approved | **Complete** — immutable audit, 5 years + Legal Hold, statement-time, revision + command ID |
| G9 | Future migration and test file list receives explicit implementation approval | **Complete** — PM approved T4.3B forward-only Migration and Test Code |
| G10 | Local isolated QA procedure is approved before runtime validation | **Complete** — Preflight, baseline 90/90 + 7 bridges, Forward 14/14, regression 13/13, C1–C10, no-Batch and lint/security passed |

**Readiness:** T4.3B is Approved/Closed. Isolated containers, volumes and the
transient harness were removed after QA; Main core services remained healthy.
Database lint passed with one pre-existing unrelated unused-variable warning in
`platform_simulate_sandbox_payment_event`.

**Stop condition:** Wait for PM approval before starting Phase T4.4. No
PREVIEW/Production Apply, Remote connection or deployment was performed.

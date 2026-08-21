# AVENZO ONE — Phase T5.2 Initial Stock Implementation and Test Draft

**Status:** Approved/Closed — Local and Isolated QA PASS

**Date:** 21 August 2026

**Branch:** `codex/workstream-domain-qa`

**Baseline:** `382b2a6` — T4.4B Approved/Closed

**Remote status:** T5.3 PREVIEW Approved/Closed เมื่อ 21 August 2026; T4.2C–T4.4B และ SKU-04 corrective apply ผ่านบน AVENZO ONE PREVIEW; Production ไม่ถูกเชื่อมต่อหรือแก้ไข และไม่มี deploy
**Git status:** PM approved T5.3 scoped Commit/Push checkpoint

## 1. Approved Scope

T5.2 connects the existing Product Creation UI to the approved T4.4B atomic
batch receive boundary. It introduces no schema, migration or RPC. Product
Queue/Import, Bundle, Rapid Entry and Live Sale remain outside this phase, and
the existing Product Creation layout/design is unchanged.

The staged workflow is:

1. Create Product and all SKUs atomically through the existing creation command.
2. Persist stable Workflow ID, SKU/Product activation Command IDs and the Batch
   idempotency key for retry/refresh/double-click recovery.
3. Activate every SKU idempotently.
4. Activate Product only after every SKU activation succeeds.
5. If Initial Stock is disabled, finish with an explicit `not_requested` result.
6. If enabled, submit all positive Items once through
   `server_receive_inventory_batch` in one database transaction.

The Batch boundary is all-or-nothing. There is no legacy per-SKU fallback and
no `partial` success result. A failure after activation yields recoverable
workflow state `stock_pending`; an indeterminate timeout yields
`unknown_outcome`. Neither value is a Product lifecycle status.

## 2. Server Boundary and DTO

- Browser calls one trusted Server Action with a strict versioned workflow DTO.
- The Server Action derives the actor from the authenticated session and checks
  `product.update`; a receive additionally checks branch-scoped
  `inventory.receive`.
- The Server layer uses the existing trusted command service for activation and
  the approved T4.4B RPC for receive. Browser code never obtains service-role
  credentials and never writes Batch, Command, Movement, Event or Balance
  tables directly.
- DTO supports 1–100 SKU activation entries and per-Item `locationId`. Current UI
  intentionally maps one selected Location to every positive Item.
- Enabled Initial Stock with no positive Item is rejected before mutation.
  Disabled Initial Stock sends `receive: null` and skips the RPC.

## 3. Idempotency, Retry and Timeout

- One logical workflow owns one stable Workflow ID, Product activation Command
  ID, one Command ID per SKU and one Batch idempotency key.
- Refresh, double-click and manual retry replay the same identifiers and payload.
- Soft timeout is 20 seconds. The server may auto-retry at most once using the
  exact same Batch request only when the remaining 30-second action budget can
  cover another attempt. Otherwise it returns `unknown_outcome`.
- Validation, authorization and idempotency conflict errors are never retried.
- T4.4B remains authoritative for canonical request hashing, same-key replay,
  changed-payload conflict, duplicate SKU/Location denial and concurrency.

## 4. Permission and Error Contract

- Product Creation page requires `product.create` and `product.update`; legacy
  `product.manage` is no longer an authority for this flow.
- Product identifier pre-check requires `product.create`, while failed image
  cleanup requires `product.update`; Product Import remains outside T5.2.
- Destination loading requires `warehouse.read`, `location.read` and
  branch-scoped `inventory.receive`.
- Effective permission evaluation remains Role baseline + Allow - Deny, with
  Individual Deny winning.
- Cross-tenant and hidden-object failures map to stable application errors and
  do not expose SQL details or object existence.

## 5. Files in Draft

- `web/src/lib/foundation/initial-stock-workflow.ts`
- `web/src/lib/foundation/errors.ts`
- `web/src/lib/foundation/repositories.ts`
- `web/src/lib/foundation/supabase-repository.ts`
- `web/src/lib/foundation/service-core.ts`
- `web/src/lib/foundation/server-service.ts`
- `web/src/app/actions/foundation.ts`
- `web/src/lib/foundation/product-identifier-check.server.ts`
- `web/src/lib/foundation/product-image-cleanup.server.ts`
- `web/src/app/organizations/[id]/products/new/page.tsx`
- `web/src/app/organizations/[id]/products/new/unified-product-creation-form.tsx`
- `web/scripts/test-products-initial-stock-t2-read.mjs`
- `web/scripts/test-products-initial-stock-t3-workflow.mjs`
- `web/scripts/test-products-r7-inventory-components.mjs`
- `web/scripts/test-products-r7-success-recovery-interaction.mjs`
- `web/scripts/test-products-r7-identifier-interaction.mjs`
- `web/scripts/test-products-r7-unified-creation.mjs`
- `web/scripts/test-products-initial-stock-t5-2-integration.mjs`
- `web/scripts/test-products-initial-stock-t5-2-e2e.mjs`
- `web/package.json`

No migration, T4.4B SQL, schema, RPC, layout or design file is changed.

## 6. Test Matrix

The T5.2 Integration suite contains exactly 24 fail-fast cases covering strict
DTO parsing, one/many SKU activation order, Batch atomicity, disabled/enabled
validation, permission mapping, Deny behavior, stable replay identifiers,
idempotency conflict, timeout/retry, unknown outcome, error mapping and trusted
server/RPC boundaries.

The T5.2 E2E contract suite contains exactly 12 fail-fast cases covering the
standard and variant UI adapters, one selected Location with per-Item DTO
support, refresh recovery, no simulation trigger, granular Product permission,
browser denial, no per-SKU fallback, Bundle/Queue/Import/Rapid Entry/Live Sale
scope boundaries and user-facing recovery states.

Additional gates are TypeScript, Production build, affected Product regression,
isolated Supabase Auth/Storage preflight, baseline verifier/replay, Forward and
T4.2C–T4.4B apply, T4.4B SQL regression, security/no-duplicate/no-alias checks
and cleanup/Main-stack health confirmation.

## 7. Risks and Controls

- Product/SKU activation and Stock receive are separate transactions. Recovery
  state is durable in the browser draft and replays stable identifiers.
- A timeout can race a successful commit. `unknown_outcome` forbids a new key;
  replay must use the original key and payload.
- Current browser-draft storage is device-local. A future cross-device recovery
  registry would require a separately approved schema/contract.
- The platform hard timeout must remain above the workflow's 20-second soft
  timeout; auto-retry is suppressed when the remaining budget is insufficient.

## 8. QA Evidence

All approved T5.2 Local gates passed on the isolated project
`avenzo-one-t5-2-qa-20260821` using ports 55320–55329:

| Gate | Result |
|---|---|
| Auth/Storage preflight | PASS — `auth.users`, `auth.jwt()`, `auth.uid()`, `storage.buckets`, `storage.objects` present |
| Canonical baseline verifier | PASS — 90/90 files + 7/7 bridges |
| Canonical baseline replay | PASS — 90/90; bridges applied in approved dependency order |
| Forward migrations | PASS — 14/14 |
| T4 contract migrations | PASS — T4.2C → T4.3B → T4.4B |
| SQL regression/security | PASS — 15/15, including T4.4B atomicity/idempotency/no-duplicate/no-alias assertions |
| Affected application regression | PASS — 64/64 across activation/recovery, identifier, image and unified-creation suites |
| T5.2 Integration | PASS — 24/24 |
| T5.2 E2E contract | PASS — 12/12 |
| TypeScript | PASS — `tsc --noEmit` |
| Next.js Production build | PASS — 39/39 static pages generated; Product Creation route compiled |
| Database lint | PASS with one pre-existing non-blocking warning: unused variable in `platform_simulate_sandbox_payment_event`, outside T5.2 |
| Cleanup/isolation | PASS — isolated containers, volumes and transient harness removed; Main DB/Auth/Storage healthy |

Approved bridge order used by the transient harness:

1. `git_bridge_phase_0_7_permission_aware_ui`
2. `git_bridge_phase_0_7_restrict_organization_creation`
3. `git_bridge_phase_0_7_member_access_summary`
4. `git_bridge_phase_1_0_2_plans_prices`
5. `git_bridge_phase_1_0_2_1_plan_lifecycle`
6. `git_bridge_phase_1_1_3_3_stripe_test_checkout`
7. `recovered_bridge_stripe_test_event_current_definition`

The first replay attempt stopped before a completed baseline because the
transient PowerShell harness treated a PostgreSQL `NOTICE` as an error. No
Migration or Production Code was changed. The isolated stack was destroyed and
recreated from zero; the corrected harness then passed every gate above.

The final permission audit found two R7 test expectations that still required
legacy `product.manage`; only those expectations were reconciled to the approved
granular authorities and all 34 affected tests passed. A parallel TypeScript and
Next build attempt also caused a transient `.next/types` file race; the
Production build and `tsc --noEmit` both passed when rerun sequentially.

PM approval covers source Commit/Push on `codex/workstream-domain-qa` only. No
PREVIEW/Production connection, Remote database apply or deploy is authorized.

## 9. Next Action

Create the approved T5.2 source checkpoint and push only
`codex/workstream-domain-qa`. Do not deploy or connect/apply to PREVIEW or
Production without a separate approval.

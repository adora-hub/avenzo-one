# AVENZO ONE — Phase T5.3 PREVIEW Release Preflight

**Status:** Approved/Closed

**Approval Date:** 21 August 2026

**Branch:** `codex/workstream-domain-qa`

**Domain Baseline:** `e49e210` — T5.2 Approved/Closed

**Approved Web/UI Baseline:** `codex/workstream-ui` commit `9bfcff4`

**Environment:** AVENZO ONE PREVIEW (`kenhlerbirchcpzgnfsh`) only

**Production/Deploy Status:** Production was not connected to, queried, migrated, or changed. No deployment was performed.

## 1. Approval Scope

PM approved the integrated T5.3 baseline, the forward-only SKU-04 granular
authority correction, the PREVIEW migration apply, and smoke gates P01–P14.
This closure does not authorize Production apply or Web deployment. The
Owner-locked atomic stock, stable idempotency, recovery, `stock_pending`,
granular Product authority, Individual Deny, tenant isolation, and branch
isolation contracts remain unchanged.

## 2. Integrated Baseline and Corrective Migration

The approved UI baseline `9bfcff4` was merged into the Domain workstream without
rebase. Conflict resolution kept the T5.2 backend workflow as authority while
preserving approved UI states. The corrective migration is forward-only:

- `20260821060222_sku_04_granular_product_create_authority.sql`
- replaces SKU-04 compatibility checks based on `product.manage` with exact
  `product.create` and `product.update` authorities;
- delegates effective permission evaluation to the approved T4.3B helper, so
  active Individual Deny continues to win over Role Allow;
- preserves service-only execution and creates no schema, policy, permission
  alias, browser grant, or duplicate function surface.

## 3. PREVIEW Apply Record

The authenticated Supabase connection was confirmed as AVENZO ONE PREVIEW
before apply. Migrations were applied in this order:

| Order | Local migration | PREVIEW history version | Result |
|---:|---|---:|---|
| 1 | `20260820074733_phase_t4_2c_permission_rls_contract.sql` | `20260821122715` | PASS |
| 2 | `20260820152508_phase_t4_3b_individual_permission_overrides.sql` | `20260821122730` | PASS |
| 3 | `20260821000304_phase_t4_4b_atomic_batch_receive.sql` | `20260821122742` | PASS |
| 4 | `20260821060222_sku_04_granular_product_create_authority.sql` | `20260821122755` | PASS |

No schema was duplicated. Post-apply metadata confirmed the approved granular
permission catalog, SKU SELECT authority `sku.read`, the two private individual
override tables, the two approved Batch tables, and one approved atomic Batch
RPC.

## 4. PREVIEW Smoke Test P01–P14

All behavior tests used explicit transactions and rollback, so their fixtures
were not persisted in PREVIEW.

| Gate | Contract under test | Result |
|---|---|---|
| P01 | `anon` cannot read/write Batch surfaces or execute the receive RPC | PASS |
| P02 | authenticated Browser cannot directly write Batch, Command, Movement, Balance, or Event surfaces | PASS |
| P03 | authenticated Browser cannot execute `server_receive_inventory_batch` | PASS |
| P04 | `service_role` cannot bypass the approved Batch table mutation boundary | PASS |
| P05 | trusted service receive with `inventory.receive` and valid branch scope succeeds | PASS |
| P06 | individual Branch Allow plus valid membership succeeds | PASS |
| P07 | active Individual Deny overrides Role Allow | PASS |
| P08 | Branch Allow without Branch membership is denied | PASS |
| P09 | expired Allow is denied at statement time | PASS |
| P10 | cross-tenant and cross-branch access is denied | PASS |
| P11 | `inventory_batch.read` exposes only the exact authorized branch | PASS |
| P12 | receive without Batch read can mutate through the server boundary but cannot read Batch rows | PASS |
| P13 | Batch read without movement/audit read cannot expose ledger or audit data | PASS |
| P14 | exactly two approved Batch tables and one RPC exist; no duplicate, alias, or legacy Batch surface exists | PASS |

Executed regression evidence:

- `phase_t4_2c_permission_rls_contract.sql`
- `phase_t4_3b_individual_permission_overrides.sql`
- `phase_t4_4b_atomic_batch_receive.sql`
- `phase_t5_3_sku_04_granular_product_create_authority.sql`

Atomic rollback, same-key replay, different-payload conflict, duplicate command,
movement lineage, balance update, Individual Deny, organization/branch ceiling,
and Browser/service boundary assertions all passed.

## 5. Security and Lint

Post-apply metadata confirmed:

- `anon` and `authenticated` have no execute privilege on the Batch RPC;
- `service_role` has execute privilege on the Batch RPC but no direct DML grant
  on the two Batch tables;
- RLS is enabled on both approved Batch tables;
- the only non-sales Batch tables are `inventory_receive_batches` and
  `inventory_receive_batch_items`;
- no `inventory_locations` or `inventory_movements` legacy alias exists;
- the four approved immutability/guard triggers exist on Batch Header/Items.

Security Advisor returned no ERROR attributable to T4.2C–T5.3. Relevant INFO
entries report RLS with no policy on the private override tables and
`sku_product_sequences`; this is the approved deny-by-default/service-boundary
model. Performance Advisor returned INFO only. Newly applied Batch indexes are
reported as unused because PREVIEW has not accumulated workload yet. Two
historical SKU sequence actor foreign keys remain informational candidates for
covering indexes and are not a T5.3 correctness or security failure.

References:

- [Supabase RLS-no-policy advisor](https://supabase.com/docs/guides/database/database-linter?lint=0008_rls_enabled_no_policy)
- [Supabase unindexed-foreign-key advisor](https://supabase.com/docs/guides/database/database-linter?lint=0001_unindexed_foreign_keys)
- [Supabase unused-index advisor](https://supabase.com/docs/guides/database/database-linter?lint=0005_unused_index)

## 6. Closure and Stop Gate

T5.3 PREVIEW Release Preflight is Approved/Closed. AVENZO ONE PREVIEW contains
the approved migration chain and passed P01–P14. Production apply and Web deploy
remain separate stop gates and require explicit PM/Owner authorization.

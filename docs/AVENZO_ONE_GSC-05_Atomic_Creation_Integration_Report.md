# AVENZO ONE — GSC-05 Atomic Creation Integration Report

**Status:** Local implementation complete — pending Owner approval  
**Date:** 21 August 2026  
**Branch:** `codex/workstream-ui`

## Outcome

GSC-05 now provides one trusted Server/Database boundary for permanent Global
Sales Code V1 assignment during Product creation:

- Normal: one Product and one SKU with one confirmed Sales Code.
- Variant: one Product graph with one different Sales Code per enabled SKU.
- Rapid: 1–50 Products/SKUs in one all-or-nothing command.

The allocator reservation, Product/SKU graph and reservation assignment are in
the same PostgreSQL transaction. A failure at any row or SKU rolls back the
entire applicable command.

## Runtime Contract

- RPC: `server_execute_global_sales_code_creation`
- Server Action: `executeGlobalSalesCodeCreationAction`
- Modes: `sequence`, `manual`, `same_as_sku`, `deferred`
- Flows: `normal`, `variant`, `rapid`
- Rapid rejects `deferred` because every submitted row needs a permanent Sales
  Code.
- Stable outer and child Command IDs make timeout/retry idempotent.
- The command result reports `inventory_posted: false` and
  `initial_stock_boundary: t5-pending`.

GSC-05 does not write `inventory_balances` or `stock_movements`; T5 remains the
sole Initial Stock authority.

## Security

- Command table has forced RLS and no `anon`/`authenticated` grants.
- Public RPC execution is revoked from Browser roles and granted only to
  `service_role`.
- Server Action resolves the authenticated Organization actor and requires
  `product.create`.
- Security-definer functions use an empty `search_path` and fully qualified
  relations.

## Verification

- GSC-02 contract: 11/11 tests passed.
- GSC-03 static: 4/4 passed.
- GSC-04 static: 4/4 passed.
- GSC-05 static/integration contract: 5/5 passed.
- TypeScript no-emit: passed.
- Isolated Supabase QA:
  - Production baseline replay: 90/90.
  - Compatibility bridges: 7/7.
  - Forward migrations plus GSC-03 → GSC-04 → GSC-05: passed.
  - Normal creation and idempotent replay: passed.
  - Two-SKU Variant assignment: passed.
  - Rapid 50-row atomic creation: passed.
  - Duplicate conflict with complete rollback: passed.
  - Browser table/RPC denial and service-only execution: passed.
- Temporary QA containers, volumes and files were removed after testing.

The Production Build command was stopped after it produced no progress output
for several minutes while the existing Local dev environment was active.
TypeScript and all scoped runtime/database gates passed; the build must be run
again at the later GSC-08 release gate with the dev compiler isolated.

## Files

- `supabase/migrations/20260821143000_phase_gsc_05_atomic_creation_integration.sql`
- `supabase/tests/phase_gsc_05_atomic_creation_integration.sql`
- `web/src/lib/foundation/global-sales-code-creation.server.ts`
- `web/src/app/actions/foundation.ts`
- `web/scripts/test-global-sales-code-gsc-05.mjs`
- `web/scripts/test-global-sales-code-gsc-05-replay.mjs`
- `web/package.json`

## Boundary to GSC-06

GSC-05 supplies the authoritative backend path but does not change the current
Normal, Variant or Rapid UI. GSC-06 will connect the approved screens to this
Server Action and standardize preview, loading, error, conflict and assigned
states without adding another allocator.

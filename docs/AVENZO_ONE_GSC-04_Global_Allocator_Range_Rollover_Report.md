# AVENZO ONE — GSC-04 Global Allocator, Range Discovery and Rollover Report

**Status:** Local Implementation Complete — Pending Owner Approval  
**Date:** 21 August 2026  
**Branch:** `codex/workstream-ui`  
**Remote/Deploy:** None

## Outcome

GSC-04 now extends the existing A4 allocator so a trusted server can discover
and reserve the next actually available permanent Sales Code or one contiguous
range of 1–50 codes for an Organization. It does not create a second allocator,
identifier registry or Browser write path.

The implementation remains local. It was not applied to PREVIEW or Production,
and GSC-05 was not started.

## Implemented Contract

- Canonical range size: 1–50 codes.
- Fixed temporary reservation lifetime: three hours.
- Prefix progression and rollover follow Global Sales Code V1.
- A range never splits across Prefixes; when the remaining space is too small,
  the complete range starts at the next available Prefix.
- Organization/purpose advisory locking and command row locking prevent
  overlapping reservations.
- A retry with the same idempotency key and payload returns the original result.
- Expired or released reservations that were never assigned may return to the
  pool; assigned permanent codes never do.
- Preview and reserve functions are explicitly denied to `public`, `anon` and
  `authenticated`, and granted only to `service_role`.
- `product.create` is the granular permission for allocation. The migration
  backfills compatible Owner/Admin roles without falling back to
  `product.manage`.

## Files

- `supabase/migrations/20260821115026_phase_gsc_04_global_allocator_range_rollover.sql`
- `supabase/tests/phase_gsc_04_global_allocator_range_rollover.sql`
- `web/scripts/test-global-sales-code-gsc-04.mjs`
- `web/scripts/test-global-sales-code-gsc-04-replay.mjs`
- `web/package.json`
- `docs/AVENZO_ONE_Global_Sales_Code_Implementation_Plan_V1.md`

## Verification

| Gate | Result |
| --- | --- |
| Static GSC-02/GSC-03/GSC-04 contracts | PASS — 20/20 after rerunning the Docker-backed test with required access |
| TypeScript | PASS — `npx tsc --noEmit --incremental false` |
| Baseline replay | PASS — 90/90 migrations |
| Compatibility bridges | PASS — 7/7 |
| GSC-03 behavior regression | PASS |
| GSC-04 SQL behavior suite | PASS |
| Range 1 / range 50 / boundary rollover | PASS |
| Concurrent different commands | PASS — `X001–X050`, `X051–X100` |
| Same key + same payload | PASS — one command and one reservation batch |
| Large synthetic dataset | PASS — 9,990 SKUs |
| Full `J` Prefix | PASS — next range `K001–K050` |
| Measured preview execution | PASS — approximately 15.08 ms |
| `git diff --check` | PASS |

The first performance-fixture attempt inserted all synthetic rows in one
transaction and exhausted PostgreSQL shared lock memory. The fixture was
corrected to commit bounded batches of 250 rows; database configuration was not
weakened or increased to hide the issue.

## Safety and Cleanup

- QA ran only on the isolated project `avenzo-one-gsc04-qa` using ports
  55340–55349.
- The isolated containers, volumes and temporary `.gsc04-qa` directory were
  removed after verification.
- The main local stack was not reset or modified by the replay.
- No secret is recorded in tracked files.
- No PREVIEW/Production connection, migration apply, commit, push or deploy was
  performed.

## Owner Test Gate

GSC-04 has no user-facing UI wiring by design. Owner review should confirm the
allocator rules and evidence above. UI validation such as rejecting `A000` is
scheduled for GSC-06; atomic Product/SKU consumption is scheduled for GSC-05.

After approval, the next Part is GSC-05 — Atomic Creation Integration for
normal products, multiple-option products and Rapid Entry / Live Sale.

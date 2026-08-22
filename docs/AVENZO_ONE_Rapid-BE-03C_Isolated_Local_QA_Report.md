# AVENZO ONE — Rapid-BE-03C Isolated Local QA Report

**Status:** PASS — Ready for PM Review

**Date:** 22 August 2026

**Branch:** `codex/workstream-ui`

## Outcome

The Rapid-BE-03B reserved-batch Product/SKU creation contract passed all
approved Rapid-BE-03C Local gates on a dedicated Supabase stack. The test stack
used ports 55420–55429 and did not share the Main Local database.

No PREVIEW or Production connection, Apply, Deploy, Commit or Push occurred.

## Gates

| Gate | Result |
|---|---|
| Canonical baseline verifier | PASS — 90 migrations and 7 bridges |
| Baseline/forward/GSC replay | PASS |
| Rapid-BE-03B Migration Apply | PASS |
| Selected subset and unselected reservation | PASS |
| Scale boundaries | PASS — 1, 10 and 50 rows |
| Atomic rollback | PASS — invalid row creates/assigns nothing |
| Stable retry | PASS — same Command/payload returns identical result |
| Idempotency conflict | PASS — same Command/different payload is rejected |
| Reservation guards | PASS — expired and foreign-owned batches rejected |
| Individual permission Deny | PASS — Deny beats Admin role baseline |
| Browser security | PASS — anon/authenticated cannot execute trusted RPC |
| Same-command concurrency | PASS — one result and one persisted creation |
| Overlapping reversed order | PASS — no deadlock and no partial commit |
| Disjoint subsets | PASS — both commands consume only selected rows |
| Normal/Variant GSC regression | PASS |
| T4.3 permission regression | PASS |
| Database lint | PASS — zero errors |
| Query-plan/index evidence | PASS — supporting batch lookup index exists; measured test query executed |

## Test Fixture Corrections

Two test-only corrections were required:

1. Branch creation supplies authenticated JWT claims because the approved
   Branch entitlement trigger correctly rejects unauthenticated writes.
2. Individual Deny is created through
   `server_set_member_permission_override(...)`; direct writes to the private
   override table remain forbidden.

Neither correction changes Production schema or relaxes security.

## Files

- `supabase/migrations/20260822100620_rapid_be_03b_reserved_batch_creation.sql`
- `supabase/tests/rapid_be_03b_reserved_batch_creation.sql`
- `supabase/tests/rapid_be_03c_reserved_batch_full_contract.sql`
- `web/scripts/test-rapid-be-03c-concurrency.mjs`

## Safety and Cleanup

- The isolated containers, volumes and temporary harness directory were
  removed after the run.
- The Main Local Supabase stack was not reset, migrated or modified.
- Image writes and Initial Stock writes remain intentionally pending for
  Rapid-BE-04 and Rapid-BE-05.
- Real Browser submit remains gated until Rapid-BE-04, BE-05 and BE-06 close.

## Next Action

Stop for PM review. The next planned part is **Rapid-BE-04 — Image staging,
finalize and compensation**. Commit/Push and any PREVIEW action require a
separate explicit approval.

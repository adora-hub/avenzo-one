# AVENZO ONE — GSC-03 Database Compatibility Migration Report

Status: **Local Implementation Complete — Pending Owner Approval**
Date: 21 August 2026
Environment: Local isolated QA only; no PREVIEW or Production apply

## 1. Outcome

GSC-03 adds a forward-only compatibility layer on top of the existing A4
allocator. It does not replace the permanent identifier registry, sequence
locking, idempotency, audit events or tenant isolation established by A4.

The Database now treats:

- existing sequence definitions as `legacy` and read-only;
- every new sequence definition as `global_v1`;
- every new permanent Sales Code as `A001` through `ZZZ999`;
- the numeric suffix `000` as reserved and invalid;
- existing non-V1 Sales Codes as grandfathered values that remain readable and
  unchanged.

## 2. Database authority

The shared predicate is `private.is_global_sales_code_v1(text)`:

```text
^[A-Z]{1,3}[0-9]{3}$
```

with an additional rule that the last three digits must not be `000`.

The predicate is enforced by three private trigger boundaries:

1. `public.skus` — Manual, Same-as-SKU, Import and trusted Product/SKU commands;
2. `public.sales_code_sequences` — new Global V1 definitions and immutable
   legacy definitions;
3. `public.sales_code_reservations` — reserved and assigned codes from A4.

The trigger on `public.skus` executes after the existing canonical SKU writer,
so trimming and upper-casing happen before Global V1 validation.

## 3. Compatibility behavior

- Historical values are not rewritten or deleted.
- Historical non-V1 Sales Codes may remain attached to their current SKU.
- An unrelated SKU field can still be edited without changing its grandfathered
  Sales Code.
- Legacy sequences cannot allocate or reserve more codes after GSC-03.
- A4 permanent registry and cross-field uniqueness remain authoritative.
- GSC-03 does not implement rollover/range discovery; that belongs to GSC-04.
- Sales Code rotation and permanent aliases remain reserved for the later
  approved lifecycle Part.

## 4. Security

- `anon` receives no allocator table access.
- `authenticated` keeps tenant-scoped read access only.
- Browser roles cannot insert/update allocator tables.
- Browser roles cannot execute `server_execute_sales_code_command(...)`.
- The command remains explicitly granted only to `service_role` and performs
  its existing permission check.
- All public allocator tables retain RLS defense in depth.

This follows the current Supabase Data API guidance: table exposure and RLS are
separate controls, so GSC-03 reasserts explicit grants in addition to RLS.

## 5. Verification

Passed locally:

- GSC-02 shared contract: 11/11;
- GSC-03 structural contract: 4/4;
- A1/A4/Live reservation regressions: 18/18;
- isolated compatibility behavior: 1/1;
- canonical Production baseline verifier: 90/90 migrations + 7/7 bridges;
- isolated Supabase Stack replay: baseline 90/90 + bridges 7/7 + forward
  migrations + GSC-03;
- Manual invalid, Same-as-SKU invalid, `000`, Thai and malformed values rejected;
- valid normalized Manual, valid Same-as-SKU, upper boundary and trusted
  allocator assignments accepted;
- Browser direct writes and Browser command execution denied;
- QA Stack and volumes removed after verification; main Local stack remained
  healthy.

## 6. Files

- `supabase/migrations/20260821112527_phase_gsc_03_global_sales_code_compatibility.sql`
- `supabase/tests/phase_gsc_03_global_sales_code_compatibility.sql`
- `web/scripts/test-global-sales-code-gsc-03.mjs`
- `web/scripts/test-global-sales-code-gsc-03-database.mjs`
- `web/scripts/test-global-sales-code-gsc-03-replay.mjs`

## 7. Gate

No PREVIEW/Production apply, Deploy, Commit or Push is included. GSC-04 must not
start until the Owner reviews and approves GSC-03.

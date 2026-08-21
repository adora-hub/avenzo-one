# AVENZO ONE — Global Sales Code Implementation Plan V1

**Status:** GSC-07 Local Import/API Compatibility Complete — Pending Owner Test
**Updated:** 21 August 2026
**Source of Truth:** `AVENZO_ONE_Global_Sales_Code_Standard_V1.md`
**Required before:** Rapid Backend production integration and any new Product
creation workflow that assigns a permanent Sales Code

## 1. Objective

Implement one shared Sales Code authority for:

1. Normal product creation
2. Product creation with multiple options / SKU combinations
3. Rapid Entry / Live Sale product creation
4. Excel import and future authenticated APIs

Every new permanent Sales Code must use `A001–A999 → B001–B999 → ... →
Z999 → AA001`, be unique inside one Organization and resolve permanently to
one `sku_id`.

This plan applies to permanent Sales Codes only. Session-scoped Live Codes are
a different identifier contract and must not be silently converted into
permanent Sales Codes.

## 2. Current Baseline and Confirmed Gaps

The existing A4 allocator already provides useful foundations:

- Organization-scoped sequence and reservation tables
- Identifier registry and cross-field collision protection
- Atomic row locking, idempotent commands and audit events
- Permanent assignment and reservation lifecycle
- Concurrency tests

The current implementation is not yet compliant with the new global standard:

- Prefix currently accepts letters, digits, underscore and hyphen and may be
  longer than three letters.
- Sequence may start at `0` and use 1–12 digits.
- Current allocator exhausts one sequence; global alphabetic Prefix rollover is
  not yet an authority shared by all workflows.
- Normal, Variant and Rapid Entry screens use different client validation and
  preview logic.
- Rapid Entry is still a UI simulation and normal/Variant creation can accept
  manually shaped Sales Codes outside the new V1 format.
- Existing historical identifiers must remain readable without being rewritten.

The implementation must extend and reconcile A4. It must not create a second
parallel allocator or a second identifier registry.

## 3. Sequential Development Plan

Only one Part may be in progress at a time. Every Part stops for PM/Owner review
before the next Part begins.

### GSC-01 — Baseline Reconciliation and Contract Matrix

Current result:

- Baseline and Decision Matrix are documented in
  `AVENZO_ONE_GSC-01_Baseline_Reconciliation_and_Contract_Matrix.md`.
- No runtime code, Migration, RPC, API or UI was changed.
- Owner approved decisions D1–D15, including three-hour reservation expiry,
  automatic allocation before usable/imported state and audited Sales Code
  rotation with a permanent historical alias.
- GSC-02 may begin only after a new explicit Owner approval.

Scope:

- Inventory every current Sales Code write path, migration, trigger, RPC,
  Server Action, UI validator, import parser and test.
- Reconcile A1, A4, SKU-04, Unified Product Creation, Variant Creation, Rapid
  Entry, T5 Initial Stock and T4.3 granular permissions.
- Classify existing data as `V1 compliant`, `grandfathered legacy`, `collision`,
  `ambiguous` or `invalid new assignment`.
- Freeze the exact distinction between permanent Sales Code and session Live
  Code.
- Produce a Decision Matrix for compatibility, permissions, rollover,
  reservation expiry and manual/Same-as-SKU behavior.

Acceptance gate:

- No code or migration yet.
- All write paths and current Database surfaces are listed with exact files.
- No duplicate allocator/table/function is proposed.
- Owner approves all compatibility decisions.

### GSC-02 — Shared Canonical Contract Library and UI Specification

Current result:

- **Owner accepted / closed.**
- Shared pure TypeScript contract and scoped tests are implemented locally.
- UI wording and authority boundaries are documented in
  `AVENZO_ONE_GSC-02_Shared_Contract_and_UI_Specification.md`.
- Existing Product/Variant/Rapid screens are not rewired in this Part.
- No Migration, RPC, API, PREVIEW or Production change was made.
- The contract is the shared authority for the remaining GSC Parts.

Scope:

- Create one reusable TypeScript module for normalize, validate, format,
  increment Prefix, calculate capacity and display errors.
- Canonical pattern: uppercase `A–Z` Prefix of 1–3 letters plus exactly three
  digits from `001–999`.
- Implement deterministic Prefix progression `A...Z, AA, AB...ZZZ`.
- Define bounded request/response contracts for one-code preview and contiguous
  range preview.
- Define the shared labels, helper text, invalid states, loading, conflict and
  next-available suggestion used by all three creation experiences.
- Update Design System guidance for Sales Code fields without redesigning
  unrelated approved UI.

Acceptance gate:

- Unit/property tests cover `A001`, `A999 → B001`, `Z999 → AA001`,
  `AA999 → AB001`, `ZZZ999` exhaustion and invalid `000`.
- Thai, whitespace, punctuation, mixed case and malformed widths have explicit
  results.
- Normal, Variant and Rapid UI specifications use the same terms and states.
- TypeScript and scoped contract tests pass.

### GSC-03 — Forward-only Database Compatibility Migration

Current status: **Owner accepted / closed**

Current result:

- Added a CLI-created forward-only migration on top of A4.
- Existing sequence definitions are marked `legacy` and read-only; new
  definitions default to `global_v1`.
- New Sales Codes are enforced at the Database boundary as 1–3 English letters
  plus three digits, with `000` reserved.
- Manual, Same-as-SKU, reservation and trusted command paths share the same
  predicate; historical non-V1 values remain readable and unchanged.
- Browser writes remain denied and the privileged command remains service-only.
- Baseline verifier and isolated replay passed 90/90 migrations + 7/7 bridges,
  followed by Forward migrations and the GSC-03 behavior suite.
- PREVIEW/Production were not connected or changed.

Scope:

- Design a forward-only migration on top of the existing A4 allocator.
- Preserve historical non-V1 Sales Codes as grandfathered read-only values.
- Prevent every new permanent assignment outside Global V1, including trusted
  command paths; do not rely on Browser validation.
- Separate legacy sequence definitions from new Global V1 sequence definitions
  without rewriting or deleting historical rows.
- Add only necessary constraints/indexes/metadata after measuring current data
  and query plans.
- Keep the permanent identifier registry and cross-field uniqueness authority.
- Use explicit grants, tenant-safe relationships, RLS defense in depth and a
  trusted server boundary; do not expose privileged allocator writes to the
  Browser.

Acceptance gate:

- Baseline migrations replay cleanly in an isolated stack.
- Historical data remains readable and unchanged.
- New invalid Manual, Same-as-SKU and Sequence assignments are rejected by the
  Database authority.
- Anonymous and Browser direct writes are denied.
- No PREVIEW or Production apply.

### GSC-04 — Global Allocator, Range Discovery and Rollover

Current status: **Local Implementation Complete — Pending Owner Approval**

Current result:

- Extended the existing A4 sequence, reservation, command, event, audit and
  permanent identifier registry surfaces; no parallel allocator was created.
- Added service-only preview and reserve boundaries for contiguous ranges of
  1–50 permanent Sales Codes with a fixed three-hour reservation lifetime.
- Added indexed high-water discovery, complete-Prefix rollover, reusable
  expired/released never-assigned reservations, Organization locking and
  idempotent command replay.
- Legacy and `global_v1` sequence definitions can coexist without rewriting
  historical Sales Codes. Assigned permanent identifiers never return to the
  pool.
- Isolated replay passed 90/90 baseline migrations, 7/7 bridges, GSC-03 and
  GSC-04 behavior tests. Concurrent requests produced `X001–X050` and
  `X051–X100`; the same key and payload produced one command/result.
- With 9,990 synthetic SKUs, a full `J` Prefix rolled to `K001–K050`; measured
  preview execution time was about 15 ms.
- PREVIEW/Production were not connected or changed. GSC-05 remains blocked
  until Owner approval.

Scope:

- Extend the existing allocator to find the next actually available permanent
  Sales Code for an Organization.
- Add a bounded indexed query for the next contiguous range of 1–50 codes.
- Continue after the high-water mark; do not repeatedly suggest each occupied
  code one at a time.
- A batch stays inside one Prefix. If insufficient capacity remains, recommend
  the next Prefix with a complete range.
- Implement Prefix rollover, `000` reservation, exhaustion and deterministic
  conflict responses.
- Preserve advisory/row locking, canonical lock order, idempotency and audit.
- Define expiry/release rules for unassigned reservations; assigned permanent
  codes never expire or return to the pool.

Acceptance gate:

- Two concurrent actors cannot receive the same code or overlapping range.
- Retry with the same idempotency key returns the same result.
- Conflict returns the next available candidate/range.
- Range 1 and range 50, boundary rollover and exhausted Prefix tests pass.
- Query plan and latency are measured with a large synthetic dataset.

### GSC-05 — Atomic Creation Integration for All Three Modes

Current result:

- Added one trusted, service-only atomic creation command for Normal, Variant
  and Rapid flows; no Browser writes are permitted.
- Sequence allocation, Product/SKU creation and reservation confirmation now
  share one PostgreSQL transaction and stable outer/child Command IDs.
- Rapid creation supports 1–50 rows in one all-or-nothing command. Duplicate
  or invalid rows roll back the complete command with no partial fallback.
- Manual, Same-as-SKU and deferred Draft behavior reuse the same Database
  trigger and identifier registry authority. Rapid does not allow deferred
  Sales Codes.
- Initial Stock is deliberately returned as `t5-pending`; GSC-05 does not
  write Inventory balances or Stock Movements directly.
- Full isolated baseline replay passed 90/90 migrations and 7/7 bridges.
  Normal, two-SKU Variant, Rapid 50-row, replay, atomic rollback and security
  tests passed. PREVIEW/Production were not connected or changed.
- The authenticated Server Action is ready for GSC-06 UI wiring. Existing
  screen layout and wording were not changed in this Part.

Scope:

- Normal product creation assigns or confirms one Sales Code through the shared
  authority in the Product/SKU creation transaction.
- Multi-option creation assigns one different Sales Code per enabled SKU and
  rolls back the complete Product graph if any assignment fails.
- Rapid Entry consumes the selected ready reservations for 1–50 rows through
  one all-or-nothing command; unselected reservations follow the approved
  reservation lifecycle.
- Manual mode and Same-as-SKU mode use the same Database validation and claim
  path as Sequence mode.
- Preserve stable command IDs across timeout/retry and prevent double-click
  duplication.
- Integrate with the approved T5 Initial Stock boundary without directly
  writing balances or weakening its atomic/recovery contract.

Acceptance gate:

- No Product/SKU without its requested Sales Code and no Sales Code assigned to
  a missing/rolled-back SKU.
- Any duplicate, invalid code, permission denial or concurrency conflict rolls
  back the entire applicable creation command.
- Normal 1 SKU, Variant N SKUs and Rapid 1–50 rows pass integration tests.
- No partial-success fallback exists.

### GSC-06 — Shared UI Implementation and Parity

Implementation checkpoint (21 August 2026):

- Normal, Multi-option and Rapid Entry now import the GSC-02 validator and use
  the authenticated `server_preview_global_sales_code_range` boundary.
- Sequence is the default for new Normal drafts. Every new code uses one to
  three English Prefix letters plus exactly three digits; `000` remains
  rejected by the shared contract.
- Multi-option requests one complete authoritative range for all enabled SKUs,
  displays the real first/last code and never silently accepts a malformed
  manual or Same-as-SKU value.
- Rapid Entry removed its deterministic A120 simulation and its local test
  controls. It requests the real 50-code range, handles Prefix rollover and
  labels the result as a Server preview that is not reserved until creation.
- All three flows retain input across loading, timeout, permission, error and
  retry states, and ignore stale asynchronous responses.
- TypeScript and the scoped GSC/Product/Variant/Rapid suites pass. Production
  build did not complete while the active localhost Next.js process held the
  shared `.next` workspace; Owner visual approval and a clean build checkpoint
  remain required before GSC-07.

Scope:

- Replace per-screen Sales Code validation/preview helpers with the GSC-02
  shared module and authenticated Server preview.
- Normal creation: Sequence is the recommended default; Manual and Same-as-SKU
  clearly show eligibility and authority.
- Multi-option creation: display the proposed code for each enabled SKU and
  recheck the complete set together.
- Rapid Entry: Prefix scan recommends a real 50-code range and visibly
  distinguishes preview, reserved and assigned states.
- Existing grandfathered codes remain visible/readable; editing cannot silently
  transform them.
- Keep all approved layout, button, Combobox, Tooltip and Design System rules.

Acceptance gate:

- Same input produces the same normalized result, message and suggestion in all
  three modes.
- Loading, timeout, stale response, conflict, permission and retry states pass.
- Keyboard/accessibility, TypeScript, production build and full Product/Rapid
  regressions pass.
- Owner visually approves each mode before GSC-07.

### GSC-07 — Import, API and Compatibility Gate

Implementation checkpoint (21 August 2026):

- Excel Import now uses the GSC-02 canonical validator. Blank Sales Codes are
  explicitly classified for automatic allocation; supplied codes are preserved
  only when they pass Global V1.
- The authenticated dry-run uses `product.create` plus `sku.create`, checks
  identifiers inside the requested Organization and returns only submitted
  values. It never exposes the Product/SKU that owns a conflict.
- Preview distinguishes invalid rows, duplicates in the file, Organization
  conflicts and grandfathered historical codes. Known conflicts block the
  confirmation button instead of silently importing the remaining rows.
- Every write group contains at most 50 rows and reuses one stable outer GSC-05
  trusted command. Blank codes receive the authoritative proposed range before
  the command; supplied and proposed codes are claimed together. Any failure
  rolls back the complete group with no per-row fallback.
- Files larger than 50 valid rows are processed as sequential atomic groups.
  A completed earlier group remains idempotently replayable if a later group
  fails; the UI states this boundary rather than claiming whole-file atomicity.
- Historical identifiers remain unchanged and continue through the existing
  search/read model. A grandfathered code is readable/searchable but cannot be
  used for a new assignment. Correction remains an audited Rotate Sales Code
  workflow; GSC-07 does not enable direct mutation or reuse.
- No Database Migration, PREVIEW apply, Production connection or Deploy was
  introduced in this Part.

Scope:

- Excel import and future authenticated API use the same canonical validator
  and trusted assignment command.
- Import preview reports invalid, duplicate, grandfathered and conflicting
  codes by row before any write.
- Define whether blank imported Sales Codes use Sequence allocation or remain
  blank; require explicit Owner approval rather than silently guessing.
- Keep searches and exports compatible with grandfathered historical values.
- Document a correction workflow for mistakenly assigned permanent codes; do
  not enable direct mutation or code reuse.

Acceptance gate:

- Import dry-run and atomic write tests pass for mixed valid/invalid rows.
- API cannot bypass canonical format, permission or tenant scope.
- Existing historical identifiers remain searchable and export unchanged.
- No cross-Organization information leak in duplicate/availability responses.

### GSC-08 — Security, Concurrency, PREVIEW and Closure Gate

Scope:

- Run isolated full migration replay and all Product/Variant/Rapid/T5
  regressions.
- Run multi-session concurrency, idempotency, rollback, RLS, Individual Deny,
  audit and exact-surface tests.
- Reconcile PREVIEW schema using SELECT-only inspection after explicit Owner
  approval.
- Create backup/rollback/smoke-test plan before applying any migration.
- Apply and deploy to AVENZO ONE PREVIEW only after a separate explicit Owner
  approval; Production remains prohibited.
- Execute E2E for normal, multi-option, Rapid Entry and import flows against the
  real PREVIEW authority.

Acceptance gate:

- All gates pass without skipped tests or partial writes.
- PREVIEW E2E proves permanent lookup resolves exactly one `sku_id`.
- No new Security Advisor issue related to the change.
- Owner completes final acceptance and explicitly closes Global Sales Code V1.

## 4. Dependency and Plan Mapping

- GSC-01–04 absorb and supersede the Sales Code-specific work previously listed
  as Rapid-BE-01 and Rapid-BE-02.
- GSC-05 provides the Sales Code portion of Rapid-BE-03 and must integrate with
  T5 Initial Stock rather than duplicate it.
- Rapid-BE-04 image staging remains a separate workstream.
- Rapid-BE-05 Initial Stock uses the already approved Phase T/T5 boundary.
- Rapid-BE-06 starts only after GSC-08 closes.

## 5. Explicit Non-goals

- No automatic rewrite of historical Sales Codes
- No Thai Sales Code mode in V1
- No reuse of archived, trashed, released or previously assigned permanent codes
- No direct Browser write to allocator tables or identifier registry
- No second allocator dedicated to Rapid Entry
- No Production migration or deployment without a later explicit Owner approval

## 6. Immediate Next Action

GSC-07 is locally implemented and awaits Owner testing of Excel dry-run,
automatic blank-code allocation, conflict blocking and one 1–50 row atomic
group. Do not begin **GSC-08 — Security, Concurrency, PREVIEW and Closure Gate**
until the Owner explicitly approves GSC-07.

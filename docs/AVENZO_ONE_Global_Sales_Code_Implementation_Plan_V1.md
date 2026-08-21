# AVENZO ONE — Global Sales Code Implementation Plan V1

**Status:** GSC-01 Owner Approved and Closed — GSC-02 Ready
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

GSC-01 is closed. The next Part is **GSC-02 — Shared Canonical Contract Library
and UI Specification**. Do not start GSC-02 until the Owner explicitly approves
it, and do not create a Database Migration or runtime allocator change before
the later approved Parts.

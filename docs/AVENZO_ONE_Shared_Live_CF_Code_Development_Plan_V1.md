# AVENZO ONE — Shared Live CF Code Development Plan V1

**Status:** Future Development Plan — Owner Direction Recorded

**Updated:** 22 August 2026

**Depends on:** Global Sales Code V1 closure, Product Variant creation stability,
Live Sale order parsing, and the approved Inventory/Stock transaction boundary

## 1. Objective

Support two different Sales Code / CF workflows for a multi-option Product
without weakening permanent SKU identity or causing the wrong SKU to be added to
an Order or deducted from Stock.

1. **Separate code per SKU** — the existing safe workflow. Example: `A017`,
   `A018`, and `A019` resolve directly to three different SKUs.
2. **One shared Live CF code for the Product group** — example: `A017` identifies
   the Product group and the remaining customer words identify the exact SKU.

Example shared-code input:

`A017 ทอง ฟ้าเทา`

- Shared CF code: `A017`
- Option 1: `ทอง`
- Option 2: `ฟ้าเทา`
- Resolved SKU: `MU-001-GLD-V1`

The SKU Code remains unique in both workflows.

## 2. Owner-approved Product Direction

The system must eventually provide both modes:

| Mode | Recommended use | Customer input | Resolution |
|---|---|---|---|
| Separate code per SKU | Normal selling and the default multi-option workflow | `A018` | Resolves directly to one SKU |
| Shared code for all options | Live Sale where the seller announces one easy code | `A017 ทอง ฟ้าเทา` | Resolves the shared Product group first, then the exact option combination |

Defaults:

- Normal multi-option creation defaults to **Separate code per SKU**.
- A future Live Sale creation flow may default to **Shared code for all options**.
- The operator may switch modes only before the code is published or used by an
  Order. Later changes require an audited command and compatibility rules.

## 3. Safety Decision: Do Not Duplicate One Code Across SKU Rows

The shared code must not be implemented by inserting the same permanent
`sales_code` value into every SKU row. That approach would break the existing
one-code-to-one-SKU lookup contract and would make Order/Stock resolution
ambiguous.

Recommended model:

- keep `sku_code` unique and immutable as the internal merchandise identity;
- keep the current per-SKU Sales Code authority for Separate mode;
- create a Product-level **Shared CF Group** for Shared mode;
- register the shared code once per Organization against that group;
- map every eligible option signature in the group to exactly one `sku_id`;
- index normalized Organization + code lookup so search remains bounded;
- preserve the historical code and mapping through audit records.

Candidate entities, subject to Domain review:

- `product_sales_code_groups`
- `product_sales_code_group_skus`
- an extension to the canonical identifier registry that can identify either an
  individual SKU or an approved Shared CF Group

These names are proposed only. No Schema change is authorized by this plan.

## 4. Required Resolution Contract

For Shared mode, an Order or Live CF command must resolve in this order:

1. Normalize and locate the Organization-scoped shared code.
2. Load only active SKUs mapped to that Product group.
3. Normalize option words and approved aliases.
4. Match all required option groups to exactly one SKU.
5. Create or update an Order only after exact SKU resolution.
6. Reserve or deduct Stock using the resolved `sku_id`, never the shared code.

Required outcomes:

| Input state | System behavior |
|---|---|
| Code and all options resolve exactly | Continue to Order preview/confirmation |
| Code exists but an option is missing | Ask the customer/operator to select the missing option |
| Option text matches more than one SKU | Show the possible choices; do not guess |
| Option text is unknown or misspelled | Request correction or an approved alias |
| SKU is inactive or unavailable | Reject that choice and show an understandable reason |
| Same event is received twice | Return the same idempotent result; do not duplicate the Order |

Typing only `A017` when multiple active SKUs exist must not silently choose the
first SKU.

## 5. UI Direction

Add a Combobox in multi-option creation:

**วิธีใช้รหัสขาย / รหัส CF**

- `ใช้รหัสแยกแต่ละตัวเลือก` — recommended for normal selling
- `ใช้รหัสเดียวกันทุกตัวเลือก` — recommended for Live Sale

Separate mode UI:

- preview and allocate one code per enabled SKU;
- show the exact code in every SKU row;
- a customer can CF using the code alone.

Shared mode UI:

- show one shared code for the Product group;
- show an example such as `A017 ทอง ฟ้าเทา`;
- show every required option group before creation;
- warn that the customer must provide all required options;
- preview the exact shared-code + option text for every SKU;
- block activation if two SKUs produce the same normalized option signature.

UI work alone must remain a simulation until the Domain contract, lookup API,
Order behavior, and Stock integration are approved.

## 6. Development Parts and Stop Gates

Complete and verify each Part before starting the next Part.

### SLCF-01 — Baseline and Domain Contract

- Reconcile Global Sales Code V1, SKU uniqueness, Product Variant Schema,
  identifier registry, Live Sale, Order, and Stock boundaries.
- Freeze Shared CF Group ownership, lifecycle, publish state, and audit rules.
- Decide collision rules between per-SKU codes and shared group codes.
- Prove that one normalized Organization-scoped code cannot identify two
  unrelated subjects.

**Gate:** Owner approves the Schema/relationship/permission decision matrix. No
Migration or production behavior change before approval.

### SLCF-02 — Localhost UI and Creation Contract

- Implement the two-mode Combobox and conditional previews.
- Keep Separate mode as the normal multi-option default.
- Add complete, missing-option, ambiguous, and invalid-option UI states.
- Follow AVENZO ONE Design System and test keyboard/accessibility behavior.

**Gate:** Owner verifies both modes on localhost. No real shared-code write.

### SLCF-03 — Schema, Registry, Permission, and Audit

- Add forward-only Shared CF Group and SKU-mapping Schema.
- Add tenant-safe foreign keys, normalized unique constraints, and lookup
  indexes.
- Apply RLS and Individual Deny rules.
- Forbid direct Browser writes to identifier and mapping authority.
- Preserve rotate/archive/history behavior without code recycling.

**Gate:** Isolated migration replay, RLS, cross-tenant, duplicate, concurrency,
and audit tests pass.

### SLCF-04 — Live CF Parser and Exact SKU Resolver

- Parse shared code separately from option tokens.
- Support approved option aliases without unrestricted fuzzy auto-selection.
- Return deterministic `resolved`, `missing`, `ambiguous`, `invalid`, and
  `inactive` states.
- Record the parser version and normalized input used for Order resolution.

**Gate:** Thai/English option, missing word, ambiguous alias, typo, reordered
word, and duplicate-event tests pass without guessing a SKU.

### SLCF-05 — Order, Reservation, and Stock Integration

- Resolve `sku_id` before any Order line or Stock reservation is committed.
- Use one idempotency key from Live event through Order creation.
- Use the approved Inventory boundary for reservation/deduction.
- Roll back the command when exact resolution or Stock validation fails.
- Preserve source Live event, shared code, option text, resolved SKU, and audit
  lineage.

**Gate:** No wrong-SKU, partial Order, partial Stock, lost update, or duplicate
Order across retries and concurrent administrators.

### SLCF-06 — PREVIEW E2E and Controlled Rollout

- Apply to AVENZO ONE PREVIEW only after explicit Owner approval.
- Test separate and shared modes from Product creation through Live CF, Order,
  reservation, payment/cancellation, and Stock release/deduction.
- Release behind Organization/plan feature flags.
- Start with selected pilot Organizations and observability dashboards.
- Provide a safe fallback to manual option confirmation.

**Gate:** Owner accepts authenticated PREVIEW E2E. Production remains prohibited
until separately approved.

## 7. Performance and Concurrency Requirements

- Code lookup uses normalized `(organization_id, code)` indexes and must not
  scan all Products or SKUs.
- Option resolution queries only SKUs mapped to the located shared group.
- Shared lookup and mapping data may be cached with versioned invalidation.
- Two administrators creating codes concurrently must receive deterministic
  allocation/conflict results.
- Code allocation, mapping publication, Order creation, and Stock mutation must
  use their approved transaction and idempotency boundaries.

The proposed indexed group lookup should not materially slow unrelated users or
normal Product search. Performance must still be measured before release.

## 8. Risks and Guardrails

- **Wrong SKU risk:** never infer an incomplete or ambiguous option combination.
- **Uniqueness risk:** shared code is registered once against a group, not copied
  as a duplicate permanent SKU Sales Code.
- **Customer wording risk:** aliases require explicit management and audit.
- **Code lifecycle risk:** a published shared code cannot be silently reassigned
  to another Product.
- **Stock risk:** no Stock action before exact `sku_id` resolution.
- **Migration risk:** preserve all Global Sales Code V1 and historical lookups.
- **Complexity risk:** ship behind a feature flag and retain Separate mode as the
  safe default.

## 9. Explicit Non-goals for the First Part

- No Production migration or deployment.
- No weakening of SKU Code uniqueness.
- No unrestricted fuzzy matching or AI authority to select an SKU.
- No automatic conversion of existing per-SKU codes into shared groups.
- No direct Browser mutation of code, mapping, Order, or Stock authority.
- No change to the currently approved Global Sales Code V1 behavior until
  SLCF-01 is approved and its compatibility plan passes.

## 10. Next Authorized Action

This document records future direction only. The next implementation action is
**SLCF-01 Baseline and Domain Contract** after the Owner explicitly authorizes
the project. Current multi-option creation continues to use one different Sales
Code per enabled SKU.

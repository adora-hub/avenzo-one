# AVENZO ONE — GSC-01 Baseline Reconciliation and Contract Matrix

**Status:** Owner Approved and Closed
**Updated:** 21 August 2026
**Parent plan:** `AVENZO_ONE_Global_Sales_Code_Implementation_Plan_V1.md`
**Authority direction:** `AVENZO_ONE_Global_Sales_Code_Standard_V1.md`

## 1. Outcome

GSC-01 confirms that AVENZO ONE already has one suitable Database foundation
for permanent Sales Codes: the A4 allocator and the permanent identifier
registry. The next Parts must extend this foundation. They must not create a
second allocator, registry, range table or Rapid-only Sales Code authority.

The current product-creation workflows do not yet use that authority
consistently. Normal creation, multiple-option creation, Rapid Entry and Excel
Import currently validate or submit Sales Codes through different paths. A4
also accepts formats broader than Global Sales Code V1 and uses the deprecated
`product.manage` permission.

No Migration, RPC, API, UI or Production behavior was changed in GSC-01.

## 2. Audited Sources

### Database and tests

- `supabase/migrations/20260816105113_phase_2_1_a4_atomic_sales_code_allocator.sql`
- `supabase/tests/phase_2_1_a4_atomic_sales_code_allocator.sql`
- `supabase/migrations/20260820134813_phase_2_1_sku_04_product_sequence_allocator.sql`
- `supabase/tests/phase_2_1_sku_04_product_sequence_allocator.sql`

### Product creation and validation

- `web/src/app/organizations/[id]/products/new/unified-product-creation-form.tsx`
- `web/src/app/organizations/[id]/products/new/variant-creation-builder.tsx`
- `web/src/lib/foundation/contracts.ts`
- `web/src/lib/foundation/product-identifier-check.server.ts`
- `web/src/lib/foundation/variant-sku-sequence.server.ts`
- `web/src/lib/foundation/supabase-repository.ts`

### Rapid Entry and Live Sale

- `web/src/app/organizations/[id]/products/live-sale/rapid-entry/rapid-prefix-assistant.tsx`
- `web/src/app/organizations/[id]/products/live-sale/rapid-entry/rapid-entry-browser-draft.ts`
- `web/src/app/organizations/[id]/products/live-sale/live-sale-reservation-ui.tsx`

### Import

- `web/src/app/organizations/[id]/products/product-excel-import-validation.ts`
- `web/src/app/organizations/[id]/products/product-excel-import-duplicates.ts`
- `web/src/lib/foundation/product-import-check.server.ts`
- `web/src/lib/foundation/product-import-execute.server.ts`

### Permission and stock integration contracts

- `.codex-worktrees/workstream-domain-qa/docs/AVENZO_ONE_Phase_T4_3A_Product_Permission_Cutover_Contract.md`
- `.codex-worktrees/workstream-domain-qa/supabase/migrations/20260820152508_phase_t4_3b_individual_permission_overrides.sql`
- `.codex-worktrees/workstream-domain-qa/docs/AVENZO_ONE_Phase_T5_2_Initial_Stock_Implementation_and_Test_Draft.md`

## 3. Existing Database Authority

### 3.1 Reuse without duplication

A4 already provides:

- `sku_identifier_registry` as the permanent Organization-scoped identifier
  authority;
- `sku_identifier_bindings` as identifier history and binding state;
- `sales_code_sequences`;
- `sales_code_reservation_batches`;
- `sales_code_reservations`;
- `sales_code_allocator_commands` for idempotency;
- `sales_code_allocator_events` for audit;
- row/advisory locking, request hashing, reservation expiry and immutable
  permanent assignment;
- cross-field collision prevention among SKU Code, Sales Code and Barcode.

The approved design therefore extends A4 forward-only. No replacement tables
or parallel Rapid allocator are permitted.

### 3.2 Current incompatibilities with Global V1

| Area | Current A4 behavior | Global V1 target |
|---|---|---|
| Prefix | `A–Z`, digits, `_`, `-`, up to 12 characters | `A–Z` only, 1–3 letters |
| Number | May start at `0` | `001–999`; `000` reserved |
| Width | 1–12 digits | Exactly 3 digits |
| Batch quantity | 1–400 | Permanent Rapid range 1–50 |
| Prefix rollover | Exhausts one configured sequence | `A...Z → AA...ZZZ` |
| Permission | `product.manage` | Granular authority with Individual Deny |
| Browser access | Read policies; writes trusted only | Preserve trusted-only writes and RLS |

### 3.3 SKU-04 boundary

SKU-04 allocates the Product sequence used inside **SKU Codes** such as
`TS-001-GLD`. It does not allocate Sales Codes such as `A001`.

These authorities must remain separate:

- SKU-04 controls the Product number used to construct SKU Codes.
- Global Sales Code controls the customer-facing Sales Code / CF Code.
- They may be used in the same creation transaction but must not share sequence
  rows, rollover rules or uniqueness meanings.

## 4. Current Write-path Matrix

| Workflow | Current path | Current authority | Gap to close |
|---|---|---|---|
| Normal product | Unified form → `product.create_with_initial_sku` → repository/Database command | UI accepts Manual, Same-as-SKU or local Sequence result; Database registry prevents collision | Does not claim the code through A4 Global allocation |
| Multiple options | Unified form/Variant builder → `product.create_with_variants` | Each Variant submits its own Sales Code; duplicate checker is advisory | No one atomic Global range/claim for every enabled SKU |
| Existing SKU edit | `sku.update` with optional `sales_code` | Registry/immutability triggers protect the final write | First assignment does not use canonical Global V1 claim path |
| Rapid Entry | Prefix assistant and 50-row table | UI Simulation with deterministic local range | No authenticated availability scan, reservation or assignment |
| Legacy Live Sale | Live reservation UI | UI Simulation / Live-code concept | Must remain session Live Code, not permanent Sales Code |
| Excel Import | Parser/duplicate preview → `product.create_with_initial_sku` | Generic code pattern; Sales Code passed from file | Can accept formats outside Global V1; blank-row policy undecided |
| Future API | Foundation command contract | Optional Sales Code up to 80 characters | Canonical validation and trusted claim not enforced centrally |

## 5. Validation Drift

The audited validators currently disagree:

- Unified creation: `^[A-Z0-9][A-Z0-9._-]*$`, maximum 80.
- Variant input: removes characters outside `A–Z`, digits, `.`, `_`, `-`.
- Rapid Entry prefix: `^[A-Z0-9-]{1,8}$`, local range size 50.
- Excel execution: generic `^[A-Z0-9][A-Z0-9._-]*$`.
- A4 sequence prefix: letters/digits/underscore/hyphen, up to 12.
- Global V1: `^[A-Z]{1,3}(00[1-9]|0[1-9][0-9]|[1-9][0-9]{2})$`.

GSC-02 must provide one shared TypeScript contract for UI advice. GSC-03 and
GSC-04 must make the trusted Database command authoritative even if a client or
future API bypasses the UI helper.

## 6. Existing-data Classification Contract

GSC uses the following non-destructive classifications:

| Classification | Rule | Treatment |
|---|---|---|
| `V1 compliant` | Normalized permanent Sales Code matches Global V1 and resolves to exactly one SKU | Keep unchanged; eligible as allocator history/high-water evidence |
| `grandfathered legacy` | Existing unique permanent code does not match V1 | Keep readable/searchable/exportable; immutable; never auto-rewrite |
| `collision` | One normalized identifier is claimed by more than one active target or conflicts across SKU/Sales/Barcode | Block release and require correction workflow; never auto-merge |
| `ambiguous` | Binding/registry/history cannot prove one permanent SKU target | Quarantine from new allocation; investigate before release |
| `invalid new assignment` | A new request fails V1, uses `000`, exceeds Prefix capacity or bypasses the trusted claim | Reject atomically with a user-facing reason |

GSC-01 defines the classification rules but does not connect to PREVIEW or
Production. Actual Organization counts require a separately approved
SELECT-only reconciliation before GSC-03 is finalized.

## 7. Permanent Sales Code versus Live Code

| Attribute | Permanent Sales Code / CF Code | Session Live Code |
|---|---|---|
| Example | `A120` | A code reserved only for one Live session |
| Target | Exactly one `sku_id` permanently | Session/listing/reservation context |
| Reuse | Never reused | May follow a separate approved session lifecycle |
| Global V1 format | Required for every new assignment | Not changed by GSC V1 |
| Search/open bill | Permanent customer-facing identifier | Live-session capture shortcut |
| Allocator purpose | `permanent_sales` | `live_code` remains a separate purpose |

Existing A4 support for `live_code` must not be converted, constrained or
silently treated as permanent assignment by GSC.

## 8. Owner Decision Matrix

The following decisions are proposed as one contract gate. Every row requires
Owner approval before GSC-02 or GSC-03 changes runtime behavior.

| ID | Decision | Recommendation | Effect on later Parts |
|---|---|---|---|
| D1 | Allocator architecture | Extend A4 only; prohibit a second allocator/registry | GSC-03–05 migrate and extend existing surfaces |
| D2 | Permanent vs Live | Global V1 governs `permanent_sales` only; keep `live_code` separate | Prevents 70-code Live history from being rewritten as permanent codes |
| D3 | Historical values | Grandfather existing unique legacy codes as immutable/readable; no rewrite | GSC-03 adds forward-only enforcement only |
| D4 | New canonical format | `A–Z` Prefix 1–3 letters + exactly `001–999`; reserve `000`; reject Thai and punctuation | Shared contract and Database guard use one rule |
| D5 | Rollover and exhaustion | Excel-style Prefix progression through `ZZZ`; never expand beyond three letters in V1 | Deterministic boundary and exhaustion responses |
| D6 | Range behavior | Range size 1–50, never split across Prefix; move the complete request to the next available Prefix | Rapid Entry and bulk creation remain understandable and atomic |
| D7 | Gap and reuse policy | Continue after the Organization high-water mark and never reuse a code that was assigned to a SKU. A code that was only reserved, never assigned or published, and then expired/released may return to the available pool | Avoids recycling historical identifiers without wasting untouched Rapid reservations |
| D8 | Reservation lifecycle | Rapid unassigned permanent reservations expire after 3 hours; explicit release is allowed. Only never-assigned reservations return to the available pool. Assigned codes do not expire automatically and never return to another SKU | GSC-04 needs three-hour expiry, release, reuse-eligibility and audit tests |
| D9 | Manual and Same-as-SKU | Keep both modes, but claim through the same trusted command; Same-as-SKU only when SKU itself matches V1 | No UI mode can bypass V1 or Organization uniqueness |
| D10 | Blank Sales Code | Draft data may temporarily have no Sales Code. Before a SKU becomes Active, is received as an Import, or is submitted as a Rapid batch, every blank Sales Code is allocated automatically in one atomic batch after the preview clearly shows the proposed range. A user-supplied code is validated and preserved rather than overwritten | Keeps drafts flexible but prevents usable/imported SKUs from remaining without a Sales Code |
| D11 | Permission authority | Preview/allocate for new creation requires `product.create` + `sku.create`; assigning to an existing SKU requires `sku.update`; read/search requires `sku.read`. Any Individual Deny wins. `product.manage` is not a runtime alias | GSC-03–07 reconcile A4, import and identifier-check paths |
| D12 | Atomicity | Normal claims one code inside its creation command; Variant and Rapid claim all enabled rows all-or-nothing; no per-row success fallback | GSC-05 integrates with Product graph and T5 without partial stock |
| D13 | Conflict response | Return the next actually available code/range from indexed server discovery, not `input + 1` | Prevents repeated A001→A002→A003 failures |
| D14 | Information disclosure | Availability response may show the caller's candidate/range but never the other Organization/SKU owner | GSC security tests cover tenant isolation |
| D15 | Correction policy | Internal identity keys and historical identifier bindings are immutable. A displayed Sales Code may be changed only by an audited **Rotate Sales Code** command: claim the new unique code, retire the old display code, preserve the old code as a non-reusable alias to the same SKU, and keep orders/CF/audit history resolvable. Product name and other descriptive fields remain editable normally | Allows business corrections without recycling an old code or breaking historical references |

## 9. Permission Reconciliation

T4.3B establishes granular Product/SKU authority and Individual Deny. GSC must
therefore remove runtime dependency on broad `product.manage` from:

- A4 preview/execute commands;
- identifier check and suggestion;
- Excel import check/execute;
- Variant SKU sequence preview/execute where applicable;
- Product creation route gates.

The trusted boundary evaluates permissions again at execution time. UI hiding
or an earlier preview is not authorization. Browser roles retain no direct
write to allocator, registry, command or event tables. Service-role execution
is limited to trusted server code and remains tenant/branch scoped by the
validated command context.

## 10. T5 Initial Stock Boundary

Global Sales Code assignment belongs to Product/SKU creation. Initial Stock
continues through the approved T5 atomic receive boundary after Product/SKU
activation.

GSC must not:

- write `inventory_balances` directly;
- create Stock Movement per partially created SKU;
- change the stable T5 idempotency key on a timeout retry;
- weaken `stock_pending`, rollback or recovery behavior.

If Sales Code allocation fails, the applicable Product creation graph must roll
back before Initial Stock is received. If Initial Stock fails after creation,
the existing T5 recovery contract remains authoritative.

## 11. Risks and Required Gates

| Risk | Required control |
|---|---|
| Parallel allocator creates duplicate authority | Extend A4 only; exact-surface test rejects aliases/duplicates |
| Browser validation is bypassed | Database trusted command validates and claims every new code |
| Legacy data blocks rollout | Forward-only grandfathering and SELECT-only classification |
| Granular Deny is bypassed by `product.manage` | Exact command-permission tests; deprecated code is not an alias |
| Two actors reserve the same range | Canonical lock order, row/advisory locks and multi-session tests |
| Timeout creates a second assignment | Stable idempotency key and request hash |
| Import silently changes data | Explicit dry-run and explicit blank-code policy |
| Sales Code failure creates partial stock | Product graph rollback before T5; no per-SKU fallback |

## 12. GSC-01 Acceptance Result

- Current write paths and Database surfaces: **documented**.
- A1/A4/SKU-04/Unified/Variant/Rapid/Import/T4.3/T5 boundaries:
  **reconciled at contract level**.
- Duplicate allocator/table/function proposal: **none**.
- Runtime code, Migration, RPC, API or UI change: **none**.
- PREVIEW/Production access: **none**.
- Owner-approved contract: **D1–D15**.
- Owner-approved revisions: **D7/D8 never-assigned reservation reuse and
  three-hour expiry; D10 automatic allocation before usable/imported state;
  D15 audited Sales Code rotation with permanent historical alias**.

After approval, begin **GSC-02 — Shared Canonical Contract Library and UI
Specification** and stop again after its tests and specification are ready.

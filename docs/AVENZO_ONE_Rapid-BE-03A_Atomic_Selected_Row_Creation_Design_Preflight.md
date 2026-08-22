# AVENZO ONE — Rapid-BE-03A Atomic Selected-Row Creation Design/Preflight

**Status:** Approved Contract — Ready for Rapid-BE-03B Local Draft

**Updated:** 22 August 2026

**Branch:** `codex/workstream-ui`
**Scope:** Design and preflight only; no Migration, RPC, API mutation, Remote Apply or Deploy

**Owner Decision:** D1–D12 approved in full on 22 August 2026.

## 1. Outcome

Rapid-BE-03A defines how **1–50 explicitly selected and ready Rapid Entry
rows** become normal AVENZO ONE Product and SKU records while consuming the
exact permanent Sales Codes already reserved by Rapid-BE-02A.

The command is one trusted database transaction:

- every selected row creates one draft Product and one draft SKU;
- the row's reserved Sales Code becomes both the SKU Code and permanent Sales
  Code in Rapid Entry V1, for example `A017`;
- all selected rows succeed together or the complete command rolls back;
- retry with the same Idempotency Key cannot create duplicates;
- unselected Sales Codes remain reserved until assigned, explicitly released
  or expired under the approved three-hour rule;
- image upload and Initial Stock remain Rapid-BE-04 and Rapid-BE-05. This Part
  must not claim that either has been persisted.

## 2. Audited Baseline

### 2.1 Existing authority to reuse

The repository already has the GSC-05 trusted creation boundary:

- `public.server_execute_global_sales_code_creation(...)` supports Normal,
  Variant and Rapid 1–50 creation;
- `public.global_sales_code_creation_commands` stores request hash and replay
  result;
- child Product/SKU creation uses the existing atomic Product command;
- `product.create`, tenant scope, Individual Deny, immutable identifier
  registry and Browser write denial are already enforced;
- response already states `inventory_posted=false` and
  `initial_stock_boundary='t5-pending'`.

Rapid-BE-03 must extend this authority. It must not create a second Product
creation RPC, allocator, command ledger or identifier registry.

### 2.2 Gap found during preflight

Rapid-BE-02A reserves an authoritative 50-code batch before the operator fills
the table. GSC-05 `sequence` mode currently reserves a new range according to
the submitted item count. It therefore cannot safely consume only the selected
codes from the already reserved Rapid batch:

- reusing the original reservation command with a different item count causes
  an idempotency conflict;
- using a new allocator command reserves an unnecessary second range;
- using `manual` mode accepts submitted codes but does not prove ownership of,
  lock or confirm the existing reservation rows.

The safe direction is a forward-only `reserved_batch` mode on GSC-05.

## 3. Proposed Command Contract

### 3.1 Request

```json
{
  "command_id": "stable-uuid",
  "organization_id": "uuid",
  "flow": "rapid",
  "sales_code_mode": "reserved_batch",
  "reservation_batch_id": "uuid",
  "creation_items": [
    {
      "client_row_id": "rapid-row-000",
      "command_id": "stable-child-uuid",
      "command_type": "product.create_with_initial_sku",
      "sales_code": "A017",
      "payload": {
        "name": "PayDay-A017",
        "sku_name": "PayDay-A017",
        "sku_code": "A017",
        "structure_type": "standard",
        "category_id": "uuid",
        "base_unit_code": "piece",
        "sale_price": 490
      },
      "handoff": {
        "branch_id": "uuid",
        "initial_stock": 12
      }
    }
  ]
}
```

Rules:

1. `creation_items` contains 1–50 rows and no duplicate `client_row_id`, Sales
   Code, SKU Code or child command ID.
2. Every submitted Sales Code must be an unexpired `reserved` row belonging to
   the submitted batch, Organization and current actor.
3. `sku_code` equals the reserved Sales Code in Rapid Entry V1. A different
   descriptive SKU policy requires a future explicit UI and contract; the
   Backend must not invent one silently.
4. Product name is required but is not a database Unique authority. Duplicate
   Product names inside the submitted command remain rejected by the Rapid UI
   validation contract.
5. `category_id` must identify an active Organization Category. The UI label
   `ไม่ระบุหมวดหมู่` must resolve to a real approved fallback Category before
   submission or the row is not ready. The command never creates master data
   implicitly.
6. `base_unit_code` must be an approved canonical code such as `piece`, `pair`,
   `bottle`, `pack`, `set`, `box` or `kg`; Thai display labels are presentation
   values only.
7. `sale_price` is required by the Rapid V1 workflow and must be a finite,
   non-negative decimal in the supported money range.
8. Branch and Initial Stock are validated handoff values only in BE-03. No
   Warehouse, Balance or Movement row is written until BE-05.
9. Local image `File` data is never placed in the JSON/RPC payload. Image
   staging, finalize and compensation belong to BE-04.

### 3.2 Success response

```json
{
  "status": "succeeded",
  "command_id": "stable-uuid",
  "reservation_batch_id": "uuid",
  "created_count": 2,
  "items": [
    {
      "client_row_id": "rapid-row-000",
      "sales_code": "A017",
      "product_id": "uuid",
      "sku_id": "uuid",
      "sku_code": "A017",
      "product_status": "draft",
      "sku_status": "draft"
    }
  ],
  "inventory_posted": false,
  "initial_stock_boundary": "rapid-be-05-pending",
  "images_finalized": false,
  "image_boundary": "rapid-be-04-pending"
}
```

The response order follows the submitted row order. It must never contain a
`partial_success` state.

## 4. Transaction Boundary

The trusted command executes the following steps without external network or
Storage calls:

1. Authenticate the actor and resolve Organization membership.
2. Check exact `product.create`; legacy `product.manage` is not accepted and an
   active Individual Deny wins over Role Allow.
3. Acquire the existing command-scoped advisory transaction lock.
4. Canonicalize the complete payload and apply existing request-hash
   idempotency: same key/same payload replays the stored result; same key with a
   different payload returns Conflict.
5. Lock the reservation batch, then lock selected reservation rows in ascending
   sequence-number order.
6. Validate batch owner, Organization, purpose, active state, expiry and every
   submitted Sales Code before creating any Product.
7. Validate all Category, Unit and Branch references and every Product/SKU
   payload before the mutation loop.
8. Create each Product/SKU through the existing child command using stable,
   deterministic child command IDs.
9. Confirm each exact reserved Sales Code against its newly created `sku_id`.
10. Persist the canonical result and audit lineage, then commit once.

Any exception rolls back Products, SKUs, identifier bindings, reservation
assignments, command result and audit rows from the current attempt.

## 5. Concurrency and Idempotency

- The client creates one `command_id` when entering final review and reuses it
  for double-click, timeout and retry. A timeout never generates a new key.
- Lock order is fixed: outer command → reservation batch → reservation rows by
  sequence → child commands. A different order is forbidden.
- The request hash includes Organization, actor, reservation batch, exact row
  identities, Sales Codes and every persisted Product/SKU field.
- Same key + same payload from two sessions returns one Product/SKU mapping.
- Same key + different payload returns a stable conflict without mutations.
- Two different commands cannot consume the same reservation row.
- Unselected reservation rows are untouched. The batch remains active while at
  least one unexpired row remains reserved.
- The transaction must be measured at 1, 10 and 50 rows. It contains no HTTP,
  Storage or other long-running external work.

## 6. Permission, RLS and Function Security

- Browser roles cannot insert/update/delete creation commands, Products, SKUs,
  identifier registry rows or reservation rows directly.
- The public callable boundary is `service_role` only. Application code first
  revalidates the authenticated user and calls the trusted RPC.
- The database function uses `security definer`, an empty `search_path` and
  fully qualified relations only.
- Function `EXECUTE` is revoked from `PUBLIC`, `anon` and `authenticated` and
  granted only to the intended trusted role.
- Private tables retain RLS/forced RLS and explicit grants. RLS is defense in
  depth and is not treated as function-execution authorization.
- V1 requires `reservation_batches.created_by = actor_user_id`; an Owner cannot
  take over another operator's live reservation without a separately approved
  recovery command and audit contract.
- Organization and Branch references use composite tenant-safe validation and
  indexed Foreign Key paths.

## 7. User-visible Error Contract

| Code | Meaning | UI action |
|---|---|---|
| `rapid_reservation_expired` | Three-hour reservation expired | Keep Browser Draft; reserve a new range and remap only after confirmation |
| `rapid_reservation_not_owned` | Batch belongs to another actor/Organization | Stop; do not disclose foreign details |
| `rapid_reserved_code_unavailable` | One selected code is no longer reserved | Roll back all rows; refresh authoritative reservation |
| `rapid_row_invalid` | Product/SKU/master-data validation failed | Focus exact row/field; no rows created |
| `permission_denied` | `product.create` denied | Disable retry until permission changes |
| `idempotency_conflict` | Same key used with changed payload | Reload stored review state; never create a new key silently |
| `identifier_conflict` | SKU/Sales Code conflicts with another SKU | Roll back all rows; re-reserve/review |
| `unknown_outcome` | Client timed out before result | Retry the same command key and show checking state |

Raw SQL, constraint names, UUIDs from another tenant and internal stack traces
must not be returned to the Browser.

## 8. Approved Decision Matrix

| ID | Approved recommendation for BE-03B |
|---|---|
| D1 | Extend GSC-05 with `reserved_batch`; do not add a parallel RPC/ledger |
| D2 | Submit only 1–50 explicitly selected ready rows |
| D3 | Require same Organization and same actor that created the reservation |
| D4 | Permit a selected subset; leave unselected codes reserved |
| D5 | Create Product and SKU as `draft` |
| D6 | Use the exact Sales Code as Rapid V1 `sku_code`, for example `A017` |
| D7 | Require a real active Category ID, including an explicit fallback master record |
| D8 | Require price for a Rapid ready row |
| D9 | Exclude image persistence until BE-04 |
| D10 | Exclude Stock write until BE-05; preserve the handoff and report pending truthfully |
| D11 | Reuse one stable outer key and stable per-row child keys for every retry |
| D12 | Do not connect the final Browser submit until BE-04/05 recovery and BE-06 E2E gates are ready |

## 9. Required BE-03B Test Matrix

### Contract and validation

1. One valid selected row succeeds.
2. Fifty valid selected rows succeed.
3. Zero or 51 rows are rejected before mutation.
4. Empty/unselected rows are absent from the request and remain reserved.
5. Duplicate client row, Sales Code, SKU Code or child key rolls back all rows.
6. Missing/inactive/cross-tenant Category is rejected.
7. Unsupported Unit, invalid price or invalid Product name is rejected.
8. Branch outside actor scope is rejected.

### Reservation and identifiers

9. Exact selected codes from the active batch are assigned to exact returned
   SKUs.
10. Unselected codes remain reserved.
11. Expired, released, assigned, foreign-batch and foreign-actor codes fail.
12. The same code can bind as SKU Code and Sales Code only for the same SKU.
13. Cross-field collision with another SKU rolls back the complete command.

### Atomicity and recovery

14. Failure on row 1, middle row and last row leaves zero new Products/SKUs and
    zero new assignments.
15. Same key/same payload replays identical JSON and creates once.
16. Same key/different payload returns Conflict and creates nothing new.
17. Double-click and timeout/retry create once.
18. Two commands racing for one reserved code yield one success and one safe
    conflict.
19. Reversed row order completes without deadlock or partial commit.

### Security and regression

20. `anon` and `authenticated` direct RPC/table writes are denied.
21. Missing `product.create` and Individual Deny are rejected.
22. Tenant/Branch isolation does not disclose foreign data.
23. Normal and Variant GSC-05 modes remain unchanged.
24. BE-02A three-hour reservation/recovery tests remain green.
25. Response always reports Images/Initial Stock as pending and never writes
    Storage, Balance or Movement rows.
26. Explain/measurement gates cover 1, 10 and 50 rows and verify required
    composite/FK indexes.

## 10. Pre-implementation Gates

- **G1:** PASS — Owner approved D1–D12 on 22 August 2026.
- **G2:** Remote PREVIEW schema is inspected with SELECT-only queries; no
  Production connection.
- **G3:** Forward-only extension design proves no duplicate table/RPC/ledger.
- **G4:** Request/response and stable child-ID derivation are frozen.
- **G5:** Master-data ID/code mappings for Category, Unit and Branch are frozen.
- **G6:** Migration and SQL tests receive review before Local Apply.
- **G7:** Isolated Local replay passes baseline, forward migrations and all
  regression/security/concurrency gates.
- **G8:** TypeScript adapter and contract tests pass without Browser Supabase
  mutations.
- **G9:** PREVIEW Apply/P01–P14 requires a separate explicit Owner approval.
- **G10:** Production Apply and Deploy remain separate explicit approvals.

## 11. Expected BE-03B Files

Names and timestamps remain provisional until implementation:

- one forward-only Supabase migration extending GSC-05 `reserved_batch` mode;
- one SQL test for reservation consumption, atomicity, idempotency, RLS and
  concurrency;
- one server-only Rapid creation adapter that converts real Category/Unit/
  Branch data into the approved command payload;
- scoped TypeScript contract and integration tests;
- one BE-03B implementation/QA report.

## 12. Current Stop Point

Rapid-BE-03A changes documentation only. No database object, API behavior,
Product/SKU record, reservation, image, Stock value or Remote environment has
been changed. D1–D12 are now approved; the next authorized development Part is
Rapid-BE-03B Local Migration/Test Draft. Remote Apply, PREVIEW, Production and
Deploy remain outside this approval.

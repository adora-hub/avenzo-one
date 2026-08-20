# AVENZO ONE — Phase T4.4A Atomic Multi-SKU Batch Receive Design/Preflight

**Status:** Approved/Closed — G1–G12 PASS; G2 amended to 1–100 Items
**Prepared:** 20 August 2026; PM cardinality amendment recorded 21 August 2026
**Repository baseline:** `codex/workstream-domain-qa` at `d4aa92749f6c1df90c313645df9a9bd7aa910f53`
**Scope:** Atomic Initial Stock receive for multiple SKU/Location pairs
**Change in this phase:** Documentation only

## 1. Executive Decision

T4.4A is ready for PM review. The recommended implementation adds exactly two
normalized public relations and one trusted public RPC:

- `public.inventory_receive_batches`
- `public.inventory_receive_batch_items`
- `public.server_receive_inventory_batch(jsonb, uuid)`

The design does **not** create a second ledger or a second balance model. Each
Batch Item owns one existing `public.inventory_commands` receive command; that
command creates exactly one immutable `public.stock_movements` row and updates
the existing `public.inventory_balances` row through
`private.post_inventory_command(...)`. All Items execute inside the single
database transaction opened by one RPC statement. Any error raises out of the
RPC and rolls back the Batch Header, every Batch Item, every Inventory Command,
Movement, Domain Event and Balance change.

No Migration, RPC, API, UI or Test code was created in T4.4A. No PREVIEW or
Production connection was used, and no Commit or Push was performed.

## 2. Source of Truth and Precedence

| Priority | Source | Binding points used by T4.4A |
|---:|---|---|
| 1 | `AVENZO_ONE_Phase_T_Initial_Stock_Integration.md` | SKU is stock identity; balance is SKU + Location; atomic all-or-nothing Batch; idempotency; permission/RLS; Movement audit |
| 2 | `AVENZO_ONE_Phase_T4_1_Schema_Domain_Contract.md` | Approved Batch Header/Items, Header idempotency authority, UUID key, canonical hash, duplicate SKU/Location rejection, base-unit-only, required Warehouse Branch, Product/SKU stockability |
| 3 | `AVENZO_ONE_Phase_T4_2C_Migration_and_Test_Plan.md` | Reuse `locations`, `stock_movements`, `inventory_balances`; `inventory.receive` and `inventory_batch.read`; browser write denial; tenant/branch-safe RLS |
| 4 | T4.3B approved contract, migration and QA record | Effective permission = Role baseline + Allow − Deny; Deny wins; Branch ceiling; statement-time expiry; trusted-server-only mutation |
| 5 | Schema/Migration/Test code at commit `d4aa927` | Current executable constraints and function signatures |

When an older planning name differs from the committed schema, the reconciled
current name wins. Therefore T4.4A uses `public.locations`,
`public.stock_movements` and `public.inventory_balances`; it does not introduce
`inventory_locations`, `inventory_movements` or another inventory alias.

## 3. Baseline Inspection at `d4aa927`

### 3.1 Existing objects to reuse

| Object | Current contract relevant to T4.4A |
|---|---|
| `public.products` | Tenant-safe Product root; `status` is `draft`, `active` or `archived`; Phase 2.1 adds `structure_type` = `standard`, `variant` or `bundle` |
| `public.skus` | Tenant-safe child of Product; globally immutable base unit and quantity scale after insert; active status is required by posting primitive |
| `public.warehouses` | Required `branch_id`; unique tenant/branch identity; active lifecycle |
| `public.locations` | Required Organization, Branch and Warehouse; unique code within Warehouse; active lifecycle |
| `public.inventory_commands` | Existing idempotent single-SKU command envelope; UUID command ID, SHA-256-shaped request hash, processing/completed state and stored result |
| `public.stock_movements` | Immutable source-of-truth ledger; receive Movement is positive, base-unit denominated and sequence `1` per command |
| `public.inventory_balances` | Derived row keyed by `(organization_id, sku_id, location_id)`; write guard requires a processing Inventory Command context |
| `public.inventory_domain_events` | One event per Inventory Command; receive emits `stock.received` |
| `private.post_inventory_command(...)` | Atomic posting primitive that inserts Movement before updating Balance and returns the command result |
| `public.server_post_inventory_command(...)` | Existing service-role-only single-SKU boundary with explicit actor and branch-scoped permission check |
| T4.3B permission helpers | Effective Role/Allow/Deny resolution with Deny precedence and Branch membership ceiling |

### 3.2 Current inventory invariants that must remain unchanged

- `stock_movements` is immutable; UPDATE and DELETE are rejected.
- A non-transfer command has exactly one Movement at `sequence_no = 1` and no
  `correlation_id`.
- A Balance insert/update is legal only while the referenced
  `inventory_commands` row is `processing` and the transaction-local command
  context matches.
- `inventory_balances.last_movement_id` references the Movement that produced
  the latest version.
- Browser roles cannot directly write Commands, Movements, Balances or Events.
- Existing read access is authenticated SELECT plus permission-aware RLS.
- Existing receive authority is `inventory.receive` with `scope_kind = branch`.
- Existing Batch read vocabulary is `inventory_batch.read`, also Branch-scoped.

### 3.3 Confirmed gaps

At commit `d4aa927` there is no executable Batch table, Batch policy or Batch
function. In particular, the following are absent from migrations:

- `public.inventory_receive_batches`
- `public.inventory_receive_batch_items`
- `public.server_receive_inventory_batch(...)`

The existing single-SKU primitive also validates active SKU, Location,
Warehouse and Branch, but does not currently validate parent Product status or
`structure_type`. A forward-only guard extension is therefore required before
the Batch boundary can satisfy the approved Product stockability contract.

### 3.4 Important compatibility finding

One existing `inventory_commands` receive command can own only one receive
Movement because `stock_movements_command_sequence_unique` and the non-transfer
shape require `sequence_no = 1`. T4.4 must not force multiple receive Movements
under one command. The compatible model is:

```text
Inventory Receive Batch (1)
  └─ Batch Item (N)
       └─ Inventory Command (1, command_type = receive)
            ├─ Stock Movement (1, movement_type = receive)
            ├─ Inventory Domain Event (1, stock.received)
            └─ Inventory Balance delta (1 SKU + Location row)
```

This preserves every existing ledger constraint and gives the Batch an atomic
outer transaction without duplicating the ledger.

## 4. Locked T4.4A Domain Decisions

The following are the proposed locked contract for PM approval.

| ID | Decision |
|---|---|
| D1 | One Batch belongs to exactly one Organization and one required active Branch. |
| D2 | A Batch may target multiple active Warehouses/Locations only when all are inside that one Branch. Warehouse is derived from Location and persisted; the client cannot override it. |
| D3 | Input contains 1–100 Items. One normal SKU and multiple Variant SKUs use the same RPC; 100 remains the security and transaction-size ceiling. |
| D4 | Duplicate `(sku_id, location_id)` is rejected before any ledger write. Item array order is not business meaning. |
| D5 | Only active SKU under active `standard` or `variant` Product is directly receivable. `bundle` is rejected; T4.4 does not expand components or implement Assembly. |
| D6 | Requested `unit_code` must equal `skus.base_unit_code`. Sell-unit conversion is out of scope. |
| D7 | Quantity must be positive, fit `numeric(20,6)` and not exceed the SKU `quantity_scale`. T4.4 adds no unapproved integer-only rule for `quantity_behavior = discrete`. |
| D8 | Business operation is `initial_receive`; existing command and ledger values remain `receive`. The Header and reason preserve Initial Stock semantics without widening the Movement enum. |
| D9 | Batch Header is the sole idempotency authority. No separate Idempotency Record table is created in v1. |
| D10 | Exactly one public mutation RPC is added for T4.4. Browser/anon cannot execute it; only authenticated trusted server code using `service_role` may call it with an explicit real actor ID. |
| D11 | Effective `inventory.receive` is checked for the Batch Branch inside the RPC using the T4.3B helper. Deny and Branch ceiling remain authoritative. |
| D12 | All domain rows are locked/validated in deterministic order before the first Movement/Balance write. Item posting also repeats current primitive validation as defense in depth. |
| D13 | Batch Header/Items become immutable audit records after completion; correction uses compensating inventory operations, never edit/delete. |
| D14 | A database exception is never swallowed per Item. There is no partial-success response or failed-item continuation. |

## 5. Proposed Schema Contract

### 5.1 `public.inventory_receive_batches`

| Column | Type / rule | Purpose |
|---|---|---|
| `id` | `uuid` PK, server-generated | Internal Batch identity returned to callers |
| `organization_id` | `uuid not null` | Tenant boundary |
| `branch_id` | `uuid not null` | Single Branch authorization/RLS scope |
| `batch_type` | `text not null`, exactly `initial_receive` | Operation namespace |
| `idempotency_key` | `uuid not null` | Client-generated retry identity |
| `request_hash_version` | `smallint not null`, v1 = `1` | Canonicalization evolution guard |
| `request_hash` | `text not null`, 64 lowercase hex | Server-computed SHA-256 of canonical request |
| `reference` | normalized optional text, max 255 | External document/user reference; included in hash |
| `reason_code` | lower snake case, max 64 | Required inventory reason; included in hash |
| `reason_note` | normalized optional text, max 1,000 | Human explanation; included in hash |
| `item_count` | `smallint not null`, 1–100 | Auditable declared/validated count |
| `actor_user_id` | `uuid not null` FK `auth.users` | Real user on whose behalf trusted server acts |
| `status` | `processing` or `completed` | Idempotency state inside the transaction |
| `result` | `jsonb`, null only while processing | Exact replay response |
| `occurred_at` | `timestamptz not null` | One effective inventory time shared by all Items |
| `created_at` | `timestamptz not null` | Idempotency claim time |
| `completed_at` | `timestamptz` | Atomic completion time |

Required keys and constraints:

- PK `(id)`.
- UNIQUE `(organization_id, id)`.
- UNIQUE `(organization_id, branch_id, id)` for tenant/Branch-safe Item FK.
- UNIQUE `(organization_id, batch_type, idempotency_key)`; this is the v1
  idempotency authority approved in T4.1.
- Composite FK `(organization_id, branch_id)` to the existing Branch identity.
- Request hash format, item count, batch type and completion-shape checks.
- UPDATE permits only the guarded `processing → completed` transition; DELETE
  is always denied.

A failed request leaves no persistent `failed` Header because the complete RPC
transaction rolls back. Operational failure telemetry belongs in server logs,
not in a partially committed domain Batch.

### 5.2 `public.inventory_receive_batch_items`

| Column | Type / rule | Purpose |
|---|---|---|
| `id` | `uuid` PK, server-generated | Batch Item identity |
| `organization_id` | `uuid not null` | Tenant boundary |
| `branch_id` | `uuid not null` | Must equal Header Branch |
| `batch_id` | `uuid not null` | Composite FK to Header |
| `line_no` | `smallint not null`, 1–100 | Canonical deterministic sequence, not client trust |
| `sku_id` | `uuid not null` | Stock identity |
| `warehouse_id` | `uuid not null` | Derived from validated Location |
| `location_id` | `uuid not null` | Balance and Movement destination |
| `quantity` | `numeric(20,6) not null`, positive | Base-unit receive quantity |
| `base_unit_code` | normalized lower snake case | Snapshot of validated SKU base unit |
| `inventory_command_id` | `uuid not null` | One-to-one link to existing receive command |
| `created_at` | `timestamptz not null` | Audit timestamp |

Required keys and constraints:

- PK `(id)` and UNIQUE `(organization_id, id)`.
- Composite FK `(organization_id, branch_id, batch_id)` to Header.
- Composite FK `(organization_id, sku_id)` to SKU.
- Composite FK `(organization_id, branch_id, warehouse_id, location_id)` to
  existing Location scope.
- Composite FK `(organization_id, inventory_command_id)` to existing Command.
- UNIQUE `(organization_id, batch_id, line_no)`.
- UNIQUE `(organization_id, batch_id, sku_id, location_id)`.
- UNIQUE `(organization_id, inventory_command_id)` to enforce one Item per
  command.
- INSERT is allowed only inside the current processing Batch context; UPDATE and
  DELETE are always denied.

Movement lineage is resolved without adding mutable metadata to the ledger:

```text
batch_item.inventory_command_id
  = inventory_commands.id
  = stock_movements.command_id
```

For `command_type = receive`, existing constraints guarantee one positive
Movement at sequence `1`. The Batch test must prove the Item values match the
linked Command and Movement values for Organization, SKU, Location, Quantity,
Unit, Actor and occurred time.

### 5.3 No duplicate schema

T4.4 implementation must not create or rename:

- Product, SKU, Warehouse or Location tables;
- a second Inventory Command/Ledger/Movement/Balance/Event model;
- a private Idempotency Record table;
- `inventory_locations` or `inventory_movements` aliases.

## 6. Locked RPC Contract

### 6.1 Name, signature and exposure

```text
public.server_receive_inventory_batch(p_request jsonb, p_actor_user_id uuid)
returns jsonb
```

- `SECURITY DEFINER`, fixed empty `search_path` and fully qualified objects.
- EXECUTE revoked from `public`, `anon` and `authenticated`.
- EXECUTE granted only to `service_role`.
- The server must authenticate the session and pass the real actor UUID; the
  RPC re-authorizes that actor and does not treat `service_role` as business
  authority.
- T4.4 introduces no second public preview/validate/commit RPC. Application
  validation remains advisory; this RPC is the database authority.
- Existing `server_post_inventory_command(...)` remains for approved non-Batch
  inventory workflows, but the T4 Initial Stock Batch flow must call only the
  new Batch RPC.

### 6.2 Request v1

```json
{
  "contract_version": 1,
  "organization_id": "uuid",
  "branch_id": "uuid",
  "idempotency_key": "uuid",
  "reference": "optional external reference",
  "reason_code": "opening_balance",
  "reason_note": "optional normalized note",
  "occurred_at": "optional RFC 3339 timestamp",
  "items": [
    {
      "sku_id": "uuid",
      "location_id": "uuid",
      "quantity": 10.000000,
      "unit_code": "piece"
    }
  ]
}
```

Request rules:

- Unknown top-level or Item fields are rejected in v1; they are not silently
  omitted from the hash.
- `organization_id`, `branch_id`, `idempotency_key`, `reason_code` and Items are
  required.
- `p_actor_user_id` is required and is included in canonical hash semantics.
- Item quantity must be a JSON number, not locale-formatted text.
- Warehouse is not accepted from the client; it is derived from Location.
- `occurred_at`, when omitted, is fixed once from `statement_timestamp()` for the
  new Batch and stored. A committed replay returns the stored time.
- Item count is 1–100. Duplicate `(sku_id, location_id)` is rejected.

### 6.3 Canonical request hash v1

The database computes the hash; it never trusts a client-provided hash.

1. Parse and reject malformed/unknown fields.
2. Normalize UUID text, lowercase/trim unit and reason code, trim optional text,
   normalize timestamp to UTC and normalize numeric quantity to its exact
   `numeric(20,6)` representation.
3. Build a `jsonb` envelope containing contract/hash version, Organization,
   Branch, actor, reference/reason/occurred-at input and Items.
4. Sort Items by `(sku_id, location_id)` so reordering an otherwise identical
   set is the same semantic request.
5. Hash the deterministic UTF-8 JSONB text with SHA-256 and store lowercase hex.

The idempotency key namespace is
`(organization_id, batch_type = 'initial_receive', idempotency_key)`.

| Existing key state | Hash comparison | Required result |
|---|---|---|
| No Header | n/a | Claim Header and execute once |
| Completed Header | Same hash | Return the exact stored `result`; no new Item/Command/Movement/Event/Balance delta |
| Completed Header | Different hash | Raise `batch_receive_idempotency_conflict` |
| Processing Header visible unexpectedly | Any | Fail closed as internal incomplete state; never resume a partial Batch |
| Concurrent uncommitted Header | Same or different | Unique index wait resolves after first transaction; then apply the rules above |

Changing actor, Branch, any Item, quantity, unit, reference, reason or explicit
occurred time changes the hash. The same UUID key may be reused in another
Organization because the key is tenant-scoped.

### 6.4 Response v1

```json
{
  "contract_version": 1,
  "batch_id": "uuid",
  "batch_type": "initial_receive",
  "organization_id": "uuid",
  "branch_id": "uuid",
  "idempotency_key": "uuid",
  "request_hash": "64-lowercase-hex",
  "status": "completed",
  "item_count": 2,
  "occurred_at": "RFC 3339 timestamp",
  "committed_at": "RFC 3339 timestamp",
  "items": [
    {
      "batch_item_id": "uuid",
      "sku_id": "uuid",
      "warehouse_id": "uuid",
      "location_id": "uuid",
      "quantity": 10.000000,
      "base_unit_code": "piece",
      "inventory_command_id": "uuid",
      "movement_id": "uuid",
      "balance_version": 1,
      "on_hand": 10.000000
    }
  ]
}
```

Items are returned in canonical `(sku_id, location_id)` order. The response
does not sum quantities across unlike units. Exact completed JSON is stored on
the Header and returned for every valid replay.

### 6.5 Error contract

Errors expose stable categories and input Item position where safe, but never
confirm whether a foreign-tenant UUID exists.

| Error code | SQLSTATE | Meaning / future API mapping |
|---|---:|---|
| `batch_receive_request_invalid` | `22023` | Shape, version, UUID, text, timestamp or unknown-field error; HTTP 400 |
| `batch_receive_item_count_invalid` | `22023` | Fewer than 1 or more than 100 Items; HTTP 400 |
| `batch_receive_duplicate_sku_location` | `22023` | Duplicate pair in one Batch; HTTP 400 |
| `batch_receive_quantity_invalid` | `22023` | Null, non-positive, overflow or unsupported scale; HTTP 400 |
| `batch_receive_unit_invalid` | `22023` | Unit malformed or not the SKU base unit; HTTP 400 |
| `batch_receive_scope_not_accessible` | `42501` | Organization/Branch/Warehouse/Location relationship is invalid or inaccessible; HTTP 403 with no existence detail |
| `batch_receive_permission_required` | `42501` | Effective `inventory.receive` denied, expired or outside Branch membership; HTTP 403 |
| `batch_receive_item_not_receivable` | `23514` | SKU/Product inactive, draft, archived or Bundle; HTTP 422 without cross-tenant disclosure |
| `batch_receive_idempotency_conflict` | `23505` | Same tenant/type/key with different canonical hash; HTTP 409 |
| `batch_receive_concurrency_retry` | `40001` or `40P01` | Serialization/deadlock retry using the same key; HTTP 409/503 per future API policy |
| `batch_receive_incomplete_state` | `P0001` | Impossible persisted processing/invariant state; HTTP 500 and operator alert |

Validation errors abort the RPC. There is no success response with per-line
errors and no HTTP 207/partial result contract.

## 7. Single Transaction Boundary

The future implementation sequence is binding:

1. Validate top-level request shape, version, key and Item count.
2. Normalize Items, reject duplicate pairs and compute canonical hash v1.
3. Resolve active Organization/Branch and evaluate the explicit actor's
   effective `inventory.receive` for that Branch using the T4.3B helper.
4. Claim `inventory_receive_batches` with the unique idempotency key, then lock
   the Header row. Return stored result or conflict when the key already exists.
5. Bulk resolve and lock all referenced Product/SKU and
   Branch/Warehouse/Location rows in deterministic order.
6. Validate every Item before the first Movement/Balance write: tenant and
   Branch equality, lifecycle, Product structure, quantity and base unit.
7. Reconfirm statement-time Branch permission before posting.
8. Process canonical Items in `(sku_id, location_id)` order. For each Item,
   generate one command UUID and command hash, invoke the existing private
   receive posting primitive, then insert the Batch Item linked to that Command.
9. Assert exactly N Items, N completed receive Commands, N immutable receive
   Movements and N `stock.received` Events exist and each lineage value agrees.
10. Build the canonical response, transition Header to `completed`, store the
    response and return it.

One Supabase RPC call is one PostgreSQL statement and transaction. Any uncaught
exception at steps 1–10 rolls back all writes. Implementation must not use a
per-Item exception handler that catches an error and continues.

The forward implementation must also extend the shared receive guard so direct
single-SKU receive cannot bypass active Product and non-Bundle stockability.
This is a forward `CREATE OR REPLACE` of the existing function contract, not an
edit to a historical migration and not a second posting path.

## 8. Concurrency, Double-click, Retry and Timeout Contract

| Scenario | Required behavior |
|---|---|
| Browser double-click sends same key/payload | One transaction posts; the other waits/replays the exact stored result |
| Same key, reordered identical Items | Same canonical hash and exact replay result |
| Same key, changed payload/actor | Deterministic idempotency conflict; no delta |
| Network timeout before database commit | Transaction rollback or unknown outcome; retry with same key is safe |
| Network timeout after database commit | Retry finds completed Header and returns exact result |
| Two different keys receive into same Balance | Balance row locks serialize increments; final on-hand equals both committed Movement deltas |
| Two overlapping Batches submit reversed Item order | Canonical processing order prevents lock-order inversion; no lost update |
| Product/SKU/Location is archived concurrently | Locked validation rows make lifecycle decision and posting atomic; one transaction waits or fails, never posts against a changed state unnoticed |
| Permission expires during call | Effective authority is evaluated at RPC statement time as approved by T4.3; retry is evaluated again at the new statement time |
| Serialization/deadlock signal | Roll back whole Batch and retry the same idempotency key; never generate a replacement key automatically |
| Same payload with a different key | Treated as a new business receive and posts again; API/UI must persist the original key for retries |

Recommended transaction limits for implementation are 100 Items, deterministic
row locking and a bounded server statement timeout. Timeout tuning must be
measured in isolated QA; it must not weaken atomicity or introduce chunked
commits.

## 9. Permission and RLS Matrix

### 9.1 Mutation authority

| Caller | RPC execute | Business authorization | Direct table write |
|---|---:|---|---:|
| `anon` | Deny | n/a | Deny |
| Browser `authenticated` | Deny | n/a | Deny |
| Trusted `service_role` | Allow only on Batch RPC | Explicit real actor must have effective `inventory.receive` at exact Branch | Deny on Batch, Command, Movement, Balance and Event tables |
| Database owner/migration | Administrative only | Not an application path | Migration-controlled |

T4.3B semantics remain binding:

- Role baseline plus active individual Allow minus active individual Deny.
- Deny wins.
- Branch Allow never creates Branch membership.
- Missing/expired permission, inactive membership or inactive Branch fails
  closed.
- `service_role` is transport/trusted execution identity, never the business
  actor.

### 9.2 Read authority

Both Batch tables enable RLS. Authenticated SELECT requires:

```text
private.has_org_permission(
  row.organization_id,
  'inventory_batch.read',
  row.branch_id
)
```

This preserves the current `inventory_batch.read` Branch scope and T4.3B
Allow/Deny behavior. T4.4A does not add an Admin baseline grant. Existing Owner
inheritance and any approved individual override determine effective read
access. Movement/Balance/Command reads continue using their existing granular
permissions; Batch read does not imply `inventory_audit.read` or
`inventory_movement.read`.

### 9.3 Cross-tenant behavior

Authorization is checked before detailed Item diagnostics. A wrong-tenant SKU,
Location, Warehouse or Branch returns a generic scope/item error identical to a
non-accessible object. Responses and error details must not return foreign names,
codes, statuses or IDs beyond the UUIDs already supplied by the caller.

## 10. Movement and Balance Integrity

- One Batch Item creates one existing `receive` Command, one positive
  `receive` Movement and one `stock.received` Event.
- Initial Stock meaning is captured by `batch_type = initial_receive` and the
  approved reason, while the existing Movement enum remains unchanged.
- Requested units are never converted; Movement uses the validated SKU base
  unit.
- Movement is inserted before Balance update by the current primitive.
- Balance row lock and `last_movement_id` preserve a traceable derived state.
- Batch code must not issue an independent Balance UPDATE or INSERT outside the
  existing processing-command guard.
- Batch Header/Items, Commands, Movements and Events cannot be edited to correct
  history. A future correction uses approved adjustment/compensating Movement.

## 11. Test Matrix for T4.4B Approval Gate

### 11.1 Schema and migration gates

| ID | Test | Expected |
|---|---|---|
| S01 | Baseline is exactly approved commit/migration chain | PASS or stop |
| S02 | Only two approved Batch tables and one approved Batch RPC are added | No aliases/duplicate inventory schema |
| S03 | Composite tenant/Branch FKs reject mixed Organization and Branch rows | Rejected |
| S04 | Header idempotency unique constraint matches `(org, type, UUID key)` | Enforced |
| S05 | Item duplicate pair and command 1:1 uniqueness | Enforced |
| S06 | Header/Item update/delete attempts | Rejected; completion transition only in trusted context |
| S07 | Existing Movement immutability and Balance guards | Unchanged PASS |
| S08 | Historical migrations/checksums | Unchanged |

### 11.2 Happy path and lineage

| ID | Test | Expected |
|---|---|---|
| H01 | One active standard/variant SKU | One completed Batch, 1 Item/Command/Movement/Event and exact Balance delta |
| H01B | Two or more active standard/variant SKUs, same Location | One completed Batch with matching N Items/Commands/Movements/Events and exact Balance deltas |
| H02 | Multiple Locations/Warehouses in the same Branch | PASS; persisted Warehouse derived from each Location |
| H03 | Optional reference/note/time normalization | Stored and hashed deterministically |
| H04 | Response lineage | Every Item joins to exactly one receive Command and Movement |
| H05 | Unit/quantity snapshot | Item, Command, Movement and Balance delta agree |

### 11.3 Atomic rollback

| ID | Fault in any Item | Expected |
|---|---|---|
| A01 | Unknown/wrong-tenant SKU | Entire Batch absent; zero net changes |
| A02 | Draft/inactive/archived SKU or Product | Entire Batch absent; zero net changes |
| A03 | Bundle Product | Entire Batch absent; no component expansion |
| A04 | Wrong-tenant/inactive Branch, Warehouse or Location | Entire Batch absent; generic error |
| A05 | Location belongs to another Batch Branch | Entire Batch absent |
| A06 | Wrong unit | Entire Batch absent |
| A07 | Zero, negative, overflow or excess-scale quantity | Entire Batch absent |
| A08 | Duplicate SKU/Location pair | Rejected before Movement write |
| A09 | Injected failure after an earlier Item posted inside transaction | Header, Items, Commands, Movements, Events and Balance changes all roll back |

### 11.4 Idempotency and canonicalization

| ID | Test | Expected |
|---|---|---|
| I01 | Same key and exact payload twice | Byte-equivalent stored JSON result; one set of deltas |
| I02 | Same key with Item order reversed | Same hash/result; one set of deltas |
| I03 | Same key with changed quantity/unit/SKU/Location | Conflict; no new delta |
| I04 | Same key with changed reference/reason/time | Conflict; no new delta |
| I05 | Same key and different actor | Conflict |
| I06 | Same UUID key in another Organization | Independent allowed namespace after authorization |
| I07 | Malformed/unknown fields | Request invalid; no Header persists |

### 11.5 Concurrency, double-click and timeout

| ID | Test | Expected |
|---|---|---|
| C01 | Concurrent same key/same payload | One post; both receive same completed result |
| C02 | Concurrent same key/different payload | One post; loser gets conflict |
| C03 | Concurrent different keys on same Balance | Both atomic; no lost update |
| C04 | Overlapping Batches with reversed input order | Deterministic completion or retry signal; no partial data/deadlock leak |
| C05 | Client timeout before commit | Same-key retry safely executes or replays |
| C06 | Client timeout after commit | Same-key retry only replays |
| C07 | Serialization/deadlock retry | Whole transaction rolls back; same key succeeds/replays later |

### 11.6 Permission, RLS and role gates

| ID | Test | Expected |
|---|---|---|
| P01 | `anon` table read/write and RPC execute | Denied |
| P02 | Browser `authenticated` direct Batch/Command/Movement/Balance/Event write | Denied |
| P03 | Browser `authenticated` RPC execute | Denied |
| P04 | `service_role` direct table write | Denied |
| P05 | `service_role` RPC with actor holding Branch `inventory.receive` | Allowed |
| P06 | Role baseline missing but individual Allow + Branch membership | Allowed |
| P07 | Baseline/Allow plus active Deny | Denied; Deny wins |
| P08 | Branch Allow without membership | Denied; no membership created |
| P09 | Expired Allow at statement time | Denied |
| P10 | Actor authorized in Branch A submits Branch B | Denied |
| P11 | `inventory_batch.read` exact Branch | Header/Items visible only in authorized Branch |
| P12 | `inventory.receive` without `inventory_batch.read` | Mutation may succeed, but Batch read remains denied |
| P13 | `inventory_batch.read` without movement/audit read | Batch visible; underlying protected ledger/audit remains independently denied |

### 11.7 Lifecycle, regression and security gates

- Existing Product/SKU/Warehouse/Inventory regression suites remain PASS.
- Existing single-SKU receive also rejects inactive Product and direct Bundle
  receipt after the shared guard extension.
- T4.2C and T4.3B permission tests remain PASS, including Owner/self protection,
  Allow/Deny, Branch ceiling and statement-time expiry.
- Database lint/security checks report no mutable-search-path function, broad
  browser grant, anonymous access, unindexed FK or unsafe RLS policy.
- Object gate finds exactly the approved Batch Header, Batch Items and one Batch
  RPC; no second Batch API, Ledger, Movement, Balance or Idempotency table.
- Isolated local Supabase QA must include Auth/Storage preflight and approved
  baseline replay. PREVIEW/Production remains a separate Owner/PM gate.

## 12. T4.4B Local Draft and QA Closure

| Action | File | Draft content/status |
|---|---|---|
| Created | `supabase/migrations/20260821000304_phase_t4_4b_atomic_batch_receive.sql` | One forward-only Local Draft containing Header/Items, tenant-safe FK indexes, immutable guards, RLS/grants, Owner-only Batch-read seed reconciliation, canonical hash, one RPC and shared Product stockability guard |
| Created | `supabase/tests/phase_t4_4b_atomic_batch_receive.sql` | One rollback-based Test Draft covering 1–100 cardinality, atomicity, idempotency, deterministic concurrency contract, lifecycle, permission/RLS and lineage |
| Transient only | Isolated QA harness | G12 PASS: Auth/Storage preflight, baseline 90/90 + 7 bridges, Forward 14/14, T4.2C–T4.4B, regression, atomicity, idempotency, concurrency, security and lint; all temporary containers/volumes/files removed |
| Not changed | API/UI files | Integration remains a later separately approved gate |

Historical migrations, T4.2C/T4.3B migrations and their approved semantics must
not be edited. Any shared function change is delivered through the new
forward-only T4.4B migration.

## 13. Risks and Controls

| Risk | Impact | Required control |
|---|---|---|
| Existing command supports one receive Movement | Attempting one command per Batch breaks sequence constraint | One command per Batch Item; Batch provides outer atomicity |
| Existing primitive lacks Product status/type validation | Draft/Bundle could bypass Batch through old receive boundary | Forward shared receive guard applied to all receive entry paths |
| Bundle schema does not distinguish virtual/preassembled | Incorrect direct Bundle on-hand | Reject all `structure_type = bundle` in T4.4; Assembly remains separate |
| Same payload with a new key posts twice | Duplicate stock | Client persists UUID key; API retry middleware must never regenerate on timeout |
| Large Batch holds many locks | Latency/deadlock/DoS | 100-Item cap, canonical lock/post order and isolated concurrency measurement |
| Canonical hash changes across versions | False conflicts/replays | Store contract/hash version; unknown version rejected |
| Cross-tenant validation leaks existence | Tenant information disclosure | Permission first; generic scope/item error; no foreign metadata in details |
| Batch RLS accidentally implies ledger/audit read | Privilege expansion | Independent granular policies and negative tests |
| Security-definer exposure | Browser bypass | Fixed search path, explicit qualification, revoke-default-execute, service-role-only grant and actor reauthorization |
| Balance is updated separately from Movement | Ledger/read-model divergence | Reuse current posting primitive and its processing-command guard only |
| Item failure is caught and loop continues | Partial success | No per-Item catch/continue; top-level exception rolls back transaction |
| Permission or lifecycle changes during processing | Inconsistent authorization/state | Statement-time permission contract and deterministic row locks before posting |
| Stored result contains unstable ordering | Retry response differs | Canonical Item order and exact Header result replay |

## 14. PM Approval Gates and Open Decisions

The report is implementation-ready only after PM explicitly approves these
items. Recommendations are already stated in the Locked Decisions section.

| Gate | Decision required | Recommendation |
|---|---|---|
| G1 | One Branch per Batch; multi-Warehouse/Location allowed within Branch | **Approved** |
| G2 | Item ceiling | **Approved with amendment: 1–100** |
| G3 | Direct Product structures allowed | **Approved:** `standard` and `variant`; reject all `bundle` |
| G4 | Unit/quantity rule | **Approved:** base-unit-only and current SKU scale; no new discrete-integer rule |
| G5 | Ledger mapping | **Approved:** business `initial_receive` → existing command/movement `receive` |
| G6 | Lineage | **Approved:** one Batch Item → one existing Inventory Command → one Movement |
| G7 | RPC signature | **Approved:** `public.server_receive_inventory_batch(jsonb, uuid)` |
| G8 | Canonicalization | **Approved:** SHA-256 v1 and order-insensitive sorted Item set |
| G9 | Read baseline | **Approved:** granular Branch-scoped read; no automatic Admin grant |
| G10 | Shared receive hardening | **Approved:** forward guard for active Product and non-Bundle receipt on all trusted receive paths |
| G11 | Future files | **Approved:** exactly one forward migration and one test file for T4.4B draft |
| G12 | Local Apply/QA | **Approved/PASS:** isolated local QA completed; cleanup confirmed; Main DB/Auth/Storage healthy |

G1–G12 are approved with the G2 amendment above. T4.4B Local Apply/QA passed
without connecting or applying to PREVIEW/Production. Remote Apply and deployment
remain prohibited until separately approved.

## 15. Final Readiness

**Design readiness:** G1–G12 APPROVED; G2 = 1–100 ITEMS.
**Implementation status:** T4.4B APPROVED/CLOSED; ISOLATED G12 QA PASS.
**Remote status:** NOT CONNECTED / NOT APPLIED.
**Git status intended by closure:** PM approved Commit/Push to
`origin/codex/workstream-domain-qa`; no deployment is authorized.

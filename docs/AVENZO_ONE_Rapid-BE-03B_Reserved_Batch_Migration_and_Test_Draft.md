# AVENZO ONE — Rapid-BE-03B Reserved Batch Migration/Test Draft

**Status:** Rapid-BE-03B Approved/Closed; Rapid-BE-03C Local QA PASS

**Updated:** 22 August 2026

**Branch:** `codex/workstream-ui`
**Authority:** Rapid-BE-03A D1–D12 Owner-approved contract

## 1. Outcome

Rapid-BE-03B now has a forward-only SQL draft that extends the existing
GSC-05 trusted creation function with `sales_code_mode='reserved_batch'`.
It does not create a second Product RPC, command ledger, reservation table or
identifier registry.

The draft accepts 1–50 explicitly selected Rapid rows and, in one database
transaction:

1. checks exact `product.create` authority;
2. applies the existing command-level advisory lock and idempotent replay;
3. locks the submitted reservation batch;
4. verifies Organization, actor ownership, purpose, active state and the
   approved three-hour expiry;
5. validates every row, Category, canonical Unit, price, Branch scope and
   Initial Stock handoff before Product mutation;
6. locks selected reservation rows by `sequence_number` to prevent inverted
   lock order;
7. creates draft Product/SKU records through the existing child command;
8. binds the same canonical reserved Sales Code as Rapid V1 SKU Code and Sales
   Code;
9. confirms only selected reservations and leaves unselected rows reserved;
10. stores one stable result and audit lineage.

Any exception rolls back the complete attempt. There is no partial-success
path.

## 2. Files

- `supabase/migrations/20260822100620_rapid_be_03b_reserved_batch_creation.sql`
- `supabase/tests/rapid_be_03b_reserved_batch_creation.sql`
- `docs/AVENZO_ONE_Rapid-BE-03A_Atomic_Selected_Row_Creation_Design_Preflight.md`
- `docs/AVENZO_ONE_Live_Sale_Rapid_Entry_Table_Development_Guide_V1.md`

The BE-03A request example was corrected to use the real GSC-05 field name
`sales_code_mode` and the established `creation_items[].payload` envelope.

## 3. Contract Preserved

- Normal, Variant and existing Rapid `sequence`, `manual`, `same_as_sku` and
  `deferred` behavior remains in the same function.
- `reserved_batch` is accepted only with `flow='rapid'`.
- Product/SKU status remains `draft`.
- Unselected codes remain reserved; the batch stays active while reserved rows
  remain.
- Images are not sent to Postgres and response returns
  `images_finalized=false`, `image_boundary='rapid-be-04-pending'`.
- Initial Stock is validated and retained as handoff data only; response
  returns `inventory_posted=false`,
  `initial_stock_boundary='rapid-be-05-pending'`.
- No Warehouse, Location, Balance, Movement or Storage mutation is present.
- Browser roles receive no function execution authority.

## 4. Draft Test Coverage

The SQL draft currently checks:

- an actor-owned active three-code batch;
- a selected two-row subset created in submitted order;
- exact reserved code → SKU Code → Sales Code binding;
- the unselected code remains reserved and the batch remains active;
- same key/same payload returns identical JSON and creates once;
- a malformed selected row rolls back Products, SKUs, command and reservation
  assignment for the whole attempt;
- `anon` and `authenticated` cannot execute the trusted RPC;
- `service_role` retains execute authority;
- no duplicate Rapid creation table is introduced.

The next Local QA gate must expand and execute the full BE-03A matrix,
including 1/10/50 rows, expired/foreign reservations, Individual Deny,
different-payload idempotency conflict, two-session races, reversed row order,
normal/variant regressions and measured query plans.

## 5. Static Review Result

- one Migration transaction (`BEGIN`/`COMMIT`);
- one `CREATE OR REPLACE FUNCTION` and zero `CREATE TABLE` statements;
- one SQL test transaction (`BEGIN`/`ROLLBACK`);
- balanced dollar-quoted blocks;
- service-role-only execution grant retained;
- empty function `search_path` and fully-qualified database objects retained;
- `git diff --check` passed; only a pre-existing line-ending warning remains
  for the Rapid Entry development guide;
- no database connection, migration apply, fixture mutation or remote action
  was performed.

## 6. Risks Requiring Runtime QA

1. The migration replaces the full GSC-05 function body, so all existing GSC
   regression suites must run from the beginning on an isolated stack.
2. Two-session reservation consumption and reversed-order submissions require
   a dedicated concurrency harness; they cannot be proven by static review.
3. Branch handoff is validated now but Stock is intentionally not posted until
   BE-05. The UI must not describe the quantity as received Stock.
4. Image files remain Browser-local until BE-04 staging/finalize/compensation
   is implemented.
5. Final Browser submit remains prohibited by D12 until BE-04, BE-05 and BE-06
   recovery/E2E gates are ready.

## 7. Rapid-BE-03C Verification Result

Rapid-BE-03C replayed the approved baseline and applied this Migration only to
an isolated Local Supabase stack. The full result is recorded in
`AVENZO_ONE_Rapid-BE-03C_Isolated_Local_QA_Report.md`.

The Local gates passed for 1/10/50 rows, atomic rollback, same-payload replay,
different-payload conflict, expired/foreign reservations, Individual Deny,
two-session concurrency, reversed-order selection, normal/variant regression,
Browser denial and database lint.

The isolated stack and its temporary files were removed after verification.
The Main Local database was not reset or mutated.

The next separately approved action is Rapid-BE-04. PREVIEW Apply, Production
Apply, Browser wiring, Commit/Push and Deploy remain separate approval gates.

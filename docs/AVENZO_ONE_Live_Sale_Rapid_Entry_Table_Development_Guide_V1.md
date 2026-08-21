# AVENZO ONE — Live Sale Rapid Entry Table Development Guide V1

**Status:** Rapid Entry UI V1 Owner Approved and Frozen · Rapid-UI-01–11C completed · Rapid-UI-11D deferred
**Updated:** 21 August 2026
**Authority:** Owner-approved direction after Live-UI-04
**Scope:** Live Sale product preparation only; normal Product Creation remains unchanged

## 1. Outcome

Replace the repeated one-product form workflow with a dense Rapid Entry Table
that prepares up to 50 Sales Codes and products in one workspace. The operator
must be able to type directly into cells, apply shared values, attach a cover
image per row and validate the complete selection before one atomic create
command.

This flow is intentionally different from normal Product Creation:

- Normal Product Creation prioritizes complete long-lived catalogue data.
- Live Sale Rapid Entry prioritizes safe, fast preparation of many short-lived
  selling records without requiring a skilled computer operator.
- Both flows still create normal Product/SKU identities and every Sales Code
  must resolve to exactly one `sku_id` before billing or stock operations.

## 2. Locked Product Decisions

1. One reservation prepares at most **50 Sales Codes and 50 table rows** in V1.
2. The Rapid Entry workspace supports desktop and landscape tablet only.
3. The enforceable UI gate is viewport width, not physical screen inches,
   because browsers cannot reliably detect an 8-inch device.
4. Minimum supported viewport is **1,024 CSS pixels**. Smaller viewports show a
   blocking guidance state; the table is not converted into mobile cards.
5. Each completed row may create one Product and one initial SKU. Empty or
   unselected rows are not submitted and their Sales Codes remain reserved.
6. Selected rows are created as one atomic operation: complete success or
   rollback of every selected row. Partial success is forbidden.
7. Product name is not a database Unique authority. SKU Code and permanent
   Sales Code remain the identifier authorities. Generated Product names must,
   however, be distinct inside the current 50-row reservation.
8. UI approval must finish before API, Database or Storage integration begins.

## 3. Prefix Availability and Reservation

Sales Code syntax, normalization, rollover and allocator behavior are governed
by `AVENZO_ONE_Global_Sales_Code_Standard_V1.md`. Rapid Entry may reserve up to
50 codes per command but must not define a separate Sales Code format.

When an operator enters a Prefix such as `A`, the UI normalizes it to uppercase
and performs a debounced availability check after 300–500 ms.

Required behavior:

- The advisory check finds the next contiguous range of 50 available codes.
- If `A001–A119` are unavailable, the suggestion is `A120–A169`.
- Default behavior continues after the latest used/reserved code; it does not
  automatically refill historical gaps.
- The UI shows `กำลังตรวจสอบ`, `พร้อมจอง`, `มีรหัสไม่ว่าง`, `ตรวจไม่ได้` and
  `สิทธิ์ไม่เพียงพอ` states.
- `ใช้ช่วงที่แนะนำ` copies the suggested start into the reservation form.
- Advisory availability never guarantees ownership. The create/reserve command
  must recheck and claim the complete range atomically under Organization scope.
- Concurrent loss of a suggested range returns a Conflict and a new available
  suggestion; the client must not silently change the range after confirmation.

## 4. Naming Template Builder

Product names must be ready for real use at initial creation. The system must
not depend on users returning later to replace temporary names.

### 4.1 Presets

| Preset | Template | Example |
|---|---|---|
| Sales Code only | `{code}` | `A120` |
| Live name + code | `{campaign} {code}` | `เทศกาล Live A120` |
| Campaign code | `{campaign}-{code}` | `PayDay-A120` |
| Custom | user-authored pattern containing `{code}` | `ต่างหูรอบค่ำ-A120` |

Default recommendation is `{campaign}-{code}`. Each Organization may later
persist its own default, including `{code}` for the shortest workflow.

### 4.2 Approved tokens

- `{code}` — permanent Sales Code, for example `A120`
- `{campaign}` — reservation/Live campaign name
- `{date}` — selected Live date in an approved deterministic format
- `{branch}` — Branch code
- `{seller}` — assigned seller/display label

Every multi-row template must contain `{code}`. If an operator enters fixed
text without the token, the UI appends `-{code}` and explains the change instead
of creating 50 duplicate names.

### 4.3 Preview and row override

- Preview the first three generated names and the final name before confirming.
- Enforce the Product name length and character safety contract before creating
  the table.
- Detect duplicate generated names inside the current reservation.
- A name cell remains directly editable.
- A manually edited row is marked `แก้ไขเฉพาะรายการ`.
- Changing the template offers: apply to every row, apply only to untouched
  rows, or cancel. Manually edited names are never overwritten silently.
- Provide `คืนค่าชื่อตาม Template` for selected rows.
- Saved/recent templates are future Organization preferences, not required for
  the first UI-only part.

## 5. Rapid Entry Table V1

### 5.1 Columns

| Column | Required behavior |
|---|---|
| Select | Select individual/all valid rows for bulk actions and submission |
| Sales Code | Read-only reserved code and row identity |
| Image | 1:1 cover preview; click to choose or drag one file onto the cell |
| Product name | Generated by template and editable inline |
| Category | Optional searchable Combobox; defaults to `ไม่ระบุหมวดหมู่` and supports bulk apply |
| Price | Inline non-negative Money field |
| Initial stock | Inline bounded quantity field |
| Unit | Searchable Combobox backed by approved unit master data |
| Branch | Reservation Branch by default; editable only within authorization |
| Status | Empty, editing, ready, warning, invalid or selected for creation |

Unit examples include `คู่`, `ใบ`, `ขวด`, `ชิ้น`, `แพ็ค`, `ชุด`, `กล่อง` and
`กิโลกรัม`. Changing a sell unit never changes the SKU base-unit contract
without an approved conversion model.

### 5.2 Spreadsheet interaction

- Click a cell to edit directly.
- `Enter` moves down, `Tab` moves right, `Shift+Tab` moves left and `Escape`
  cancels the current edit.
- Focus remains visible and never shifts the table layout.
- Copy/paste support starts with safe scalar cell values; multi-cell paste is a
  separately tested enhancement.
- Invalid cells show a local error without marking unrelated rows invalid.
- Sticky header, pinned identity columns, internal horizontal scroll and column
  resize follow the AVENZO ONE Data Table standards.

### 5.3 Bulk toolbar

The toolbar operates on selected rows by default and always displays the number
of affected rows before applying a change.

- Apply price to selected rows
- Apply initial stock to selected rows
- Apply unit to selected rows
- Apply Branch to selected rows
- Restore names from the current Naming Template
- Select all ready rows / clear selection

Applying to all 50 rows requires a separate explicit choice and confirmation.
Undo must be available for the latest bulk operation.

### 5.4 Images

- V1 supports one cover image per row.
- Click the image cell to open the file picker or drag an image onto that row.
- Validate MIME type, file size and safe preview before accepting the file.
- Replacing and removing an image use icon-only actions with accessible labels
  and top tooltips.
- Multi-image filename matching such as `A120.jpg → A120` belongs to the future
  Bulk Images phase and must not delay the first per-row UI.

## 6. Safety and Recovery

- Display summary counters: reserved 50, completed, ready, invalid, unfilled and
  selected for creation.
- Submission includes only explicitly selected ready rows.
- Validation summary links to and focuses the first invalid cell.
- Browser Draft autosave protects UI work from accidental refresh during the
  UI phase; it is not proof of a server reservation.
- Draft format is versioned, bounded and scoped by Organization/reservation.
- Provide discard-draft confirmation and restore notice.
- Disable duplicate submit while processing.
- The eventual server command uses one Idempotency Key and atomic rollback.
- Images require a staged upload/compensation contract before real integration.
- Error states distinguish validation, duplicate identifier, permission,
  reservation conflict, upload failure, timeout and unknown outcome.

## 7. Development Plan and Approval Gates

Each Part must be completed and verified before the next Part starts. UI Parts
run on localhost and must not call Supabase mutations, create Products or write
Stock.

### Phase UI — Localhost only

| Part | Deliverable | Acceptance gate |
|---|---|---|
| Rapid-UI-01 | Desktop/landscape-tablet workspace shell and `<1024px` blocking state | Owner approved |
| Rapid-UI-02 | Prefix assistant and 50-code range preview using deterministic UI simulation | Owner approved |
| Rapid-UI-03 | Naming Template Builder, tokens, presets and first/last preview | Owner approved |
| Rapid-UI-04 | 50-row table structure, sticky header, pinned identity and internal scroll | Owner approved |
| Rapid-UI-05 | Inline editing and keyboard navigation | Owner approved |
| Rapid-UI-06 | Unit Combobox and selected-row bulk price/stock/unit/Branch tools | Owner approved |
| Rapid-UI-07 | Per-row click/drag cover image, preview, replace and remove | Owner approved — image flow and alignment passed |
| Rapid-UI-07B | Optional searchable Category column and bulk Category apply | Owner approved |
| Rapid-UI-08 | Validation summary, row status, selected-ready submit preview and error navigation | Owner approved — empty rows ignored, invalid cell focus and no partial-success language |
| Rapid-UI-09 | Browser Draft recovery, discard/restore and 50-row performance pass | Owner approved — refresh recovery, confirmed discard and 50-row restore passed |
| Rapid-UI-10 | Visual parity, accessibility, regression and Owner acceptance | TypeScript/build/tests pass; Owner explicitly approves UI freeze |
| Rapid-UI-11A | Status filters for incomplete, ready and all rows | Owner approved |
| Rapid-UI-11B | Ready-row ordering without mutating row identity | Owner approved |
| Rapid-UI-11C | Safe bulk-selection scope across visible and hidden rows | Owner approved; committed and pushed in `66a38fa` |
| Rapid-UI-11D | Advanced filters for Category, Price, Stock, Unit and Branch | Deferred as a Future Enhancement; not required for V1 because the workspace is capped at 50 rows and V1 prioritizes a compact workflow |

### Phase Domain/Integration — starts only after Rapid-UI-10

| Part | Deliverable | Acceptance gate |
|---|---|---|
| Rapid-BE-01 | Prefix availability read contract and Organization-scoped contiguous-range query | Bounded query, permission, no cross-tenant leak and measured index plan |
| Rapid-BE-02 | Atomic 50-code reservation/claim with expiry, conflict and idempotency | Concurrent claim creates one owner; retry returns deterministic result |
| Rapid-BE-03 | Atomic selected-row Product/SKU/Sales Code creation command | 1–50 ready rows; duplicate or invalid row rolls back the complete command |
| Rapid-BE-04 | Image staging, finalize and compensation | No orphan object/row; retry and partial upload recovery pass |
| Rapid-BE-05 | Initial Stock integration through approved Phase T inventory boundary | Every created SKU resolves to `sku_id`; one failed Stock item rolls back per approved contract |
| Rapid-BE-06 | Authenticated API/UI integration, observability and E2E | Double-click, timeout, conflict, permissions, audit and complete user journey pass |

## 8. Explicit Non-goals for the First UI Phase

- No mobile layout below 1,024 CSS pixels
- No real Prefix scan or Sales Code claim
- No Product/SKU/Stock write
- No Supabase Storage upload
- No automatic multi-file filename matching
- No AI-generated Product name authority
- No Bundle creation, unit conversion or Live CF parser change

## 9. Next Authorized Action

The Owner froze the Rapid Entry UI V1 scope on 21 August 2026. Do not add
Rapid-UI-11D before real-usage evidence shows that the current status filters,
ready-row ordering and safe selection are insufficient.

Proceed sequentially with Rapid-BE-01 through Rapid-BE-06. Every Backend Part
must pass its Contract, Security, Atomicity and E2E gate before the next Part
starts. PREVIEW apply or deployment still requires explicit Owner approval;
Production remains out of scope.

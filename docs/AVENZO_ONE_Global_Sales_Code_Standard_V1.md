# AVENZO ONE — Global Sales Code Standard V1

**Status:** Owner Approved Contract Direction — Pending Domain/UI Implementation
**Updated:** 21 August 2026
**Authority:** Applies to every new Sales Code created by AVENZO ONE

## 1. Scope

This is the single Sales Code standard for all product-creation workflows:

1. Normal product creation
2. Product creation with multiple options / SKU combinations
3. Rapid Entry / Live Sale product creation
4. Future import, API and bulk-creation workflows

No screen may implement its own normalization, sequence rollover or next-code
logic. Every workflow must use the same shared Domain contract and trusted
server allocator.

## 2. Canonical V1 Format

```text
PREFIX + THREE-DIGIT SEQUENCE

A001–A999
B001–B999
...
Z001–Z999
AA001–AA999
AB001–AB999
```

Rules:

- New Sales Codes use uppercase English letters `A–Z` and digits `0–9` only.
- Prefix length is 1–3 letters.
- The numeric segment is exactly three digits in V1.
- Sequence starts at `001`; `000` is reserved and must not be assigned.
- Whitespace, Thai characters, vowels, tone marks, punctuation and symbols are
  rejected for new Sales Codes.
- Input is trimmed and normalized to uppercase before validation and lookup.
- Canonical validation pattern is `^[A-Z]{1,3}(00[1-9]|0[1-9][0-9]|[1-9][0-9]{2})$`.
- A Sales Code is unique inside its Organization and permanently resolves to
  exactly one `sku_id`.
- Assignment is immutable. Archive, Trash or retirement does not release the
  code for reuse.

Existing historical Sales Codes that do not match V1 remain readable and
searchable. They are grandfathered, must not be rewritten automatically and
must not be used as a reason to weaken the rule for newly assigned codes.

## 3. Prefix Rollover

Prefix progression follows an Excel-style alphabetic sequence:

```text
A → B → ... → Z → AA → AB → ... → AZ → BA → ... → ZZZ
```

When a Prefix reaches `999`, the allocator recommends `001` under the next
Prefix. A reservation batch must stay inside one Prefix. If the requested
quantity does not fit in the remaining range, the system recommends a complete
range under the next available Prefix instead of splitting one batch.

Examples:

- Latest assigned under `A` is `A119`; a 50-code request recommends
  `A120–A169`.
- Latest assigned under `A` is `A980`; a 50-code request recommends
  `B001–B050`.
- `Z999` rolls over to `AA001`.
- `AA999` rolls over to `AB001`.

## 4. Creation Modes

### Sequence mode — recommended default

The server finds and atomically assigns the next available code or contiguous
range according to this standard.

### Manual mode

Manual input must pass the same canonical validation, Organization uniqueness
check and permanent-assignment rules. A client-side success state is advisory;
the trusted server command remains authoritative.

### Same-as-SKU mode

This mode is allowed only when the SKU Code itself matches the canonical Sales
Code format and is available in the Organization. Otherwise the UI must explain
why the mode cannot be used and offer Sequence mode.

## 5. Shared UI Behavior

All three product-creation experiences must show the same terminology and
validation behavior:

- `Prefix รหัสขาย`
- `เลขรัน 3 หลัก`
- `ช่วงที่แนะนำ`
- `รหัสถัดไปที่ใช้ได้`
- `ตรวจสอบรหัสอีกครั้ง`

The UI may preview a candidate but must not claim that it is assigned until the
server transaction succeeds. Duplicate/conflict responses must return the next
actually available candidate or range, not merely increment the rejected code
once.

Thai Sales Codes are not supported in V1. A future Thai mode requires a separate
Owner-approved normalization, keyboard, Unicode, parser, integration and
migration contract; it must not be introduced as an exception in one screen.

## 6. Shared Backend Authority

One Organization-scoped allocator must serve normal, multi-option and Rapid
Entry creation. It must provide:

- normalization and canonical validation;
- next-code and contiguous-range discovery;
- Organization-scoped uniqueness;
- atomic reservation/assignment;
- idempotency for retry and double-click;
- concurrency protection;
- permanent registry and audit trail;
- deterministic conflict response with the next available suggestion.

For multi-option products, every SKU receives a different Sales Code. For Rapid
Entry, the selected ready rows are assigned in one all-or-nothing command.

## 7. Implementation Gate

This document freezes the common contract direction only. Before changing the
Database or production behavior, the Domain workstream must reconcile existing
identifier migrations, historical codes and SKU-04/Rapid reservation behavior,
then provide migration, compatibility and concurrency tests for Owner approval.

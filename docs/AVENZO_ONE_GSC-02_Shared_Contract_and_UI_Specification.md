# AVENZO ONE — GSC-02 Shared Contract and UI Specification

**Status:** Local Implementation Complete — Pending Owner Approval  
**Updated:** 21 August 2026  
**Parent:** `AVENZO_ONE_Global_Sales_Code_Implementation_Plan_V1.md`  
**Approved authority:** `AVENZO_ONE_Global_Sales_Code_Standard_V1.md`

## 1. Outcome

GSC-02 creates one pure TypeScript contract for formatting, normalization,
validation, Prefix rollover, bounded range preview and shared Thai UI language.
It is deliberately independent from React, Next.js and Supabase clients so all
creation workflows can consume the same rules without introducing a second
allocator.

This Part does not wire the module into existing screens. UI integration is
reserved for GSC-06 after the Database authority and atomic creation paths are
approved.

## 2. Source and Test

- Contract: `web/src/lib/foundation/global-sales-code.ts`
- Test: `web/scripts/test-global-sales-code-contract.mjs`

## 3. Canonical Contract

| Rule | Value |
|---|---|
| Prefix | Uppercase English `A–Z`, 1–3 letters |
| Numeric part | Exactly 3 digits |
| Assignable range | `001–999` |
| Reserved value | `000` |
| Maximum preview range | 50 codes |
| Reservation TTL constant | 3 hours |
| Final code | `ZZZ999` |
| Canonical pattern | `^[A-Z]{1,3}(00[1-9]\|0[1-9][0-9]\|[1-9][0-9]{2})$` |

Normalization applies Unicode NFKC, trims outer whitespace and converts to
uppercase. It does not remove internal whitespace or punctuation. Those values
remain invalid so the UI cannot silently transform a materially different code.

## 4. Public Functions

| Function | Responsibility |
|---|---|
| `normalizeGlobalSalesCode` | Normalize user/import input for validation and lookup |
| `validateGlobalSalesCode` | Return a typed success or explicit validation error |
| `formatGlobalSalesCode` | Format a trusted Prefix and number as a canonical code |
| `nextGlobalSalesCodePrefix` | Progress `A...Z → AA...ZZZ` |
| `nextGlobalSalesCode` | Progress one code including Prefix rollover |
| `globalSalesCodeRemainingCapacity` | Calculate remaining capacity inside the current Prefix |
| `previewGlobalSalesCodeRange` | Preview 1–50 codes without splitting a Prefix |
| `globalSalesCodeValidationMessage` | Map validation to shared Thai language |
| `globalSalesCodeUiStateMessage` | Map lifecycle state to shared Thai language |

## 5. Preview Safety Contract

Every client range response contains:

- `state: "preview"`;
- `authoritative: false`;
- requested and proposed Prefix;
- start/end number and code;
- quantity;
- whether the full range moved to the next Prefix.

A client preview never uses the words “assigned” or “saved”. Only a later
authenticated Server response may move the lifecycle to `reserved` or
`assigned`.

When a requested range would cross `999`, the complete range moves to the next
Prefix. Example: `A980` plus 50 previews `B001–B050`; it never returns a split
`A980–A999` plus `B001–B030` response.

## 6. Shared UI Language

Required labels across Normal, Multiple-option and Rapid Entry creation:

- `Prefix รหัสขาย`
- `เลขรัน 3 หลัก`
- `ช่วงที่แนะนำ`
- `รหัสถัดไปที่ใช้ได้`
- `ตรวจสอบรหัสอีกครั้ง`

Required lifecycle states:

| State | Meaning |
|---|---|
| Idle | Waiting for input/check |
| Checking | Authenticated check is in progress |
| Preview | Client/server proposal only; not reserved |
| Reserved | Temporarily held for up to three hours |
| Assigned | Permanently bound to a SKU |
| Conflict | Used or reserved; server must return the next available result |
| Expired | Reservation must be checked again |
| Timeout | Keep input and allow safe retry |
| Permission denied | Do not reveal another tenant's owner or SKU |

## 7. Error Contract

Typed errors distinguish:

- required input;
- invalid characters;
- invalid overall format;
- Prefix longer than three letters;
- numeric width other than three digits;
- reserved `000`;
- invalid Prefix/start/quantity for range preview;
- terminal Prefix exhaustion.

Thai characters, Thai digits, tone marks, punctuation, `_`, `-`, internal
spaces and malformed widths are rejected. Lowercase and full-width English
letters/digits normalize deterministically before validation.

## 8. Mode Rules

- Sequence is the recommended default in future UI integration.
- Manual mode uses the same validator and later the same trusted claim path.
- Same-as-SKU is eligible only when the normalized SKU is a valid Global Sales
  Code; availability remains a Server decision.
- A Draft may be blank. Activation, Import execution and Rapid submission must
  allocate every missing code atomically in the later approved Parts.

## 9. Test Matrix

The scoped test covers:

- `A001`, `A999 → B001`, `Z999 → AA001`, `AA999 → AB001`;
- all 18,278 Prefixes from `A` through `ZZZ` without duplicate progression;
- final exhaustion at `ZZZ999`;
- one-code and 50-code preview;
- whole-range rollover without splitting;
- reserved `000` and malformed inputs;
- Thai, punctuation, mixed case, whitespace and full-width normalization;
- shared labels, messages, preview wording and three-hour reservation wording.

## 10. Security and Authority Boundary

This module performs deterministic format work only. It does not:

- query availability;
- authorize an actor;
- reserve or assign a code;
- write through a Supabase Browser client;
- expose another Organization's identifier owner;
- replace A4 locking, idempotency, registry or audit.

GSC-03 and GSC-04 remain responsible for forward-only Database enforcement and
the authenticated allocator. Browser validation is advisory.

## 11. GSC-02 Gate

GSC-02 stops after the pure contract, specification and tests. No Migration,
RPC, API, PREVIEW or Production change is included. GSC-03 must not start until
the Owner reviews and approves this Part.

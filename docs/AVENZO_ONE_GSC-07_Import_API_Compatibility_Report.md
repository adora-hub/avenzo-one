# AVENZO ONE — GSC-07 Import, API and Compatibility Report

**Status:** Local Implementation Complete — Pending Owner Test  
**Date:** 21 August 2026  
**Branch:** `codex/workstream-ui`

## Outcome

Excel Import and its authenticated Server Actions now share the Global Sales
Code V1 validator and the existing GSC-05 trusted creation command.

## Approved behavior

1. A blank imported Sales Code is explicit opt-in to automatic allocation.
2. A supplied Sales Code is normalized and validated with the same contract as
   Normal, Multi-option and Rapid Entry.
3. `A000`, Thai text, punctuation, malformed widths and Prefixes longer than
   three letters are rejected before a write.
4. Duplicate identifiers in the file and conflicts in the Organization are
   reported by row. A known conflict blocks import.
5. Grandfathered historical values stay readable/searchable unchanged but
   cannot be assigned to a new SKU.
6. Each write group is 1–50 rows, uses a stable outer Command ID and is
   All-or-Nothing. There is no per-row creation fallback.
7. Files larger than 50 valid rows are sequential atomic groups. Retrying uses
   the same batch and child Command IDs.
8. Import creates Draft Product/SKU data only. It never writes Inventory,
   Balance or Stock Movement data.

## Security boundary

- Caller must have both `product.create` and `sku.create`.
- Individual Deny remains effective through the existing authorization helper
  and the trusted Database command.
- Identifier lookup is restricted by `organization_id` after authorization.
- Conflict responses return only the values submitted by the caller and never
  disclose another Product ID, SKU ID or owner.
- Browser roles receive no direct allocator or identifier-registry write.

## Correction compatibility

GSC-07 does not update an assigned Sales Code directly. A mistaken permanent
code must use the future audited Rotate Sales Code command: claim a new unique
code, retain the old code as a non-reusable alias and preserve historical
Order/CF lookup.

## Verification

- TypeScript no-emit check: PASS
- GSC-07 and Excel Import scoped tests: PASS 26/26
- Remote/PREVIEW/Production Apply: NOT RUN
- Commit/Push/Deploy: NOT RUN

## Owner test

1. Import one valid row with an empty Sales Code and confirm Preview shows an
   automatic proposed range.
2. Import one row with `A000` and confirm the row is rejected.
3. Import a known duplicate and confirm the button is disabled until fixed.
4. Import 2–50 valid rows and confirm all rows succeed together.
5. Force one conflict immediately before confirmation and confirm the complete
   group rolls back with no partial Product/SKU creation.

# AVENZO ONE — GSC-06 Shared UI Integration Report

**Date:** 21 August 2026  
**Branch:** `codex/workstream-ui`  
**Status:** Local implementation complete — pending Owner visual approval

## Outcome

The Normal, Multi-option and Rapid Entry creation screens now use the same
Global Sales Code V1 format and one authenticated Server preview boundary.
Browser code performs only deterministic validation and UI state management;
availability remains a trusted Server decision.

## User-visible behavior

- New Normal products default to Sequence mode.
- Prefix accepts only `A–Z`, one to three letters.
- The running part is fixed to `001–999`; `000` is rejected.
- Multi-option previews one complete range for all enabled SKUs.
- Rapid Entry checks one real contiguous range of 50 codes and supports Prefix
  rollover instead of using fixed demo data.
- Loading, timeout, permission, error and retry states preserve entered data.
- Preview text states clearly that the codes are not reserved until creation.

## Security boundary

- The Browser calls `previewGlobalSalesCodeRangeAction`.
- The Server resolves the authenticated actor and requires `product.create`.
- Only the service client invokes `server_preview_global_sales_code_range`.
- No reservation, assignment, Product write or Stock write occurs in preview.

## Verification

- TypeScript: PASS (`tsc --noEmit --incremental false`)
- GSC-06 and upgraded Rapid Prefix tests: 10/10 PASS
- Scoped Product/Variant/Rapid compatibility: 37/37 PASS
- `git diff --check`: PASS
- Production build: INCOMPLETE because the active localhost Next.js process
  held the shared `.next` workspace; no compile error was reported before the
  build process was stopped.

## Owner visual test

1. Normal: choose Sequence, enter `A`, confirm a real available code appears.
2. Multi-option: create at least two enabled options and confirm a complete
   non-duplicated range is shown and applied.
3. Rapid Entry: enter `A`, wait for the 50-code range, select it and verify the
   table receives exactly those codes.
4. Enter an invalid Prefix or remove permission and confirm the Thai guidance
   is actionable and the entered value is not cleared.

No Commit, Push, PREVIEW Apply, Production Apply or Deploy is included.

# AVENZO ONE Rapid-BE-05 — Initial Stock Integration

Status: Approved implementation complete — Local only

## Contract

- Accepts 1–50 unique Rapid rows with persisted Product/SKU IDs and versions.
- Activates each SKU and Product using stable command IDs.
- Posts Initial Stock once through the approved T4.4B atomic Batch boundary.
- No stock write occurs when any activation is incomplete.
- A rejected or ambiguous Batch retains the same idempotency key for recovery.
- There is no per-SKU receive fallback and no partial Stock success state.

## Verification

- Rapid-BE-05 workflow tests: PASS 5/5.
- Existing T5.2 integration regression: PASS 24/24.
- Combined Initial Stock suite: PASS 29/29.
- TypeScript (`--incremental false`): PASS.
- Logged-in Localhost already renders 50 Rapid rows and editable Initial Stock
  cells without Console errors. Authenticated submission and visible progress/
  recovery states are intentionally connected in Rapid-BE-06.

PREVIEW and Production remain untouched. No Commit or Push was performed.

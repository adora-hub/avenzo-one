# AVENZO ONE Rapid-BE-06 — Authenticated Integration and E2E

Status: Local implementation corrected — Owner retry with image re-selection pending

## End-to-end contract

- Sends only selected rows that are complete and ready.
- Creates Product/SKU records through the approved reserved-batch command.
- Runs the approved private-image pipeline after Product IDs exist.
- Activates all created Product/SKU records before Initial Stock.
- Sends Initial Stock once through the approved atomic Batch boundary.
- Never falls back to per-SKU or partial Stock writes.
- Keeps stable command, workflow, activation and Batch identities for retry.
- Persists an execution journal in Browser storage so an interrupted attempt can
  resume without issuing a second creation command.
- Removes the Browser Draft only after the complete workflow succeeds.

## Visible user states

The Localhost UI now reports the actual stages: creating Product/SKU records,
processing images, receiving Initial Stock, success, conflict or recoverable
error. The confirmation dialog shows the exact selected rows and destination
before the first write. Double submission is disabled while work is running.

If a browser refresh loses an in-memory image file, the recovery state keeps
the created record identities and asks the user to select only the missing
image again. It does not silently recreate the Product/SKU.

## Verification

- Rapid-BE-04 image pipeline: PASS 8/8.
- Rapid-BE-05 plus T5.2 Initial Stock suites: PASS 41/41.
- Rapid-BE-06 authenticated integration: PASS 8/8.
- Rapid-BE-04/05/06 plus T5.2 scoped regression: PASS 57/57.
- Complete Rapid/Live UI regression: PASS 120/120.
- TypeScript (`--incremental false`): PASS.
- Production Build: PASS, 39/39 pages generated.
- `git diff --check`: PASS.

## Logged-in Localhost verification

- Rapid Entry loaded with `LOCAL BACKEND` and rendered all 50 rows.
- A real three-hour reservation for A017–A066 was created successfully.
- A row with price and zero Initial Stock reached the real confirmation dialog.
- The dialog showed the correct Sales Code, generated name, category, price,
  quantity and Branch before submission.
- The dialog was closed without pressing Create, and the temporary row values
  were cleared; no Product/SKU test record was created.
- Browser Console contained no application error.
- Chrome automation refused programmatic local-file selection by browser
  security policy. The click/drag image interaction remains for the Owner's
  final real-use test; no security bypass was attempted.

## Owner real-use correction — 22 August 2026

- The first real three-row submission stopped with `validation_failed` before
  Product creation.
- Root cause: the UI sent the visible Branch code (`BKK-01`) in the creation
  handoff, while the approved BE-03B contract requires the tenant-safe Branch
  UUID.
- The UI now resolves the authorized Warehouse/Location before the first write,
  passes `branch_id` to Product creation and reuses the same resolved scope for
  Atomic Initial Stock.
- An unfinished pre-fix execution journal is repaired in place while retaining
  the same creation Command and Batch retry identities.
- The latest table draft is now flushed immediately before the first write so a
  quick Create click cannot race the debounced Browser Draft autosave.
- Localhost was reloaded successfully and showed the authenticated recovery
  action without Console errors. The final retry was not submitted after reload
  because browser security intentionally discards the three previously selected
  local image File objects; the Owner must reselect those images before the
  final real-use retry.

## Safety and delivery state

This implementation is connected only to the Local backend. PREVIEW and
Production were not changed. No Deploy, Commit or Push was performed in this
checkpoint.

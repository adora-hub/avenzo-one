# AVENZO ONE Rapid-BE-04 — Image Staging, Finalize and Compensation

Status: Approved implementation complete — Local only

## Scope

Rapid Entry reuses the approved R6 Product Image Gate. It does not create a
second bucket, image table, upload RPC or browser database-write path.

The pipeline maps each staged image to the Product ID returned by Rapid-BE-03,
then performs `prepare → authenticated private upload → finalize → reorder`.
Failed items use the trusted cleanup boundary before they become retryable.

## Recovery contract

- A row already finalized as `ready` is skipped on retry.
- An ambiguous finalize response is retried with the same command ID.
- A failed prepared/uploaded image is cleaned through `product.image.fail`.
- Cleanup failure is surfaced as `compensation_pending`; the whole image phase
  must not be reported as complete while any such item remains.
- Successful rows are retained when another image fails. A later attempt only
  retries failed rows against the already-created Product IDs.

## Integration boundary

Rapid-BE-04 deliberately provides the reusable image engine without enabling
the final Rapid Entry submit button. Rapid-BE-05 adds Initial Stock through the
approved Phase T/T5 boundary. Rapid-BE-06 then connects the authenticated UI,
Product/SKU creation result, image engine, observability and complete E2E flow.

PREVIEW and Production remain untouched. Commit and Push remain separately
gated by the Owner.

## Verification

- Dynamic pipeline contract: PASS 8/8.
- Existing Rapid row-image UI regression: PASS 7/7.
- Combined BE-04/Rapid image tests: PASS 15/15.
- TypeScript (`--incremental false`): PASS.
- Logged-in Chrome Localhost: route loaded, 50 table rows and image file
  controls were rendered; Console error count was 0.
- Chrome automation refused `fileChooser.setFiles` with `Not allowed`.
  No browser-security bypass was attempted. Click/drop selection remains
  covered by the existing UI tests and will receive final Owner interaction
  testing after Rapid-BE-06, as requested.

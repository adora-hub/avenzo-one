# AVENZO ONE — Rapid-UI-09 Browser Draft Recovery Report

**Status:** Owner Approved  
**Date:** 21 August 2026  
**Scope:** Live Sale Rapid Entry UI only

## Outcome

Rapid Entry now protects the 50-row workspace from an accidental refresh. The
Browser Draft is saved after a 400 ms pause and can be restored or discarded
when the operator returns to the page.

## Safety Contract

- Draft version is `1` and the serialized payload is capped at 256 KB.
- Storage key and payload are scoped by Organization and authenticated user.
- The reservation identity (`prefix:start:end`) must match the restored range.
- Exactly 50 validated scalar rows are accepted during restore.
- Image bytes are never stored in Browser Draft. Only the original filename is
  remembered so the UI can tell the operator which images must be selected
  again after refresh.
- Invalid, oversized or foreign-scope Draft data is rejected and removed.
- Discard is destructive and therefore always requires confirmation.

## UX States

1. No Draft: operator starts with the normal Prefix workflow.
2. Draft found: editing is paused until the operator chooses Restore or Discard.
3. Restore: range, naming template, row values, selection, categories and column
   widths return; missing image files are disclosed.
4. Autosave: a compact status notice shows the most recent result.
5. Storage denied/oversized: the UI explains that the Draft was not saved and
   does not claim success.

## Verification Gate

- TypeScript must pass.
- Rapid-UI-01–09 scoped tests must pass.
- Refresh must show the restore notice and return the edited cell values.
- Canceling Discard must preserve the Draft; confirming it must return to the
  empty Prefix workflow.
- Viewport behavior remains desktop/landscape tablet only at 1,024 CSS pixels.
- No Supabase mutation, Product/SKU creation, image upload or Stock write exists
  in this Part.

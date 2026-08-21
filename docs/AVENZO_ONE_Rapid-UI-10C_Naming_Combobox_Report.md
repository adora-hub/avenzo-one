# AVENZO ONE — Rapid-UI-10C Naming Combobox Report

**Status:** Owner Correction Implemented — Pending Retest

**Date:** 21 August 2026

**Branch:** `codex/workstream-ui`

**Scope:** Live Sale Rapid Entry Step 2 UI only; no API, Database, Product/SKU,
Sales Code reservation or Stock write

## Outcome

- Replaced four large naming preset cards with one accessible Combobox.
- Kept all four approved naming modes and their existing naming formulas.
- The related Live/Campaign or custom-pattern field appears only when required.
- Removed the redundant system-template panel and pre-table name preview.
- Kept code-token enforcement and bounded-name validation in the component.
- Updated the empty-state and Step 2 progress copy to match the compact workflow.
- Step 2 runtime height with the default Campaign mode is 174px.
- Owner correction standardized every native Combobox on the Rapid Entry page:
  custom arrow, 12px right-edge clearance, consistent focus and control padding.
- Final Design correction replaced Native Select surfaces with a reusable Custom
  Combobox in Step 2 and the bulk tools. Selected and hover states now use the
  neutral Design System surface with a check mark instead of browser blue.

## Verification

- Scoped Rapid Entry UI tests: PASS 14/14
- TypeScript no-emit with incremental cache disabled: PASS
- Localhost: all four Combobox modes switch to their correct conditional field
- Localhost: system-template and pre-table preview surfaces are absent
- No Backend behavior or data-write path changed
- No Commit or Push

## Owner Acceptance

Owner approved Rapid-UI-10C on 21 August 2026. The next Rapid Entry part must
start only after explicit approval. A later Combobox-arrow correction was
implemented across the page and is waiting for Owner visual retest.

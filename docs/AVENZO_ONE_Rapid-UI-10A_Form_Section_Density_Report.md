# AVENZO ONE — Rapid-UI-10A Form Section Density Report

**Status:** Implementation Complete — Pending Owner Visual Review

**Date:** 21 August 2026

**Branch:** `codex/workstream-ui`

**Scope:** Live Sale Rapid Entry UI only; no API, Database, Storage, Product,
SKU, Sales Code reservation or Stock write

## Outcome

- Step 1 through Step 4 now use the approved Product Creation pattern: a numbered
  25×25px circle, 18px heading and 13px description.
- Repeated “ขั้นตอนที่ …” kicker text was removed from these section headers.
- Important labels keep the field name, required indicator and 18px Info icon
  on one line.
- Form Info guidance opens by hover, focus or click and exposes an accessible
  tooltip.
- Prefix checking and Naming Template behavior remain unchanged.
- The redundant `ขอบเขต V1` side card was removed so the working form uses the
  full available width.

## Files

- `web/src/app/organizations/[id]/products/live-sale/rapid-entry/rapid-info-hint.tsx`
- `web/src/app/organizations/[id]/products/live-sale/rapid-entry/rapid-prefix-assistant.tsx`
- `web/src/app/organizations/[id]/products/live-sale/rapid-entry/rapid-naming-template-builder.tsx`
- `web/src/app/organizations/[id]/products/live-sale/rapid-entry/rapid-entry-table.tsx`
- `web/src/app/organizations/[id]/products/live-sale/rapid-entry/rapid-entry-workspace-shell.tsx`
- `web/src/app/globals.css`
- `web/scripts/test-products-rapid-ui-02-prefix-assistant.mjs`
- `web/scripts/test-products-rapid-ui-03-naming-template-builder.mjs`
- `docs/AVENZO_ONE_Design_System_and_UIUX_Standards_V1.md`
- `docs/AVENZO_ONE_Live_Sale_Rapid_Entry_Table_Development_Guide_V1.md`

## Verification

- Scoped UI tests: PASS 30/30
- TypeScript no-emit with incremental cache disabled: PASS
- Runtime DOM: numbered Step 1–4 headings, inline required labels and accessible
  Info controls present
- Runtime DOM: `ขอบเขต V1` card count is 0
- Runtime computed styles: number 25×25px, heading 18px and label 14px
- Tooltip interaction: mouse/keyboard/click state verified
- Scoped `git diff --check`: PASS

## Remaining Work

Rapid-UI-10B–10D are not started. This Part stops for Owner visual approval.
No Commit or Push was performed.

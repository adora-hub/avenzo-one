# AVENZO ONE — Rapid-UI-11A Status Filter Report

## Status

Implemented on localhost for Owner visual review. UI only; no Backend, API, database, Stock write, Commit, Push or Deploy.

## Scope

- Added a compact status Button Group immediately above the Rapid Entry table.
- Default view focuses on rows that still need input or correction.
- Added dedicated views for invalid, ready, and all rows with live counts.
- Added a filtered empty state and visible/total range information.
- Preserved original row numbers, sales codes, selection, draft values, and full-dataset bulk action scope.

## Design Contract

- Single-select segmented control with `aria-pressed` and keyboard focus.
- Active state uses black background and white text.
- Filtering affects presentation only; it does not reorder or mutate rows.
- Automatically moving ready rows remains out of scope until UI-11B.

## Owner Test

1. Open Rapid Entry and create the 50-row draft.
2. Confirm the default view shows rows requiring work.
3. Enter complete data in at least one row and invalid/partial data in another.
4. Switch among `รอดำเนินการ`, `ข้อมูลไม่ครบ`, `พร้อมสร้าง`, and `ทั้งหมด`.
5. Confirm counts and visible rows update immediately.
6. Select a row, change the filter so it disappears, then return to `ทั้งหมด`; selection must remain.
7. Confirm row number and Sales Code never change.
8. Use Tab/Shift+Tab and Enter/Space to operate the filter buttons.

## Remaining

- Owner visual approval.
- UI-11B auto-move ready rows is intentionally not started.

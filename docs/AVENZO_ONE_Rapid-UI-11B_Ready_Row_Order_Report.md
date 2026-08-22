# AVENZO ONE — Rapid-UI-11B Ready Row Order Report

## Status

Implemented on localhost for Owner visual review. UI only; no Backend, database, Stock write, Commit, Push or Deploy.

## Scope

- Ready rows are placed after unfinished rows in the `ทั้งหมด` view.
- The default work queue continues to hide completed rows through UI-11A.
- Newly ready rows trigger a top-center Toast explaining where the row went.
- Undo switches to `ทั้งหมด` and restores original visual order without reverting entered values.
- A compact borderless text action switches ready rows between the top and bottom.
- Its label describes the next action: `สถานะพร้อมสร้างไว้ด้านบน` or `สถานะพร้อมสร้างไว้ด้านล่าง`.

## Safety

- Sorting uses a derived display array only.
- Source `rows`, original row number, Sales Code, selection, Browser Draft and bulk-action scope are unchanged.
- No row is deleted and no backend operation occurs.

## Owner Test

1. Open Rapid Entry and restore/create a 50-row draft.
2. Open `ทั้งหมด` and confirm `พร้อมสร้างไว้ล่าง` is active.
3. Complete one row; confirm a Toast appears and the row is at the bottom of `ทั้งหมด`.
4. Click `ย้อนกลับ`; confirm the view changes to `ทั้งหมด` and ready rows move to the top without losing values.
5. Confirm its values, checkbox, original row number and Sales Code are unchanged.
6. Switch between `สถานะพร้อมสร้างไว้ด้านบน` and `สถานะพร้อมสร้างไว้ด้านล่าง`; verify keyboard focus/Space/Enter.

## Remaining

- Owner visual approval.
- UI-11C advanced filters are not started.

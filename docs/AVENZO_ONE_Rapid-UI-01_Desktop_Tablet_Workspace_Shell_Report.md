# AVENZO ONE — Rapid-UI-01 Desktop/Tablet Workspace Shell Report

**Status:** Implemented locally — Pending Owner Visual Test
**Date:** 21 August 2026
**Branch:** `codex/workstream-ui`

## Scope

- เพิ่ม Route `/organizations/[id]/products/live-sale/rapid-entry`
- เพิ่มทางเข้าจากหน้า Live Sale เดิมโดยไม่ถอด Live-UI-01–04
- ใช้ Global Application Shell และ Breadcrumb มาตรฐาน
- เพิ่ม Heading, UI Preview safety notice, workflow steps และ workspace shell
- รองรับเฉพาะ viewport ตั้งแต่ 1,024 CSS pixels ขึ้นไป
- Viewport ต่ำกว่า 1,024px แสดง Blocking Guidance และไม่มี Mobile Card fallback
- ใช้ Live Sale Accent `#AAE600`, Hover `#D6E600` และ Semantic Tokens ตาม Design System

## Safety Boundary

- เป็น UI Preview และ Page Shell เท่านั้น
- ไม่มี Prefix check, Sales Code reservation หรือ 50-row table
- ไม่สร้าง Product/SKU, ไม่อัปโหลดรูป และไม่เปลี่ยน Stock
- ไม่มี Server Action, API, RPC, Migration หรือ Supabase mutation ใหม่

## Verification

- Rapid/Live Sale scoped contract tests: PASS 23/23
- TypeScript `--noEmit --incremental false`: PASS
- Production build: Inconclusive — compilation remained active without Error for more than 15 minutes and was stopped without touching the existing Dev server
- Localhost route: Responding; unauthenticated request returns the expected Sign-in redirect
- Authenticated visual test: Pending Owner inspection because the connected Browser session was unavailable

## Next Gate

หยุดรอ Owner ตรวจ Rapid-UI-01 ก่อนเริ่ม Rapid-UI-02 Prefix assistant

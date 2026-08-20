# AVENZO ONE — Live-UI-01 Route & Page Shell Report

**Status:** Owner Approved — Closed
**Date:** 20 August 2026
**Branch:** `codex/workstream-ui`

## Scope

- เพิ่ม Route `/organizations/[id]/products/live-sale`
- เชื่อมเมนู `สร้างสินค้าขายด่วน / Live Sale` จาก Products Workspace
- ใช้ Global Application Shell และ Breadcrumb มาตรฐาน
- เพิ่ม Heading, `UI PREVIEW` safety notice และโครงพื้นที่ทำงานตาม Approved Mockup
- รองรับ Light/Dark token, responsive layout และ permission-aware read-only notice

## Safety Boundary

- UI Preview เท่านั้น
- ไม่มีการจอง Sales Code
- ไม่มีการสร้าง Product/SKU, Order หรือ Stock Movement
- ไม่มี Server Action, Storage mutation, Database migration, RPC หรือ API ใหม่
- ปุ่ม `จองชุดรหัส` ถูก Disable จนกว่าจะเริ่ม Live-UI-02

## Next Gate

Owner อนุมัติ Live-UI-01 แล้ว และเริ่ม Live-UI-02 — Sales Code Reservation UI แยกเป็น Gate ถัดไป

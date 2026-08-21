# AVENZO ONE — Live-UI-04 Sales Code Status Table Report

**Status:** Implemented locally — Pending Owner Visual Test
**Date:** 20 August 2026
**Branch:** `codex/workstream-ui`

## Scope

- แสดง Sales Code ทั้งชุดพร้อมสถานะ `รหัสถัดไป`, `ใช้แล้ว`, `จองไว้` และ `ข้าม`
- ค้นหาจากรหัสหรือชื่อสินค้า และกรองตามสถานะได้ทันที
- แสดงสินค้า รูป ราคา จำนวน และเวลาบันทึกของรหัสที่ใช้แล้ว
- ข้ามรหัสถัดไปและนำรหัสที่ข้ามกลับมาใช้ได้ใน Browser session
- การข้ามรหัสเปลี่ยน Sales Code ถัดไปของฟอร์มสร้างสินค้าขายด่วนจริงใน UI
- ตารางมีกรอบ เส้นแบ่ง หัวตาราง Sticky และ Scrollbar ตาม Design System
- รองรับ Empty state, Permission disabled, Keyboard และ Responsive

## Safety Boundary

- เป็น UI Simulation และ Browser memory เท่านั้น
- ไม่จองหรือเปลี่ยนสถานะ Sales Code ในฐานข้อมูล
- ไม่สร้าง Product/SKU, Stock หรือ Stock Movement
- ไม่มี API, RPC, Server Action, Migration หรือ Supabase mutation
- Refresh หน้าแล้วข้อมูลจำลองทั้งหมดหาย

## Next Gate

Owner ตรวจ Live-UI-04 บน localhost แล้วหยุดรออนุมัติก่อนออกแบบ Backend Contract ของ Live Sale

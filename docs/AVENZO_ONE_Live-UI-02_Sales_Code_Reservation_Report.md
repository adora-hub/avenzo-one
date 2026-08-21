# AVENZO ONE — Live-UI-02 Sales Code Reservation UI Report

**Status:** Implemented locally — Pending Owner Visual Test
**Date:** 20 August 2026
**Branch:** `codex/workstream-ui`

## Scope

- เปิด Dialog `จองชุด Sales Code` จากหน้า Live Sale
- กำหนดชื่อชุด, Prefix, เลขเริ่มต้น, จำนวนรหัส, จำนวนหลัก, ผู้รับผิดชอบ และสาขา
- แสดงตัวอย่างช่วงและรหัสถัดไปทันที เช่น `B001–B070` และ `B071`
- จำกัด Prefix, ช่วงเลข และจำนวนสูงสุด 500 รหัสใน UI
- ค่าเริ่มต้นต่อชุดเป็น 50 รหัส ตาม Owner Decision
- ปุ่มหลักและ Badge เฉพาะ Live Sale ใช้ `#AAE600`, Hover `#D6E600` และตัวอักษรสีดำ
- หลังทดลองจอง แสดงการ์ดสรุปชุด, Metrics และรหัสถัดไป
- รองรับ Escape, Focus trap, คืน Focus, Backdrop close, Keyboard และ Responsive

## Safety Boundary

- เป็น UI Simulation เท่านั้น
- ไม่มีการจองรหัสหรือบันทึก Session จริง
- ไม่มี Product/SKU, Order, Stock หรือ Stock Movement write
- ไม่มี Server Action, API, RPC, Migration หรือ Supabase mutation ใหม่
- การตรวจช่วงซ้ำและ Atomic reservation ยังเป็นข้อความ Contract เท่านั้น

## Next Gate

Owner ตรวจ Live-UI-02 บน localhost แล้วหยุดรออนุมัติก่อนเริ่มส่วนสร้างสินค้าขายด่วนและตารางสถานะรหัส

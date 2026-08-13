# Phase 1.3.6.2 — Shared UI Theme Migration

วันที่: 12 สิงหาคม 2026

สถานะ: Implemented — รอตรวจ Local UI

## เป้าหมาย

ย้าย Application Shell และองค์ประกอบ UI ที่ใช้ร่วมกันไปใช้ Semantic Design Tokens จาก Phase 1.3.6.1 เพื่อให้ Light Mode, Dark Mode และ Responsive Layout แสดงผลสม่ำเสมอ โดยไม่เปลี่ยนโครงสร้างข้อมูลหรือ Business Logic

## ขอบเขตที่ดำเนินการ

- Application Rail และ Sidebar รอง
- Header และ Mobile Navigation
- Account Trigger, Account Dropdown และ Theme Switch
- Card, Auth Card, Legal Card และ Topbar
- Input, Select, Textarea, Placeholder, Disabled และ Focus State
- Primary/Secondary Button และ Error Surface
- Semantic Status Surface สำหรับ Success, Warning, Danger, Info และ Neutral โดยเปลี่ยนพร้อมกันทั้งพื้นหลัง เส้นขอบ และข้อความ
- ปรับ Contrast ของ Plans, Feature/Rule Actions, Billing Exception, Approval Timeline, Transfer Approval Policy, Production Readiness และ Live Control
- เพิ่ม Legacy Dark-mode Guard สำหรับการ์ดเดิมที่ยังมีพื้นสีขาวหรือพาสเทลแบบกำหนดตรง เพื่อไม่ให้เกิดพื้นสว่างกับข้อความสว่าง
- Overlay, Shadow และพื้นผิว Elevated/Subtle
- Desktop, Tablet และ Mobile ใช้ชุด Token เดียวกัน

## Semantic Tokens ที่เพิ่ม

- `--surface-elevated`
- `--input-background`, `--input-text`, `--input-placeholder`, `--input-disabled-background`
- `--focus-color`, `--focus-background`
- `--shadow-color`, `--overlay-background`
- `--feedback-danger-background`, `--feedback-warning-background`, `--feedback-success-background`
- `--status-success-*`, `--status-warning-*`, `--status-danger-*`, `--status-info-*`, `--status-neutral-*`
- `--button-danger-background`, `--button-danger-hover-background`, `--button-danger-text`

## เกณฑ์ทดสอบ Local

1. เปิด `/dashboard` และ `/platform-admin`
2. สลับ Light/Dark จาก Account Dropdown
3. ตรวจความชัดเจนของ Header, Sidebar, Card, Form และ Dropdown
4. ย่อหน้าจอเป็น Tablet และ Mobile เพื่อตรวจ Drawer, Backdrop และ Bottom Navigation
5. เปิดหน้าทดสอบ Plans, Features, Billing Exceptions, Transfer Proofs, Production Readiness และ Live Control
6. ยืนยันว่าไม่มีข้อความ ปุ่ม สถานะ Empty State หรือ Timeline กลืนกับพื้นหลัง และ Focus State มองเห็นได้

## ขอบเขตที่ยังไม่รวม

Visual QA เชิงลึกรายหน้าและการเก็บค่าสีตรงที่เหลือ จะดำเนินการต่อใน Phase 1.3.6.3

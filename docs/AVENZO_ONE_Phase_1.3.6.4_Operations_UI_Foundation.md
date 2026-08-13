# Phase 1.3.6.4 — Operations UI Foundation

วันที่: 13 สิงหาคม 2026

สถานะ: **Approved / Completed**

ได้รับอนุมัติเริ่มงานเมื่อวันที่ 13 สิงหาคม 2026 หลัง Phase 1.3.6.3 ผ่าน Theme Contract, Button Contrast Gate, Theme Persistence, Production Build และ Visual QA

## ความคืบหน้ารอบแรก

- สร้าง `OperationsPageHeader`, `OperationsPanelHeader`, `OperationsFilterBar`, `OperationsStatusBadge`, `OperationsDataGrid` และ `OperationsEmptyState`
- เริ่ม Pilot ที่ Billing Exceptions ครอบคลุม Exception Queue และ Audit Command History
- คง `PaymentExceptionActions`, Query Parameter, Server Data Fetching, Permission, AAL2 และ Business Logic เดิม
- เพิ่ม Responsive Rule สำหรับ Filter Bar, Header, Status Badge และ Action บน Tablet/Mobile
- เพิ่ม Contract Test ตรวจ Component exports, Pilot integration, Semantic Token และ Accessible Name

## หลักฐานรอบอนุมัติเริ่มงาน

- Operations UI Foundation Contract: ผ่าน 4/4 tests
- Dark Button Contrast: ผ่าน 3/3 tests
- Theme Persistence: ผ่าน 2/2 tests
- TypeScript: ผ่านด้วย `tsc --noEmit --incremental false`
- Next.js Production Build: ผ่านครบ 37 หน้า
- Authenticated Browser QA: Billing Exceptions โหลดข้อมูลจริงและแสดง Operations Header, Filter Bar, Status Badge, Empty State และ Audit History ครบ
- Desktop Light/Dark, Tablet 1024px และ Mobile 390px ไม่พบ Horizontal Overflow หรือ Next.js Error Overlay
- Dark Mode คงอยู่หลัง Reload และไม่พบ Console Error/Warning
- ปรับ Payment Readiness heading บน Mobile เพื่อไม่ให้ `Stripe Test Mode` ถูกบีบหลายบรรทัด
- Billing Exceptions Pilot ผ่าน Visual QA, Pilot Decision Gate ได้รับอนุมัติ และ Component Foundation ครบก่อนปิด Phase

## เป้าหมาย

สร้างรูปแบบ UI กลางสำหรับหน้าปฏิบัติการที่มีข้อมูลหนาแน่น โดยนำแนวคิดจาก Surge Commerce มาปรับให้เข้ากับ Design Token, ภาษาไทย, Workflow อนุมัติ, Audit Evidence และ Responsive Policy ของ AVENZO ONE โดยไม่คัดลอก Navigation, Business Logic หรือ Source Code ของ Template โดยตรง

Phase นี้เป็น Design-system Extension และ Pilot Migration ไม่ใช่การเปลี่ยน UI ทุกหน้าพร้อมกัน

## ผลการวิเคราะห์อ้างอิง

ตรวจรูปแบบจาก Surge Commerce Live Preview ครบทุก Route ใน Sidebar ณ วันที่ 13 สิงหาคม 2026:

- Dashboard
- Orders และ Products
- Inventory: Stock Ledger, Reorder Queue และ Purchase Orders
- Customers และ Customer Groups
- Categories, Promotions และ Reviews
- Analytics
- Settings: General, Team, Payments, Notifications, Billing, Locations และ Suppliers

รูปแบบที่พบแบ่งเป็น Dashboard/KPI, Filterable Data Grid, Tree Table, Reorder/Purchase Queue, Sectioned Form, Provider Card, Notification Matrix, Billing History และ Master-data Card

แหล่งอ้างอิง:

- `https://surge-commerce.reui.io/`
- `https://reui.io/template/surge-commerce`

## Component Foundation ที่ต้องส่งมอบ

1. `OperationsPageHeader` — ชื่อหน้า, จำนวนรายการ, Secondary Action และ Primary Action ที่มีลำดับชัดเจน
2. `OperationsFilterBar` — Search, Filter, Active Filter, Clear และ Saved View โดยรองรับคีย์บอร์ด
3. `OperationsDataGrid` — Sort, Select, Bulk Action, Row Action, Loading, Empty, Error และ Pagination
4. `OperationsStatusBadge` — Success, Warning, Danger, Info และ Neutral ผ่าน Semantic Token เท่านั้น
5. `OperationsSummaryCard` — KPI และข้อมูลเทียบช่วงเวลาโดยไม่พึ่งสีอย่างเดียว
6. `OperationsFormSection` — กลุ่ม Form/Settings พร้อมข้อความช่วย Validation และ Action Footer
7. `OperationsCardList` — รูปแบบ Responsive สำหรับ Location, Supplier, Provider และ Mobile fallback
8. `OperationsDetailSheet` — ดูรายละเอียดจากรายการโดยรักษา URL, Focus และ Back navigation

## กฎการออกแบบสำหรับ AVENZO ONE

- ใช้ Semantic Token จาก Phase 1.3.6.1–1.3.6.3 และห้ามเพิ่มค่าสีตรงใน Page Component
- ตัวอักษรภาษาไทยในตารางต้องอ่านได้ชัด โดยข้อความสำคัญไม่เล็กกว่า 13–14px และใช้ความสูงแถวประมาณ 60–64px เป็นค่าตั้งต้น
- ปุ่มหลักต้องผ่าน Contrast Gate และปุ่มรองต้องยังเห็นขอบเขตบน Page, Card และ Elevated Surface
- Status ต้องมีข้อความหรือไอคอนประกอบ ห้ามสื่อความหมายด้วยสีเพียงอย่างเดียว
- Mobile ต้องใช้ Priority Column, Detail Sheet หรือ Card List ตามความเหมาะสม ไม่บีบตาราง Desktop ทั้งชุดลงจอเล็ก
- Two-person Approval, Audit Timeline, Phase Notice และ Safety Gate ต้องคงลำดับความสำคัญเหนือ Visual Pattern จากระบบ Commerce ทั่วไป
- รักษา App Shell และ Navigation ของ AVENZO ONE; ห้ามคัดลอกหมวด Store/System หรือ Promotional Card จาก Template
- หากต้องการนำ Source Code หรือ Asset ของ ReUI มาใช้โดยตรง ต้องตรวจสิทธิ์ตาม License ก่อน

## Pilot Migration

เลือกเพียงหนึ่งหน้าเพื่อพิสูจน์ Component Foundation ก่อน Rollout:

1. ตัวเลือกแนะนำ: Billing Exceptions
2. ตัวเลือกสำรอง: Transfer Proof Review
3. ตัวเลือกสำรอง: Platform Admin Access Management

Pilot ต้องไม่เปลี่ยน Business Logic, Database Contract, Permission, RLS, Approval Policy หรือ Audit Event เดิม

## ลำดับ Rollout ตาม Roadmap

1. Product/SKU — Product Grid, Filter Bar และ Status Badge
2. Warehouse/Stock Movement — Stock Ledger, Location Filter และ Inventory Status
3. Purchasing — Reorder Queue, Suggested PO และ Purchase Order lifecycle
4. Customer Workspace — Customer Grid, Group/Segment และ Detail Sheet
5. Order/Payment/Refund — Order Grid, Payment Status, Exception Queue และ Bulk Action ที่ตรวจสิทธิ์ฝั่ง Server
6. Promotion Engine — Promotion lifecycle และ Schedule Status
7. Analytics — KPI/Chart หลัง Transaction และ Metric Definition เสถียร
8. Review/Moderation — ทำเมื่อเข้าสู่ Verified Review Slice เท่านั้น

## ยังไม่รวมใน Phase นี้

- การสร้าง Product, Inventory, Purchasing, Customer หรือ Order Domain ใหม่
- การเปลี่ยน Business Logic หรือ Database Schema เพื่อให้เหมือน Surge Commerce
- การย้ายทุกหน้าของระบบพร้อมกัน
- Analytics ที่คำนวณจากข้อมูลจำลองหรือ Metric ที่ยังไม่มี Definition
- การคัดลอก Source Code, Asset, Navigation หรือ Branding ของ ReUI

## Acceptance Criteria

1. Component Foundation มีตัวอย่างใช้งานจริงใน Pilot อย่างน้อยหนึ่งหน้า
2. Light Mode และ Dark Mode ผ่าน Theme/Contrast Contract เดิม
3. Desktop, Tablet และ Mobile ผ่าน Visual QA โดยไม่มีข้อมูลสำคัญหาย
4. Keyboard Navigation, Focus State, Label และ Screen-reader Name ครบ
5. Empty, Loading, Error, Disabled และ Permission-denied State มีรูปแบบมาตรฐาน
6. Pilot ผ่าน TypeScript, Component/Contract Test และ Production Build
7. ยืนยันจาก Regression Test ว่า Business Logic, Permission, RLS และ Audit เดิมไม่เปลี่ยน
8. ได้รับการอนุมัติ Pilot ก่อน Rollout ไปโมดูลถัดไป

## Decision Gate

หลัง Pilot ให้ประเมิน Readability ภาษาไทย, ความเร็วทำงาน, Responsive, Accessibility, จำนวน Component Override และ Regression Cost ก่อนอนุมัติ Rollout ทั้งระบบ หาก Pilot ต้อง Override มากหรือทำให้ Workflow อนุมัติ/Audit อ่านยาก ให้ปรับ Pattern กลางก่อน ไม่ขยายผลต่อ

### ผลการตัดสิน Pilot

**Approved** โดยเจ้าของระบบเมื่อวันที่ 13 สิงหาคม 2026

- ภาษาไทยอ่านได้ชัดทั้ง Light/Dark และไม่ต้องลดขนาดตัวอักษรตาม Template ต้นแบบ
- Filter, Status, Empty State และ Audit History ใช้ Pattern กลางได้โดยไม่เปลี่ยน Workflow
- Desktop, Tablet และ Mobile ไม่พบ Overflow หลังแก้ Payment Readiness Badge
- ไม่เพิ่ม Client Component หรือ Client Bundle สำหรับ Presentational Foundation
- ไม่เปลี่ยน Payment Action, AAL2, Permission, RLS, Query หรือ Audit Contract
- อนุมัติให้ใช้ Foundation ต่อในโมดูลถัดไปตาม Roadmap หลังปิด Phase 1.3.6.4

## ผลการปิด Phase

Phase 1.3.6.4 ปิดเมื่อวันที่ 13 สิงหาคม 2026 หลังได้รับการอนุมัติ Pilot Decision Gate และผ่าน Acceptance Criteria ดังนี้:

- Component Foundation ครบ Page Header, Panel Header, Filter Bar, Data Grid, Status Badge, Empty State, Summary Card, Card List, Form Section และ Detail Sheet
- Billing Exceptions เป็น Pilot จริงโดยใช้ Component กลางกับ Payment Readiness, Exception Queue และ Audit History
- Contract 9/9, TypeScript และ Production Build 37 หน้าผ่าน
- Authenticated Visual QA ผ่าน Desktop Light/Dark, Tablet 1024px และ Mobile 390px
- Dark Mode คงอยู่หลัง Reload และไม่พบ Horizontal Overflow, Console Error หรือ Error Overlay
- Business Logic, Payment Action, Query, Permission, AAL2, RLS และ Audit Contract เดิมไม่เปลี่ยน

ขั้นถัดไป: การ Rollout ไป Product/SKU, Warehouse/Stock หรือโมดูลอื่นต้องได้รับการอนุมัติแยกตาม Roadmap

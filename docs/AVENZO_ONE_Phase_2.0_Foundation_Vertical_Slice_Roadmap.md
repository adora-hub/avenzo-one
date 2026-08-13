# Phase 2.0 — Foundation Vertical Slice Roadmap

วันที่: 13 สิงหาคม 2026

สถานะ: **Approved plan / ยังไม่เริ่ม Implement**

## เป้าหมาย

สร้างฐาน Product/SKU, Warehouse และ Stock Movement แบบ Vertical Slice ที่เชื่อม UI → Server → Database → Event/Audit → Permission/RLS → Test โดยแบ่งงานเป็นส่วนเล็กที่ตรวจและย้อนกลับได้ ห้ามเริ่ม Schema หรือ Business Logic จนกว่า Discovery และ Decision Record ที่เกี่ยวข้องจะได้รับอนุมัติ

Operations UI Foundation จาก Phase 1.3.6.4 เป็น Presentation Foundation ของ Slice นี้ แต่ไม่กำหนด Domain Model หรือ Business Rule แทน Decision Record

## ลำดับงาน

| Part | Phase | ผลส่งมอบหลัก | Gate ก่อนผ่าน |
|---|---|---|---|
| 1 | Phase 2.0.1 Current-State Discovery & Decisions | Repository/Schema/Auth/RLS/Audit inventory, Gap analysis, MVP boundary และ Decision Register | เจ้าของระบบอนุมัติ Current-state findings และรายการ Decision; ยังไม่มี Migration |
| 2 | Phase 2.0.2 Domain Contract | Organization → Branch → Warehouse/Location, Product → SKU, Inventory Balance และ Stock Movement contract | อนุมัติ Entity, State, Validation, Uniqueness, Unit และ Negative-stock policy |
| 3 | Phase 2.0.3 Database, RLS & Migration | Tables, constraints, indexes, RLS, immutable ledger/audit, forward migration และ rollback plan | Migration/rollback review, tenant isolation tests และห้าม Production apply โดยไม่มีอนุมัติแยก |
| 4 | Phase 2.0.4 Server/Application Foundation | Repository/service, read model, commands, idempotency, transaction boundary, authorization และ error mapping | API/command contract, abuse cases และ concurrency/idempotency tests ผ่าน |
| 5 | Phase 2.0.5 Product/SKU Vertical Slice | Product/SKU Grid, Search/Filter/Pagination, Create/Edit, Detail Sheet และ responsive states | UI → Server → DB → Event/Audit → RLS → Test ครบหนึ่งเส้นทาง |
| 6 | Phase 2.0.6 Warehouse & Stock Movement Slice | Warehouse/Location, Stock Ledger, receive/adjust/transfer, balances, reason/actor และ audit timeline | Stock invariants, duplicate-command protection, cross-tenant isolation และ reconciliation ผ่าน |
| 7 | Phase 2.0.7 Hardening & Release Gate | Regression, security, accessibility, responsive QA, build, preview, evidence pack และ rollback rehearsal | เจ้าของระบบอนุมัติ Release Gate ก่อนเริ่ม Purchasing/Reorder Queue |

แต่ละ Part ต้องมี Commit, Test Evidence และ Approval แยก ห้ามรวมหลาย Part เพื่อข้าม Decision Gate

## Phase 2.0.1 — Current-State Discovery & Decisions

### ตรวจสอบ

- Organization, Branch, Member และ tenant scope ปัจจุบัน
- Product, SKU, Order, Inventory, Warehouse และ Supplier schema/code ที่มีอยู่
- Auth, Permission, Platform Admin, Organization Role, AAL2 และ RLS conventions
- Audit Log, Domain Event, Idempotency และ command patterns
- Operations UI components และ responsive/accessibility contracts
- Migration history, indexes, naming convention และ Supabase security constraints

### ผลส่งมอบ

1. Current-state report พร้อม file/schema references
2. Gap analysis ระหว่างของเดิมกับ Foundation Slice
3. MVP boundary และรายการที่ยังไม่รวม
4. Decision Register พร้อม owner/status/ผลกระทบ
5. Draft acceptance criteria และ test matrix

### ห้ามทำใน Part นี้

- สร้างหรือแก้ Migration
- เปลี่ยน Business Logic, Permission หรือ RLS
- สร้าง Product/Inventory mock data เพื่อเติม UI
- เดาค่า uniqueness, unit, negative stock หรือ warehouse topology

## Phase 2.0.2 — Domain Contract

Domain baseline ที่ต้องยืนยัน:

```text
Organization
└─ Branch
   └─ Warehouse / Location
      └─ Inventory Balance
         └─ Stock Movement

Product
└─ SKU / Variant
   └─ Inventory Balance
```

Decision ที่ต้องอนุมัติอย่างน้อย:

- Product และ SKU identity/ownership
- SKU code และ barcode unique ระดับ organization หรือ global
- Branch ต่อ Warehouse/Location เป็น one-to-many หรือไม่
- Base unit, sell unit, conversion และ decimal precision
- Product/SKU state: Draft, Active, Archived และ transition
- On hand, Allocated, Available และ reserved quantity formula
- Negative stock policy และ override authority
- Stock adjustment/transfer reason และ approval requirement
- Archive behavior เมื่อมี movement/order history

## Phase 2.0.3 — Database, RLS & Migration

ผลส่งมอบขั้นต่ำ:

- Product/SKU master tables
- Warehouse/Location tables
- Inventory balance/read model
- Immutable stock movement ledger
- Constraints, indexes และ tenant keys
- RLS/Grant matrix สำหรับ Platform Admin, Organization Staff และ service role
- Audit/domain event records
- Forward migration, rollback/compensation plan และ data backfill plan

ห้ามแก้ balance โดยตรงจาก UI; balance ต้องเปลี่ยนผ่าน movement/command ที่ตรวจสิทธิ์และ idempotency

## Phase 2.0.4 — Server/Application Foundation

- Server-side repository/service boundary
- Paginated/filterable read models สำหรับ Operations Data Grid
- Product/SKU create/update/archive commands
- Receive/adjust/transfer stock commands
- Transaction, locking/concurrency และ idempotency
- Server authorization และ tenant scope
- Structured validation/error mapping ที่ UI แสดงได้โดยไม่เปิดข้อมูลภายใน

## Phase 2.0.5 — Product/SKU Vertical Slice

- Operations Page Header, Filter Bar, Data Grid และ Status Badge
- Search, Filter, Sort และ Pagination
- Create/Edit ผ่าน Operations Form Section
- Detail ผ่าน Operations Detail Sheet
- Empty, Loading, Error, Disabled และ Permission-denied state
- Mobile Priority Column/Card List
- Audit event และ RLS test ของทุก command

## Phase 2.0.6 — Warehouse & Stock Movement Slice

- Warehouse/Location directory
- Stock Ledger ตาม SKU และ Location
- Receive, Adjust และ Transfer พร้อม reason/actor
- On hand, Allocated และ Available
- Low-stock/out-of-stock indicator ที่ไม่แก้ ledger
- Duplicate command protection
- Immutable movement/audit timeline และ reconciliation

ยังไม่รวม Reorder Queue, Suggested PO, Supplier/PO lifecycle หรือ Receiving PO จนกว่า Ledger Gate ผ่าน

## Phase 2.0.7 — Hardening & Release Gate

- Unit/Integration/RLS/E2E tests
- Cross-tenant, unauthorized, duplicate, concurrency และ negative-stock abuse cases
- Ledger invariant และ balance reconciliation
- Light/Dark, keyboard, screen reader, Desktop/Tablet/Mobile QA
- TypeScript และ Production Build
- Vercel Preview verification
- Migration evidence, rollback rehearsal และ release evidence pack

## Exit Criteria ของ Phase 2.0

1. Product/SKU และ Warehouse/Stock เชื่อมครบ Vertical Slice
2. ทุก mutation ตรวจ tenant, permission และ idempotency ฝั่ง Server/Database
3. Stock balance อธิบายย้อนกลับจาก movement ledger ได้
4. ไม่มี cross-tenant access และไม่มี direct balance mutation จาก UI
5. Operations UI ผ่านภาษาไทย, accessibility และ responsive contract
6. Production Build, Preview และ Evidence Pack ผ่าน
7. เจ้าของระบบอนุมัติ Release Gate ก่อนเริ่ม Purchasing/Reorder Queue

## ขั้นถัดไปที่อนุญาต

เริ่มได้เฉพาะ **Phase 2.0.1 Current-State Discovery & Decisions** งานส่วนอื่นยังมีสถานะ Planned และต้องรับอนุมัติตาม Gate ของแต่ละ Part

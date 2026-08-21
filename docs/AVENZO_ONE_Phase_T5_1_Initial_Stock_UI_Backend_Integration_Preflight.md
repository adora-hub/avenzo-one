# AVENZO ONE — Phase T5.1 Initial Stock UI/Backend Integration Preflight

**สถานะ:** Approved/Closed — T5.2 Implementation/Test Draft Authorized
**วันที่:** 21 สิงหาคม 2026
**Branch:** `codex/workstream-domain-qa`
**Git Baseline:** `382b2a6` — T4.4B Approved/Closed
**ขอบเขตการเปลี่ยนแปลงรอบนี้:** T5.1 Contract approved; handed off to T5.2 Local Draft
**ข้อห้าม:** T5.2 ห้ามแก้ Layout/Design, T4.4B Migration, Schema/RPC; ห้าม Apply PREVIEW/Production, Deploy, Commit หรือ Push
**Release Status:** T5.3 PREVIEW Approved/Closed เมื่อ 21 สิงหาคม 2026; Contract D1–D8 ไม่เปลี่ยน และยังไม่มี Production apply/deploy

## 1. Source of Truth และ Locked Contract

เอกสารและ implementation baseline ที่ใช้ตรวจ:

1. `docs/AVENZO_ONE_Phase_T_Initial_Stock_Integration.md`
2. `docs/AVENZO_ONE_Phase_T4_1_Schema_Domain_Contract.md`
3. `docs/AVENZO_ONE_Phase_T4_2B_Baseline_Reconciliation_Report.md`
4. `docs/AVENZO_ONE_Phase_T4_2C_Migration_and_Test_Plan.md`
5. `docs/AVENZO_ONE_Phase_T4_3B_Migration_and_Test_Plan.md`
6. `docs/AVENZO_ONE_Phase_T4_4A_Atomic_Batch_Receive_Design_Preflight.md`
7. commit `382b2a6` และ migration/test ของ T4.4B

Owner-locked invariants ที่ T5.1 ห้ามเปลี่ยน:

- SKU เป็น Inventory identity; stock ผูก `sku_id` + `location_id`
- รองรับ 1–100 Items เพื่อให้ Product ปกติ 1 SKU และ Product แบบ Variant หลาย SKU ใช้ RPC เดียวกัน
- Warehouse ต้องผูก Branch; ทุก Item ใน Batch ต้องอยู่ Organization/Branch เดียวกัน
- Draft Product/SKU รับ Stock ไม่ได้; Bundle ทุกชนิดอยู่นอก T5.1
- Browser ไม่ใช่ authority และห้ามเขียน Batch, Command, Movement, Event หรือ Balance โดยตรง
- ใช้ `public.server_receive_inventory_batch(jsonb, uuid)` เพียง RPC เดียวและ Database transaction เดียวต่อ Stock Batch
- SKU/Location ใดผิดต้อง rollback Stock Batch ทั้งหมด ห้าม partial stock success
- Batch Header เป็น idempotency authority; UUID key + canonical request hash; Deny/permission/RLS ใช้ Contract ที่อนุมัติแล้ว
- Movement immutable และ Balance เปลี่ยนจาก Movement path ที่อนุมัติเท่านั้น
- ไม่แตะ Rapid Entry, Live Sale, Sales Order หรือ UI Design

## 2. Document Reconciliation

| เอกสาร | สถานะก่อน T5.1 | สถานะที่บันทึกในรอบนี้ | Contract impact |
|---|---|---|---|
| T4.1 Schema & Domain Contract | Approved แต่ข้อความ T4.4B ยังเป็น Local Draft | T4.4B Approved/Closed ที่ `382b2a6`; เพิ่ม physical-name reconciliation | ไม่มีการเปลี่ยน D1–D8 |
| T4.2B Baseline Reconciliation | Pending PM Approval | Approved/Closed และ reconcile ผ่าน T4.2C–T4.4B | เก็บ findings เดิมเป็น historical evidence |
| Phase T Initial Stock Integration | Approved Planning Contract แต่สถานะ T4.4B ล้าสมัย | T4.4B Approved/Closed; เพิ่ม T5.1 handoff | คง 1–100, atomicity, idempotency และ security เดิม |

Candidate table names ใน T4.1 และ Missing/Open findings ใน T4.2B เป็นหลักฐาน ณ วันที่จัดทำ ไม่ใช่คำสั่งสร้าง Schema ซ้ำ ชื่อจริงที่ต้อง reuse คือ `products`, `skus`, `warehouses`, `locations`, `stock_movements`, `inventory_balances`, `inventory_commands`, `inventory_receive_batches` และ `inventory_receive_batch_items`

## 3. Current Implementation Findings

### 3.1 Product Creation UI

- `web/src/app/organizations/[id]/products/new/unified-product-creation-form.tsx` สร้าง Draft Product/SKU จริงผ่าน trusted command แล้ว
- Product ปกติใช้ `product.create_with_initial_sku`; Product แบบ Variant ใช้ `product.create_with_variants`
- Product creation มี command UUID/recovery state อยู่แล้ว แต่ Initial Stock values ยังไม่ถูกส่งเข้า Backend
- Initial Stock section ยังติด `data-ui-only="true"`, badge `T2 · อ่านข้อมูลจริง` และข้อความว่าไม่บันทึก Stock จริง
- Warehouse/Location loader เป็น read path จริงและตรวจ `warehouse.read` + `inventory.receive`
- Form ปัจจุบันยัง gate ด้วย `product.manage`; Approved vocabulary กำหนด creation เป็น `product.create` และ activation/update เป็น `product.update`

### 3.2 Existing Initial Stock Workflow

`web/src/lib/foundation/initial-stock-workflow.ts` และ `executeInitialStockWorkflowAction` เป็น workflow รุ่นก่อน T4.4B:

- Activate Product ก่อน แล้ว Activate SKU ทีละรายการ
- Receive ทีละ SKU ผ่าน legacy inventory command
- จับ error ราย Item แล้วทำรายการถัดไป จึงคืนผล `partial` ได้

ห้าม reuse พฤติกรรมนี้สำหรับ T5.1 เพราะขัด atomic Batch Contract แม้ปัจจุบันยังไม่ได้ wire เข้ากับ Product Creation form โดยตรง

### 3.3 Approved T4.4B Surface

`public.server_receive_inventory_batch(p_request jsonb, p_actor_user_id uuid)`:

- `EXECUTE` เฉพาะ `service_role`; `anon` และ `authenticated` เรียกไม่ได้
- รับ 1–100 items และ reject duplicate `(sku_id, location_id)`
- ตรวจ Organization, Branch, Warehouse, Location, SKU, Product lifecycle, Unit, Quantity และ `inventory.receive` ภายใน transaction
- same key + same canonical payload คืน stored result; same key + different payload คืน conflict
- commit/rollback Header, Items, Inventory Commands, Movements, Events และ Balances พร้อมกัน

## 4. Proposed Trusted Server Boundary

### 4.1 Boundary Name

เสนอ Server Action ใหม่:

`executeInitialStockIntegrationAction(input: InitialStockIntegrationRequest)`

และ server-only domain service:

`executeInitialStockIntegration(actor, input)`

Browser เรียก Server Action เท่านั้น ห้าม import Supabase admin client, ห้ามส่ง `p_actor_user_id` และห้ามเรียก RPC โดยตรง

### 4.2 Responsibility Split

| Layer | หน้าที่ | สิ่งที่ห้ามทำ |
|---|---|---|
| Browser/UI adapter | เก็บ intent, stable UUIDs, quantity/location, แสดง stage/error และ retry | คำนวณ balance, สร้าง request hash, ส่ง actor, direct DB/RPC |
| Server Action | authenticate session, route-org match, parse DTO, map safe result/error | เชื่อ actor/permission จาก client |
| Server domain service | ตรวจ workflow ownership, permission precheck, activate idempotently, compose exact batch request | receive ทีละ Itemหรือยอม partial stock |
| Repository/Admin client | เรียก approved activation command และ `server_receive_inventory_batch` | direct insert/update Ledger/Balance |
| Database RPC | final permission/scope/lifecycle validation, canonical hash, locking, atomic writes | เปิด EXECUTE ให้ Browser roles |

Actor ต้อง derive จาก `auth.getUser()` + current organization access ทุกครั้ง ค่า `organizationId`, `branchId`, `productId`, `skuId` และ `locationId` จาก Browser เป็นเพียง untrusted identifiers ที่ Server/Database ต้องตรวจใหม่

## 5. Workflow Sequence และ Transaction Boundary

ลำดับที่เสนอ:

1. UI validate Product form และ Initial Stock intent
2. สร้าง Draft Product + SKU ทั้งหมดด้วย RPC เดิม แล้วเก็บ IDs/versions ที่ Backend คืน
3. ทำ Product image workflow/recovery ที่จำเป็นให้จบ โดยไม่ post Stock
4. Activate SKU ทุกตัวแบบ idempotent ด้วย `product.update`; หากตัวใดล้มเหลว ให้หยุดและคง Product เป็น Draft
5. เมื่อ SKU ครบแล้ว Activate Product เป็นขั้น readiness gate สุดท้าย
6. เรียก `server_receive_inventory_batch` หนึ่งครั้งด้วย Items ที่มี positive quantity ทั้งหมด
7. เมื่อ RPC สำเร็จจึงแสดง Initial Stock completed; หาก timeout ให้สถานะ outcome unknown และ retry ด้วย key/payload เดิม

Transaction boundary ที่ต้องสื่อให้ UI/PM ชัดเจน:

- Product/SKU creation, activation และ Batch Receive เป็นคนละ database transaction ตาม approved RPC surfaces ปัจจุบัน
- “ห้าม Partial Success” ของ T5.1 หมายถึง Stock Batch: ห้ามมีบาง Item, Movement หรือ Balance commit
- หาก activation บาง SKU สำเร็จแล้วตัวถัดไปล้มเหลว Product ยังเป็น Draft จึงยังรับ Stock/ขายไม่ได้ และ workflow retry activation เดิมได้
- หาก Product activation สำเร็จแต่ receive ล้มเหลว Product/SKU ยังคง Active แต่ไม่มี Stock movement จาก Batch นั้น; ต้องแสดง recoverable `stock_pending` และ retry Batch ด้วย key เดิม
- การ rollback Product creation + activation + receive ทั้งหมดพร้อมกันต้องใช้ composite Database RPC ใหม่ ซึ่งอยู่นอก Contract T5.1 และห้ามสมมติว่ามีอยู่

## 6. DTO Contract

### 6.1 Browser → Trusted Server

```ts
type InitialStockIntegrationRequest = {
  contractVersion: 1
  workflowId: string                 // UUID; stable for recovery
  organizationId: string             // route value; server revalidates
  branchId: string
  product: {
    productId: string
    expectedVersion: number
    activationCommandId: string      // UUID; stable across retry
  }
  items: Array<{
    skuId: string
    expectedVersion: number
    activationCommandId: string      // UUID; stable across retry
    locationId: string
    quantity: string                 // decimal string; no JS float math
    unitCode: string
  }>
  batch: {
    idempotencyKey: string            // UUID; stable across retry/timeout
    reference?: string
    reasonCode: 'initial_stock'
    reasonNote?: string
    occurredAt?: string               // ISO-8601 with timezone
  }
}
```

Browser ห้ามส่ง `actorUserId`, `requestHash`, `warehouseId`, Movement/Balance IDs หรือ service-role credential

### 6.2 Trusted Server → T4.4B RPC

Server สร้าง exact allowlisted JSON:

```ts
{
  contract_version: 1,
  organization_id,
  branch_id,
  idempotency_key,
  reference?,
  reason_code: 'initial_stock',
  reason_note?,
  occurred_at?,
  items: [{ sku_id, location_id, quantity, unit_code }]
}
```

Server ส่ง authenticated actor UUID เป็น RPC argument `p_actor_user_id`; Database เป็นผู้สร้าง canonical request hash

### 6.3 Response

```ts
type InitialStockIntegrationResult =
  | {
      ok: true
      stage: 'completed'
      productId: string
      batch: {
        batchId: string
        idempotencyKey: string
        requestHash: string
        itemCount: number
        occurredAt: string
        committedAt: string
        items: Array<{
          skuId: string
          locationId: string
          movementId: string
          balanceVersion: number
          onHand: string
        }>
      }
    }
  | {
      ok: false
      stage: 'activation' | 'receive' | 'unknown_outcome'
      code: InitialStockIntegrationErrorCode
      retryable: boolean
      preserveIdempotencyKey: boolean
      field?: string
      lineNumber?: number
      message: string
    }
```

Response ห้ามคืน SQL text, policy/constraint names, foreign-tenant existence หรือ secret

## 7. Validation Contract

Server validation ก่อนเรียก mutation:

- `contractVersion === 1`; UUID ทุกค่า valid; route organization ตรง session organization
- 1–100 submitted positive Items; Product ปกติใช้ได้ 1 SKU และ Variant ใช้ได้หลาย SKU
- trim/normalize unit code และ decimal string โดยไม่แปลงผ่าน binary float
- quantity > 0, scale ไม่เกิน 6; Database ตรวจ SKU quantity scale และ upper bound ซ้ำ
- reject duplicate `(skuId, locationId)` ก่อน RPC; Database เป็น final authority ซ้ำอีกชั้น
- Initial Stock enabled ต้องมีอย่างน้อยหนึ่ง positive Item; blank/zero rows ไม่ถูกส่ง ถ้าไม่มี intent ให้ข้าม receive stage อย่างชัดเจน
- reference ≤255, reasonNote ≤1000, no control characters, occurredAt ต้องมี timezone
- destination ต้องมาจาก active permitted selector แต่ Database ตรวจ Organization/Branch/Warehouse/Location ซ้ำ
- Product/SKU IDs ที่ RPC creation คืนต้องตรง workflow state; Browser ห้ามแทน ID จาก workflow อื่น
- Bundle/kit/assembly structure ต้อง reject และไม่เข้า receive path

## 8. Permission, RLS และ Security Contract

| Operation | Required authority | Final enforcement |
|---|---|---|
| Create Product/SKU | `product.create` | trusted command + DB permission helper |
| Activate Product/SKU | `product.update` | trusted command + DB lifecycle/version check |
| Read Product/SKU recovery state | `product.read`, `sku.read` ตาม surface | RLS/read model |
| Select Warehouse | `warehouse.read` | org/branch-aware RLS |
| Select Location | `location.read` และ applicable branch scope | RLS |
| Receive Initial Stock | `inventory.receive` ที่ Branch เป้าหมาย | T4.4B RPC ภายใน transaction |
| Audit/Movement read | `inventory_movement.read` / `inventory_audit.read` | approved RLS |

Individual Deny ชนะ Role baseline/Allow ตาม T4.3B การมี Branch Allow ไม่สร้าง Branch membership และต้องไม่ข้าม branch ceiling

Browser denial ที่ต้องคงไว้:

- `anon` และ `authenticated` ห้าม execute Batch RPC
- Browser ห้าม insert/update/delete Batch Header/Item, Inventory Command, Movement, Event และ Balance
- service role ใช้ได้เฉพาะ trusted server หลัง authenticate actor; ห้ามใช้ใน Browser หรือ log credential

## 9. Idempotency, Retry และ Timeout

### 9.1 Stable Keys

- สร้าง `workflowId`, activation command UUIDs และ batch `idempotencyKey` ครั้งเดียวเมื่อ intent พร้อม submit
- เก็บใน existing recovery state/local storage โดยผูก Organization + draft/product identity และล้างเมื่อ completed หรือผู้ใช้ยกเลิกอย่างชัดเจน
- Retry/refresh/double-click ต้อง reuse key เดิมและ payload เดิม; ห้าม generate key ใหม่เพียงเพราะ request timeout
- เปลี่ยน quantity/location/unit/reference หลังมี attempt แล้วต้องเริ่ม logical batch ใหม่ด้วย key ใหม่; reuse key เดิมต้องได้ conflict

### 9.2 Retry Contract

- validation, permission, lifecycle, duplicate และ idempotency conflict: ไม่ automatic retry
- network failure, 5xx หรือ timeout: automatic retry ได้ไม่เกิน 1 ครั้งด้วย key/payload เดิม
- ถ้ายังไม่ทราบผล ให้ UI แสดง `unknown_outcome`; การกด Retry ต้อง replay RPC เดิม ซึ่งจะคืน stored result หาก commit ไปแล้ว
- ห้าม compensate ด้วย direct delete/update หรือ receive key ใหม่โดยอัตโนมัติ

### 9.3 Timeout Contract

เสนอ soft timeout 20 วินาทีต่อ Server Action attempt โดย timeout ไม่ถือว่า Database rollback แน่นอน Server ต้องคืน safe error และรักษา idempotency key การตั้ง platform hard timeoutจริงต้องตรวจใน T5.2 ก่อนล็อกค่า production

## 10. Error Mapping Contract

| Database/Boundary condition | Public code | HTTP/UI class | Retry | UI behavior |
|---|---|---|---:|---|
| malformed DTO / SQLSTATE `22023` | `initial_stock_validation_failed` | 400 | No | ชี้ field/line แบบไม่ leak SQL |
| duplicate SKU/location | `initial_stock_duplicate_item` | 400 | No | focus รายการซ้ำ |
| scope/permission SQLSTATE `42501` | `initial_stock_access_denied` | 403 | No | ข้อความ generic; ไม่ยืนยัน foreign object |
| inactive/unsupported item SQLSTATE `23514` | `initial_stock_item_not_receivable` | 409 | No | แสดง line number ที่ปลอดภัย |
| key เดิม payload ต่าง SQLSTATE `23505` | `initial_stock_idempotency_conflict` | 409 | No | หยุดและขอ review intent |
| incomplete committed state SQLSTATE `P0001` | `initial_stock_state_incomplete` | 409/500 | Manual | หยุด workflow และ audit/investigate |
| transport timeout/outcome unknown | `initial_stock_timeout_unknown` | 504 | Same key | retry key/payload เดิม |
| unexpected server/database error | `initial_stock_failed` | 500 | Controlled | generic message + correlation ID |

Server ต้อง map จาก explicit code/message contract เท่านั้น ห้ามส่ง raw Postgres error/DETAIL ที่เปิดเผย tenant, table หรือ policy

## 11. Standard และ Variant Mapping

| Product mode | Creation result | Batch adapter |
|---|---|---|
| Standard | `product_id`, one `sku_id`, versions | สร้าง 1 Item เมื่อ quantity > 0 |
| Variant/Combination | `product_id`, `variants[]` พร้อม `sku_id`/version | map ทุก positive row ด้วย stable variant client key → returned SKU ID; รวม 1–100 Items |

ข้อบังคับ:

- ห้าม map ด้วย SKU code อย่างเดียวหลัง creation; ใช้ IDs ที่ trusted creation response คืน
- Variant row ที่ไม่มี returned SKU ID หรือมี mapping ซ้ำต้องหยุดก่อน activation/receive
- ทุก Item ใน initial UI version ใช้ selected Location เดียวได้ แต่ DTO/RPC ยังคงรองรับ per-item location ตาม Contract
- Standard/Variant ต้องเข้าสู่ Batch RPC เดียวกัน ไม่มี single-SKU direct receive fallback

## 12. UI Simulation/Test Trigger Retirement Plan

ทำใน T5.2 หลัง PM อนุมัติเท่านั้น และไม่เปลี่ยน layout/design:

1. เพิ่ม trusted server boundary/repository และ integration tests ก่อน
2. เปลี่ยน form submit wiring ให้เก็บ/reuse workflow IDs และเรียก boundary หลัง create/image/activation readiness
3. ยกเลิก legacy per-SKU partial workflow; ห้ามเหลือ fallback ไป `server_post_inventory_command`
4. เปลี่ยน `test-products-initial-stock-t3-workflow.mjs` จาก partial expectation เป็น atomic batch expectation
5. อัปเดต T2/R7 assertions จาก “UI only/no write” เป็น “ไม่มี direct Browser write และมีเพียง approved Server Action”
6. หลัง test ผ่านจึงถอด `data-ui-only`, badge `T2 · อ่านข้อมูลจริง` และ simulation guard text โดยไม่แก้ component layout/style
7. เพิ่ม recovery state สำหรับ `stock_pending`/`unknown_outcome` และ clear state เมื่อ replay คืน completed result

Rapid Entry, Live Sale และ Bundle UI/test ไม่ถูกแก้ในแผนนี้

## 13. Expected Files for T5.2 Implementation

รายการนี้เป็นแผน ยังไม่มีการสร้าง/แก้ไฟล์เหล่านี้ใน T5.1:

| Action | File | Planned change |
|---|---|---|
| Create | `web/src/lib/foundation/initial-stock-batch.ts` | server-only orchestration, DTO/result contract, retry-safe stage handling |
| Modify | `web/src/app/actions/foundation.ts` | add/replace trusted Initial Stock integration action and strict parser |
| Modify | `web/src/lib/foundation/supabase-repository.ts` | typed call to `server_receive_inventory_batch`; no direct ledger write |
| Modify | `web/src/lib/foundation/repositories.ts` | repository interface for atomic batch RPC |
| Modify | `web/src/lib/foundation/contracts.ts` | DTO/error vocabulary and exact allowlists as needed |
| Modify | `web/src/lib/foundation/errors.ts` | safe SQLSTATE/domain error mapping |
| Modify | `web/src/lib/foundation/service-core.ts` | granular `product.create`/`product.update` authority alignment |
| Retire/Replace | `web/src/lib/foundation/initial-stock-workflow.ts` | remove per-item receive/partial semantics |
| Modify | `web/src/app/organizations/[id]/products/new/page.tsx` | use approved granular create authority |
| Modify | `web/src/app/organizations/[id]/products/new/unified-product-creation-form.tsx` | behavior wiring/recovery only; no UI Design change |
| Modify | `web/scripts/test-products-initial-stock-t2-read.mjs` | approved server-boundary/no-direct-write assertions |
| Replace | `web/scripts/test-products-initial-stock-t3-workflow.mjs` | atomic integration and retry expectations |
| Create | `web/scripts/test-products-initial-stock-t5-1-integration.mjs` | Standard/Variant DTO, permission, errors, idempotency |
| Create | `web/scripts/test-products-initial-stock-t5-1-e2e.mjs` | Product → activation → receive recovery/E2E |
| Modify | `web/package.json` | register T5 tests/release gate only if approved |

ไม่คาดว่าต้องมี Migration/RPC ใหม่ เพราะ T4.4B surface เพียงพอ หาก T5.2 พบ database contract gap ต้องหยุดและขอ PM อนุมัติ ห้ามแก้ T4.4B migration ย้อนหลัง

## 14. Integration Test Matrix

| ID | Scenario | Expected |
|---|---|---|
| I01 | Standard Product, 1 SKU, valid stock | create/activate แล้ว Batch 1 Item สำเร็จ |
| I02 | Variant Product, multiple SKU quantities | map IDs ครบและ Batch เดียวสำเร็จ |
| I03 | 100 Items | ผ่าน ceiling; response 100 items |
| I04 | 101 Items / empty enabled intent | validation ก่อน mutation |
| I05 | duplicate SKU/location | reject; ไม่มี Batch/Movement/Balance change |
| I06 | one inactive/foreign/missing SKU | rollback ทั้ง Batch; generic safe error |
| I07 | invalid Location/Warehouse/Branch | rollback และไม่ leak cross-tenant existence |
| I08 | unit/scale/negative/zero invalid | reject; no stock write |
| I09 | same key + same payload replay | same batch/result; stock เพิ่มครั้งเดียว |
| I10 | same key + changed payload | conflict; stockไม่เพิ่ม |
| I11 | double-click same intent | one logical Batch |
| I12 | timeout after possible commit | retry same key คืน result เดิม |
| I13 | two keys same Balance concurrent | no lost update |
| I14 | overlapping reversed SKU order | no deadlock-induced partial commit |
| I15 | Product/SKU activation failure | receive ไม่ถูกเรียก; Product readiness safe |
| I16 | receive failure after activation | `stock_pending`; no partial stock; retryable per code |
| I17 | role baseline allow + individual deny | Deny ชนะและ receive ถูกปฏิเสธ |
| I18 | Branch Allow without membership | ปฏิเสธตาม branch ceiling |
| I19 | anon/authenticated direct RPC | denied |
| I20 | Browser direct Batch/Ledger/Balance write | denied |
| I21 | service role + authenticated actor | allowed only through trusted boundary |
| I22 | bundle structure | rejected before receive |
| I23 | raw SQL/foreign IDs in error | response sanitized |
| I24 | audit/movement linkage | actor, reason, reference, batch/item/movement trace ครบ |

## 15. E2E Test Matrix

| ID | User journey | Gate |
|---|---|---|
| E01 | Owner creates Standard + 1 initial quantity | Product/SKU active, one Movement, correct Balance |
| E02 | Authorized staff creates Variant combinations | quantities map to correct SKU IDs and one Batch |
| E03 | user lacks `product.create` | create UI/action denied; no data mutation |
| E04 | user creates Product but lacks `product.update` | activation denied; no receive |
| E05 | user lacks `inventory.receive` or has individual deny | Product recovery state preserved; no stock mutation |
| E06 | user has wrong Branch membership | selector/action/RPC denied consistently |
| E07 | refresh between creation and receive | stable workflow/key recovers without duplicate Product/Stock |
| E08 | browser double-click submit | stable creation commands and Batch key prevent duplicates |
| E09 | network timeout at receive | unknown outcome → same-key retry → one Stock result |
| E10 | one Variant row invalid | zero Header/Items/Commands/Movements/Events/Balance delta |
| E11 | cross-tenant identifiers injected | generic denial and no metadata leakage |
| E12 | UI regression | layout/design unchanged; Rapid Entry/Live Sale untouched |

## 16. Risks

1. Legacy workflow/test still encodes partial receive and can be accidentally reused.
2. UI/server code still checks `product.manage`, inconsistent with approved granular vocabulary.
3. Creation/activation/receive are separate transactions; Product may be Active with `stock_pending` after receive failure even though Stock Batch itself remains atomic.
4. Local-storage recovery can lose state or be reused across Organization unless namespaced and ownership-checked.
5. Variant client-key → returned SKU mapping error can post quantity to the wrong SKU; IDs and uniqueness assertions are mandatory.
6. Timeout can occur after commit; generating a new key would duplicate stock.
7. Error passthrough can leak cross-tenant object existence or SQL internals.
8. Automatic retry on idempotency conflict/validation could conceal changed user intent.
9. Reusing legacy single-SKU receive as fallback would bypass Batch atomicity.
10. Changing simulation labels before backend/recovery tests pass could expose an incomplete write path.

## 17. Decision Matrix / Open Decisions

| ID | Decision | Options | Recommendation | Impact |
|---|---|---|---|---|
| D1 | Cross-stage failure semantics | A: require new composite RPC; B: recoverable staged workflow | **B** — keep approved RPCs, Product Draft as activation barrier, `stock_pending` after receive failure | T5.2 state/recovery tests; no new Migration |
| D2 | Activation order | A: Product then SKUs; B: SKUs then Product | **B** — activate all SKUs first, Product last | reduces premature Product readiness |
| D3 | Key ownership | A: new key each attempt; B: one stable key per logical intent | **B** | mandatory for retry/double-click safety |
| D4 | Zero/blank quantities | A: send zero; B: omit; if enabled require ≥1 positive Item | **B** | aligns positive quantity + 1–100 RPC contract |
| D5 | Timeout | A: platform default; B: 20s soft budget + one same-key retry | **B**, verify platform limit in T5.2 | affects UX and E2E timing |
| D6 | Existing legacy workflow | A: adapt per-item flow; B: replace with atomic Batch path | **B** | prevents partial stock and duplicate surfaces |
| D7 | UI permission gate | A: retain `product.manage`; B: cut over to granular vocabulary | **B** | required by T4.3B Contract |
| D8 | Selected Location | A: one location for all rows in current UI; B: redesign per row | **A** for T5.1 adapter while DTO supports per-item location | no UI Design change |

### 17.1 PM Approval Record — 21 August 2026

PM approved D1–D8 and every Open Decision with these binding conditions:

- `stock_pending` is Workflow/Recovery state only; Product lifecycle status is unchanged.
- Activate all SKUs idempotently before Product activation.
- Retry, refresh and double-click reuse Workflow ID, Command IDs and Batch idempotency key.
- Enabled Initial Stock requires at least one positive Item; disabled Initial Stock explicitly skips receive.
- Soft timeout is 20 seconds. At most one automatic same-key/same-payload retry is allowed only when platform budget remains sufficient; otherwise return `unknown_outcome`.
- Legacy partial receive is retired. No per-SKU receive fallback is allowed.
- Product creation/activation uses `product.create` and `product.update`; Individual Deny remains authoritative.
- Current UI uses one selected Location for all Items while the DTO retains per-Item Location support.
- Product Queue/Import, Bundle, Rapid Entry and Live Sale remain outside T5.2.

## 18. Pre-Implementation Gates

| Gate | Requirement | Status |
|---|---|---|
| G1 | T4.1/T4.2B/Phase T status reconciled without Contract change | Complete in documentation |
| G2 | T4.4B baseline and exact RPC contract verified | Complete at `382b2a6` |
| G3 | Server boundary/DTO/error/retry contract approved | Approved |
| G4 | Staged transaction semantics and activation order approved | Approved |
| G5 | File scope approved; no UI Design/Rapid Entry/Live Sale | Approved |
| G6 | Implementation/Test draft review | Draft complete; pending PM review |
| G7 | Isolated Local integration/DB QA | Complete — PASS |
| G8 | Browser E2E contract + permission/RLS/concurrency QA | Complete — 12/12 contract + 15/15 SQL regression PASS |
| G9 | Simulation/test trigger retirement verified | Complete for standard/variant; Bundle remains explicitly out of scope |
| G10 | PM approval before Commit/Push or any Remote step | Waiting |

## 19. Next Action

ดำเนิน T5.2 Implementation/Test Draft และ isolated Local QA ตาม Contract ที่อนุมัติ แล้วหยุดรอ PM review ก่อน Commit/Push หรือ Remote step ใด ๆ

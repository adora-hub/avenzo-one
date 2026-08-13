# Phase 2.0.2 — Product, Warehouse & Inventory Domain Contract

วันที่: 13 สิงหาคม 2026

สถานะ: **Approved / Completed**

อ้างอิง: Phase 2.0.1 Findings ได้รับอนุมัติแล้ว

ขอบเขต: ออกแบบ Contract เท่านั้น ไม่สร้าง Migration, ไม่แก้ Production, ไม่เปลี่ยน Permission/RLS/Business Logic และไม่สร้าง mock data

## 1. Contract Summary

Foundation Slice ใช้ `organization_id` เป็น tenant boundary และ `branch_id` เป็น operational scope โดย Product/SKU เป็น master data ระดับ Organization ส่วน Warehouse/Location และ Stock เป็นข้อมูลระดับ Branch

```text
Organization
├─ Product
│  └─ SKU
└─ Branch
   └─ Warehouse
      └─ Location
         └─ Inventory Balance ← derived read model
            └─ Stock Movement ← immutable source of truth
```

ข้อเสนอหลักสำหรับ MVP:

- SKU code และ barcode unique ภายใน Organization ไม่ใช่ global
- Warehouse ทุกแห่งต้องอยู่ใต้ Branch เดียว และ Location ทุกแห่งต้องอยู่ใต้ Warehouse เดียว
- Stock ต้องอ้าง Location เสมอ ไม่มี stock ที่ Warehouse โดยไม่ระบุ Location
- หนึ่ง SKU มี base unit เดียวใน Phase 2.0; ยังไม่มี unit conversion
- Quantity ใช้ exact decimal precision 6 ตำแหน่ง
- ห้าม stock ติดลบทุกกรณีใน MVP และไม่มี override
- `on_hand` มาจาก Movement Ledger; `allocated = 0`; `available = on_hand` จนกว่า Order/Reservation domain จะพร้อม
- Product/SKU/Warehouse ใช้ Archive/Inactive ไม่ hard delete เมื่อเคยมี Stock Movement
- Stock mutation ผ่าน Server Command เท่านั้น; UI และ browser ห้ามเขียน Balance หรือ Movement โดยตรง
- Platform Admin + AAL2 ตรวจดู tenant evidence ได้ตาม Control Plane แต่ห้ามแก้ stock ของ tenant โดยตรง

ข้อกำหนดในเอกสารนี้ได้รับอนุมัติเป็น Domain Contract สำหรับ Phase 2.0 แล้ว การเปลี่ยน Contract ต้องผ่าน Decision Record ใหม่

## 2. Ubiquitous Language

| คำ | ความหมายใน AVENZO ONE |
|---|---|
| Product | กลุ่มสินค้าที่ใช้ชื่อ/คำอธิบายร่วมกันและมี SKU อย่างน้อยหนึ่งรายการ |
| SKU | หน่วยสินค้าที่ขาย/นับ stock จริง มีรหัสและ base unit ของตนเอง |
| Warehouse | พื้นที่เก็บสินค้าหลักภายใน Branch |
| Location | ตำแหน่ง stock ที่เล็กที่สุดซึ่งระบบบันทึก quantity เช่น Default, Shelf หรือ Bin |
| Stock Movement | เหตุการณ์ immutable ที่เพิ่ม/ลด/ย้าย stock พร้อม actor, reason และ command |
| Inventory Balance | Read model ของยอดปัจจุบันต่อ Organization + SKU + Location |
| Receive | รับ stock จากภายนอกเข้าหนึ่ง Location โดยยังไม่ผูก Purchase Order |
| Adjust | ปรับเพิ่ม/ลดเพื่อแก้ยอดจริง พร้อมเหตุผลบังคับ |
| Transfer | ย้าย quantity ระหว่าง Location เป็นคำสั่งเดียวแบบ atomic |
| Archive | ปิดการใช้งาน master data ใหม่ โดยรักษาประวัติและการอ้างอิงเดิม |

ห้ามใช้คำว่า Inventory Record แทน Ledger หรือ Balance โดยไม่ระบุความหมาย เพราะสองสิ่งนี้มี write authority ต่างกัน

## 3. Aggregate และ Ownership

### 3.1 Product Aggregate

`Product` เป็น aggregate root ระดับ Organization และมี `SKU` เป็น child entity

Product contract:

- `id`: UUID ภายในระบบ
- `organization_id`: tenant owner และเปลี่ยนไม่ได้
- `name`: ข้อความหลัง trim ความยาว 1–160
- `description`: optional text
- `status`: `draft | active | archived`
- `created_by`, `updated_by`, `created_at`, `updated_at`
- มี SKU ได้หลายรายการ
- Product ที่ `active` ต้องมี SKU active อย่างน้อยหนึ่งรายการก่อนถูกใช้ใน operation ใหม่

SKU contract:

- `id`: UUID ภายในระบบ
- `organization_id`: tenant owner ซ้ำเพื่อ constraint/RLS/read path
- `product_id`: ต้องอ้าง Product ใน Organization เดียวกัน
- `sku_code`: uppercase canonical form, trim, ความยาว 1–80
- `name`: ข้อความหลัง trim ความยาว 1–160
- `barcode`: optional canonical text ความยาวไม่เกิน 128
- `sales_code`: optional permanent customer-facing code ความยาวไม่เกิน 80; ใช้ค้นหา/สแกนได้แต่ไม่ใช่ stock identity
- `base_unit_code`: lowercase canonical code เช่น `piece`, `kg`, `litre`
- `quantity_scale`: ล็อกที่ 6 ใน MVP
- `status`: `draft | active | archived`
- `created_by`, `updated_by`, `created_at`, `updated_at`

Uniqueness:

- `(organization_id, sku_code)` unique โดยไม่สนตัวพิมพ์เล็ก/ใหญ่หลัง canonicalize
- `(organization_id, barcode)` unique เฉพาะค่าที่ไม่เป็น null
- `(organization_id, sales_code)` unique เฉพาะค่าที่ไม่เป็น null และห้ามนำกลับไปใช้กับ SKU อื่น
- Product name และ SKU name ซ้ำได้
- SKU code/barcode ของคนละ Organization ซ้ำได้

ยังไม่รวมหลาย barcode ต่อ SKU, option matrix, variant generator, bundle/kit, digital product, service item หรือ external channel identity

### 3.1.1 Identifier Resolution Contract

- `sku_id` เป็น stock identity และ foreign key ที่ canonical เพียงรายการเดียว
- `sku_code`, `barcode` และ `sales_code` เป็น permanent lookup identifiers ภายใน Organization
- `cf_code` เป็น campaign/live-session identifier และต้อง unique ภายใน `(live_session_id, cf_code)`; ไม่ใช่คอลัมน์ถาวรบน SKU
- `order_item_code` เป็น fulfillment identifier ของรายการขาย; ไม่ใช่ SKU identity
- การสแกน code ทุกชนิดต้อง resolve ภายใต้ Organization และ context ที่ถูกต้องให้ได้ `sku_id` ก่อน
- Resolver ต้องปฏิเสธ not found, inactive, ambiguous และ cross-tenant match แบบ fail closed
- Stock Command และ Stock Movement บันทึก `sku_id` เสมอ ห้ามใช้ code text เป็น foreign key หรือ authority ในการตัด stock
- อาจเก็บชนิด/ค่ารหัสที่สแกนเป็น sanitized audit metadata เพื่อ trace ได้ แต่ห้ามใช้แทน `sku_id`

`cf_code`, Live Session, Order และ Order Item ยังไม่ถูก implement ใน Phase 2.0; Contract นี้ล็อก boundary เพื่อให้ Live CF ในอนาคตเชื่อม stock ได้อย่างปลอดภัยโดยไม่ขยาย MVP ปัจจุบัน

### 3.2 Warehouse Aggregate

Warehouse contract:

- `id`, `organization_id`, `branch_id`
- Branch ต้องอยู่ Organization เดียวกัน
- `code`: uppercase canonical form, unique `(organization_id, code)`
- `name`: 1–160 ตัวอักษร
- `status`: `active | inactive | archived`
- มี Location อย่างน้อยหนึ่งรายการก่อนรับ Stock Movement
- Branch หนึ่งมี Warehouse ได้หลายแห่ง
- Warehouse ต้องมี Branch เสมอ; ยังไม่มี Organization-level warehouse

Location contract:

- `id`, `organization_id`, `branch_id`, `warehouse_id`
- ทุก tenant/scope key ต้องสอดคล้องกันด้วย composite constraint/FK
- `code`: uppercase canonical form, unique `(warehouse_id, code)`
- `name`: 1–160 ตัวอักษร
- `is_default`: Warehouse มี default Location ได้หนึ่งรายการ
- `status`: `active | inactive | archived`
- Stock command ใหม่ใช้ได้เฉพาะ active Warehouse และ active Location

ตอนสร้าง Warehouse ให้สร้าง Default Location ใน transaction เดียวกัน เพื่อให้ไม่มี stock ที่ไม่มีตำแหน่ง

### 3.3 Inventory Aggregate

Stock Movement เป็น write model และ source of truth

Movement contract:

- `id`: immutable event identifier
- `organization_id`, `branch_id`, `warehouse_id`, `location_id`, `sku_id`
- `movement_type`: `receive | adjustment_in | adjustment_out | transfer_out | transfer_in`
- `quantity_delta`: signed exact numeric และห้ามเป็นศูนย์
- `base_unit_code`: snapshot จาก SKU ตอน post
- `reason_code`: required stable code
- `reason_note`: optional; required สำหรับ manual adjustment ตาม command rule
- `command_id`: idempotency reference
- `correlation_id`: เชื่อม movement คู่ของ Transfer
- `actor_user_id`, `occurred_at`, `created_at`
- ไม่มี update/delete path; correction ใช้ compensating movement ใหม่

Inventory Balance contract:

- key: `(organization_id, sku_id, location_id)`
- `on_hand`: exact numeric(20,6)
- `version`: monotonic integer สำหรับ optimistic evidence/read response
- `updated_at`, `last_movement_id`
- เขียนได้เฉพาะ stock command transaction
- ห้าม browser/API table mutation โดยตรง
- ผลรวม Balance ต่อ SKU ต้องเท่ากับผลรวม Movement Ledger ต่อ SKU/Location

## 4. State Contract

### 4.1 Product/SKU

```text
Draft ──activate──> Active ──archive──> Archived
  └──────────────archive──────────────> Archived
```

- `draft`: แก้ master data ได้ แต่ห้าม Receive/Adjust/Transfer
- `active`: ใช้ใน stock command ได้
- `archived`: ห้าม operation ใหม่และห้ามกลับ Active ใน MVP
- Archive Product ต้องไม่ทำให้ SKU/Movement เดิมหาย
- Archive Product ต้อง archive SKU ที่ยังไม่มี stock/history หรือปฏิเสธพร้อมรายการ blocker; ห้าม cascade แบบเงียบ

### 4.2 Warehouse/Location

```text
Active <──activate/deactivate──> Inactive ──archive──> Archived
Active ────────────────────────────────────archive──> Archived
```

- `inactive`: เก็บประวัติและอ่านได้ แต่ห้าม command ใหม่
- `archived`: terminal state
- Warehouse/Location ที่มี on_hand ไม่เท่ากับศูนย์ archive ไม่ได้
- Location default เปลี่ยนได้เมื่อ Location ใหม่ active และอยู่ Warehouse เดียวกัน

## 5. Unit และ Quantity Contract

- ใช้ `numeric(20,6)` สำหรับ quantity; ห้าม float/double
- รับค่าบวกใน command input แล้วสร้าง signed delta ภายใน transaction
- Quantity ต้องมากกว่า `0.000000` และไม่เกิน business ceiling ที่กำหนดใน implementation contract
- เก็บและคำนวณด้วย 6 ตำแหน่ง; UI แสดงตาม unit แต่ห้ามเปลี่ยนค่าจริงด้วย binary floating point
- SKU หนึ่งมี base unit เดียวและเปลี่ยนไม่ได้หลังมี Movement
- Phase 2.0 ยังไม่รองรับ conversion; sell/receive unit ต้องเท่ากับ base unit
- Unit catalog รุ่นแรกเป็น stable codes ที่ระบบรองรับ ไม่ให้ tenant สร้าง conversion เอง

เหตุผล: การเลื่อน conversion ออกไปลดความเสี่ยง rounding, reconciliation และการย้อน ledger โดยยังรองรับสินค้าชิ้นและสินค้าชั่งที่ใช้ทศนิยม

## 6. Quantity Formula และ Invariant

ใน Phase 2.0:

```text
on_hand  = sum(quantity_delta ของ posted movements)
allocated = 0
available = on_hand
```

Invariant บังคับ:

1. `on_hand >= 0` ทุก SKU/Location
2. Transfer ไม่เปลี่ยนยอดรวมของ Organization/SKU
3. Transfer Out และ Transfer In ต้อง post สำเร็จหรือ rollback พร้อมกัน
4. Movement quantity และ base unit ห้ามแก้ย้อนหลัง
5. Balance เปลี่ยนได้จาก Movement ใน transaction เดียวเท่านั้น
6. Archived/Inactive destination รับ movement ใหม่ไม่ได้
7. Source และ destination ของ Transfer ต้องต่าง Location
8. SKU, Location, Warehouse และ Branch ต้องอยู่ Organization เดียวกัน
9. Command replay ห้ามสร้าง Movement เพิ่ม

เมื่อ Order/Reservation พร้อม ต้องเปิด Decision ใหม่ก่อนเปลี่ยน `allocated` และ `available`; ห้ามเติม allocated แบบจำลองใน Phase 2.0

## 7. Stock Command Contract

Command envelope กลาง:

- `command_id`: UUID สร้างโดย client หนึ่งครั้งและ reuse เมื่อ retry
- `organization_id`: รับมาเป็น context แต่ Server ต้องยืนยัน Membership/Permission
- `actor_user_id`: อ่านจาก verified session ห้ามรับจาก request body
- `expected_version`: optional สำหรับ master-data update; required เมื่อ command อาศัย balance snapshot
- `reason_code`, `reason_note`
- command-specific payload

หากเริ่มคำสั่งจากการสแกน `cf_code`, `sales_code`, `barcode` หรือ `order_item_code` ฝั่ง Server ต้อง resolve เป็น `sku_id` ก่อนสร้าง command payload และตรวจซ้ำว่า SKU อยู่ Organization เดียวกับ Location/Order context

Idempotency:

- unique `(organization_id, command_id)` ข้าม stock command ทุกชนิด
- request hash/safe payload fingerprint เก็บเพื่อปฏิเสธ command ID เดิมที่ payload ต่างกัน
- retry payload เดิมคืน outcome เดิมและ movement IDs เดิม
- failed validation ก่อน post ไม่สร้าง command success หรือ movement

### 7.1 Receive

- destination Location active
- SKU active
- quantity เป็นบวก
- permission `inventory.receive`
- reason code ค่าเริ่มต้น `manual_receipt`; note optional
- สร้างหนึ่ง `receive` movement และเพิ่ม Balance

### 7.2 Adjust

- Location และ SKU active
- permission `inventory.adjust`
- ต้องมี reason code และ reason note อย่างน้อย 3 ตัวอักษร
- เพิ่มใช้ `adjustment_in`; ลดใช้ `adjustment_out`
- ปรับลดแล้วห้าม on_hand ติดลบ
- ไม่มี Platform Admin override และไม่มี two-person approval ใน MVP

### 7.3 Transfer

- source/destination active และอยู่ Organization เดียวกัน
- รองรับข้าม Warehouse/Branch ภายใน Organization เมื่อ actor มี scope ของทั้งต้นทางและปลายทาง
- permission `inventory.transfer`
- lock balance rows ตาม key order คงที่เพื่อป้องกัน deadlock
- สร้าง `transfer_out` และ `transfer_in` ด้วย correlation เดียวใน transaction สั้นเดียว
- ห้าม external API call ขณะถือ database lock

## 8. Permission Contract

เพิ่ม Permission codes ระดับ Organization:

| Code | ความหมาย | Branch scope |
|---|---|---|
| `product.read` | ดู Product/SKU ใน Organization | ไม่จำกัด Branch |
| `product.manage` | สร้าง/แก้/activate/archive Product/SKU | ไม่จำกัด Branch |
| `warehouse.read` | ดู Warehouse/Location ตาม scope | ใช่ |
| `warehouse.manage` | สร้าง/แก้/inactivate/archive Warehouse/Location | ใช่ |
| `inventory.read` | ดู Balance/Ledger ตาม Branch scope | ใช่ |
| `inventory.receive` | รับ stock เข้า Location | ใช่ |
| `inventory.adjust` | ปรับยอด stock | ใช่ |
| `inventory.transfer` | ย้าย stock; ต้องมี scope ทั้ง source และ destination | ใช่ทั้งสองฝั่ง |

กฎ:

- Permission ผูก Role ผ่าน catalog เดิม; ห้าม authorize จาก role name/code โดยตรง
- Owner/Admin อาจได้รับ permission ตอน migration seed แต่ต้องระบุชัดใน Phase 2.0.3
- Manager/Staff/Viewer ไม่ได้รับ write permission โดยอัตโนมัติจนกว่า owner อนุมัติ role mapping
- Platform Admin ไม่ถูกนับเป็น tenant operator และไม่มี stock write permission

## 9. RLS และ Data API Contract

- ทุก table ใน exposed schema เปิด RLS ก่อน grant
- `anon` และ `PUBLIC` ไม่มี table/function access
- `authenticated` ได้เฉพาะ SELECT read model/master data ตาม permission; ไม่มี INSERT/UPDATE/DELETE บน Movement/Balance
- Master-data UPDATE policy ต้องมีทั้ง `USING` และ `WITH CHECK`
- ทุก policy ระบุ `TO authenticated` และใช้ `(select auth.uid())`/private permission helper ตาม pattern ที่วัดแล้ว
- Index ทุก tenant key, FK และ predicate ที่ใช้ใน RLS/query path
- View ที่ browser อ่านต้องใช้ `security_invoker = true`
- Complex permission helper อยู่ private schema, ตรวจ caller identity ภายใน, fix `search_path` และ revoke execute ที่ไม่จำเป็น
- `service_role` ใช้ใน Server Command ได้แต่ต้องยืนยัน user, tenant, membership, scope และ permission ก่อน mutation เพราะ service role bypass RLS
- Platform Admin evidence read path ต้องแยก RPC และบังคับ active admin + AAL2

## 10. Audit และ Domain Event Contract

แยกสามชั้น:

1. Stock Movement — financial-style immutable operational ledger
2. Domain Event — machine-readable event สำหรับ integration/read-model ในอนาคต
3. Organization Audit — human-readable timeline สำหรับผู้ดูแล

Event names ขั้นต่ำ:

- `product.created`, `product.updated`, `product.activated`, `product.archived`
- `sku.created`, `sku.updated`, `sku.activated`, `sku.archived`
- `warehouse.created`, `warehouse.updated`, `warehouse.inactivated`, `warehouse.archived`
- `location.created`, `location.updated`, `location.inactivated`, `location.archived`
- `stock.received`, `stock.adjusted`, `stock.transferred`

Event/Audit ต้องมี organization, branch (ถ้ามี), actor, command, entity IDs, reason, occurred time และ safe metadata โดยไม่คัดลอก request body ทั้งก้อน

## 11. Read Model และ Query Contract

Product/SKU list:

- filter organization, status และ search term
- stable sort `(updated_at desc, id desc)`
- cursor/keyset pagination; ไม่ใช้ deep OFFSET เป็น contract หลัก
- search เริ่มจาก normalized code/name; full-text/trigram รอวัด workload

Stock list/ledger:

- filter organization, branch, warehouse, location, SKU, movement type และ time range
- stable cursor `(occurred_at desc, id desc)`
- tenant/scope filter ต้องอยู่ใน query และ RLS
- summary ไม่คำนวณจาก page เดียว; ใช้ aggregate/read model ฝั่ง Database

Indexes จะถูกออกแบบจาก query contract นี้ใน Phase 2.0.3 โดย equality columns ก่อน range/sort columns และ index foreign keys ทุกเส้นทางสำคัญ

## 12. Error Contract

Server map error เป็น stable codes โดยไม่เปิด SQL/schema detail:

- `tenant_access_denied`
- `branch_scope_denied`
- `permission_denied`
- `entity_not_found`
- `entity_inactive`
- `duplicate_sku_code`
- `duplicate_barcode`
- `duplicate_warehouse_code`
- `duplicate_location_code`
- `unit_mismatch`
- `insufficient_stock`
- `command_payload_conflict`
- `version_conflict`
- `invalid_state_transition`

UI แปลเป็นภาษาไทยและคง command ID สำหรับ support evidence โดยห้ามแสดง stack trace, SQL, JWT หรือ service credentials

## 13. Archive และ Retention Contract

- ไม่มี hard delete สำหรับ Product/SKU/Warehouse/Location ที่มี Movement/Audit reference
- Product/SKU ที่ไม่มี history อาจลบ draft ได้เฉพาะถ้า Decision Gate อนุมัติ; ข้อเสนอ MVP คือ archive เสมอเพื่อให้ behavior เดียว
- Warehouse/Location archive ได้เมื่อ on_hand ทุก SKU เป็นศูนย์
- Movement, command outcome และ audit เป็น immutable; retention policy ต้องตัดสินก่อน Production แต่ห้าม purge จน reconciliation/legal requirement ชัดเจน
- การแก้ความผิดพลาดใช้ compensating command พร้อม link ไป command/movement เดิม

## 14. Migration Baseline Gate

ก่อน Phase 2.0.3 ต้อง:

1. กู้ exact Phase 0.1 migration SQL หรือสร้าง reviewed baseline จาก Production schema
2. reconcile repository 93 files กับ Production history 90 records
3. สร้าง clean database จาก baseline ได้
4. apply migrations แล้ว schema diff กับ Production เฉพาะ expected environment differences
5. ห้าม rewrite Production migration history โดยไม่มีแผนและ approval แยก
6. เก็บ evidence ของ migration list, constraints, grants, RLS, functions และ advisors

Domain Contract นี้อนุมัติเพียงแนวทางซ่อม baseline ไม่อนุญาตให้ execute การซ่อมหรือ apply migration

## 15. Acceptance Criteria

Phase 2.0.2 ผ่านเมื่อเจ้าของระบบอนุมัติ:

1. Entity ownership และ topology Organization → Branch → Warehouse → Location
2. Product → SKU identity, lifecycle และ uniqueness
3. Base unit เดียว, numeric(20,6) และไม่มี conversion ใน MVP
4. `on_hand`, `allocated = 0`, `available = on_hand`
5. Negative stock deny-all และไม่มี override
6. Receive/Adjust/Transfer command, reason และ idempotency contract
7. Immutable Ledger, derived Balance และ reconciliation invariant
8. Permission/RLS/Platform Admin boundary
9. Archive/retention และ compensating movement policy
10. Migration Baseline Gate ก่อน Phase 2.0.3
11. Identifier Resolution: code ทุกชนิด resolve เป็น `sku_id` ก่อน Stock Command/Movement

## 16. Draft Test Matrix

| Contract | Positive | Negative/Abuse | Concurrency/Replay |
|---|---|---|---|
| Product/SKU | create → activate → archive | cross-tenant product, duplicate SKU/barcode, invalid transition | duplicate command/update version conflict |
| Warehouse/Location | create warehouse + default location | mismatched org/branch/FK, inactive destination | two creates same code/default location |
| Receive | post movement + balance | unauthorized, inactive SKU/location, zero/negative input | same command replay และ parallel receive |
| Adjust | in/out พร้อม reason | insufficient stock, missing reason, cross-branch | competing decrement ไม่ติดลบ |
| Transfer | atomic out/in | same location, scope ขาดด้านหนึ่ง, cross-tenant | opposite transfers ใช้ lock order เดียว |
| Ledger | aggregate เท่ากับ balance | direct update/delete denied | reconciliation ระหว่าง concurrent commands |
| RLS | own tenant/branch | other tenant, suspended member, anon, AAL1 admin | permission change ระหว่าง request ต้อง fail safe |
| UI/API | cursor/search/filter และ safe error | tampered tenant/actor/version | retry timeout คืน outcome เดิม |
| Identifier resolver | sku/sales/barcode resolve เป็น SKU เดียว | ambiguous, inactive, cross-tenant, reused CF code | scan retry ได้ `sku_id` เดิมและไม่ post ซ้ำ |

## 17. Decision Register Resolution Proposal

| ID | Resolution proposal | Gate status |
|---|---|---|
| D-201 | organization tenant key + branch operational scope + composite tenant constraints | **Owner approved** |
| D-202 | Product/SKU owned by Organization | **Owner approved** |
| D-203 | SKU/barcode unique per Organization; one optional barcode per SKU in MVP | **Owner approved** |
| D-204 | Draft → Active → Archived; no restore/hard delete | **Owner approved** |
| D-205 | Branch 1:N Warehouse; Warehouse 1:N Location; stock requires Location | **Owner approved** |
| D-206 | one immutable base unit per SKU; numeric(20,6); no conversion | **Owner approved** |
| D-207 | on_hand from ledger; allocated 0; available = on_hand | **Owner approved** |
| D-208 | negative stock deny-all; no override | **Owner approved** |
| D-209 | reason required for adjustment; no two-person approval in MVP | **Owner approved** |
| D-210 | Movement immutable source of truth; Balance derived | **Owner approved / Locked** |
| D-211 | all mutation via Server Command; browser read only where RLS permits | **Owner approved** |
| D-212 | unique organization + UUID command ID + payload conflict detection | **Owner approved** |
| D-213 | separate Movement, Domain Event and human Audit | **Owner approved** |
| D-214 | Platform Admin evidence read only; no tenant stock mutation | **Owner approved** |
| D-215 | repair/reconcile replayable baseline before Phase 2.0.3 schema work | **Owner approved / Blocking** |
| D-216 | eight Product/Warehouse/Inventory permission codes | **Owner approved** |
| D-217 | sku_code/barcode/sales_code/cf_code/order_item_code เป็น lookup; ทุก scan resolve เป็น `sku_id` ก่อน Stock Command/Movement | **Owner approved** |

## 18. Decision Gate

เจ้าของระบบอนุมัติ Resolution D-201–D-217 และปิด Domain Decision Gate เมื่อวันที่ 13 สิงหาคม 2026

หลังอนุมัติ Phase 2.0.2 แล้ว ขั้นถัดไปคือวางแผน **Phase 2.0.3 Database, RLS & Migration** แต่การสร้าง migration, ซ่อม baseline, apply Supabase หรือเปลี่ยน Production ต้องได้รับอนุมัติแยกทั้งหมด

### ผลการปิด Phase

- Entity, ownership, topology, lifecycle, uniqueness, unit และ quantity formula ผ่าน Decision Gate
- Ledger, Balance, Receive/Adjust/Transfer, negative-stock และ idempotency contract ผ่าน Decision Gate
- Permission/RLS, Platform Admin boundary และ Identifier Resolution ผ่าน Decision Gate
- D-215 ยังคงเป็น blocking prerequisite: ต้องทำ Migration Baseline Recovery ก่อนสร้าง Product/Inventory schema
- ขั้นถัดไปที่เข้า Gate ได้คือ **Phase 2.0.3.1 Migration Baseline Recovery** และต้องรับอนุมัติเริ่มงานแยก

## 19. สิ่งที่ไม่ได้ทำ

- ไม่มี migration/schema/RLS/function/grant ถูกสร้างหรือแก้
- ไม่มี SQL ถูก execute กับ Production
- ไม่มี Product/Inventory application code หรือ mock data
- ไม่มี Package, Environment Variable, Commit, Push หรือ Deploy

## 20. Supabase/Postgres References

- [Supabase Row Level Security](https://supabase.com/docs/guides/database/postgres/row-level-security)
- [Supabase Secure Product Configuration](https://supabase.com/docs/guides/security/product-security)
- [Supabase Postgres Roles](https://supabase.com/docs/guides/database/postgres/roles)
- [PostgreSQL Constraints](https://www.postgresql.org/docs/current/ddl-constraints.html)
- [PostgreSQL Explicit Locking and Deadlocks](https://www.postgresql.org/docs/current/explicit-locking.html#LOCKING-DEADLOCKS)

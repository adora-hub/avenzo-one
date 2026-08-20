# AVENZO ONE — Part T1 Initial Stock Data Contract & Safety Design V1

วันที่อนุมัติ: 18 สิงหาคม 2026  
สถานะ: **Completed — Design contract only**  
ขอบเขต: ล็อก Data Contract และ Safety Boundary สำหรับเชื่อม UI สต็อกเริ่มต้นใน Part T2 ขึ้นไป โดย **ยังไม่มี Migration, RPC ใหม่ หรือการเขียน Stock จริง**

## 1. เป้าหมายและ Existing Foundation

ให้ผู้ใช้กำหนดสต็อกเริ่มต้นในหน้าสร้างสินค้าได้ แต่ทุกยอดต้องเข้าสู่ Inventory Ledger เดิม ห้าม UI แก้ `inventory_balances` โดยตรง

| หน้าที่ | Contract ที่ต้องใช้ |
|---|---|
| สร้าง Product/SKU | `server_execute_product_creation_command` หรือ `server_execute_variant_creation_command` |
| เปิดใช้งาน | `product.activate` และ `sku.activate` พร้อม optimistic version |
| รับสต็อก | `server_post_inventory_command` ด้วย `command_type = 'receive'` |
| Source of truth | `stock_movements` แบบ immutable |
| Read model | `inventory_balances` ซึ่งปรับพร้อม Movement ใน transaction เดียวกัน |
| Permission | `inventory.receive` ตาม Organization และ Branch scope |

T1 ไม่สร้าง direct insert/update path ใหม่จาก Browser

## 2. Identity และ Tenant Contract

ทุกบรรทัดต้องใช้ `organization_id`, `destination_location_id`, `sku_id` และ `quantity` มากกว่า 0 ตาม `numeric(20,6)` เดิม

- Branch/Warehouse ต้อง resolve จาก Location ในฐานข้อมูล ไม่รับค่าจาก Client เป็น authority
- `base_unit_code` อ่านจาก SKU
- Location, Warehouse, Branch และ SKU ต้อง active และอยู่ Organization เดียวกัน
- SKU Code, Sales Code/CF และ Barcode ใช้ค้นหาเท่านั้น ห้ามใช้แทน `sku_id`
- หน้าสร้างสินค้ามี `sku_id` จากผลลัพธ์คำสั่งสร้างอยู่แล้ว จึงไม่ต้อง resolve จากรหัสข้อความอีก

## 3. Status Precondition และลำดับ

ระบบปัจจุบันสร้าง Product/SKU เป็น `draft` แต่ Inventory RPC รับเฉพาะ SKU `active`:

1. สร้าง Product/SKU แบบ atomic
2. จัดการรูปภาพ/ข้อมูลประกอบตาม workflow เดิม
3. เมื่อผู้ใช้กดสร้างจริง ให้ activate Product และ SKU ที่ผ่าน validation
4. หลัง SKU active จึง post `receive`
5. รายงานผล Product/SKU และ Initial Stock แยกกัน

`บันทึกร่าง` ไม่ post Stock แม้กรอกจำนวนไว้ ค่าดังกล่าวอยู่ใน form draft/recovery state จนกว่าจะสร้างและเปิดใช้งานจริง

## 4. Inventory Command

หนึ่ง SKU ต่อหนึ่ง Location ใช้หนึ่งคำสั่ง:

```text
command_type            = receive
sku_id                  = activated SKU UUID
source_location_id      = null
destination_location_id = selected active Location UUID
quantity                = initial quantity in SKU base unit
reason_code             = opening_balance
reason_note             = Initial stock from product creation
occurred_at             = server-approved timestamp
```

ไม่เพิ่ม movement type ใหม่: `receive` รองรับ source ภายนอกสู่ Location อยู่แล้ว และ `opening_balance` จำแนกที่มา

## 5. Idempotency

- มี UUID `inventory_command_id` คงเดิมต่อ `product creation attempt + sku_id + location_id`
- Request hash มาจาก canonical Organization, SKU, Location, Quantity, Reason และ Occurred At ตามมาตรฐานเดิม
- Retry Command ID และ payload เดิมคืนผลเดิมโดยไม่มี Movement ซ้ำ
- ID เดิมแต่ hash/tenant ต่างต้องเป็น `inventory_command_payload_conflict`
- Refresh, double-click, timeout และ network retry ต้องใช้ key เดิมจาก recovery state
- เปลี่ยน Quantity/Location หลัง retry ต้องออก Command ID ใหม่

## 6. Transaction Boundary และ Recovery

ใช้ **recoverable two-stage workflow**:

```text
Stage A: Product/SKU creation + activation
Stage B: Initial Stock receive command(s)
```

Product creation contract เดิมระบุ `inventory_posted = false`; รูปภาพ/Storage ไม่อยู่ atomic transaction เดียวกับ Postgres และไม่ควรลบสินค้าที่สร้างสำเร็จเพราะ Stock ล้มเหลว

- Standard: retry receive ด้วย Command ID เดิม
- Variants: แสดง `pending/completed/failed` ราย SKU และ retry เฉพาะที่ยังไม่ completed
- ไม่เรียกว่า Stock สำเร็จทั้งหมดจนทุกบรรทัด completed
- ห้ามลบ Movement ที่สำเร็จ; การแก้ยอดใช้ Adjustment command ใหม่
- นี่คือ batch แบบ item-level idempotency ไม่ใช่ all-or-nothing ข้ามหลาย SKU

## 7. Permission, RLS และ Service Boundary

- Browser เรียก application endpoint เท่านั้น
- Application ตรวจ session, active membership และ Organization context
- `server_post_inventory_command` execute เฉพาะ `service_role`
- Database ตรวจ `inventory.receive` ตาม Branch ที่ resolve จาก destination Location
- Exposed tables ต้องมี RLS และ least-privilege grants; Data API อ่านได้ตาม policy แต่ห้าม direct mutation
- Security-definer function ใช้ `search_path = ''`, schema-qualified names, revoke `public/anon/authenticated` และ grant เฉพาะ role จำเป็น
- ห้ามใช้ JWT `user_metadata` เป็น authorization authority

แนวทางนี้สอดคล้องกับ Supabase ปัจจุบันที่กำหนดให้ exposed tables เปิด RLS และต้องกำหนดทั้ง grants กับ policies ไม่ใช่ policies อย่างเดียว

## 8. Concurrency และ Ledger Safety

Existing inventory primitive เป็น authority สำหรับ command locking, idempotent retry, tenant foreign keys, atomic Movement+Balance, `on_hand >= 0` และ immutable guards

Part T2 ห้ามทำ read-modify-write Balance ใน TypeScript และห้ามใช้ยอดที่ UI อ่านไว้เป็น authority

## 9. Product Structure Rules

- **Standard:** SKU เดียว → receive หนึ่งคำสั่งเมื่อ Quantity > 0
- **มีตัวเลือกหลายรายการ:** แยกคำสั่งต่อ SKU ใช้ `workflow_id` ร่วม; ค่า 0/ว่างไม่สร้างคำสั่ง
- **Virtual Bundle:** ไม่รับ Bundle Stock; Stock มาจาก component SKU
- **Preassembled Bundle:** ยังไม่ post Initial Stock จน Assembly command contract ผ่าน

## 10. Lazy Loading

- Switch ปิด: ไม่ query Warehouse/Location/Balance
- เปิดครั้งแรก: query เฉพาะ active Branch/Warehouse/Location ใน scope ที่อ่านได้
- Cache ตามมาตรฐานและ invalidate เมื่อ Organization/Branch เปลี่ยน
- ไม่ query Movement history หรือ aggregate Balance เพราะไม่จำเป็น

## 11. Error Contract

| Technical outcome | การสื่อสาร/การทำงาน |
|---|---|
| `inventory_receive_permission_required` | ไม่มีสิทธิ์รับสต็อกเข้าสาขานี้ |
| Location/Warehouse/Branch inactive | จุดจัดเก็บไม่พร้อมใช้ ให้โหลดตัวเลือกใหม่ |
| `active_sku_required` | SKU ยังไม่พร้อมรับสต็อก ให้ workflow เปิดใช้งานก่อน |
| `inventory_command_payload_conflict` | Key ถูกใช้กับข้อมูลอื่น ให้ออกคำขอใหม่โดยไม่ post ซ้ำ |
| Network/timeout | สถานะยังไม่ยืนยัน ให้ retry ด้วย Command ID เดิม |
| Variant สำเร็จบางส่วน | แสดงผลราย SKU และลองเฉพาะรายการค้าง |

## 12. Audit

เชื่อม Product creation command ID, `workflow_id`, Inventory command ID ต่อ SKU/Location, actor, tenant/scope, Quantity/Base Unit, `opening_balance`, timestamps และ sanitized error code ห้าม log token หรือ service-role key

## 13. Acceptance Gate สำหรับ T2–T5

1. Permission และ cross-tenant denial
2. Draft SKU รับ Stock ไม่ได้; activate ก่อน receive แล้วสำเร็จ
3. Retry payload เดิมสร้าง Movement เดียว; payload conflict ถูกปฏิเสธ
4. Standard/Variant เก็บ Quantity และ Base Unit ถูกต้อง
5. Quantity 0/ติดลบ/เกินขอบเขต/precision ผิดถูกปฏิเสธ
6. Virtual/Preassembled Bundle ไม่ผ่าน Initial Stock flow
7. Partial Variant recovery และ retry เฉพาะรายการค้าง
8. Balance เท่าผลรวม Ledger และไม่มี direct mutation
9. Switch ปิดแล้วไม่มี Warehouse/Location query
10. RLS/grants/function execution ผ่าน security regression suite

## 14. Non-goals

T1 ไม่แก้ Migration/RPC/endpoint/UI-Supabase integration, ไม่แก้ Reservation/Order/Live CF/`allocated`, ไม่ทำ Bundle Assembly และไม่ Commit/Push/Deploy

## 15. แผนถัดไป

1. **T2 — Read Integration & Lazy Loading: Completed locally** — โหลด Warehouse/Location จริงเมื่อเปิด switch พร้อม permission-aware cascading options
2. **T3 — Initial Stock Application Workflow: Completed locally** — activate → receive, idempotency/recovery และสถานะราย SKU; ยังไม่เชื่อม UI จนถึง T5
3. **T4 — Database & Security Tests:** tenant, permission, retry, concurrency, ledger invariants
4. **T5 — UI Integration & E2E Gate:** เชื่อม UI ที่ผ่านแล้วและหยุดให้ Owner ทดสอบก่อน Deploy

# AVENZO ONE — Phase T4 Preflight Design Report

**สถานะเอกสาร:** Preflight Design เท่านั้น — รอ PM อนุมัติก่อนเริ่ม Implement  
**Phase:** T4 — Multi-SKU Combination Batch Receive  
**Source of Truth หลัก:** `docs/AVENZO_ONE_Phase_T_Initial_Stock_Integration.md`  
**Branch:** `codex/workstream-domain-qa`  
**ข้อจำกัด:** รายงานนี้ไม่แก้โค้ด ไม่สร้าง Migration ไม่สร้าง Contract ใหม่ และไม่ Commit/Push

---

## Status

สถานะความพร้อมของ T4: **Not Ready / Blocked for Implementation**

จากการตรวจแบบ read-only ยังไม่พบ Schema, Migration, API หรือ Test สำหรับ Product, SKU, Warehouse, Location และ Inventory Movement ใน repository ปัจจุบัน จึงยังไม่สามารถเริ่มเขียนโค้ด T4 ได้

เอกสารนี้เป็น Implementation Plan ที่เสนอเพื่อรอ PM Review เท่านั้น ไม่ใช่การอนุมัติ Contract หรือการเปลี่ยนแปลงระบบ

---

## Findings

### 1. ข้อกำหนด T4 จาก Source of Truth

Phase T กำหนดให้ T4 รองรับการรับ Stock หลาย SKU ในคำสั่งเดียว โดยจำนวนแยกตาม `sku_id` และมีข้อกำหนดหลักดังนี้:

- รับ 2–N SKU Combination พร้อมจำนวนแยกตาม `sku_id`
- Input แต่ละรายการต้องมี `sku_id`, `location_id`, `quantity`, `unit/base_unit`, `client_request_id หรือ idempotency_key`, `reference` และ `reason ตาม Policy`
- ตรวจ Organization, SKU, Location, Permission และจำนวนก่อนเขียน
- สร้าง Inventory Movement แยกต่อ `sku_id` แต่ Commit พร้อมกัน
- หาก SKU ใดไม่ถูกต้อง ต้อง Rollback ทั้ง Transaction
- ห้ามเกิด Partial Success
- `idempotency_key` เดิมต้องคืนผลลัพธ์เดิมและห้ามเพิ่ม Stock ซ้ำ
- ต้องมี Unique Constraint หรือกลไกเทียบเท่าสำหรับคำสั่งรับ Stock
- ต้องป้องกัน Double-click, Retry, Refresh และ Network timeout
- ต้องตรวจ SKU Code ซ้ำก่อนเริ่มเขียน
- Error ต้องไม่เปิดเผยข้อมูลข้าม Organization
- ต้องป้องกัน Conflict จากการเขียนพร้อมกัน
- ต้องผ่าน TypeScript, Unit Test, Integration Test และ E2E Test

### 2. สิ่งที่มีอยู่ใน Repository

พบรูปแบบพื้นฐานที่สามารถใช้เป็นแนวอ้างอิงได้จากระบบเดิม:

- `organization_id` และ Organization scope
- Permission helper `public.has_org_permission(...)`
- `security definer` RPC
- RLS และการ revoke direct write
- Unique Constraint สำหรับ Idempotency ใน Payment
- `SELECT ... FOR UPDATE`
- Audit Trigger
- Command ที่คืนผลลัพธ์เดิมเมื่อส่งซ้ำ

ไฟล์อ้างอิง:

- `supabase/migrations/20260805200000_phase_0_2_role_permission.sql`
- `supabase/migrations/20260807120000_phase_0_9_security_audit.sql`
- `supabase/migrations/20260808123000_phase_1_1_2_payment_gateway_sandbox.sql`

รูปแบบเหล่านี้เป็นของ Permission, Audit และ Billing ไม่ใช่ Stock Implementation ที่พร้อมนำมาใช้โดยตรง

### 3. สิ่งที่ยังไม่พบ

ยังไม่พบ Table, RPC, RLS, API หรือ Test สำหรับ:

- Product
- Product Variant
- SKU
- Sales Code
- Warehouse
- Location
- Inventory Movement
- Stock Balance
- Initial Receive
- Multi-SKU Batch Receive
- Inventory Reservation
- Stock Idempotency

Migration ที่มีอยู่เน้น Foundation, Permission, Subscription, Notification, Billing และ Payment

API ที่มีอยู่เน้น Billing, Stripe, Notification, Invitation และ Auth ไม่พบ API ของ Inventory หรือ Stock Receive

ไม่พบ Test File หรือ Test Runner Script ใน `web/package.json` สำหรับ Unit, Integration หรือ E2E ของ T4

---

## Decisions

ส่วนนี้เป็นแนวทางที่เสนอจาก Phase T เพื่อรอ PM อนุมัติ ไม่ใช่ Contract ใหม่ที่ล็อกแล้ว

### 1. Transaction Boundary

กำหนดให้การรับ Stock เป็นหนึ่ง Database Transaction ต่อหนึ่ง Batch Command:

```text
API Request
  → validate request shape
  → call one server-side RPC
      → validate organization/permission
      → validate all SKU
      → validate all Location
      → validate unit/quantity
      → check duplicate command
      → lock relevant records
      → create Movement per SKU
      → commit all
  → return batch result
```

หลักการ:

- API ห้ามเขียน Movement ทีละรายการเอง
- RPC เป็น Authority ของ Transaction
- SKU ใดผิดต้อง Rollback ทั้ง Batch
- ห้าม Partial Success
- Movement ทุกแถวต้อง Commit พร้อมกัน
- Balance ต้องเปลี่ยนจาก Movement ที่สำเร็จเท่านั้น
- ต้องรองรับ Concurrent Batch โดยไม่ทำให้ยอดเกินจริง

### 2. Idempotency

อ้างอิง `client_request_id หรือ idempotency_key` ตาม T4:

- รับ `idempotency_key` ต่อ Batch
- Key เดิมต้องคืนผลลัพธ์เดิม
- Key เดิมห้ามสร้าง Movement เพิ่ม
- ต้องรองรับ Double-click, Retry, Refresh และ Network timeout
- ต้องมี Unique Constraint หรือกลไกเทียบเท่า
- ต้องตรวจ Duplicate ก่อนเริ่มเขียนข้อมูล
- Concurrent Request ที่ใช้ Key เดียวกันต้องไม่สร้าง Batch ซ้ำ

Candidate ชื่อตารางสำหรับการ Implement เช่น `inventory_receive_batches` เป็นเพียงข้อเสนอ ยังไม่ใช่ชื่อ Contract ที่ได้รับอนุมัติ

### 3. Constraints

Implementation ต้องตรวจสอบหรือวางแผนให้ครอบคลุม:

- `organization_id` ห้ามเป็น null
- `sku_id` ต้องอยู่ใน Organization เดียวกับคำสั่ง
- `location_id` ต้องอยู่ใน Warehouse/Organization ที่ถูกต้อง
- `quantity` ต้องไม่ติดลบ
- Unit ต้องตรงกับ SKU
- SKU Code ต้องไม่ซ้ำตามขอบเขตที่อนุมัติ
- Location ต้องไม่ซ้ำภายใน Warehouse ตามขอบเขตที่อนุมัติ
- Movement Type ต้องเป็น `initial_receive` สำหรับ T4
- `idempotency_key` ต้อง unique ตามขอบเขตที่อนุมัติ
- Batch เดียวกันต้องไม่รับ SKU/Location ซ้ำโดยไม่มีกฎรองรับ
- Virtual Bundle ห้ามรับยอดโดยตรง
- Draft Product ห้ามสร้าง Stock

ปัจจุบันยังไม่มี Schema ให้ตรวจว่า Constraint เหล่านี้มีอยู่แล้วหรือไม่

### 4. RLS และ Permission

ตาม Phase T ต้องบังคับ:

- ทุก Product/SKU/Warehouse/Location/Movement ผูก `organization_id`
- ตรวจ Organization membership
- ตรวจ Permission ก่อนเขียน
- ใช้ `warehouse.read` สำหรับการอ่าน Warehouse/Location
- ใช้ `inventory.receive` สำหรับการรับ Stock
- ป้องกัน Cross-organization access
- ปิด direct insert/update/delete จาก Client
- ให้ Server/RPC เป็นช่องทาง Mutation
- Audit ต้องบันทึก Actor, เวลา, เหตุผล และ Reference

ต้องตรวจสอบก่อน Implement ว่า Permission Code `warehouse.read` และ `inventory.receive` มีอยู่ในระบบหรือไม่ หากยังไม่มี ต้องผ่าน Decision/Approval ก่อนเพิ่ม ไม่ควรสร้างเองใน Preflight

---

## Risks

### ความเสี่ยงหลัก

1. **ไม่มี Domain Schema ตั้งต้น** — ยังไม่มี Product/SKU/Warehouse/Location/Movement ให้ API และ RPC อ้างอิง
2. **Partial Success** — หาก API เขียนทีละรายการแทน Transaction เดียว อาจเกิด Stock บาง SKU ถูกเพิ่มและบาง SKU ล้มเหลว
3. **Duplicate Receive** — หากไม่มี Unique Constraint หรือ Lock ที่เหมาะสม Double-click/Retry อาจเพิ่ม Stock ซ้ำ
4. **Concurrent Oversell/Over-receive** — Batch พร้อมกันอาจทำให้ยอดไม่ตรงจริงหากไม่ Lock หรือกำหนด Transaction Isolation ให้ถูกต้อง
5. **Cross-tenant Access** — หาก Foreign Key และ RLS ไม่ตรวจ Organization ร่วมกัน อาจรับ Stock โดยอ้างอิง SKU/Location ของร้านอื่น
6. **Unit Mismatch** — หาก Unit ของ SKU กับ Unit ที่รับไม่ตรง อาจทำให้ Balance ผิดโดยไม่เห็นชัดจาก UI
7. **Draft/Bundle Leakage** — Draft Product หรือ Virtual Bundle อาจถูกนำไปสร้าง Movement หาก Validation อยู่เฉพาะ Client
8. **Error Disclosure** — Error ที่บอกข้อมูล SKU/Location ข้าม Organization อาจเปิดเผยข้อมูล Tenant อื่น
9. **Missing Auditability** — หาก Movement ไม่มี Actor, Reference, Reason และเวลา จะตรวจย้อนหลังและ Reconcile ไม่ได้
10. **Test Infrastructure Gap** — ปัจจุบันไม่พบ Test File หรือ Script ที่พร้อมรัน T4

### Stop Gate

ยังไม่ควรเริ่ม Implement จนกว่า PM จะอนุมัติ:

- Candidate Schema/Table และชื่อ RPC
- ขอบเขต Unique ของ SKU Code, Location และ Idempotency
- Permission Code ที่จะใช้
- Transaction Boundary แบบ RPC เดียว
- Error Code/Response Contract
- การจัดการ Duplicate SKU/Location ใน Batch เดียว
- Test Runner และ Test Environment
- Product/SKU/Warehouse/Location Schema ที่เป็นฐานจริง

---

## Files

รายการนี้เป็นไฟล์ที่คาดว่าจะเกี่ยวข้องหลัง PM อนุมัติเท่านั้น ยังไม่ได้สร้างหรือแก้จริง

### Source of Truth / Documentation

- `docs/AVENZO_ONE_Phase_T_Initial_Stock_Integration.md`
- `docs/AVENZO_ONE_Codex_Implementation_Starter_Plan_V7.md`
- `docs/AVENZO_ONE_Phase_T4_Preflight_Design_Report.md` (เอกสารรายงานนี้)

### Migration / Schema ที่คาดว่าจะสร้าง

- `supabase/migrations/<timestamp>_phase_t_product_sku_warehouse_location.sql`
- `supabase/migrations/<timestamp>_phase_t_inventory_receive_batch.sql`
- `supabase/migrations/<timestamp>_phase_t_inventory_rls_audit.sql`

หน้าที่ที่ต้องพิจารณา:

- Product/SKU/Variant ที่ T4 ต้องอ้างอิง
- Warehouse/Location
- Batch Command สำหรับ Initial Receive
- Inventory Movement
- Constraint และ Index
- Idempotency Unique Constraint
- RLS, Permission และ Audit Trigger/RPC

ยังไม่ควรแก้ Migration เดิมจนกว่าจะยืนยันว่ามี Schema อื่นที่ไม่ได้อยู่ใน repository นี้

### API ที่คาดว่าจะสร้าง

- `web/src/app/api/inventory/receive/route.ts`

หน้าที่:

- ตรวจรูปแบบ Request เบื้องต้น
- ตรวจ Session
- ส่งคำสั่งหนึ่ง Batch ไปยัง RPC
- แปลง Error จาก Database เป็น Error Contract ของ T4
- ไม่คำนวณ Balance เอง
- ไม่เขียน Movement โดยตรงจาก API

### Server/Data Access ที่คาดว่าจะสร้าง

- `web/src/lib/inventory/...`
- `web/src/lib/product/...`
- `web/src/lib/warehouse/...`

ชื่อจริงและการแบ่ง Module ต้องยืนยันตามโครงสร้างที่ PM/ทีมกำหนดก่อน Implement เพราะปัจจุบันยังไม่มี Domain Module เหล่านี้

### Tests ที่คาดว่าจะสร้าง

- `web/tests/inventory-receive.unit.test.ts`
- `web/tests/inventory-receive.integration.test.ts`
- `web/tests/inventory-receive.rls.test.ts`
- `web/tests/inventory-receive.e2e.test.ts`
- `supabase/tests/phase_t_t4_batch_receive.sql` หรือโครงสร้าง Test ที่ทีมอนุมัติ

---

## Tests

### T4 Test Matrix

| # | Test Case | Expected Result |
|---:|---|---|
| 1 | รับ SKU เดียว จำนวนถูกต้อง | สร้าง Movement สำเร็จ 1 รายการ |
| 2 | รับหลาย SKU จำนวนต่างกัน | สร้าง Movement ครบทุก SKU ใน Transaction เดียว |
| 3 | มี SKU หนึ่งรายการไม่พบ | Rollback ทั้ง Batch |
| 4 | Location ไม่มีสิทธิ์ | ปฏิเสธทั้ง Batch และไม่สร้าง Movement |
| 5 | Quantity ติดลบ | ปฏิเสธทั้ง Batch |
| 6 | Quantity เป็นทศนิยมที่ Unit ไม่รองรับ | ปฏิเสธทั้ง Batch |
| 7 | Unit ไม่ตรงกับ SKU | ปฏิเสธทั้ง Batch |
| 8 | ใช้ `idempotency_key` เดิม | คืนผลลัพธ์เดิม ยอดไม่เพิ่ม |
| 9 | Double-click | สร้าง Batch เดียว |
| 10 | Retry หลัง Network timeout | ไม่สร้าง Movement ซ้ำ |
| 11 | Concurrent Batch | ยอดไม่เกินจริง และไม่เกิด Partial Success |
| 12 | Cross-organization SKU | ปฏิเสธโดยไม่เปิดเผยข้อมูลข้ามองค์กร |
| 13 | Cross-organization Location | ปฏิเสธโดยไม่เปิดเผยข้อมูลข้ามองค์กร |
| 14 | Rollback หลังพบรายการผิด | ไม่มี Movement ของรายการใดใน Batch |
| 15 | SKU Code ซ้ำ | Constraint/Validation ปฏิเสธ |
| 16 | Draft Product | ห้ามรับ Stock |
| 17 | Virtual Bundle | ห้ามรับยอดโดยตรง |
| 18 | Permission ไม่มี `inventory.receive` | ปฏิเสธการเขียน |
| 19 | RLS อ่านข้อมูลข้าม Tenant | ต้องอ่านไม่ได้ |
| 20 | Audit | บันทึก Actor, เวลา, Reference และ Reason ครบ |
| 21 | Error Response | ระบุรายการผิดโดยไม่เผยข้อมูลข้าม Organization |
| 22 | TypeScript/Build | ผ่านโดยไม่มี Type Error |
| 23 | API Integration | Request เดียวสร้างผลลัพธ์ตรงกับ DB |
| 24 | E2E | UI Preview ตรงกับ Movement ที่ Commit จริง |

### Test Layers

- **Unit:** Validation ของ quantity, unit, duplicate item และ error mapping
- **Database/Integration:** Atomic Batch, Rollback, Movement creation, Idempotency และ Concurrent Request
- **RLS/Security:** Organization isolation, Permission, direct-write denial และ Error disclosure
- **API Contract:** Request/Response, Session, RPC mapping และ Retry behavior
- **E2E:** Preview → Confirm → Commit → แสดงผลตาม SKU/Location
- **Build/TypeScript:** ตรวจ TypeScript และ Build หลัง Implement

ปัจจุบันยังไม่มี Test Runner หรือ Test File ของ T4 จึงยังไม่สามารถรายงานผล Pass/Fail ได้

---

## Next Action

1. PM Review รายงานนี้และอนุมัติหรือแก้ Candidate Design
2. ยืนยัน Product/SKU/Warehouse/Location Schema ที่เป็นฐานจริง
3. ยืนยัน Permission Code และขอบเขต Unique Constraint
4. ยืนยันชื่อ RPC, Batch Table และ Movement Table
5. ยืนยัน Error Contract และ Test Environment
6. หลังอนุมัติจึงเริ่มสร้าง Migration/API/Test ตามลำดับ
7. ก่อน Commit/Push ต้องให้ PM ตรวจผล Test และ Diff บน branch `codex/workstream-domain-qa`

**สถานะปัจจุบัน:** รอ PM อนุมัติ — ยังไม่มีการแก้โค้ดหรือ Migration

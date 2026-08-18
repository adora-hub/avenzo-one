# AVENZO ONE — Product Variant, Sales Code & Live CF Development Guide V1

วันที่จัดทำ: 16 สิงหาคม 2026

สถานะ: **Part 5 Unified Variant Creation พร้อม Refinement ข้อ 2–5 completed locally ตาม Sequential Gate · รอ Owner ทดสอบก่อนงานถัดไป**

เจ้าของการตัดสินใจ: Owner AVENZO ONE

เอกสารที่เกี่ยวข้อง: `AVENZO_ONE_Phase_2.1_Product_Workspace_UI_UX_Modernization.md`

## 1. วัตถุประสงค์

เอกสารนี้เป็นแหล่งอ้างอิงหลักสำหรับการพัฒนา Product Variant, การรันรหัสขาย และ Live CF หลังจาก Owner ทดลองสร้างสินค้าจริงแล้วพบว่า:

1. Sales Code แบบรันเลขต่อเนื่องยังเป็น Preview/Browser Draft และไม่สามารถรับประกันลำดับข้าม Product จากฐานข้อมูลจริง
2. Product Variant ยังเก็บสีและไซซ์เป็นช่องตัวเลือกทั่วไป ไม่ได้เป็นข้อมูลที่ระบบเข้าใจอย่างมีโครงสร้าง
3. ระบบยังไม่สามารถตีความข้อความ Live CF เช่น `B001 สีฟ้า S` แล้ว resolve เป็น SKU เดียวได้

คู่มือนี้ใช้ป้องกันการหลงขอบเขต การเปลี่ยนความหมายของรหัสระหว่างพัฒนา และการเริ่ม UI จริงก่อน Mockup ผ่านการอนุมัติ

## 2. กฎการทำงานร่วมกัน

1. ทำงาน **ทีละ Part เท่านั้น** ห้ามเริ่มหลาย Part พร้อมกัน
2. ทุก Part ต้องพัฒนา ทดสอบ ตรวจ UI/UX และสรุปหลักฐานให้ผ่านก่อนเริ่ม Part ถัดไป
3. งานที่มี UI ใหม่ต้องทำ Mockup และให้ Owner อนุมัติก่อนนำไปใช้ในระบบจริง
4. ระบบจริงต้องยึด Approved Mockup 100% ห้ามเปลี่ยนดีไซน์หรือพฤติกรรมโดยไม่ได้รับอนุมัติ
5. Client validation เป็นเพียงผู้ช่วย; Database transaction เป็นผู้ยืนยัน Unique และผลการบันทึกขั้นสุดท้าย
6. ทุกการขาย การจอง และการตัด Stock ต้อง resolve เป็น `sku_id` ก่อนเสมอ
7. ห้ามตัด Stock จาก Product ID, ข้อความ CF, Sales Code หรือ Barcode โดยตรง
8. หลังจบแต่ละ Part ให้หยุดเพื่อ Owner ทดสอบ เว้นแต่ Owner อนุมัติล่วงหน้าให้เดินต่อ
9. Commit, Push, Deploy และ Production apply ต้องได้รับอนุมัติตามขอบเขตแยกจากการพัฒนา

## 3. คำศัพท์และความหมายของรหัส

| ชนิดรหัส | ตัวอย่าง | ขอบเขต | หน้าที่ |
|---|---|---|---|
| SKU Code | `TS-BLU-S` | Unique ภายใน Organization | รหัสถาวรภายในของ SKU แต่ละตัวเลือก |
| Sales Code / รหัส CF ประจำสินค้า | `A001` | Unique ภายใน Organization และชี้ไปยัง SKU เดียว | ค้นหา สแกน รับ CF หรือเปิดบิลแบบถาวร |
| Barcode | `8851234567890` | ตาม Identifier Contract และต้อง resolve เป็น SKU เดียว | สแกนสินค้า |
| Live Code | `B001` | Unique ภายใน Live Session หรือชุดจองรหัส | รหัสชั่วคราวที่ใช้ร่วมกับสี/ไซซ์ในรอบ Live |

ข้อห้ามสำคัญ: ห้ามใช้ `B001` เป็น Sales Code ถาวรของ SKU หลายรายการ เพราะรหัสเดียวจะ resolve ไม่ได้ว่าเป็น SKU ใด

## 4. Product Variant Contract

Product หนึ่งรายการสามารถมี Option Group ได้ เช่น:

- สี: สีฟ้า, สีดำ
- ไซซ์: S, M, L, XL

ระบบสร้าง SKU Combination จากค่าที่เปิดขายจริง เช่น:

| Product | Live Code | สี | ไซซ์ | SKU Code |
|---|---|---|---|---|
| เสื้อยืด Basic | B001 | สีฟ้า | S | `TS-BLU-S` |
| เสื้อยืด Basic | B001 | สีฟ้า | M | `TS-BLU-M` |
| เสื้อยืด Basic | B001 | สีฟ้า | L | `TS-BLU-L` |
| เสื้อยืด Basic | B001 | สีฟ้า | XL | `TS-BLU-XL` |

แต่ละ SKU Combination ต้องกำหนดหรือสืบทอดข้อมูลต่อไปนี้ได้:

- SKU Code, Sales Code และ Barcode
- ราคา ต้นทุน ภาษี และสถานะ
- รูปภาพประจำ Variant
- Base Unit และหน่วยขาย
- Stock แยกตาม SKU และสาขา
- ชื่อเรียกอื่นของ Option เช่น `ฟ้า`, `สีฟ้า`, `Blue`

สี/ไซซ์เป็น Variant Option ส่วนคู่/ชิ้น/แพ็ค/กล่องเป็นหน่วยนับหรือหน่วยขาย ห้ามนำสองแนวคิดนี้มารวมเป็นข้อมูลเดียว

## 5. Live CF Resolution Contract

ตัวอย่างข้อความลูกค้า:

```text
CF B001 สีฟ้า S
B001 ฟ้า s
B001/S/BLUE
B001 สีฟ้า S 2 ตัว
```

ลำดับการทำงานที่อนุญาต:

```text
Live Session + Live Code + Option tokens + Quantity
                         ↓
              Normalize และตรวจ Alias
                         ↓
             Resolve เป็น SKU เดียวเท่านั้น
                         ↓
                      sku_id
                         ↓
          ตรวจ Available Stock → จอง → เปิดบิล
```

หากข้อมูลไม่ครบหรือพบมากกว่าหนึ่ง SKU ระบบต้องแจ้งให้เลือก ห้ามเดา ห้ามจอง และห้ามตัด Stock

## 6. แผนพัฒนาแบบ Sequential Gate

### Part 1 — Identifier Contract Freeze

กำหนดความหมาย ขอบเขต Unique ความแก้ไขได้ และ Lifecycle ของ SKU Code, Sales Code, Barcode และ Live Code

เกณฑ์ผ่าน:

- มีตาราง Contract ครบทุก Identifier
- ระบุ Scope ของ Unique และกฎแก้ไขหลังบันทึก
- ระบุความสัมพันธ์ Identifier → SKU ID
- Owner อนุมัติ Contract ก่อนทำ Schema หรือ UI

### Part 2 — Variant UX Mockup

ออกแบบ Mockup สำหรับสินค้าปกติ, สินค้ามีตัวเลือก และ Bundle/Kit โดยเพิ่ม Option Group, Option Value และ Combination Matrix

เกณฑ์ผ่าน:

- เพิ่มสี ไซซ์ และตัวเลือกกำหนดเองได้
- สร้าง/ปิด Combination ได้
- Bulk fill SKU, ราคา, Barcode และสถานะได้
- รองรับรูปประจำ Product และ Variant
- Responsive, Light/Dark และ Keyboard ผ่าน
- Owner อนุมัติ Mockup ก่อนเชื่อมระบบจริง

### Part 3 — Variant Data Model

เพิ่ม Schema สำหรับ Option Group, Option Value, SKU Option Assignment, Alias และ Display Order โดยไม่ทำลาย Product/SKU เดิม

เกณฑ์ผ่าน:

- Migration รองรับข้อมูลเดิมและ rollback ได้
- Organization/RLS isolation ผ่าน
- Unique combination และ validation ผ่าน
- Alias มี normalization และจำกัดความยาว/จำนวน
- Database tests ผ่าน

ผลดำเนินการ: **Completed locally — 16 สิงหาคม 2026**

- Migration: `20260816103853_phase_2_1_a3_variant_data_model.sql`
- Integration test: `phase_2_1_a3_variant_data_model.sql`
- Schema lint ผ่าน โดยเหลือ warning เดิมที่ไม่เกี่ยวกับ A3 ใน sandbox payment function
- ยังไม่ Commit, Push, Deploy หรือ apply ไป Preview/Production

### Part 4 — Atomic Sales Code Allocator

เปลี่ยน Sequence จาก Preview-only เป็นการ allocate/join reservation จากฐานข้อมูลจริง

ความสามารถ:

- Prefix, Start number และ Digit count
- Preview รหัสถัดไป
- Atomic allocation ป้องกันผู้ใช้สองคนได้เลขเดียวกัน
- จองช่วง เช่น `B001–B070`
- สถานะ Available, Reserved, Used, Released/Expired
- Audit Log และ idempotency

เกณฑ์ผ่าน:

- A001 → A002 → A003 ต่อเนื่องข้าม Product
- Concurrency test ไม่เกิดรหัสซ้ำ
- Draft ไม่ยึดรหัสถาวรโดยไม่มีนโยบายหมดอายุ
- Owner ทดสอบการเพิ่มรายการต่อเนื่องผ่าน

ผลดำเนินการ: **Completed locally — 16 สิงหาคม 2026**

- Permanent Identifier Registry ปิด cross-field collision ของ SKU/Sales/Barcode
- Atomic allocation ผ่าน A001 → A002 → A003 ข้าม Product
- Reservation batch ผ่าน B001–B070 พร้อม expiry/release state
- Two-session concurrency test ผ่าน A001/A002 โดยไม่ซ้ำ
- ยังไม่ Commit, Push, Deploy หรือ apply ไป Preview/Production

### Part 5 — Unified Variant Creation

เชื่อม Approved Mockup กับ Atomic command เพื่อสร้าง Product, Variant combinations, SKU, Identifier, รูป และราคาภายใน Flow เดียว

เกณฑ์ผ่าน:

- All-or-nothing transaction หรือมี partial-failure contract ที่ Owner อนุมัติ
- Validation ชี้ช่องที่ผิดและรักษาข้อมูลที่ผู้ใช้กรอก
- สร้าง SKU หลาย Combination ได้จริง
- Duplicate identifier และ stale response ปลอดภัย
- - Audit Log ครบ

ผลดำเนินการ: **Completed locally — 16 สิงหาคม 2026**

- เชื่อม Approved Variant Builder เข้ากับฟอร์มสร้างสินค้าจริงแล้ว
- สร้าง Product, Option Groups, Option Values, SKU Variants, Identifier Registry และ Audit/Event ภายใน Atomic transaction เดียว
- รองรับรูปประจำ Variant ผ่านขั้นตอนอัปโหลดและคำสั่ง assign ที่ retry ได้
- ทดสอบ 2 กลุ่มตัวเลือก 4 ค่า รวม 4 SKU, idempotent replay, duplicate rollback และ service-role boundary ผ่าน
- UI ทดสอบ 2 กลุ่มตัวเลือกสร้าง 8 Combination, Bulk price และ Browser Draft หลัง F5 ผ่าน
- TypeScript, B5 test, R7 regression และ Production build ผ่าน
- ยังไม่เริ่ม Part 6 และยังไม่ Commit, Push หรือ Deploy

#### Part 5 Refinement — ข้อ 2–5 (Owner approved)

ดำเนินการตามลำดับและทดสอบทีละข้อแล้ว:

2. **Base Unit ร่วมระดับ Product/Variant** — เลือกครั้งเดียวในข้อมูลทั่วไปและส่งเป็นค่าร่วมของทุก SKU Combination; ไม่แสดงช่องซ้ำในแต่ละ Variant
3. **Sales Code / รหัส CF ต่อ Variant** — ทุก Combination มีช่องรหัสขายของตนเองและส่งเข้า Atomic Variant payload
4. **Sequence และ Unique validation ต่อ Variant** — รองรับ Manual, ใช้รหัสเดียวกับ SKU และเลขต่อเนื่อง; ตรวจ cross-field/local duplicate และตรวจ Permanent Identifier Registry แบบ batch ก่อนสร้าง
5. **ราคาและภาษีของ Variant** — ราคาขายกำหนดต่อ Combination; ช่องราคาสินค้าเดี่ยวถูกซ่อนในโหมด Variant; ต้นทุนและ Tax Category ใช้ร่วมเป็นค่าเริ่มต้น พร้อมสรุปช่วงราคาในฟอร์ม

Verification ล่าสุด:

- TypeScript compile ผ่าน
- B5 Variant creation 4/4 ผ่าน
- A2 Mockup 10/10 ผ่าน
- A4 Allocator 6/6 ผ่าน
- R7 Pricing regression 5/5 ผ่าน
- R7 Unified creation regression 7/7 ผ่าน
- Dev server root ตอบ HTTP 200

Stop gate: **หยุดให้ Owner ทดสอบ UI และข้อมูลจริงก่อน Commit, Push, Deploy หรือเริ่ม Part 6**

### Part 6 — Products Workspace Alignment

ขยาย Read Model, Data Grid, Search, Customize Columns และ Quick View ให้รองรับ Variant จริง

เกณฑ์ผ่าน:

- แสดงสี ไซซ์ จำนวน Variant รูป ราคา และ Stock ถูกต้อง
- ค้นจาก Product, SKU, Sales Code, Barcode และ Option Alias ได้
- Grid/Quick View ตรง Approved Mockup
- Pagination, resize, pin และ F5 persistence ไม่เสีย
- Existing Product regression ผ่าน

### Part 7 — Live Sale Reservation

นำ Mockup ชุดรหัสขายด่วนมาเชื่อมระบบจริง โดยสร้าง Live Session และผูก Live Code กับ Product/Variant

เกณฑ์ผ่าน:

- จอง `B001–B070` ได้แบบ Atomic
- กำหนดสาขา ผู้รับผิดชอบ เวลาเริ่ม/จบ และสถานะได้
- Live Code เดิมใช้ซ้ำต่าง Session ได้ตาม Contract
- ปิด/หมดอายุ Session แล้วจัดการรหัสอย่างปลอดภัย
- ทุก mapping ชี้ไปยัง SKU ที่อนุญาตเท่านั้น

### Part 8 — Deterministic Live CF Parser

พัฒนา Parser แบบกฎที่ตรวจสอบได้ก่อนใช้ AI รองรับรหัส สี ไซซ์ จำนวน ลำดับคำ และ Alias ภาษาไทย/อังกฤษ

เกณฑ์ผ่าน:

- `B001 สีฟ้า S` resolve ถูก SKU
- รองรับตัวพิมพ์ใหญ่/เล็ก ช่องว่าง comma และ slash
- ข้อมูลกำกวมต้องถาม ไม่เดา
- Unknown token และ duplicate message มีผลลัพธ์ชัดเจน
- Rate limit, input length และ abuse tests ผ่าน

### Part 9 — Reservation, Stock & Billing Integration

เชื่อม CF → SKU → Available Stock → Reservation → Invoice โดยไม่ตัด Stock ซ้ำ

เกณฑ์ผ่าน:

- ป้องกัน oversell และ race condition
- รองรับ timeout, cancel, waitlist และคืน Available Stock
- ทุก Stock command บันทึกด้วย `sku_id`
- Idempotency และ Audit Log ผ่าน
- E2E ครบทั้งสำเร็จ ไม่ครบ กำกวม สินค้าหมด และยกเลิก

### Part 10 — Migration, Rollout & E2E Gate

ตรวจความเข้ากันได้กับข้อมูลเดิม เปิดใช้แบบควบคุม และปิดงานด้วยหลักฐาน E2E

เกณฑ์ผ่าน:

- Product เดิมที่ไม่มี Variant ยังใช้งานได้
- Identifier เดิมไม่เปลี่ยนความหมายหรือเกิดรหัสซ้ำ
- Feature flag/rollback plan พร้อม
- Light/Dark, Desktop/Mobile, Keyboard และ Accessibility ผ่าน
- Owner ทดสอบ Preview ผ่านก่อน Commit/Push/Deploy ตามลำดับอนุมัติ

## 7. สิ่งที่ยังไม่รวมโดยอัตโนมัติ

งานต่อไปนี้ต้องมีแผนและการอนุมัติแยก ห้ามถือว่ารวมอยู่ใน Part 1–10:

- การเชื่อม TikTok Shop, Shopee หรือ Marketplace API จริง
- AI ตีความข้อความอิสระแทน Deterministic Parser
- การรับเงินจริงหรือเปิด Production Live
- การแก้กฎบัญชี ภาษี Invoice หรือ Payment
- การเปลี่ยนกฎ Stock Movement ที่อนุมัติแล้ว
- การ Deploy Production

## 8. Acceptance Scenarios หลัก

1. สร้าง Product เสื้อยืด สีฟ้า/ดำ และไซซ์ S/M/L/XL ได้ครบ Combination
2. เก็บ SKU A001 แล้วรายการใหม่แสดงและ allocate A002 อย่างถูกต้อง
3. ผู้ใช้สองคนขอรหัสถัดไปพร้อมกันต้องได้คนละรหัส
4. `B001 สีฟ้า S` resolve เป็น SKU เดียวและจอง Stock ถูกสาขา
5. `B001` ที่มีหลาย Variant ต้องแจ้งให้ระบุสี/ไซซ์
6. Alias `ฟ้า`, `สีฟ้า`, `Blue` ให้ผลเป็น Option Value เดียวกัน
7. สินค้าหมดต้องไม่เปิด Reservation สำเร็จ
8. ข้อความซ้ำต้องไม่จองหรือตัด Stock ซ้ำ
9. Product เดิมที่ไม่มี Variant ยังค้นหา เปิดดู และขายได้
10. ทุกคำสั่งสำคัญมี Organization scope, Permission, RLS และ Audit Log

## 9. สถานะการดำเนินงาน

| Part | สถานะ | หลักฐาน/หมายเหตุ |
|---|---|---|
| 1. Identifier Contract Freeze | Completed locally | Sequential gate passed · `AVENZO_ONE_Product_Variant_A1_Identifier_Contract_Freeze.md` |
| 2. Variant UX Mockup | Completed locally | Mockup + interaction + responsive gate passed · `AVENZO_ONE_Product_Variant_A2_Variant_UX_Mockup.md` |
| 3. Variant Data Model | Completed locally | Migration + behavior/RLS tests + rollback plan ผ่าน |
| 4. Atomic Sales Code Allocator | Completed locally | Registry + sequence/reservation + idempotency/audit + concurrency ผ่าน |
| 5. Unified Variant Creation | Completed locally | Atomic graph + Variant image recovery + UI/F5 + SQL/TS/build ผ่าน · `AVENZO_ONE_Product_Variant_B5_Unified_Variant_Creation.md` |
| 6. Products Workspace Alignment | Not started | รักษา Approved Products UI |
| 7. Live Sale Reservation | Not started | ใช้ Approved Live Sale concept |
| 8. Deterministic Live CF Parser | Not started | ไม่ใช้ AI เป็น Authority |
| 9. Reservation, Stock & Billing | Not started | ทุกคำสั่ง resolve เป็น sku_id |
| 10. Migration, Rollout & E2E | Not started | ต้องหยุดให้ Owner ทดสอบ |

## 10. Warehouse, Initial Stock & Live Commerce Integration Plan

วันที่บันทึกแนวคิด: 18 สิงหาคม 2026
สถานะ: **Initial Stock UI S1–S5, T1 Data Contract, T2 Read Integration และ T3 Application Workflow completed locally · UI ยังไม่เขียน Stock จนถึง T5**

### 10.1 สถานะระบบ Warehouse/Stock ปัจจุบัน

- โครงสร้างเป็น Organization → Branch → Warehouse → Location และยอดคงเหลืออยู่ระดับ `sku_id + location_id`
- `stock_movements` เป็น immutable source of truth; `inventory_balances` เป็น derived read model และห้าม UI แก้ Balance โดยตรง
- คำสั่งที่รองรับแล้วคือ Receive, Adjustment In/Out และ Transfer พร้อม idempotency, negative-stock denial, permission และ Audit Log
- ทุก Sales Code, CF Code หรือ Barcode ต้อง resolve เป็น `sku_id` ก่อนสร้าง Inventory Command
- `allocated` ยังเป็น generated `0` และ `available = on_hand`; จึงยังไม่มี Reservation/Allocation สำหรับ Order หรือ Live Sale ในระบบจริง
- การขายออก, การจอง, Order, Invoice และ Fulfillment stock issue ยังไม่อยู่ใน Phase 2.0.6

### 10.2 Initial Stock ตอนสร้างสินค้า

อนาคตหน้าสร้างสินค้าสามารถมีส่วน **สต็อกเริ่มต้น (ไม่บังคับ)** เพื่อให้ผู้ใช้สร้างสินค้าและตั้งยอดเริ่มต้นใน Flow เดียว แต่ต้องไม่เขียนยอดลง `inventory_balances` โดยตรง

ข้อมูลขั้นต่ำ:

- Branch, Warehouse และ Location ปลายทาง
- จำนวนเริ่มต้นแยกต่อ SKU
- วันที่รับเข้า, ต้นทุนต่อหน่วย และหมายเหตุ/เหตุผล เช่น `opening_balance`

การบันทึกต้องเป็น transaction/application workflow ที่สร้าง Product/SKU ก่อน แล้ว post Inventory Command แบบ idempotent ต่อ SKU/Location หากส่วน Stock ล้มเหลวต้องใช้ all-or-nothing หรือ recovery contract ที่ Owner อนุมัติ ห้ามเหลือ Balance ที่ไม่มี Movement

### 10.3 หลักการเชื่อม Live Sale กับ Warehouse

การเลือกสินค้าเข้ารอบ Live เป็นการสร้าง **Live Catalog/Session Mapping** เท่านั้น ไม่ตัด `on_hand` ล่วงหน้าโดยอัตโนมัติ

ค่าที่ Live Session ต้องกำหนด:

- Branch และ Fulfillment Warehouse หลักของรอบ Live
- Location ที่ใช้หยิบ/แพ็ก หรือกติกาเลือก Location
- Product/SKU ที่อนุญาตให้ขาย, Live Code, ราคา Live และเพดานจำนวนขาย
- เวลาเริ่ม/จบ, ผู้รับผิดชอบ และช่องทาง เช่น Facebook

ถ้าร้านนำสินค้าจากหลายจุดมาวางรวมกันจริง ให้ใช้ Transfer ไปยัง **Live Staging Location** ก่อนเริ่ม Live; นี่เป็นการย้ายสถานที่เก็บ ไม่ใช่การขายออก

### 10.4 จังหวะ Stock ที่อนุญาต

```text
เลือกสินค้าก่อนไลฟ์
  → ยังไม่ตัด Stock; สร้าง Live Catalog/Quota
Facebook Comment / Manual CF
  → Parse Live Code + ตัวเลือก
  → Resolve เป็น SKU เดียว
  → ตรวจ Available ใน Fulfillment Location
  → สร้าง Reservation แบบ Atomic พร้อม TTL
  → allocated เพิ่ม, available ลด, on_hand ยังเท่าเดิม
เปิด Order/Invoice
  → ผูก Reservation เดิมกับ Order; ห้ามจองซ้ำ
ยืนยันหยิบ/แพ็กหรือ Fulfillment milestone ที่กำหนด
  → สร้าง sale_issue Stock Movement ลด on_hand และปิด Reservation
หมดเวลา/ยกเลิก/ชำระไม่สำเร็จ
  → Release Reservation; allocated ลด โดยไม่สร้าง Movement ขายออก
```

หลักสำคัญ: ห้ามตัดสต็อก Organization กลางโดยไม่ระบุ Location และห้ามลด `on_hand` ทั้งก้อนตั้งแต่เลือกสินค้าเข้ารอบ Live เพราะสินค้ายังไม่ได้ขายจริง

### 10.5 แผนพัฒนาแบบ Sequential Gate

1. **W1 — Warehouse UX & Current Flow Audit**: ทดสอบ Warehouse, Location, Receive, Adjust, Transfer, Balance และ Ledger ของระบบจริง พร้อมปรับคำที่ผู้ใช้เข้าใจยากโดยไม่เปลี่ยน Ledger contract
2. **W2 — Initial Stock at Product Creation**: UI S1–S5, T1 Data Contract, T2 Read Integration/Lazy Loading และ T3 Application Workflow ผ่านแล้ว; ขั้นถัดไป T4 Database/Security Tests → T5 UI/E2E Gate
3. **W3 — Reservation Data Contract**: เพิ่ม Reservation/Allocation/TTL/Release และปรับ `allocated`/`available` ให้เป็น read model จริง พร้อม concurrency และ oversell tests
4. **W4 — Live Session Inventory Scope**: เลือก Fulfillment Warehouse/Location, Live Catalog, SKU quota และ optional Live Staging Location โดยยังไม่เชื่อม Facebook
5. **W5 — Facebook Live CF → Order**: Webhook inbox → deterministic parser → SKU resolver → Reservation → Customer/Order/Invoice พร้อม idempotency และ ambiguous-message handling
6. **W6 — Fulfillment Stock Issue & E2E**: Pick/Pack/Ship หรือ milestone ที่ Owner อนุมัติ → `sale_issue` movement; cancel/timeout คืน Reservation; reconciliation ระหว่าง Order, Reservation, Balance และ Ledger

ทุก Gate ต้องทำทีละข้อ ทดสอบก่อนข้อต่อไป และงาน UI ต้องผ่าน Approved Mockup/Design System ก่อนเชื่อมระบบจริง

### 10.6 Phase U — Product Lifecycle, Archive, Trash & Retention

สถานะ: **Planned — เริ่มหลัง Phase T (T1–T5 Initial Stock Integration) ผ่านและ Owner ปิด Gate แล้วเท่านั้น**

เป้าหมายคือให้ผู้ใช้นำสินค้าที่ไม่ใช้แล้วออกจากตารางปกติได้ โดยรักษาประวัติ Order, Invoice, Live Sale, Stock Movement และ Audit Log ให้ถูกต้อง พร้อมควบคุมปริมาณข้อมูลระยะยาว

Lifecycle ที่เสนอ:

```text
Draft / Active
  → Archive: ซ่อนจากงานขายใหม่ แต่ดูประวัติและนำกลับมาใช้ได้ตาม Contract
  → Trash: soft delete ด้วย deleted_at/deleted_by และกู้คืนได้ภายใน Retention Window
  → Permanent Delete: ทำได้หลังตรวจ Blocker และ Retention Policy เท่านั้น
```

กติกาหลัก:

- Product/SKU ที่มี Order, Invoice, Live Sale, Stock Movement, Balance, Reservation, Bundle reference หรือ Audit history ห้าม hard delete
- Archive/Trash ต้องไม่ลบหรือเปลี่ยนความหมายของ Ledger และเอกสารย้อนหลัง
- SKU Code, Sales Code/CF และ Barcode ที่เคยใช้ยังถูกสงวนไว้; Archive/Trash ไม่คืนรหัสให้ Sequence
- ลบถาวรได้เฉพาะรายการที่ไม่เคยถูกใช้งานและไม่มี Foreign-key/Business blocker หลังผ่าน permission และ confirmation gate
- รูปภาพของรายการ Trash จัดการตาม Retention Policy แยกจากข้อมูลอ้างอิง; ห้ามลบไฟล์ที่เอกสารหรือประวัติยังต้องใช้
- ตารางรายการปกติต้องกรองเฉพาะข้อมูลที่ใช้งาน, ใช้ server-side pagination และ index ตาม `organization_id + lifecycle/status + deleted_at`; ห้ามโหลดข้อมูลทั้งหมดเพื่อกรองใน Browser
- ต้องมีการวัด Query plan/latency และทดสอบข้อมูลปริมาณมากก่อนเปิดใช้การ purge อัตโนมัติ

แผนพัฒนาแบบ Sequential Gate:

1. **U1 — Lifecycle & Retention Contract Freeze:** ล็อกสถานะ, transition, restore, retention window, blocker, code reservation และ permission/audit contract
2. **U2 — Approved UI/UX Mockup:** ออกแบบ Archive, Trash, Restore, Permanent Delete, blocker explanation และ bulk action ตาม Design System ก่อนแตะระบบข้อมูล
3. **U3 — Database & Application Workflow:** เพิ่ม `deleted_at/deleted_by`, index, tenant-safe commands, optimistic concurrency และ audit โดยไม่แก้หรือลบ Ledger history
4. **U4 — Retention & Storage Cleanup:** ทำ eligible-item scanner, dry run, image cleanup policy และ privileged purge workflow; ค่าเริ่มต้นเสนอ Trash 90 วัน แต่ต้องให้ Owner อนุมัติก่อนใช้จริง
5. **U5 — Security, Performance & E2E Gate:** ทดสอบ RLS/permission, restore, blockers, code uniqueness, pagination/query plan, large dataset และ recovery ก่อน Deploy

Stop Gate: Phase U เป็นแผนอนาคตเท่านั้น ห้ามเริ่ม Migration, purge job หรือเปลี่ยนพฤติกรรมลบสินค้า จนกว่า Phase T จะเสร็จและ Owner อนุมัติ U1

## 11. Decision Log

| วันที่ | การตัดสินใจ |
|---|---|
| 16 ส.ค. 2026 | แยก SKU Code, Sales Code ถาวร และ Live Code ออกจากกัน |
| 16 ส.ค. 2026 | สีและไซซ์ต้องเป็น Structured Variant Option ไม่เก็บเฉพาะในชื่อสินค้า |
| 16 ส.ค. 2026 | ข้อความ Live CF ต้อง resolve เป็น SKU ID เดียวก่อนจอง เปิดบิล หรือตัด Stock |
| 16 ส.ค. 2026 | ทำ Mockup ก่อนระบบจริง และพัฒนาทีละ Part พร้อม Stop Gate |
| 16 ส.ค. 2026 | Variant ใช้ Base Unit ร่วม, Sales Code/CF และราคาขายต่อ Combination; Tax Category/ต้นทุนเป็นค่าร่วมเริ่มต้น |
| 18 ส.ค. 2026 | Initial Stock ในหน้าสร้างสินค้าเป็น Optional UX แต่ต้องสร้าง Inventory Movement ต่อ SKU/Location ห้ามแก้ Balance โดยตรง |
| 18 ส.ค. 2026 | เลือกสินค้าเข้ารอบ Live ไม่ลด on_hand; CF ต้องสร้าง Reservation ก่อน และขายออกเมื่อถึง Fulfillment milestone ที่อนุมัติ |
| 18 ส.ค. 2026 | Live Session ระยะแรกใช้ Fulfillment Warehouse/Location ที่ชัดเจน ไม่ตัด Stock กลางระดับ Organization |
| 18 ส.ค. 2026 | T1 ล็อก Initial Stock เป็น recoverable two-stage workflow: สร้าง/activate Product+SKU ก่อน แล้วใช้ idempotent `receive` ต่อ SKU/Location; draft ไม่ post stock, Virtual Bundle ไม่รับยอด และ Preassembled Bundle รอ Assembly contract |
| 18 ส.ค. 2026 | T2 เชื่อม Warehouse/Location แบบ read-only lazy loading หลังเปิด switch พร้อม session, membership, warehouse.read, inventory.receive, RLS และ cascading selection; ยังไม่มี Stock write |
| 18 ส.ค. 2026 | หลังจบ Phase T ให้ทำ Phase U Product Lifecycle: Archive → Trash → Permanent Delete แบบมี Retention/Blocker; ประวัติ Ledger/Order/Invoice/Live และรหัสที่เคยใช้ต้องไม่หายหรือถูกนำกลับมาใช้ซ้ำ |
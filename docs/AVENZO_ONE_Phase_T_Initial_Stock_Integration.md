# AVENZO ONE — Phase T: Initial Stock Integration

**สถานะ:** Approved Planning Contract  
**วันที่:** 20 สิงหาคม 2026  
**PM Amendment:** 21 สิงหาคม 2026 — Batch cardinality เป็น 1–100 Items
**ขอบเขต:** Product/SKU creation → Initial Stock → Warehouse/Location → Inventory Movement  
**Implementation Status:** T5.3 PREVIEW Approved/Closed เมื่อ 21 สิงหาคม 2026; T4.2C–T4.4B และ SKU-04 Corrective Migration Apply บน AVENZO ONE PREVIEW แล้ว
**ข้อจำกัดปัจจุบัน:** เอกสารนี้ยังเป็น Source of Truth; การอนุมัติ T5.3 ครอบคลุม PREVIEW เท่านั้น ห้าม Apply Production หรือ Deploy จนกว่าจะได้รับอนุมัติแยกต่างหาก

## 1. เป้าหมาย

ให้การสร้างสินค้าและการรับสต็อกเริ่มต้นมีลำดับที่ตรวจสอบได้ โดย Balance ต้องเกิดจาก Inventory Movement ต่อ SKU และ Location ไม่แก้ยอดคงเหลือโดยตรง รองรับการสร้างสินค้าแบบ SKU เดี่ยวและหลาย SKU Combination

## 2. หลักการที่ห้ามเปลี่ยน

- SKU เป็นตัวตนของสินค้าที่ใช้ใน Stock และ Order
- จำนวนสต็อกต้องผูกกับ sku_id และ location_id
- Available ต้องคำนวณจาก On hand - Reserved - Committed
- Draft Product ห้ามเพิ่ม Stock
- การรับสต็อกต้องสร้าง Movement ที่ตรวจสอบย้อนหลังได้
- ทุก Mutation ต้องผ่าน Organization scope, Permission และ RLS
- คำสั่งซ้ำต้องไม่เพิ่มสต็อกซ้ำ
- หาก Batch เดียวมีรายการผิด ต้อง Rollback ทั้ง Batch
- ห้ามใช้ Client เป็น Authority ในการคำนวณยอดคงเหลือ

## 3. ลำดับ Phase T

### T1 — Initial Stock Contract

ล็อกสัญญาการรับสต็อกเริ่มต้นต่อ SKU/Location

- สร้างหรือ Activate Product/SKU ก่อน
- Draft ไม่ Post Stock
- ใช้ Idempotent receive ต่อ SKU/Location
- ต้องบันทึกผู้ทำรายการ เวลา เหตุผล และ Reference
- Virtual Bundle ห้ามรับยอดโดยตรง
- Preassembled Bundle ต้องรอ Assembly Contract

### T2 — Warehouse/Location Selection

เชื่อม Warehouse และ Location แบบ Permission-aware

- โหลดข้อมูลแบบ Lazy หลังผู้ใช้เปิดส่วน Warehouse/Stock
- ตรวจ Organization membership และสิทธิ์ warehouse.read/inventory.receive
- เลือก Warehouse ก่อน Location
- เปลี่ยน Warehouse ต้องล้าง Location ที่ไม่เกี่ยวข้อง
- ไม่มี Stock write หากยังไม่เลือก Location ที่ถูกต้อง
- RLS ต้องบังคับ tenant isolation

### T3 — Initial Stock Workflow

กำหนดพฤติกรรมการกรอกและยืนยัน Stock เริ่มต้น

- รองรับ SKU เดี่ยวและหลาย SKU Combination
- แสดงจำนวนต่อ SKU อย่างชัดเจน
- ตรวจจำนวนเป็นเลขไม่ติดลบและอยู่ในขอบเขตที่กำหนด
- แสดง Preview ก่อนยืนยัน
- บันทึกเป็น Inventory Movement ประเภท initial_receive
- สำเร็จแล้วแสดงผลต่อ SKU และ Location
- Refresh หรือ Retry ต้องไม่สร้าง Movement ซ้ำ

### T4 — Multi-SKU Combination Batch Receive

รองรับการรับสต็อกหลาย SKU ในคำสั่งเดียว โดยจำนวนแยกตาม sku_id

#### Input Contract

แต่ละรายการต้องมี:

- sku_id
- location_id
- quantity
- unit/base_unit
- client_request_id หรือ idempotency_key
- reference และ reason ตาม Policy

#### Transaction Contract

- รับรายการทั้งหมดใน Batch Command เดียว
- ตรวจ Organization, SKU, Location, Permission และจำนวนก่อนเขียน
- หาก SKU ใดไม่ถูกต้อง ให้ Rollback ทั้ง Transaction
- ห้ามเกิด Partial Success
- สร้าง Inventory Movement แยกต่อ sku_id แต่ Commit พร้อมกัน
- Balance ต้องเปลี่ยนจาก Movement ที่สำเร็จเท่านั้น

#### Duplicate Protection

- idempotency_key เดิมต้องคืนผลลัพธ์เดิมและห้ามเพิ่มสต็อกซ้ำ
- ต้องมี Unique Constraint หรือเทียบเท่าบนคำสั่งรับสต็อก
- ป้องกันการส่งคำสั่งซ้ำจาก Double-click, Retry, Refresh และ Network timeout
- การตรวจ SKU Code ซ้ำต้องปฏิเสธก่อนเริ่มเขียน

#### Error Contract

ต้องแจ้งรายการที่ผิดโดยไม่เปิดเผยข้อมูลข้าม Organization:

- SKU ไม่พบหรือไม่อยู่ใน Organization
- Location ไม่พบหรือไม่มีสิทธิ์
- จำนวนไม่ถูกต้อง
- Unit ไม่ตรงกับ SKU
- คำสั่งซ้ำ
- Conflict จากการเขียนพร้อมกัน

เมื่อมี Error ต้องไม่มีรายการใดใน Batch ถูกเพิ่ม Stock

## 4. Acceptance Criteria ของ Phase T

### T1

- รับ Initial Stock ต่อ SKU/Location ได้
- Draft ไม่สร้าง Movement
- Movement มี Audit และ Reference

### T2

- เลือก Warehouse/Location ได้ตามสิทธิ์
- ข้อมูลข้าม Organization เข้าถึงไม่ได้
- ไม่มีการเขียน Stock ก่อนเลือก Location

### T3

- Preview ตรงกับรายการที่จะบันทึก
- Refresh/Retry ไม่เพิ่มยอดซ้ำ
- แสดงผลสำเร็จและล้มเหลวอย่างตรวจสอบได้

### T4

- รับ 1–N SKU Combination พร้อมจำนวนแยกตาม sku_id ได้ เพื่อให้ Product ปกติ
  1 SKU และ Product แบบ Variant หลาย SKU ใช้ Atomic Receive RPC เดียวกัน
- SKU ทุกตัวถูกต้อง: Commit Movement ครบทุกตัว
- SKU ใดผิด: Rollback ทั้ง Batch
- ส่ง idempotency_key เดิมซ้ำ: ยอดไม่เพิ่มซ้ำ
- ส่งสองคำสั่งพร้อมกัน: ไม่ทำให้ยอดเกินจริง
- ตรวจรหัส SKU ซ้ำและ Constraint ผ่าน
- Unit, Permission, RLS และ Audit Test ผ่าน
- TypeScript, Unit Test, Integration Test และ E2E Test ผ่าน

## 5. Test Matrix ขั้นต่ำ

1. SKU เดี่ยว จำนวนถูกต้อง
2. หลาย SKU จำนวนต่างกัน
3. SKU หนึ่งรายการไม่พบ
4. Location ไม่มีสิทธิ์
5. จำนวนติดลบ/ทศนิยมไม่ถูกต้อง
6. Unit ไม่ตรง
7. Duplicate idempotency_key
8. Double-click/Retry
9. Concurrent Batch
10. Organization isolation
11. Rollback ตรวจว่าไม่มี Movement บางส่วน
12. Audit และ Error response

## 6. ลำดับการส่งมอบ

ทำทีละ Part และหยุดให้ Owner ตรวจ:

1. T1 Contract และ Test
2. T2 Warehouse/Location
3. T3 Initial Stock Workflow
4. T4 Multi-SKU Batch Transaction
5. Final E2E และ Security Review

### 6.1 T5.1 Integration Handoff

T5.1 ต้องเชื่อม Product Creation UI กับ T4.4B atomic RPC โดยไม่เปลี่ยนหลักการที่ล็อกไว้:

- สร้าง Product/SKU แบบ Draft ให้ครบ จากนั้น Activate SKU ทั้งหมดและ Activate Product ก่อนรับ Initial Stock
- รับ SKU เดี่ยวหรือหลาย SKU ผ่าน `public.server_receive_inventory_batch` เพียงครั้งเดียวต่อ Logical Batch
- ความเป็น Atomic ครอบคลุม Batch Receive transaction ทั้ง Batch; หากรายการใดผิดต้องไม่มี Header, Item, Command, Movement, Event หรือ Balance บางส่วน
- Product/SKU creation และ activation เป็น transaction ก่อนหน้า จึงต้องมี recoverable workflow state หาก receive ล้มเหลว โดย retry receive ด้วย idempotency key และ payload เดิม
- Browser ห้ามเรียก RPC หรือเขียน Ledger/Balance โดยตรง; trusted Server Boundary ต้อง derive actor จาก authenticated session
- ห้ามนำ Rapid Entry, Live Sale, Bundle assembly หรือการเปลี่ยน UI Design เข้ามาใน T5.1

## 7. Stop Gates

ห้ามเริ่ม Part ถัดไปหาก:

- Contract ยังไม่ผ่านการ Review
- มี Partial Success
- Idempotency ยังป้องกันคำสั่งซ้ำไม่ได้
- RLS หรือ Permission ยังไม่ผ่าน
- Test Matrix ยังไม่ครบ
- ผลลัพธ์ UI/Server/Database ไม่ตรงกัน

Source of Truth: เอกสารนี้ใช้ร่วมกับ AVENZO_ONE_Codex_Implementation_Starter_Plan_V7.md, AVENZO_ONE_Product_Variant_Sales_Code_and_Live_CF_Development_Guide_V1.md และ Supabase Schema/Migration ที่ได้รับอนุมัติเท่านั้น

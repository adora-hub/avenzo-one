# AVENZO ONE — Product Variant A4 Atomic Sales Code Allocator

สถานะ: Implemented locally and covered by database/concurrency tests

## ผลลัพธ์

Part A4 ย้าย Sales Code sequence จาก Browser Preview มาให้ PostgreSQL เป็น Authority จริง และเพิ่ม Permanent Identifier Registry เพื่อให้ข้อความรหัสหนึ่งค่า resolve ไปยัง `sku_id` เดียวเสมอ

## ส่วนประกอบ

- `sku_identifier_registry` — lookup ปัจจุบันของ SKU Code, Sales Code และ Barcode แบบ Organization-scoped
- `sku_identifier_bindings` — ประวัติการ bind/release identifier โดยรักษาค่า Barcode เดิมสำหรับ Audit
- `sales_code_sequences` — Prefix, Start, Next number, Digit count และ Purpose
- `sales_code_reservation_batches` — ช่วงรหัส 1–400 รายการ พร้อมวันหมดอายุไม่เกิน 7 วัน
- `sales_code_reservations` — รหัสแต่ละตัวและสถานะ Reserved/Assigned/Released/Expired
- `sales_code_allocator_commands` และ `sales_code_allocator_events` — idempotency, event evidence และ audit source

## พฤติกรรมสำคัญ

1. Preview แสดงรหัสถัดไปแต่ไม่ถือสิทธิ์ในรหัส
2. การ Allocate ล็อก sequence row ด้วย `FOR UPDATE` ใน transaction สั้นๆ
3. Concurrent callers ได้คนละเลข ไม่มี A001 ซ้ำ
4. Permanent allocation ข้าม Product ต่อเนื่อง A001 → A002 → A003
5. Manual identifier ที่มีอยู่ถูกข้าม ไม่เลือกผู้ชนะเมื่อเกิด cross-field collision
6. Sales Code กำหนดได้ครั้งเดียว ส่วน Barcode ของ SKU ที่ยังไม่ archived เปลี่ยนและ release ค่าเดิมได้
7. รหัสชุด เช่น B001–B070 มี expiry; Draft ที่ไม่ได้ assign ไม่กลายเป็น Sales Code ถาวร
8. Resolver คืน `sku_id` ก่อนเสมอ และไม่ส่งข้อความรหัสเข้า Stock Movement โดยตรง

## Concurrency verification

Test สร้างฐานข้อมูล scratch จาก schema local แล้วเปิด PostgreSQL สอง session พร้อมกันให้ allocate จาก sequence เดียวกัน ผลที่ยอมรับได้ต้องเป็น `A001,A002`, `next_number = 3` และมี assigned event สองรายการ จากนั้น test ลบเฉพาะฐานข้อมูล scratch ทิ้ง

## Security

- Trusted functions เป็น `SECURITY DEFINER`, กำหนด `search_path = ''`, รับ actor/organization ชัดเจน และตรวจ `product.manage`/`product.read`
- Execute ถูก revoke จาก `public`, `anon`, `authenticated`; อนุญาตเฉพาะ `service_role`
- ตารางเปิด RLS และผู้ใช้ `authenticated` อ่านได้เฉพาะ Organization ที่มี `product.read`
- ผู้ใช้ทั่วไปเขียน sequence, reservation, registry หรือ command table ตรงๆ ไม่ได้

## Rollback plan

1. ปิด allocator/identifier writes และรอ transaction ที่กำลังทำงานให้จบ
2. สำรองและตรวจข้อมูลจริงก่อน rollback: sequence, batch, reservation, registry, binding, command, event และ audit reference
3. เปลี่ยน read path กลับไปใช้ `skus` เฉพาะเมื่อยืนยันว่าไม่มี cross-field ambiguity
4. ถอด RLS policies, service functions และ SKU registry trigger
5. ลบตารางจากลูกไปหาแม่: events → commands → reservations → batches → sequences → bindings → registry
6. คืน lifecycle trigger เวอร์ชันก่อน A4 เฉพาะเมื่อยอมรับว่าจะไม่มี permanent Sales Code guard
7. รัน Product/SKU, Identifier และ Stock resolver regression ทั้งหมด

ห้าม rollback Preview/Production โดยไม่ export mapping `identifier → sku_id` และอนุมัติ maintenance window

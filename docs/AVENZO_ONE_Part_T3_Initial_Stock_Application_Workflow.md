# AVENZO ONE — Part T3 Initial Stock Application Workflow

วันที่ดำเนินการ: 18 สิงหาคม 2026  
สถานะ: **Completed locally — Application workflow only**  
ขอบเขต: เพิ่ม workflow ฝั่ง Application สำหรับเปิดใช้งาน Product/SKU และรับสต็อกเริ่มต้นผ่าน Inventory Command เดิม โดยยังไม่เชื่อมปุ่มสร้างสินค้าใน UI จนถึง T5

## 1. ลำดับที่ใช้

```text
Product created as draft
  → product.activate
  → sku.activate ต่อ SKU
  → receive ต่อ SKU/Location เมื่อ quantity > 0
  → รายงาน completed / partial / failed ราย SKU
```

- ใช้ `server_execute_foundation_command` สำหรับ `product.activate` และ `sku.activate`
- ใช้ `server_post_inventory_command` ด้วย `command_type = receive`
- ใช้ `reason_code = opening_balance`
- ไม่ insert/update `inventory_balances` หรือ `stock_movements` จาก Browser/Application โดยตรง

## 2. Idempotency และ Recovery

- Product activation, SKU activation และ receive มี UUID command ID แยกกัน
- Retry ต้องส่ง command ID และ payload เดิม
- SKU ที่สำเร็จแล้วไม่ถูกย้อนหรือลบเมื่อ SKU อื่นล้มเหลว
- ผลลัพธ์ `partial` ระบุรายการที่ล้มในขั้น `sku_activation` หรือ `inventory_receive`
- Retry สามารถส่งเฉพาะรายการที่ยังไม่ completed โดยใช้ receive command ID เดิม

## 3. Validation และ Security Boundary

- ตรวจ UUID, optimistic version, จำนวนมากกว่า 0, precision ไม่เกิน 6 ตำแหน่ง และ batch ไม่เกิน 100 SKU
- ไม่รับ SKU ซ้ำหรือ receive command ID ซ้ำใน workflow เดียว
- Server Action เรียก authenticated Foundation command boundary เดิม
- Organization membership, `product.manage`, `inventory.receive` และ Branch scope ถูกตรวจตามคำสั่งจริง
- Location/Branch authority resolve ใน Repository/Database ไม่เชื่อค่าจาก Browser
- Service-role key ไม่ถูกส่งไป Client

## 4. ไฟล์สำคัญ

- `web/src/lib/foundation/initial-stock-workflow.ts`
- `web/src/app/actions/foundation.ts`
- `web/scripts/test-products-initial-stock-t3-workflow.mjs`

## 5. Verification

- T3 workflow: 4/4
- T2 read integration: 4/4
- Foundation application boundary: 3/3
- Inventory UI regression: 16/16
- Unified creation regression: 7/7
- TypeScript: ผ่าน

## 6. Stop Gate

T3 ยังไม่เชื่อม UI submit และยังไม่สร้าง Stock จากหน้าสร้างสินค้า จึงไม่มีผลต่อข้อมูลจริงในขั้นนี้

ขั้นถัดไปเมื่อ Owner อนุมัติ:

1. **T4 — Database & Security Tests:** tenant, permission, retry, concurrency และ ledger invariants
2. **T5 — UI Integration & E2E Gate:** เก็บ command IDs/version ใน recovery state, เรียก T3 หลังรูปสำเร็จ และแสดงสถานะราย SKU
3. **หลังปิด Phase T เท่านั้น — Phase U Product Lifecycle, Archive, Trash & Retention:** เริ่มจาก U1 Contract Freeze ตามคู่มือหลัก; ยังไม่เปลี่ยนพฤติกรรมลบสินค้าใน T3–T5

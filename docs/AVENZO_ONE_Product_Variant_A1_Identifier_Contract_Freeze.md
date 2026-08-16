# AVENZO ONE — Product Variant A1 Identifier Contract Freeze

วันที่: 16 สิงหาคม 2026

สถานะ: **Completed locally / Sequential gate passed**

ขอบเขต: Contract และ verification เท่านั้น ไม่มี Migration, UI/TSX, Database write, Supabase apply, Commit, Push หรือ Deploy

## 1. Outcome

Part A1 ล็อกความหมายและ Lifecycle ของรหัสที่เกี่ยวข้องกับ Product, SKU และ Live Sale ก่อนออกแบบ Variant Schema หรือแก้ UI เพื่อให้ทุกช่องทางค้นหา สแกน รับ CF จองสินค้า เปิดบิล และตัด Stock resolve ไปยัง `sku_id` เดียวกันเสมอ

## 2. Identifier Contract

| Identifier | Authority ปัจจุบัน/อนาคต | Required | Normalization | Unique scope | Mutable | Reuse |
|---|---|---:|---|---|---|---|
| SKU Code | `public.skus.sku_code` | ใช่ | `upper(btrim(value))` | `(organization_id, sku_code)` | ห้ามแก้หลัง Insert | ห้ามนำกลับมาใช้ แม้ SKU ถูกเก็บถาวร |
| Sales Code / รหัส CF ประจำสินค้า | `public.skus.sales_code` และ Part A4 registry | ไม่ | `upper(btrim(value))` | `(organization_id, sales_code)` | กำหนดได้หนึ่งครั้งเมื่อเดิมเป็น `null`; หลังจากนั้นห้ามเปลี่ยนหรือลบ | ห้ามนำกลับมาใช้ แม้ SKU ถูกเก็บถาวร |
| Barcode | `public.skus.barcode` และ Part A4 registry | ไม่ | `btrim(value)` และรักษาค่าจากผู้ผลิต | `(organization_id, barcode)` | เปลี่ยน/ลบได้เฉพาะ SKU ที่ยังไม่ archived ผ่าน trusted command พร้อม Audit | รหัสเก่ากลับมาใช้ได้หลัง Atomic update สำเร็จและไม่มี Identifier history policy อื่นห้ามไว้ |
| Live Code | Part A4 reservation; Part 7 Live Session assignment | ตามรายการ Live | `upper(btrim(value))` | `(organization_id, live_session_id, live_code)` | แก้ช่วงรหัสไม่ได้หลัง Session เปิด; เปลี่ยน mapping ต้องผ่าน command/version guard | ใช้ซ้ำได้คนละ Live Session เท่านั้น |

คำอธิบายสำหรับผู้ใช้:

- **รหัสสินค้า (SKU)** คือรหัสถาวรภายในของสินค้าแต่ละตัวเลือก
- **รหัสขาย / รหัส CF ประจำสินค้า** คือรหัสสั้นถาวรที่ค้นหาและรับ CF ได้ โดยรหัสหนึ่งชี้ SKU เดียว
- **Barcode / รหัสสแกน** คือรหัสจากผู้ผลิตหรือรหัสภายในที่เครื่องสแกนใช้
- **รหัสไลฟ์** คือรหัสชั่วคราวของรอบ Live เช่น `B001` และอาจต้องใช้ร่วมกับสี/ไซซ์เพื่อระบุ SKU

## 3. Global Resolution Invariant

ภายใน Organization เดียวกัน ข้อความรหัสถาวรเดียวกันห้ามชี้ไปยัง SKU คนละรายการ แม้จะอยู่คนละคอลัมน์

อนุญาต:

```text
SKU 1: sku_code = TS-BLU-S, sales_code = A001, barcode = A001
```

เพราะ `A001` ทุกตำแหน่งชี้ SKU 1 เดียวกัน

ห้าม:

```text
SKU 1: sales_code = A001
SKU 2: barcode    = A001
```

เพราะการค้นหา/สแกน `A001` จะกำกวมและอาจตัด Stock ผิด SKU

Part A1 ยืนยันว่า Unique indexes ปัจจุบันของ `public.skus` ป้องกันการซ้ำภายในคอลัมน์แล้ว แต่ยังไม่ป้องกัน Cross-field collision ข้าม `sku_code`, `sales_code` และ `barcode` ช่องว่างนี้ต้องปิดใน Part A4 ด้วย Permanent Identifier Registry และ Atomic command หลังตรวจข้อมูลเดิมก่อน Migration

## 4. Lifecycle Rules

### 4.1 SKU Code

1. Server สร้างหรือรับค่าตอนสร้าง SKU
2. Normalize ก่อนตรวจ Unique
3. หลัง Insert ถือเป็น Immutable identity
4. Archive ไม่ลบ row และไม่คืนรหัส
5. หากพิมพ์ผิด ให้สร้าง SKU ใหม่และย้ายกระบวนการทางธุรกิจด้วย command ที่อนุมัติในอนาคต ห้ามแก้ตรง

หมายเหตุ: Foundation command ปัจจุบันไม่เปิดให้แก้ `sku_code`; Part A3 ต้องเพิ่ม Database guard ให้ชัดเจนเพื่อป้องกัน privileged/direct write ที่ผิด Contract

### 4.2 Sales Code

1. เป็น Optional จนกว่าจะใช้ขาย/รับ CF
2. กำหนด Manual, Same-as-SKU หรือ Sequence ได้
3. หากเดิมเป็น `null` สามารถกำหนดได้หนึ่งครั้งผ่าน trusted command
4. เมื่อมีค่าแล้ว Trigger ปัจจุบันบังคับ Permanent
5. Draft UI เป็นเพียง Preview; Part A4 Database allocator เป็น Authority ของเลขจริง
6. Archive ไม่คืนรหัส และห้าม Sequence เลือกรหัสที่เคยใช้

### 4.3 Barcode

1. Manufacturer barcode รักษารูปแบบหลัง Trim และไม่บังคับ Uppercase
2. Internal barcode อาจใช้ค่าเดียวกับ SKU Code หรือ Sales Code ได้ เมื่อชี้ SKU เดียวกัน
3. การแก้ Barcode ต้องตรวจ Cross-field collision และบันทึก Audit
4. Archived SKU ห้ามแก้ Barcode

### 4.4 Live Code

1. ไม่ใช่ Permanent Sales Code และไม่อยู่ใน `public.skus.sales_code`
2. Unique เฉพาะ Organization + Live Session
3. รหัสเดียวอาจแทน Product listing ที่มีหลาย SKU ได้
4. หาก Listing มี SKU เดียว `B001` สามารถ resolve ได้ทันที
5. หาก Listing มีหลาย SKU ต้องใช้ Option tokens เช่น `B001 สีฟ้า S` จนเหลือ SKU เดียว
6. Session ต่างกันใช้ `B001` ซ้ำได้ แต่ Session เดียวกันห้ามชนกัน
7. Part A4 จองช่วงรหัสได้ก่อน ส่วนการผูกกับ Live Session จริงอยู่ใน Part 7

## 5. Resolution Precedence

### Permanent identifier lookup

1. Normalize input ตามชนิดรหัสที่ค้นหา
2. ค้นผ่าน Permanent Identifier Registry ภายใต้ `organization_id`
3. ต้องได้ `sku_id` เดียว
4. หากไม่พบ ให้คืน `identifier_not_found`
5. หากข้อมูลเดิมกำกวม ให้คืน `identifier_ambiguous` และห้าม Stock/Billing command

ไม่ใช้ลำดับความสำคัญแบบ SKU Code ชนะ Sales Code หรือ Barcode ชนะ SKU Code เพราะจะซ่อนข้อมูลชนและทำให้ผลขึ้นกับช่องทางที่เรียก

### Live lookup

1. ต้องมี `organization_id` และ `live_session_id`
2. Resolve `live_code` เป็น Live listing
3. Normalize Option aliases ภายใน Listing
4. ต้องเหลือ `sku_id` เดียว
5. หาก Option ไม่ครบหรือกำกวม ให้คืน `live_option_required` หรือ `live_identifier_ambiguous`

## 6. Sequence และ Reservation Contract สำหรับ Part A4

Part A4 ต้องแยกสามแนวคิด:

- **Sequence definition:** Prefix, Start number, Digit count, Next candidate และ Purpose
- **Reservation batch:** ช่วงเลขที่จอง ผู้จอง เวลาเริ่ม/หมดอายุ และสถานะ
- **Permanent assignment:** การยืนยันรหัสถาวรให้ SKU ภายใน transaction เดียวกับการสร้าง/แก้ SKU

สถานะขั้นต่ำ:

```text
available → reserved → assigned
                    ↘ expired/released
```

กฎ:

1. `next candidate` ไม่ใช่การรับประกันจนกว่า Database transaction จะ allocate
2. Draft ไม่ถือรหัสถาวรโดยไม่มี Reservation และ `expires_at`
3. Permanent Sales Code ที่ assigned แล้วไม่มี expiry
4. Live Code batch ที่ยังไม่ผูก Session สามารถหมดอายุหรือ release ได้
5. Command ID เดิมต้อง idempotent และคืนผลเดิม
6. Concurrent callers ต้องไม่รับ code เดียวกัน

## 7. Permissions, RLS และ Audit

| Operation | Permission | Authority |
|---|---|---|
| อ่าน Permanent identifier | `product.read` | Tenant-scoped RLS/read model |
| กำหนดหรือ allocate Sales Code | `product.manage` | Trusted Foundation command |
| แก้ Barcode | `product.manage` | Trusted Foundation command + version guard |
| จอง Live Code | `product.manage` ใน A4; แยก `live_sale.manage` ใน Part 7 | Trusted command |
| Resolve เพื่อ Stock Movement | Inventory permission ของ command ปลายทาง | Server-side resolver ก่อน Inventory command |

ข้อกำหนดความปลอดภัย:

- ตารางใหม่ใน `public` ต้อง Enable RLS และมี Organization predicate
- `TO authenticated` อย่างเดียวไม่ถือเป็น Authorization
- Function ใช้ `SECURITY INVOKER` เป็นค่าเริ่มต้น
- หากจำเป็นต้องใช้ `SECURITY DEFINER` ต้องอยู่หลัง trusted server boundary, กำหนด `search_path = ''`, ใช้ชื่อ relation แบบ fully-qualified, ตรวจ Actor/Organization และ revoke execute จาก `public`, `anon`, `authenticated`
- ทุก assign, release, expire, collision rejection และ mapping change ต้องมี Audit/Event evidence

## 8. Error Contract

| Error | ความหมาย |
|---|---|
| `duplicate_sku_code` | SKU Code ซ้ำใน Organization |
| `duplicate_sales_code` | Sales Code ซ้ำใน Organization |
| `duplicate_barcode` | Barcode ซ้ำใน Organization |
| `identifier_cross_field_collision` | รหัสเดียวกันชี้ SKU อื่นผ่าน identifier คนละประเภท |
| `identifier_not_found` | ไม่พบรหัสภายใน Organization |
| `identifier_ambiguous` | ข้อมูลเดิมทำให้รหัสชี้มากกว่าหนึ่ง SKU |
| `identifier_reservation_conflict` | ช่วงหรือรหัสถูกจอง/allocate ไปแล้ว |
| `identifier_reservation_expired` | Reservation หมดอายุ |
| `live_option_required` | Live Code มีหลาย SKU และต้องระบุ Option เพิ่ม |
| `live_identifier_ambiguous` | Live Code + Option ยังชี้มากกว่าหนึ่ง SKU |

## 9. Compatibility Decisions

1. Product/SKU เดิมยังอ่านและขายได้โดยไม่ต้องมี Variant Option
2. `sales_code` และ `barcode` เดิมยังอยู่ใน `public.skus` ระหว่าง Migration เพื่อไม่ทำลาย API ปัจจุบัน
3. Part A4 Registry ต้อง Backfill จาก `public.skus` และหยุดหากพบ Cross-field collision ห้ามเลือกผู้ชนะเอง
4. Resolver ปัจจุบันที่ค้นแต่ละคอลัมน์จะถูกเปลี่ยนไปใช้ Registry หลัง Backfill ผ่าน
5. Stock Movement contract เดิมไม่เปลี่ยน: รับเฉพาะ `sku_id` ที่ resolve แล้ว

## 10. Sequential Gate Result

- Identifier matrix: ผ่าน
- Unique scope และ normalization: ผ่าน
- Mutability/Lifecycle: ผ่าน
- Identifier → SKU ID invariant: ผ่าน
- Cross-field collision policy: ผ่าน
- Live Code session scope: ผ่าน
- RLS/permission/audit boundary: ผ่าน
- Compatibility และ migration stop condition: ผ่าน

Part A1 ปิด Gate แล้วภายใต้คำอนุมัติระยะ A 1–4 ของ Owner ขั้นถัดไปคือ Part A2 Variant UX Mockup เท่านั้น

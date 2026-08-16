# AVENZO ONE — Phase 2.1.R7.4.2 Products Read Model Expansion

วันที่: 16 สิงหาคม 2569  
สถานะ: **Completed locally — sequential gate passed**

## Outcome

ขยาย Products Workspace Read Model จาก Product/SKU identifiers เดิมให้รองรับข้อมูลที่บันทึกจริงจาก Unified Product Creation โดยยังไม่เปลี่ยนหน้าตา Data Grid หรือ Quick View ใน Part นี้

## Data ที่เพิ่ม

- Product: Category, Brand, Structure Type, Internal Note, Tags, วันที่สร้าง และชื่อผู้สร้างภายใน Organization
- SKU profile: วิธีนับ, ราคาขาย/สกุลเงิน, ภาษี, น้ำหนัก/ขนาดสินค้า, น้ำหนัก/ขนาดกล่อง, Safety Stock และ Reorder Min/Max
- Cost profile: อ่านเฉพาะเมื่อ Server ยืนยันสิทธิ์ `product.cost.read`; ผู้ไม่มีสิทธิ์จะไม่ query ตารางต้นทุน
- Detail only: Sell Units และ Bundle Components พร้อมรหัส/ชื่อ Component SKU
- Inventory: คงใช้ยอดจาก `inventory_balances` และคงกฎห้ามรวม SKU ที่ Base Unit ต่างกัน

## Aggregate contract

- ราคา SKU เดียวหรือราคาเท่ากัน: `single`
- หลายราคาในสกุลเดียว: `range` พร้อม minimum/maximum
- หลายสกุล: `mixed-currency` และไม่แปลงค่าเงินเอง
- ไม่มีราคา: `not-set`
- Quantity/Tax/Reorder ที่หลาย SKU ไม่เท่ากัน: `mixed`; ห้ามนำ SKU แรกมาแทน Product ทั้งหมด

## Query and security contract

- ใช้ bounded batch query ตาม Product IDs และ SKU IDs; ไม่มี query ต่อแถวแบบ N+1
- Category, Brand, Tags, Profiles, Creator, Images และ Inventory โหลดเป็นกลุ่ม
- ทุก query มี `organization_id` boundary และยังผ่าน RLS ของ Supabase
- Signed image URL และ private bucket contract เดิมไม่เปลี่ยน
- ไม่มี migration, database write, privileged key ใน Browser หรือ Production apply

## Acceptance evidence

- [x] Read types เป็น serializable object และรองรับ List/Detail
- [x] Price summary ครอบคลุม single/range/mixed-currency/not-set
- [x] Physical, Packaging, Sell Units และ Bundle อยู่ใน SKU Detail
- [x] Cost query ถูก guard ด้วย `product.cost.read` จาก Server
- [x] Targeted test ผ่าน
- [x] TypeScript ผ่าน

## Next gate

R7.4.3 สามารถเริ่มได้หลัง R7.4.2 ผ่านทั้งหมด โดย R7.4.3 จะปรับเฉพาะ Default Data Grid ให้ตรง Approved Mockup และใช้ข้อมูลจริงจาก Read Model นี้

# AVENZO ONE — Phase 2.1.R7.4.5 Product Quick View Alignment

วันที่: 16 สิงหาคม 2569  
สถานะ: **Completed locally / Awaiting Owner Test**

## เป้าหมาย

นำ Product Quick View ในระบบจริงให้ใช้การจัดกลุ่มและหน้าตาตาม Approved Mockup พร้อมแสดงข้อมูลจาก Detail Read Model จริงที่ขยายใน R7.4.2 โดยไม่เพิ่ม mutation, ไม่แก้ Database schema และไม่ใช้ข้อมูลจำลอง

## กลุ่มข้อมูลที่แสดง

1. ข้อมูลทั่วไป: Product, Category, Brand, Structure, Tags และสถานะ
2. รูปภาพสินค้า: เฉพาะภาพสถานะ ready ตาม `sort_order` พร้อมระบุภาพปก
3. SKU / ตัวเลือก: ตารางแนวนอนแบบหัวพื้นดำ รองรับ Keyboard scroll แสดง SKU, รหัส CF, Barcode, Base Unit และ Stock
4. ราคาและภาษี: สรุปราคา Product และรายละเอียดต่อ SKU
5. คลังและการเติมสินค้า: On hand, Allocated, Available, สาขาที่มี Balance, Safety Stock และ Min/Max
6. น้ำหนักและขนาด: แยกสินค้าและกล่องต่อ SKU
7. หน่วยขายและการบรรจุ: Sell Unit, อัตราแปลง Base Unit, Barcode และสถานะ
8. Bundle / Kit: SKU ส่วนประกอบและจำนวน
9. ข้อมูลกำกับ: วันที่สร้าง, แก้ไขล่าสุด, ผู้สร้าง, Version และหมายเหตุภายใน

## Permission และ Safety

- ราคาต้นทุนแสดงเมื่อ Server ยืนยัน `product.cost.read` เท่านั้น
- Repository ไม่ query `sku_cost_profiles` เมื่อไม่มีสิทธิ์
- Internal note อยู่ใน Quick View เท่านั้น ไม่เพิ่มเข้า Default Grid หรือ Export
- Stock เป็น read-only Inventory-derived value
- Safe lifecycle actions, version และ SKU archive guard เดิมยังคงอยู่
- R7.4.5 ไม่มี Database write, migration, Production apply หรือ Deploy

## UI Contract

- Drawer กว้างไม่เกิน 680px ตาม Mockup และไม่เกิน viewport
- Header ติดด้านบนขณะเลื่อน
- Section ใช้กรอบและหัวข้อพื้นผิวเดียวกับ Mockup
- ตาราง SKU/ราคา/Sell Unit/Bundle ใช้หัวพื้น `#111` ตัวอักษรขาว
- ตารางกว้างเลื่อนเฉพาะภายในและ Focus ด้วย Keyboard ได้
- Mobile เปลี่ยน detail grid เป็นหนึ่งคอลัมน์และรูปภาพเป็นสองคอลัมน์

## Verification

- [x] Deterministic R7.4.5 contract tests
- [x] R4 safe-action regression
- [x] TypeScript no-emit
- [x] Products regression 202/202
- [x] Browser ตรวจข้อมูล AVENZO ONE PREVIEW จริง, layout, เปิด/ปิด Quick View และไม่มี runtime error ใหม่หลัง reload
- [ ] Owner ตรวจข้อมูลจริงและภาพใน Browser ก่อนอนุมัติขั้นถัดไป

## Owner Test Correction — Status Control และ Quick View

- Status select ใน Products Data Grid ใช้ native compact select ตาม Approved Mockup ขนาด 120 × 30px พร้อมจุดสถานะและลูกศรห่างขอบขวา 12px; ใช้เลือก `ใช้งานอยู่`, `ฉบับร่าง` หรือ `เก็บถาวร` เท่านั้น ไม่ใช้เปิด Quick View
- Quick View เปิดจากเมนู `…` ของรายการ เพื่อแยก “ดูรายละเอียด” ออกจาก “เปลี่ยนสถานะ” อย่างชัดเจน
- ใช้ lifecycle command เดิมของระบบ: ฉบับร่าง → ใช้งานอยู่ และฉบับร่าง/ใช้งานอยู่ → เก็บถาวร
- ไม่อนุญาต ใช้งานอยู่ → ฉบับร่าง และข้อมูลที่เก็บถาวรแล้วเป็น read-only ตาม Database guard เดิม
- การเก็บถาวรยังต้องผ่าน confirmation เดิม และทุกคำสั่งส่ง Version เพื่อป้องกันข้อมูลชนกัน
- เพิ่ม regression test ป้องกันไม่ให้ Status control กลับไปเปิด Quick View อีก

## Owner Test Correction — Pinned Columns

- Checkbox selection column ติดซ้ายที่ `0px` เสมอและมีพื้นหลังแยกตาม normal, hover และ selected state
- คอลัมน์ปักหมุดเริ่มหลัง Checkbox ที่ `52px` ทั้งหัวตารางและแถวข้อมูล โดยใช้ offset ชุดเดียวกัน
- เรียงคอลัมน์ที่ปักหมุดไว้หน้าคอลัมน์ทั่วไป สูงสุด 3 คอลัมน์ และคงค่าผ่าน F5 ตาม device preference เดิม
- แสดงไอคอนหมุดในหัวคอลัมน์ที่ปักหมุด และใน Pin control ของ Customize
- แสดง boundary shadow เฉพาะขอบขวาของกลุ่มที่ปักหมุด เพื่อให้เห็นการแยกขณะเลื่อนแนวนอน

## Owner Test Correction — Products Pagination

- Footer ตารางใช้ `Rows per page` เลือกได้ 10, 25, 50, 100, 300 และ 400 รายการ
- แสดงช่วงข้อมูลจริงแบบ `1–25 of 100` จาก exact tenant-scoped count
- มีปุ่มไอคอน หน้าแรก, ก่อนหน้า, ถัดไป และหน้าสุดท้าย พร้อม disabled state และ accessible label
- เปลี่ยนตัวกรองแล้วกลับหน้า 1 โดยคง page size; เปิด/ปิด Quick View แล้วยังคงหน้าปัจจุบัน
- Server ใช้ offset range เฉพาะ Products workspace และคง Organization, permission และ bounded aggregate guard เดิม

## Stop Gate

จบ R7.4.5 ต้องหยุดให้ Owner ทดสอบ Products Data Grid, Customize และ Product Quick View ก่อน ห้ามเริ่ม Part ถัดไป, Commit, Push หรือ Deploy โดยไม่มีคำอนุมัติใหม่

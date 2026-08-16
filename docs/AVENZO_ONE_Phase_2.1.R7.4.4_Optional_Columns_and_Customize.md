# AVENZO ONE — Phase 2.1.R7.4.4 Optional Columns & Customize

วันที่: 16 สิงหาคม 2569  
สถานะ: **Completed locally — sequential gate passed**

## Outcome

เพิ่ม Optional Columns ตาม Field Contract เข้า Customize โดยทั้งหมดถูกซ่อนเป็นค่าเริ่มต้น จึงไม่เปลี่ยน Default Grid ที่อนุมัติใน R7.4.3

## Optional columns

- หมวดหมู่, แบรนด์, Tags และ Barcode
- วิธีนับจำนวน, ภาษี, Safety Stock และ Reorder Min/Max
- สาขาที่มี Inventory Balance
- วันที่สร้างและผู้สร้าง
- ราคาต้นทุนเฉพาะผู้มี `product.cost.read`

## Customize behavior

- เลือกแสดง/ซ่อน
- ปรับความกว้าง 96–520 px
- จัดลำดับ
- ปักหมุดได้สูงสุด 3 คอลัมน์
- บันทึก preference ในอุปกรณ์และคืนค่าหลัง F5
- Preference เป็น Presentation data เท่านั้น ไม่มี Foundation command หรือ Business-data write

## Security

- Server เป็นผู้คำนวณ `canReadCost` และไม่ query `sku_cost_profiles` เมื่อไม่มีสิทธิ์
- Cost column ถูกตัดออกทั้ง Grid และ Customize เมื่อไม่มีสิทธิ์
- Internal Note ไม่อยู่ Grid หรือ Export default
- Branch column หมายถึง “สาขาที่มี Inventory Balance” ไม่ใช่ Branch Sales Scope

## Acceptance evidence

- [x] Optional columns ซ่อนเป็นค่าเริ่มต้นทั้งหมด
- [x] Customize รองรับ show/hide, width, order, pin และ persistence
- [x] Cost permission gate ทำตั้งแต่ Server query ถึง UI option
- [x] Targeted test ผ่าน
- [x] Product regression ผ่าน
- [x] TypeScript ผ่าน

## Next gate

R7.4.5 จะปรับ Product Quick View ให้แสดงข้อมูล Detail จริงครบกลุ่ม โดยไม่เพิ่ม mutation หรือแก้ Database schema

## Owner follow-up — Sortable column order

วันที่ 16 สิงหาคม 2569 เปลี่ยนการจัดลำดับใน Customize Columns จากปุ่มขึ้น/ลงเป็น Drag handle แบบหกจุดตาม Approved UI reference:

- ลากแถวไปวางก่อนหรือหลังคอลัมน์เป้าหมาย พร้อมเส้นบอกตำแหน่งวาง
- รองรับปุ่มลูกศรขึ้น/ลงเมื่อโฟกัส Drag handle เพื่อให้ใช้งานด้วยคีย์บอร์ดได้
- ลำดับยังเป็น Draft จนกดบันทึก และยังคงจำค่าในอุปกรณ์หลัง F5
- ไม่เพิ่ม Database write และไม่เปลี่ยน Show/Hide, Width, Pin หรือ permission gate เดิม
- Pin ใช้ไอคอนหมุดเอียงรูปแบบเดียวกันทั้ง Customize และหัวคอลัมน์ โดยในช่อง Pin จัดไอคอนชิดขวา และบนหัวตารางวางชิด Column divider/resizer ด้านขวา

# AVENZO ONE — Phase 2.1.R7.4.3 Default Data Grid Alignment

วันที่: 16 สิงหาคม 2569  
สถานะ: **Completed locally — sequential gate passed**

## Outcome

ปรับ Default Products Data Grid ให้ตรง Approved Mockup และ Field Contract โดยเพิ่มคอลัมน์ราคาขายจาก Read Model จริง ไม่ใช้ค่าจำลองหรือข้อมูลจาก SKU แรกแทนทั้ง Product

## Default columns

1. สินค้า + รูปปก
2. รหัส CF
3. SKU / ตัวเลือก
4. สต็อก + Available
5. หน่วยนับ
6. ราคาขาย
7. สถานะ
8. แก้ไขล่าสุด
9. Row actions

## Price display rules

- `single`: แสดงราคาหนึ่งค่าและสกุลเงินจริง
- `range`: แสดงช่วงราคาต่ำสุด–สูงสุดในสกุลเดียว
- `mixed-currency`: แสดง “หลายสกุลเงิน” โดยไม่แปลงค่าเอง
- `not-set`: แสดง “ยังไม่กำหนดราคา”
- ราคาต้นทุนไม่อยู่ Default Grid

## Preserved behavior

- Checkbox, sort, copy code, row menu และ safe status action เดิมยังอยู่
- Column resize ใช้ Pointer และ Keyboard และบันทึก Local Storage เพื่อคงค่าหลัง F5
- Stock ยังคงเป็น Inventory-derived และไม่รวมยอดข้าม Base Unit
- Mobile list และ Dark/Light semantic surfaces ยังคงทำงาน

## Acceptance evidence

- [x] Default column order ตรง Approved Mockup
- [x] Price อ่านจาก R7.4.2 summary เท่านั้น
- [x] ไม่มีต้นทุนหรือ internal note ใน Default Grid
- [x] Targeted test ผ่าน
- [x] Product regression ผ่าน
- [x] TypeScript ผ่าน

## Next gate

R7.4.4 จะเพิ่ม Optional Columns ใน Customize โดยไม่เปลี่ยน Default Grid ที่ล็อกใน Part นี้

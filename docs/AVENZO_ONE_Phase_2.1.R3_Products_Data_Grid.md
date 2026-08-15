# Phase 2.1.R3 — Products Production Data Grid

วันที่: 15 สิงหาคม 2569
สถานะ: **Owner Approved / Completed Locally**

## ขอบเขตที่นำขึ้น Production

- ใช้ `ProductWorkspaceRow` จาก R2; ไม่มีข้อมูลภาพ/ราคา/หมวดหมู่จำลอง
- Default columns: Product, รหัส CF, SKU/Variants, Stock, Base Unit, Status และแก้ไขล่าสุด
- Product ใช้ neutral letter placeholder เป็น fallback; หลัง R6 ผ่านแล้วจะแสดง signed cover image เมื่อมีภาพ `ready`
- Copy action สำหรับ Sales Code/รหัส CF และ SKU Code พร้อม accessible label
- Stock เป็น read-only summary; mixed Base Unit แสดง “หลายหน่วย” และไม่รวมยอดข้ามหน่วย
- Search URL รองรับชื่อ Product และหลาย SKU/Sales Code/Barcode แบบ OR โดยคั่น comma/space/newline
- `Ctrl+Enter` ส่งฟอร์มค้นหาได้
- คอลัมน์แก้ไขล่าสุด sort จริงได้ทั้งเก่า→ใหม่และใหม่→เก่า โดย cursor ใช้ทิศทางเดียวกับ query
- Column preferences รองรับ Show/Hide, Width 96–520px, Order และ Pin สูงสุด 3 คอลัมน์
- Preferences validate ก่อนใช้และบันทึกแยกต่อ Organization ใน local storage
- Desktop ใช้ semantic table + internal horizontal scroll; Mobile ใช้ semantic list/card
- Dark mode เปลี่ยน table header เป็น inverse ตามแบบที่อนุมัติ

## Safety Boundary

- Data Grid ไม่เขียน Stock โดยตรง
- Status ยังแสดง read-only; lifecycle actions เดิมยังอยู่ใน detail flow
- Base Unit และ Sales Code ไม่ถูก inline edit ใน R3
- ไม่มี privileged browser client, migration หรือ command ใหม่

## Deferred ตาม Gate

- Quick View และ safe lifecycle action UX เชิงลึก: R4
- Category, Brand, Tags, Price/Cost/Tax, physical/packaging และ Bundle: R5
- Product images จริง: R6
- Unified Product Creation: R7
- Import/Export/Bulk release: R8

## Verification

- Targeted R3 tests: `5/5 passed`
- R2 regression: `5/5 passed`
- Product/SKU regression: `3/3 passed`
- TypeScript: `npm exec tsc -- --noEmit --incremental false` passed
- Authenticated browser Desktop Light: passed
- Responsive 760px: semantic card layout, no page overflow, passed
- Dark mode: inverse table header `rgb(248,250,252)` / `rgb(11,13,16)`, no page overflow, passed
- Customize: open, width/order/pin controls and max 3 pin contract passed
- Preference persistence: hide column → reload → still hidden → restore defaults, passed
- Multi-code OR search: `A001,NOPE-999` ยังพบรายการที่ตรง `A001`, passed
- Real sort: `updated_desc` → `updated_asc` เปลี่ยน URL/query และหน้าโหลดสำเร็จ

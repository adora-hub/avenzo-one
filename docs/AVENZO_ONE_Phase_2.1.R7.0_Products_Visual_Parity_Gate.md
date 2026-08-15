# AVENZO ONE — Phase 2.1.R7.0 Products Visual Parity Gate

วันที่: 15 สิงหาคม 2026
สถานะ: Owner Approved / Interaction parity follow-up completed 16 สิงหาคม 2026
ขอบเขต: Production Products route บน Local + AVENZO ONE PREVIEW data; ไม่มี Schema, Migration หรือ privileged browser write เพิ่ม

## Outcome

หน้า Products จริงถูกปรับจาก Workspace เดิมให้ใช้ visual hierarchy ของ Prototype ที่อนุมัติแล้ว โดยยังอ่านข้อมูลจริงผ่าน Server Component/Repository และรักษา Foundation Command, Permission, tenant boundary, Inventory authority และ Safe Detail Action เดิม

## สิ่งที่ปิดใน R7.0

1. Heading แบบ compact พร้อม truthful page-count badge และปุ่ม `สร้างสินค้า` จุดเข้าเดียวในระดับคำอธิบาย
2. คำสั่งสร้าง Product และเพิ่ม SKU เดิมถูกรวมไว้ใต้เมนูเดียว เพื่อไม่ทำให้ความสามารถเดิมหายก่อน Unified Form พร้อม
3. Filter และ Data Grid อยู่ในการ์ดเดียวกัน พร้อม live search, status, clear-filter, Excel Tools และ Customize Columns ตาม Approved Mockup
4. Multi-code dialog รับ SKU/Sales Code/Barcode จาก comma, whitespace หรือ newline จำกัด 50 รหัสและ query รวมไม่เกิน 400 ตัวอักษร
5. Status แสดงเป็น fixed-size control ตาม Prototype แต่เปิด Safe Detail แทน inline mutation ที่ยังไม่มี confirmation/version contract
6. Product image/placeholder, copy CF/SKU, stock wording, Base Unit, sort, persisted column preferences และ responsive mobile card ยังคงใช้ read model จริง
7. Light/Dark ผ่าน authenticated visual verification และไม่พบ Next.js Runtime/Console Error overlay
8. Follow-up วันที่ 16 สิงหาคม 2026 ปิด interaction gap ของ Search/Enter, Multi-code modal, Excel menu, export-column preferences และ Customize Columns โดยใช้ draft/Save/Cancel, width, show/hide, reorder และ pin สูงสุด 3 คอลัมน์

## Truthful deferrals

- `Price` ไม่แสดงค่าปลอม: ต้องต่อ R5 sale-price read model ก่อน
- Excel Import ยังเป็น Preview-only: เลือกไฟล์ได้แต่ไม่อ่าน/อัปโหลด/เขียนข้อมูลจริงจนกว่าจะผ่าน Import Gate; Template CSV และ export-column UI preference ใช้งานบนอุปกรณ์ได้แล้ว
- Inline status mutation ไม่ถูกทำเป็น combobox ที่เขียนทันที; ต้องใช้ lifecycle command + permission + expected version + confirmation
- Unified Product Creation ยังไม่ใช้คำสั่ง `product.create` ต่อด้วย `sku.create` แบบเสี่ยง partial state; ขั้นถัดไปคือ R7.1 Atomic Creation Contract

## Verification evidence

- `npm run test:products-r7-visual-parity` — 5/5
- Products regression หลัง Interaction parity follow-up — 172/172 + Product/SKU slice 3/3
- `npm exec tsc -- --noEmit --incremental false` — passed
- Authenticated Chrome: Search/Multi-code, Excel menu, export-column modal/persistence, Customize draft/cancel, pin limit และ save/F5 persistence — passed
- Runtime Error overlay — 0; Console Error overlay — 0

## Next gate

**2.1.R7.1 — Atomic Product Creation Contract**: ออกแบบและทดสอบ idempotent command สำหรับ Product + SKU แรก + metadata + image compensation ก่อนนำ Unified Product Creation Form ไปเขียนข้อมูลจริง

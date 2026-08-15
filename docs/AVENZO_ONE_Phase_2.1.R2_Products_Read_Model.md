# Phase 2.1.R2 — Products Workspace Read Model

วันที่: 15 สิงหาคม 2569
สถานะ: **Owner Approved / Completed Locally**

## ขอบเขต

- เพิ่ม `ProductWorkspaceRow` สำหรับหน้า Products โดยไม่เปลี่ยน schema หรือ migration
- รวม Product, SKU preview/count และ Inventory summary ด้วย bounded batch queries
- ค้นหาได้จากชื่อ Product และ exact/normalized SKU Code, Sales Code หรือ Barcode
- สรุป Stock เฉพาะเมื่อ SKU ภายใน Product ใช้ Base Unit เดียวกัน
- ถ้ามีหลาย Base Unit จะแสดงสถานะ `mixed-units` และไม่บวกจำนวนข้ามหน่วย
- แยก `no-balance` ออกจาก `not-authorized` เพื่อไม่ทำให้ผู้ใช้เข้าใจผิด
- Branch list ได้จาก Inventory Balance จริงและตัดค่าซ้ำ
- จำกัด SKU preview ที่ 5 รายการ แต่เก็บ `skuCount` สำหรับตาราง R3

## Query Budget

- 1 query หา identifier matches เมื่อมีคำค้น
- 1 query Product page
- 1 batch query SKU ของ Product ในหน้าปัจจุบัน
- 1 batch query Inventory Balance เมื่อมี `inventory.read`
- 1 batch query Branch code เฉพาะ Branch ID ที่พบใน Balance
- ไม่มี query ต่อแถวหรือ N+1; query budget สูงสุด 5 ครั้งเมื่อมีทั้งคำค้นและสิทธิ์ Inventory
- Guardrail: SKU aggregate 5,000 rows และ Balance aggregate 10,000 rows; `aggregateCapped` แจ้งเมื่อชนเพดาน

## Security Boundary

- หน้า route ยังบังคับ `product.read`
- Inventory aggregate จะถูกขอเฉพาะเมื่อมี `inventory.read`
- ไม่มีการใช้ service-role ใน read path
- RLS และ Organization boundary เดิมยังทำงานเหมือนเดิม

## R2 ไม่ได้ทำ

- ยังไม่เปลี่ยน Data Grid UI — เป็นขอบเขต R3
- ยังไม่เพิ่ม Image, Price, Category, Brand, Tags, Packaging หรือ Bundle ที่ schema ยังไม่มี
- ยังไม่เพิ่ม migration หรือ command ใหม่

## Verification

- Targeted R2 tests: `5/5 passed`
- TypeScript: `npm exec tsc -- --noEmit --incremental false` passed
- Existing Product/SKU regression: `3/3 passed`
- R1 shell regression: `4/4 passed`
- Authenticated browser smoke: passed บน `AVENZO ONE PREVIEW`
- Exact Sales Code search smoke: `A001` resolve กลับไปยัง Product `แหวน` สำเร็จ
- Runtime query correction: เปลี่ยน Branch relation embed เป็น bounded Branch batch query และทดสอบซ้ำผ่าน

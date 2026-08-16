# Design QA — Phase 2.1 Product Variant Mockup

วันที่ตรวจ: 16 สิงหาคม 2026

## Findings

| Severity | จุดตรวจ | ผลลัพธ์ |
|---|---|---|
| P0 | Prototype boundary | ผ่าน — มีข้อความชัดเจนว่าไม่เชื่อมระบบและไม่แก้ Stock |
| P0 | Variant data loss | ผ่าน — Draft เก็บ Option Group และ Combination แบบ bounded |
| P1 | Desktop layout | ผ่าน — Variant Builder อยู่ในส่วน SKU และใช้ surface/token เดิม |
| P1 | Mobile layout | ผ่าน — 390 × 844 ใช้ one-column controls และ Matrix scroll แนวนอน |
| P1 | Keyboard | ผ่าน — เพิ่มค่าด้วย Enter/comma, checkbox/select/input ใช้ native keyboard |
| P1 | Light/Dark | ผ่าน — สีทั้งหมดอ้างอิง token ที่มี light/dark definition |
| P2 | Combination density | ยอมรับสำหรับ Prototype — ตารางกว้างตั้งใจให้เลื่อนแนวนอนเพื่อรักษาข้อมูลครบ |

## Verification Summary

- Default สี × ไซซ์สร้าง 8 Combination ถูกต้อง
- เพิ่มกลุ่มเนื้อผ้า Cotton/Polyester แล้วสร้าง 16 Combination ถูกต้อง
- Bulk fill ราคา `390`, Barcode จาก SKU และสถานะ `ใช้งานอยู่` ถูกต้องทุกแถว
- Summary นับจำนวน Combination ที่เปิดใช้งาน
- ไม่พบ JavaScript syntax error หรือ console error ใน flow ที่ตรวจ

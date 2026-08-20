# AVENZO ONE — SKU-01 Variant SKU Code Standard

วันที่อนุมัติ: 20 สิงหาคม 2026
สถานะ: **SKU-01–04 Completed · Applied to AVENZO ONE PREVIEW · Production Untouched**
Owner Authority: AVENZO ONE

## 1. วัตถุประสงค์

กำหนดรหัส SKU สำหรับ Product Variant ให้สื่อความหมาย อ่านง่าย และไม่ชนกันเมื่อหลาย Product ใช้ Prefix หรือ Option เดียวกัน โดยยังคงให้ Database เป็นผู้ยืนยัน Unique ขั้นสุดท้าย

## 2. รูปแบบมาตรฐาน

```text
{PRODUCT_PREFIX}-{PRODUCT_SEQUENCE}-{OPTION_CODE_1}[-{OPTION_CODE_2}...]
```

ตัวอย่าง:

| กรณี | SKU Code |
|---|---|
| Product TS ลำดับ 001 สีทอง | `TS-001-GLD` |
| Product TS ลำดับ 001 สีเงิน | `TS-001-SLV` |
| Product TS ลำดับ 001 สีทอง ไซซ์ S | `TS-001-GLD-S` |
| Product TS ลำดับ 002 สีทอง | `TS-002-GLD` |
| Product ปกติไม่มี Variant | `TS-001` |

## 3. ความหมายของ Segment

| Segment | ความหมาย | กฎ |
|---|---|---|
| Product Prefix | กลุ่มหรือคำนำหน้าที่ผู้ใช้เข้าใจ | A–Z, 0–9, 2–12 ตัว; แปลงเป็นตัวพิมพ์ใหญ่ |
| Product Sequence | เลขประจำ Product ภายใต้ Prefix เดียวกัน | ค่าเริ่มต้น 3 หลัก; เริ่ม 001; ขยายเกิน 999 ได้โดยไม่ตัดเลข |
| Option Code | รหัสค่าตัวเลือกตามลำดับ Option Group | A–Z, 0–9, 1–12 ตัวต่อ Segment |
| Separator | ตัวแบ่ง Segment | ใช้ `-` เท่านั้น |

ความยาว SKU Code รวมต้องไม่เกิน 80 ตัวอักษรตาม Identifier Contract เดิม

## 4. กฎ Product Sequence

1. Sequence รันแยกตาม Product Prefix ภายใน Organization เช่น `TS-001`, `TS-002` และ `BAG-001`
2. SKU ทุก Variant ของ Product เดียวกันใช้ Prefix และ Sequence เดียวกัน
3. Preview บน Client ไม่ถือว่าเป็นการจองเลข
4. SKU-04 ต้องให้ Server หาเลขว่างจริงและจองใน Transaction เดียว เพื่อป้องกันผู้ใช้สองคนได้เลขเดียวกัน
5. เมื่อเลขมีช่องว่างจากรายการที่ยกเลิก ระบบไม่ย้อนกลับไปใช้โดยอัตโนมัติ; ใช้เลขสูงสุด + 1 เป็นค่าแนะนำ
6. ผู้ใช้แก้ Sequence ได้ก่อนบันทึก แต่ต้องตรวจรหัสทั้งหมดใหม่

## 5. กฎ Option Code

1. เรียง Option Code ตามลำดับ Option Group ที่ผู้ใช้จัดไว้ เช่น สี → ไซซ์ ได้ `GLD-S`
2. รหัสสีมาตรฐานที่มีอยู่ยังใช้ต่อ เช่น `GLD`, `SLV`, `BLU`, `BLK`, `WHT`, `RED`
3. Size ใช้ค่าที่อ่านได้ เช่น `XS`, `S`, `M`, `L`, `XL`, `2XL`
4. Custom option ให้ระบบเสนอรหัสจากอักษร Latin/ตัวเลข; หากแปลงไม่ได้ให้เสนอ `V1`, `V2` แต่ผู้ใช้ต้องตรวจแก้ได้ก่อนสร้าง
5. Option Code ต้องไม่ซ้ำกันภายใน Option Group เดียวกัน
6. การเปลี่ยนชื่อ Option ไม่เปลี่ยน Code ของ SKU ที่บันทึกแล้วโดยอัตโนมัติ

## 6. Unique และ Safety Contract

- `sku_code` ต้อง Unique ภายใน Organization และชี้ไปยัง `sku_id` เดียว
- Client ตรวจซ้ำภายในฟอร์มและแสดง Preview เพื่อช่วยผู้ใช้เท่านั้น
- Server/Database ตรวจ Unique อีกครั้งก่อนบันทึกทุก SKU
- การสร้าง Product และ SKU Combination ต้องเป็น Atomic: หาก SKU ใดชน ห้ามสร้างเพียงบางรายการ
- Sales Code / รหัส CF และ Barcode เป็น Identifier แยก ไม่สืบทอดความ Unique จาก SKU Code
- ทุกการขาย จอง และตัด Stock ต้อง resolve Identifier เป็น `sku_id` ก่อนเสมอ

## 7. Existing Data Compatibility

- ห้าม Rename SKU Code เดิม เช่น `TS-GLD` หรือ `TS-SLV` อัตโนมัติ
- มาตรฐานใหม่ใช้กับ Product ใหม่ หรือรายการเดิมที่ผู้ใช้สั่งเปลี่ยนโดยชัดแจ้ง
- หากมีการเปลี่ยนรหัสเดิมในอนาคต ต้องมี Alias/Audit/Impact review แยกต่างหาก

## 8. Barcode และ Sales Code / CF

- SKU `TS-001-GLD` สามารถใช้เป็น Barcode ภายในได้เมื่อผู้ใช้เลือก แต่ Barcode ยังต้อง resolve ไป SKU เดียว
- Sales Code / CF เช่น `A001` รันแยกจาก SKU Sequence และต้อง Unique ภายใน Organization
- Live Code เป็นรหัสชั่วคราวระดับ Live Session และไม่ใช้แทน SKU Code ถาวร

## 9. Sequential Implementation Plan

1. **SKU-01 — Contract Freeze:** เอกสารนี้
2. **SKU-02 — Local UI:** Prefix, Product Sequence, Format Preview และ Combination Preview; ไม่แตะ Backend
3. **SKU-03 — Client Behavior:** Owner Accepted — Generate, ตรวจซ้ำในฟอร์มก่อนเรียก Backend, Preserve manual edits และแนะนำเลขถัดไปแบบ UI
4. **SKU-04 — Backend Integration:** Completed — Server-side next available, จองเลขพร้อม Product+SKU ใน Transaction เดียว, Organization+Prefix high-water, idempotency, rollback และ concurrent protection ผ่านฐานข้อมูลทดสอบแยก; Migration `20260820134813` Apply เฉพาะ AVENZO ONE PREVIEW แล้ว และ Production ไม่ถูกแตะ

## 10. Acceptance Criteria ของ SKU-01

- ตัวอย่างหลักเป็น `TS-001-GLD`
- Product เดียวกันทุก Variant ใช้เลข `001` ร่วมกัน
- Product ถัดไปภายใต้ Prefix `TS` ใช้ `002`
- หลาย Option เรียงเป็น `TS-001-GLD-S`
- SKU เดิมไม่ถูกเปลี่ยนอัตโนมัติ
- Sales Code/CF, Barcode และ Live Code ยังคงเป็นคนละ Identifier
- ไม่มี Code, UI, Database หรือ Migration change ใน Part นี้

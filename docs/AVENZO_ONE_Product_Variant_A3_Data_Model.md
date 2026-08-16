# AVENZO ONE — Product Variant A3 Data Model

สถานะ: Implemented locally and covered by migration/integration tests

## เป้าหมาย

Part A3 เพิ่มโครงสร้างข้อมูล Variant แบบ additive โดยยังไม่เปลี่ยน command สร้างสินค้าเดิม และยังไม่แตะ Stock Movement จริง ข้อมูลทุกแถวผูกกับ `organization_id` และใช้ `sku_id` เป็นตัวตนที่ระบบ Stock ต้องรับต่อไป

## ตารางและความสัมพันธ์

- `product_option_groups` — กลุ่มตัวเลือกของ Product เช่น สี ไซซ์ หรือรูปแบบกำหนดเอง สูงสุด 3 กลุ่ม
- `product_option_values` — ค่าภายในกลุ่ม เช่น สีฟ้า สีดำ S M L XL สูงสุด 12 ค่าต่อกลุ่ม
- `product_option_value_aliases` — คำเรียกแทน เช่น `Blue`, `ฟ้า`, `สีฟ้า` เพื่อรองรับตัวแก้คำและ Live CF ในระยะถัดไป
- `sku_option_assignments` — จับคู่หนึ่ง SKU กับหนึ่งค่าต่อกลุ่ม และห้าม Combination ที่สมบูรณ์ซ้ำกันภายใน Product เดียวกัน
- `sku_variant_images` — ผูกภาพ Product ที่ผ่าน gate แล้วเข้ากับ SKU/Variant เฉพาะตัว

```text
Product
  ├─ Option Group (สี)
  │    └─ Option Value (สีฟ้า)
  │         └─ Alias (Blue / ฟ้า)
  ├─ Option Group (ไซซ์)
  │    └─ Option Value (S)
  └─ SKU
       ├─ Assignment: สี = สีฟ้า
       ├─ Assignment: ไซซ์ = S
       └─ Variant Image
```

## กติกาที่ฐานข้อมูลบังคับ

1. Product ต้องมี `structure_type = variant` ก่อนรับ Variant assignment
2. กลุ่มและค่าต้องเป็นของ Organization และ Product เดียวกันกับ SKU
3. SKU หนึ่งตัวเลือกได้เพียงหนึ่งค่าต่อหนึ่งกลุ่ม
4. Combination ที่ครบทุกกลุ่มและยัง active ต้องไม่ซ้ำ SKU อื่นใน Product เดียวกัน
5. `sku_code` เปลี่ยนไม่ได้หลังสร้าง
6. alias ถูก normalize สำหรับค้นหาและห้ามซ้ำในกลุ่มเดียวกัน เพื่อลดความกำกวม
7. ผู้ใช้ `authenticated` อ่านผ่าน RLS ด้วยสิทธิ์ `product.read` แต่เขียนตารางเหล่านี้ตรงๆ ไม่ได้
8. การแก้ไขในระบบจริงต้องผ่าน trusted command ที่จะทำใน Part A5

## Index และขอบเขตประสิทธิภาพ

- Read indexes เริ่มด้วย `organization_id` แล้วตามด้วย parent/status/order
- Compound foreign keys ป้องกันการผูกข้อมูลข้าม tenant
- Advisory transaction locks ป้องกัน race ตอนเพิ่มกลุ่ม ค่า alias และตรวจ Combination
- Partial unique index ใช้กับภาพหลักหนึ่งภาพต่อ SKU

## Rollback plan

Migration นี้เป็น additive แต่ rollback ต้องทำแบบมีการควบคุม เพราะหลัง Part A5 ตารางอาจมีข้อมูลจริงแล้ว

1. ปิดคำสั่งเขียน Variant และตรวจว่าไม่มี command กำลังทำงาน
2. สำรองและตรวจจำนวนข้อมูลจริงก่อน rollback โดยเฉพาะ assignments, aliases และ image mappings
3. ถอด RLS policies และ triggers ของ A3
4. ลบตามลำดับลูกไปหาแม่: `sku_variant_images` → `sku_option_assignments` → `product_option_value_aliases` → `product_option_values` → `product_option_groups`
5. ลบ private functions และ compound constraints ที่ A3 เพิ่มให้ `skus`/`product_images`
6. รัน schema lint และ regression tests ของ Product/SKU เดิม

ห้าม rollback อัตโนมัติบน Preview หรือ Production หากยังไม่ได้ export ข้อมูลและอนุมัติ maintenance window

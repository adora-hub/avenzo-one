# AVENZO ONE — Phase 2.1.R7.2.2 Page Structure

วันที่: 15 สิงหาคม 2026

สถานะ: **Implemented Locally / Awaiting Owner Visual Review**

## Outcome

นำ Page structure ของ Approved Unified Product Creation Mockup มาใช้กับ Route จริง
`/organizations/[id]/products/new` เฉพาะ Diff A-01–A-08 และ F-01–F-03 โดยไม่เปลี่ยน Domain command, Image lifecycle, Permission หรือ Stock boundary

## สิ่งที่เปลี่ยน

- เปลี่ยนฟอร์มจาก 8 การ์ดแยกเป็น Continuous form surface 1 ชุด มี 8 Section คั่นด้วย divider
- จำกัด Inner canvas สูงสุด 1280px และใช้ Layout `1fr + 300px` พร้อม container breakpoint เพื่อไม่บีบฟอร์มภายใน Application Shell
- เพิ่ม Eyebrow, Heading/action hierarchy, spacing และ Mobile action order ตาม Mockup
- เพิ่ม Production note ที่เป็นความจริงแทนข้อความ Prototype และเพิ่ม Required-field guide
- แยก Empty-master state สำหรับกรณียังไม่มี Category โดยยัง Disable การสร้างอย่างปลอดภัย
- ปรับ Summary ให้มี completion percentage, progress bar, Product/Category และ facts 7 ค่า
- เพิ่ม Timeline marker line พร้อม state ต่อ Section และเรียง Summary actions ตาม Mockup
- คง Light/Dark inverse primary action และ responsive summary collapse

## Boundary ที่ไม่แตะ

- ไม่เปลี่ยนฟิลด์หรือ Component contract ใน Section 1–8 ซึ่งเป็น R7.2.3
- ไม่เพิ่ม Info guide, Master modal, Saved Tags navigation, Physical tabs, Identifier assistant, Sales sequence หรือ SKU staging ซึ่งเป็น R7.2.3–R7.2.4
- ไม่เปลี่ยน `product.create_with_initial_sku`, R6 Image Gate, Draft recovery หรือ Stock Movement boundary
- ไม่สร้างข้อมูลทดสอบ, ไม่ apply Migration, ไม่ commit/push และไม่ deploy

## Verification

- R7.2.2 Page Structure: 4/4
- R7.2 Unified Creation regression: 6/6
- R7 Visual Parity regression: 5/5
- Product R1–R7.2.2 regression รวม: 50/50
- TypeScript: ผ่านด้วย `tsc --noEmit --incremental false`
- Authenticated Chrome 1920px Light/Dark: Continuous surface, 300px Summary, Timeline, inverse theme และ no horizontal overflow ผ่าน
- Theme ถูกคืนเป็น Light หลังทดสอบ
- Responsive 980/760/390 rules ถูกล็อกด้วย automated structure test; Full side-by-side visual matrix ยังคงอยู่ใน R7.2.5

## Next Gate

รอ Owner ตรวจ R7.2.2 ในระบบจริง หากผ่านจึงเริ่ม **R7.2.3 — Form Components** ทีละ Section ตาม Diff B-01–E-08 โดยห้ามรวม R7.2.4 Interaction Parity

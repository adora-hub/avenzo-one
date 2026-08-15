# AVENZO ONE — Phase 2.1.R7.2.1 Visual Parity Audit

วันที่: 15 สิงหาคม 2026

สถานะ: **Completed — Gap Freeze / No Production UI Code Changed**

## 1. วัตถุประสงค์

ตรวจความต่างระหว่าง Approved Unified Product Creation Mockup กับ Route จริง โดยยังไม่แก้ Production UI เพื่อสร้างรายการ Diff ที่ตรวจสอบย้อนกลับได้ก่อนเริ่ม R7.2.2

## 2. Source of Truth และขอบเขต

- Approved Mockup: `docs/mockups/phase-2.1-unified-product-creation-form.html`
- Production route: `/organizations/[id]/products/new`
- Production component: `web/src/app/organizations/[id]/products/new/unified-product-creation-form.tsx`
- Production styles: `web/src/app/globals.css`
- กฎกลาง: `AVENZO_ONE_UI_Mockup_First_Implementation_Guide_V1.md`

Application Rail, Context Sidebar, Global Header และ Mobile Navigation เป็น System Shell ที่มีอยู่แล้วและอยู่นอก Page-level parity แต่ Content canvas ภายใน `app-shell-main` ต้องรักษา Layout, Visual และ Interaction ของ Approved Mockup

ข้อความ `Interaction Prototype เท่านั้น` และปุ่มที่มีไว้สร้างข้อมูลจำลองเป็น Prototype artifact ห้ามคัดลอกเป็นข้อความเท็จในระบบจริง การแทนที่ต้องรักษาโครงสร้างและได้รับ Owner approval ก่อน Implement

## 3. วิธีตรวจและหลักฐาน

- เปิด Mockup จาก Local static server และ Production จาก authenticated localhost session
- ตรวจ Desktop Light ที่ 1280px และ 1920px
- ตรวจ Mobile 390px ทั้ง Mockup และ Production
- ตรวจ Production Dark mode ที่ Mobile 390px แล้วคืน Theme เดิมหลังตรวจ
- ตรวจ DOM landmarks, heading, field, action, bounding box และ Interaction inventory
- ตรวจ Runtime console ระหว่าง Audit: ไม่พบ `warning` หรือ `error`
- ไม่กรอกหรือ Submit ข้อมูล, ไม่สร้าง Master, Product, SKU, Stock หรือ Storage object
- ไม่แก้ TSX/CSS, ไม่ apply Migration และไม่ deploy

## 4. สรุปผล

**ผล: ไม่ผ่าน Visual Parity**

ณ เวลาทำ Audit Production มี Route, 8 หมวด, R7.1 command boundary, R6 image boundary และข้อมูลจริงครบเป็น Functional baseline แต่ยังต่างจาก Approved Mockup ทั้งระดับ Page structure, Component composition และ Interaction contract จึงบันทึกสถานะในขณะนั้นเป็น `Visual Parity Pending`; gap ชุดนี้ปิดแล้วใน R7.2.2–R7.2.5

Interaction inventory ที่ตรวจได้:

| รายการ | Mockup | Production |
|---|---:|---:|
| Section | 8 | 8 |
| Continuous form surface | 1 | 0 |
| Separate section cards | 0 | 8 |
| Info guide buttons | 9 | 0 |
| Modal/Dialog contract | 4 | 0 |
| Saved Tags navigation menu | 1 | 0 |
| Physical tabs | 2 | 0 |
| Identifier assistant | 1 | 0 |
| Sales Code sequence panel | 1 | 0 |
| SKU staging workspace | 1 | 0 |
| Security summary | 1 | 0 |

## 5. Locked Diff Register

ระดับความสำคัญ:

- `P0` — โครงสร้างหรือ Workflow หลักไม่ตรง Mockup
- `P1` — Component/Interaction สำคัญไม่ตรง
- `P2` — Copy, spacing, token หรือรายละเอียดรองไม่ตรง

### A. Page Structure และ Heading

| ID | Priority | Approved Mockup | Production ปัจจุบัน | Acceptance สำหรับ Part ถัดไป |
|---|---|---|---|---|
| A-01 | P0 | Form surface เดียว มี 8 Section คั่นด้วยเส้น | 8 การ์ดแยก มี gap/radius/shadow ของแต่ละการ์ด | ใช้ continuous form surface และ section divider ตาม Mockup |
| A-02 | P1 | Canvas สูงสุด 1280px, gutter 16px, form `1fr + 300px`, gap 18px | Canvas ถูกกำหนดโดย App Shell; ที่ viewport 1280px form กว้าง 845px และคอลัมน์หลักเหลือ 527px | รักษา App Shell แต่ Inner content ต้องใช้ breakpoint/layout ตาม Mockup โดยไม่บีบ field ผิด hierarchy |
| A-03 | P1 | มี Eyebrow `Part 2.1.4A · Unified Product Creation` | ไม่มี Eyebrow | แสดง Heading hierarchy เดียวกับ Mockup |
| A-04 | P1 | Header actions สูงประมาณ 38–39px; Secondary ขาวและ Primary inverse | Production action สูง 50px ใช้ muted blue/gray | ใช้ขนาด, radius, gap และ semantic color ตาม Mockup |
| A-05 | P1 | Desktop actions อยู่แถวเดียว; Mobile ยกเลิก/บันทึกร่างอยู่ 2 คอลัมน์และ Primary เต็มแถว | Mobile วางทั้ง 3 ปุ่มเป็นแนวตั้งเต็มแถว | ใช้ responsive action layout ตาม Mockup |
| A-06 | P1 | มี required-field guide ใต้ Banner | ไม่มี required guide | เพิ่ม guide ตามตำแหน่งและรูปแบบ Mockup |
| A-07 | P1 | Prototype banner ครองตำแหน่ง note ก่อน required guide | Production ใช้ Category-missing alert ในตำแหน่งเดียวโดยไม่มี default note | ต้องทำ truthful production note/state ด้วย Mockup ที่อนุมัติก่อน Implement; ห้ามคัดลอกข้อความ Prototype |
| A-08 | P1 | Default Mockup มี Category options และตรวจฟอร์มได้ | Production test Organization ไม่มี Category จึง Disable submit ตั้งแต่เริ่ม | ต้องมี Approved Empty-master state แยกจาก Default parity และ Default verification ต้องมี Master data พร้อม |

### B. Section 1 — ข้อมูลทั่วไป

| ID | Priority | Diff |
|---|---|---|
| B-01 | P1 | Mockup มี Info guide ที่ชื่อสินค้า, รูปแบบ และวิธีนับ; Production ไม่มี Info guide |
| B-02 | P1 | Category/Brand ใช้ Edit icon เปิด Context Master Manager modal พร้อม Search/Bulk/Edit/Archive; Production ใช้ปุ่ม `+` เปิด Quick-add popover เท่านั้น |
| B-03 | P1 | Quantity behavior มีคำอธิบายและตัวอย่าง จำนวนเต็ม/น้ำหนัก/ปริมาตร; Production แสดง helper สั้นและไม่มี example panel |
| B-04 | P0 | Tags ใช้ input/chips, Saved Tags hover/focus menu, search modal, suggestions และ Edit manager; Production แสดงรายการ Checkbox หรือปุ่ม `+` และคำสั่งแนะนำจากชื่อแบบย่อ |
| B-05 | P2 | Mockup มี `หมายเหตุสินค้า` หนึ่งช่อง; Production แยก `คำอธิบายสินค้า` และ `หมายเหตุภายใน` ต้องทำ Field mapping ที่ Owner อนุมัติก่อนตัดสินใจแสดง/ซ่อน |
| B-06 | P2 | Select height, custom chevron 12px, Edit icon และ label alignment ยังไม่ตรงรายละเอียด Mockup |

### C. Section 2 — รูปสินค้า

| ID | Priority | Diff |
|---|---|---|
| C-01 | P1 | Mockup มี header count `0/9`, toolbar, image grid, cover note, policy และ upload status; Production ใช้ Dropzone เดี่ยวและ count อยู่ใน Summary |
| C-02 | P1 | Production มี preview/reorder/remove logic หลังเลือกไฟล์ แต่ composition ก่อน/หลังเลือกภาพยังไม่ใช้ Image grid contract ของ Mockup |
| C-03 | P2 | ข้อความ Mockup ระบุ 5 MB และแนะนำ 1200×1200; Production ระบุ 5 MiB แต่ไม่แสดงขนาดแนะนำในตำแหน่งเดียวกัน |
| C-04 | P2 | ปุ่ม `เพิ่มภาพจำลอง` เป็น Prototype-only ห้ามนำสู่ Production; ต้องคงปุ่มเลือกภาพจริงในตำแหน่ง Toolbar ที่ได้รับอนุมัติ |

### D. Section 3 — SKU แรกและรหัสสินค้า

| ID | Priority | Diff |
|---|---|---|
| D-01 | P1 | Heading Production ใช้ `SKU แรก`; Mockup ใช้ `SKU แรกและรหัสสินค้า` พร้อมคำอธิบายที่ชัดกว่า |
| D-02 | P1 | Mockup มี `ใช้ชื่อเดียวกับสินค้า` และ Variant name assistant; Production ไม่มี |
| D-03 | P1 | Mockup มี Info guide สำหรับ SKU Code, Sales Code, Barcode และ Base Unit; Production ไม่มี |
| D-04 | P0 | Mockup มี Sales Code mode: manual/same SKU/sequence; Production มีเพียงปุ่ม `ใช้ SKU` |
| D-05 | P0 | Mockup มี Barcode mode: manufacturer/internal SKU/internal Sales/none; Production มีเพียงปุ่ม `ใช้ Sales Code` |
| D-06 | P0 | Sales Code sequence Prefix/Start/Digits/Preview/Atomic policy ไม่มีใน Production |
| D-07 | P0 | Identifier assistant และผลตรวจ SKU/Sales Code/Barcode ไม่มีใน Production |
| D-08 | P1 | Base Unit policy modal และหน่วย `set/case` ใน Mockup ไม่มีใน Production UI |
| D-09 | P1 | Initial status selector ใน Mockup ไม่มีใน Production; Production บังคับ Draft ผ่าน Backend แต่ไม่แสดง control/คำอธิบายตำแหน่งเดียวกัน |
| D-10 | P0 | SKU staging table, แก้ไข/ลบ และ `เก็บ SKU นี้และเพิ่มรายการถัดไป` ไม่มีใน Production |

### E. Section 4–8

| ID | Priority | Diff |
|---|---|---|
| E-01 | P1 | Pricing Mockup ใช้ Sale/Cost/Tax category และ Tax-inclusive choice; Production ใช้ Sale/Cost/Tax category/Tax rate 4 ช่อง รูปแบบไม่ตรง |
| E-02 | P1 | Physical Mockup ใช้ 2 Tabs: ตัวสินค้า/กล่อง พร้อม suffix kg/cm และ cross-field validation; Production แสดง 2 Fieldset พร้อมกันและไม่มี Tab contract |
| E-03 | P0 | Packaging Mockup ใช้ enable switch, multiple packaging rows, presets, unit barcode/Sales Code/price และ conversion note; Production มีหน่วยขายได้หนึ่งแถวแบบ 3 ช่อง |
| E-04 | P0 | Bundle Mockup มี Virtual/Pre-assembled mode, component table และเพิ่มหลาย Component; Production รองรับ Component เดียวเมื่อเลือก Bundle |
| E-05 | P1 | Inventory Mockup เลือกสาขาที่เปิดขายได้; Production แสดง Branch เป็น read-only chip |
| E-06 | P1 | Mockup แสดง Available quantity แบบ derived และ Reserved/Allocated warning; Production ไม่มีสองส่วนนี้ |
| E-07 | P1 | Metadata Mockup แสดง Created/Updated/Creator และ Security Guardrails; Production แสดง Organization/Creator/Create time/Initial status แต่ไม่มี Updated และ Security summary |
| E-08 | P2 | Section status labels และคำอธิบาย เช่น `Future contract`, `Inventory Policy`, `Read-only` ไม่ตรง Production copy หลายจุด |

### F. Summary, Validation และ Interaction

| ID | Priority | Diff |
|---|---|---|
| F-01 | P0 | Mockup Summary มี completion percentage/progress bar, product/category, SKU/price/image/branch/packaging/bundle; Production มีเพียงข้อความ R7.2, timeline และ facts 3 ค่า |
| F-02 | P1 | Mockup Timeline มี marker line และ state ต่อ Section (`กำลังกรอก`, `ยังไม่ครบ`, `พร้อม`); Production แสดงเลขและ label ไม่มี state |
| F-03 | P1 | Summary action height/color/order ไม่ตรง Mockup |
| F-04 | P0 | Mockup มี Success modal: กลับแก้ไข/กลับ Products; Production ใช้ inline feedback และ created link ไม่มี modal contract |
| F-05 | P1 | Mockup มี Form alert ด้านบนและ field-level error presentation; Production พึ่ง native required + feedback banner เป็นหลัก |
| F-06 | P1 | Mockup มี Master Data, Saved Tags และ Base Unit modals รวม 4 dialog contracts; Production ไม่มี dialog |
| F-07 | P2 | Back-to-top มีทั้งสองหน้าและถือว่า Behavior baseline ตรง แต่ตำแหน่ง/สีต้องเทียบอีกครั้งหลังแก้ Layout |

### G. Responsive, Theme และ Runtime

| ID | Priority | ผลตรวจ |
|---|---|---|
| G-01 | P1 | Mobile 390px ไม่มี horizontal page overflow ทั้งคู่ แต่ Header actions ต่างตาม A-05 |
| G-02 | P1 | Production Mobile มี System Header/Bottom navigation ซึ่งเป็น Shell exception; Page content ยังต้องตรง Mockup ภายในขอบเขต |
| G-03 | P1 | Production Light/Dark สลับและอ่านได้ แต่ Primary action ใน Dark ใช้สีน้ำเงิน/เทา ขณะที่ Mockup token ใช้ inverse ขาว/ดำ |
| G-04 | P2 | Production Runtime ระหว่าง Audit ไม่พบ console warning/error |

## 6. สิ่งที่ถือว่าผ่านและต้องรักษา

- Route จริงอยู่ภายใต้ Auth, Organization scope และ `product.manage`
- มี Section 1–8 และ Summary/Back-to-top
- R7.1 Atomic command, R6 image pipeline และ Stock safety boundary ยังไม่ถูกลัด
- รูปรองรับ 1–9 JPEG/PNG/WebP และ 5 MiB พร้อม preview/reorder/remove logic
- Draft recovery, idempotency, permission และ server validation ยังคงเป็น Production contract
- Light/Dark และ Mobile page ไม่มี Runtime overlay ในการตรวจครั้งนี้

## 7. ลำดับแก้ที่ล็อกไว้

1. **R7.2.2 — Page Structure:** A-01–A-08 และ F-01–F-03 เฉพาะโครงสร้าง/Visual hierarchy
2. **R7.2.3 — Form Components:** B-01–E-08 ทีละ Section โดยไม่ทำพร้อมกัน
3. **R7.2.4 — Interaction Parity:** Modal, Tags, Identifier, SKU staging, validation, success/recovery
4. **R7.2.5 — Visual Verification:** Side-by-side/Overlay ที่ 390/760/1280/1920 และ Light/Dark
5. **R7.2.6 — Owner Approval:** ปิด R7.2 แล้วจึงเสนอ R7.3

ห้ามเริ่ม R7.2.2 ก่อน Owner อนุมัติ Audit นี้ และห้ามรวม R7.2.2–R7.2.4 ทำพร้อมกัน

## 8. Files Changed ใน R7.2.1

- เพิ่มเอกสาร Audit ฉบับนี้
- อัปเดต Living Plan/R7.2 status reference เท่านั้น
- ไม่มี Production TSX/CSS/Schema/Migration change

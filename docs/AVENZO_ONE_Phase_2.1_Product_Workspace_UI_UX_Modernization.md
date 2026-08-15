# Phase 2.1 — Product Workspace UI/UX Modernization

วันที่เริ่มบันทึก: 14 สิงหาคม 2026

สถานะ: **R0–R7.3 Completed / AVENZO ONE PREVIEW E2E Closed / Production untouched**

## วัตถุประสงค์ของเอกสาร

เอกสารนี้เป็นแผนที่ปรับปรุงต่อเนื่องจากข้อเสนอแนะการทดลองใช้งานจริงของเจ้าของระบบ ใช้เป็นแหล่งอ้างอิงหลักสำหรับการออกแบบหน้า Workspace Products และบันทึกการตัดสินใจใหม่ระหว่างพัฒนา

การแก้ไขใน Phase นี้เป็น **UI/UX modernization เท่านั้น** ไม่เปลี่ยน Domain Model, Database Schema, RLS, Permission, Foundation Command, Audit Event, Product/SKU lifecycle หรือกฎ Stock Movement ที่ผ่านการอนุมัติแล้ว

## ปัญหาที่พบจากการทดลองใช้งาน

1. การสร้างสินค้าหนึ่งรายการต้องทำหลายขั้นตอนและผู้ใช้ต้องเข้าใจความแตกต่างระหว่าง Product กับ SKU ก่อนจึงจะทำงานสำเร็จ
2. เมนูและพื้นที่ใช้งานมีลำดับชั้นมากเกินไป ทำให้ค้นหางานหลักและสถานะปัจจุบันได้ยาก
3. การใช้ Card จำนวนมากทำให้สแกนและเปรียบเทียบข้อมูลหลายรายการได้ช้า
4. Form, Detail และ Lifecycle action แยกจากกันจนผู้ใช้รู้สึกว่างานเดียวแตกเป็นหลายงาน

## หลักการออกแบบที่ตกลงร่วมกัน

- ผู้ใช้เริ่มงานจากปุ่มหลักเดียว: **สร้างสินค้า**
- Form สร้าง Product และ SKU แรกอยู่ในหน้าเดียว เรียงตามลำดับที่ผู้ใช้เข้าใจได้
- UI ซ่อนความซับซ้อนของคำสั่งระบบ แต่ยังเรียก Product/SKU command เดิมตามลำดับอย่างปลอดภัย
- หน้ารายการใช้ Data Grid เป็นพื้นที่หลัก; ใช้ Card เฉพาะ Summary, Empty state, Mobile และข้อมูลที่เหมาะกับ Card จริง
- ทุก code ที่ใช้ค้นหา/ขาย/สแกน (`sku_code`, `sales_code`, `barcode` และรหัสอื่นในอนาคต) ต้อง resolve เป็น `sku_id` ก่อน Stock Command/Movement เสมอ
- รักษา Light/Dark Mode, responsive layout, keyboard navigation และสถานะ Loading/Empty/Error/Permission/Read-only
- ไม่เพิ่มข้อมูลปลอมเพื่อให้เหมือน Template; ช่องที่ระบบยังไม่มี เช่น Category, Vendor และ Price ต้องแยกเป็น Phase ออกแบบ Domain ในอนาคต
- Product Image เป็น requirement ใหม่ของ Phase 2.1 โดยต้องออกแบบ Storage/Data/Permission contract และผ่าน Gate แยกก่อนเชื่อมกับ UI จริง

## โครงสร้างหน้า Workspace Products

### 1. Breadcrumb และ Page Header

- Breadcrumb: `Home > Workspace > Products`
- ชื่อหน้า `Products`
- Badge แสดงจำนวน SKU หรือจำนวนผลลัพธ์ตามบริบท
- คำอธิบายสั้น: จัดการสินค้า, SKU, Sales Code และ Barcode
- Secondary action: Export
- Primary action: สร้างสินค้า

### 2. Search และ Filter Bar

- Search เดียวค้นจากชื่อ Product, SKU Code, Sales Code และ Barcode
- Filter ตาม Lifecycle status
- Filter Product/SKU เมื่อจำเป็น โดยไม่กลับไปใช้ Tab ที่ทำให้ผู้ใช้หลงบริบท
- แสดง Active filter เป็น chip และมีปุ่มล้างตัวกรอง
- เก็บ query/filter/cursor ใน URL เพื่อ reload หรือแชร์หน้าเดิมได้

### 3. Products Data Grid

คอลัมน์หลักสำหรับข้อมูลที่มีอยู่จริง:

| คอลัมน์ | เนื้อหา |
|---|---|
| เลือก | Checkbox สำหรับงานแบบกลุ่มใน Phase ที่รองรับ |
| Product | ภาพปกสินค้า, ชื่อ Product และข้อมูลรองที่จำเป็น |
| SKU / Variants | SKU หลักหรือจำนวน SKU ภายใต้ Product |
| Inventory | On hand/Available แบบ read-only เมื่อข้อมูลพร้อม |
| Base Unit | หน่วยฐานของ SKU |
| Status | Draft, Active หรือ Archived |
| Actions | ดูรายละเอียด, แก้ไข, เปิดใช้งาน หรือเก็บถาวรตามสิทธิ์ |

- Desktop ใช้ตารางเพื่อเปรียบเทียบข้อมูลหลายรายการ
- Mobile ใช้ Priority Card/List โดยคง action สำคัญและ status
- ใช้ cursor pagination เดิมและไม่เปลี่ยน data contract
- แสดงภาพหลักเป็น thumbnail ขนาดคงที่ พร้อม placeholder ที่ไม่ทำให้แถวกระโดดเมื่อสินค้าไม่มีภาพหรือโหลดภาพไม่สำเร็จ
- ภาพเป็นข้อมูลประกอบการค้นหา ห้ามลดความสำคัญของชื่อสินค้า, SKU และสถานะ และต้องมีข้อความทดแทนสำหรับ accessibility

### 4. Unified Create Product

ผู้ใช้เห็น Form เดียว แต่ระบบยังคง Product และ SKU เป็นคนละ Entity

ลำดับข้อมูล:

1. ข้อมูลสินค้า: ชื่อ Product
2. รูปภาพสินค้า: เพิ่มได้อย่างน้อย 1 ภาพและสูงสุด 9 ภาพ
3. ข้อมูล SKU แรก: ชื่อ/Variant, SKU Code, Sales Code, Barcode และ Base Unit
4. สถานะหลังบันทึก: บันทึกร่าง หรือเปิดใช้งานเมื่อผ่าน validation
5. Summary ก่อนกดบันทึก พร้อมแจ้งช่องที่แก้ภายหลังไม่ได้หรือมีข้อจำกัด

พฤติกรรมสำคัญ:

- ปุ่ม Submit หลักชื่อ `สร้างสินค้า`
- รองรับเลือกไฟล์หลายภาพ, preview ก่อนบันทึก, ลบภาพ, จัดลำดับภาพ และกำหนดภาพหลัก โดยภาพลำดับแรกเป็นภาพปกเริ่มต้น
- บังคับจำนวน 1–9 ภาพทั้ง UI และ Server boundary; ชนิดไฟล์, ขนาดต่อไฟล์ และความละเอียดต้องกำหนดใน Image Contract ก่อนเริ่ม implementation
- แสดง upload progress และ error รายภาพ เพื่อให้ผู้ใช้แก้เฉพาะภาพที่มีปัญหาโดยไม่ต้องกรอก Form ใหม่
- Validation อยู่ใกล้ field และ focus ไปยังข้อผิดพลาดแรก
- ป้องกันการกดซ้ำและคง idempotency/optimistic concurrency เดิม
- ถ้าคำสั่งช่วงหลังไม่สำเร็จ ต้องแสดงผลที่เกิดขึ้นจริงและวิธีทำต่ออย่างชัดเจน ไม่บอกว่าสำเร็จทั้งหมด
- ไม่เปลี่ยน Base Unit หรือ permanent identifier โดยฝืนกฎ Domain เดิม

### 5. Product Detail

- ใช้ Drawer/Sheet สำหรับดูเร็วโดยไม่ออกจากรายการ
- จัดกลุ่ม Overview, SKUs, Identifiers, Inventory summary และ Audit metadata
- Action แสดงตาม permission และ lifecycle จริง
- การแก้ไขที่ซับซ้อนเปิดเป็นพื้นที่ Form ที่ชัดเจน ไม่ยัดทุกอย่างไว้ในการ์ดเดียว

## แผนพัฒนาแบ่งส่วน

| Part | งาน | ผลส่งมอบ | Gate |
|---|---|---|---|
| 2.1.1 | Products Workspace Layout | Breadcrumb, header, action hierarchy และ content width ใหม่ | Desktop/Tablet/Mobile + Light/Dark visual QA |
| 2.1.2 | Search & Filters | Unified search, status filter, filter chips และ URL state | Search ทุก identifier + reload persistence |
| 2.1.3 | Products Data Grid | ตารางรายการพร้อมภาพปกสินค้า, status, row actions, empty/loading/error และ cursor pagination | Image/placeholder/alt text + keyboard/table semantics + permission states |
| 2.1.4 | Unified Product Creation | Form หน้าเดียวสำหรับ Product + รูปภาพ 1–9 ภาพ + SKU แรก | Image contract/upload/reorder/cover + existing commands + validation + partial-failure + duplicate-code tests |
| 2.1.5 | Product Detail Drawer | Detail hierarchy และ SKU list ที่อ่านง่าย | Version/lifecycle/action visibility ถูกต้อง |
| 2.1.6 | Product Actions | Edit, activate และ archive interaction ที่ลดความสับสน | Permission + optimistic conflict + confirmation tests |
| 2.1.7 | Export & Bulk Selection | Export ข้อมูลที่มองเห็นและ selection foundation | Scope/permission/large-result behavior ชัดเจน |
| 2.1.8 | Responsive & Accessibility Gate | Mobile priority layout, keyboard, screen reader และ contrast | Regression + authenticated browser verification |

ลำดับแนะนำ: ทำ 2.1.1–2.1.3 เพื่อวางโครงหน้าให้ถูกก่อน จากนั้นทำ 2.1.4 ซึ่งเป็นการลดขั้นตอนที่มีคุณค่าสูงสุด แล้วจึงทำ Detail/Actions/Export และปิด Accessibility Gate

## แผนนำ Products Mockup ไปใช้จริง

วันที่ 15 สิงหาคม 2569 เจ้าของระบบกำหนดให้พัก Clinic Mockup และให้ Products Workspace เป็นลำดับพัฒนาจริงถัดไป การนำไปใช้จริงต้องสร้างเป็น React/Next.js components ภายใน Application Shell เดิม ไม่คัดลอก Standalone HTML/JavaScript เข้า Production โดยตรง

### สถานะระบบจริงที่นำมาต่อยอดได้

- Route จริงอยู่ที่ `web/src/app/organizations/[id]/products/page.tsx` และอ่านข้อมูลผ่าน Server Component
- Interaction ปัจจุบันอยู่ที่ `product-sku-workspace.tsx` และ mutation ผ่าน `executeFoundationCommandAction`
- มี `product.read`, `product.manage`, Organization scope, RLS, server authorization, idempotency, audit/domain event และ optimistic `version` แล้ว
- Product contract ปัจจุบันมี name, description, status; SKU มี SKU Code, name, Sales Code, Barcode, Base Unit และ status
- Inventory Balance/Movement มีอยู่แล้ว แต่หน้า Products ยังไม่มี Product-level aggregate read model
- Mockup มีข้อมูลที่ Domain ปัจจุบันยังไม่มี ได้แก่ รูปภาพ, Category, Brand, Tags, ราคา/ต้นทุน/ภาษี, น้ำหนัก/ขนาด, Packaging, Bundle และ Branch assignment

### ลำดับพัฒนาจริงแบบแบ่ง Gate

| Part | งานจริง | ขอบเขต | Gate ก่อนผ่าน |
|---|---|---|---|
| 2.1.R0 | Contract & Gap Freeze | ทำ Field Matrix ระหว่าง Mockup ↔ Product/SKU/Inventory contract; ระบุ Now/Later/Hidden และห้ามสร้างข้อมูลปลอม | Owner อนุมัติ Field Matrix; ไม่มี Migration |
| 2.1.R1 | Production Workspace Shell | ย้าย Breadcrumb, Heading, responsive content width, action hierarchy, loading/error/empty และ Design Tokens ไปหน้า Next.js จริง | Light/Dark + 1024/1280/1440/1920 + permission states |
| 2.1.R2 | Product Workspace Read Model | เพิ่ม `ProductWorkspaceRow` แบบ paginated ซึ่งรวม Product + SKU summary + identifiers + inventory aggregate โดยไม่เกิด N+1 | Repository/SQL contract, tenant isolation, cursor และ query-plan tests |
| 2.1.R3 | Production Data Grid | สร้าง React Data Grid จาก Mockup: search, status, copy, sort ที่รองรับจริง, column show/hide/width/order/pin และ cursor pagination | Keyboard/table semantics, URL state, preference validation และ authenticated browser tests |
| 2.1.R4 | Product Detail & Safe Actions | Quick View/Drawer, SKU list, inventory summary, edit/activate/archive ตาม permission/version และล็อก immutable fields | Permission, version conflict, lifecycle และ archive-with-stock tests |
| 2.1.R5 | Product Domain Extension Gate | ตัดสินใจ Schema/Command สำหรับ Category, Brand, Tags, price/cost/tax, physical/packaging, Bundle และ unit conversion แยกเป็น additive migrations | Decision record + clean replay + RLS + audit + rollback/compensation |
| 2.1.R6 | Product Image Gate | Product image contract, private/public policy, Storage path, 1–9 files, 5MB allowlist, cover/order, processing และ read model | Upload abuse, tenant isolation, partial failure, cache และ `next/image` verification |
| 2.1.R7.0 | Products Visual Parity Gate | ปรับหน้า Products จริงให้ใช้ heading/action/toolbar/grid hierarchy ตาม Mockup โดยใช้ข้อมูลจริงและไม่สร้าง write control ปลอม | Light/Dark, authenticated browser, R1–R6 regression และ no runtime overlay |
| 2.1.R7.1 | Atomic Product Creation Contract | เพิ่ม `product.create_with_initial_sku` เพื่อสร้าง Product + SKU แรก + metadata แบบ Draft ใน transaction เดียว; รูปใช้ R6 และ Stock ใช้ Inventory Command แยก | Atomicity/idempotency, duplicate identifiers, tenant masters, service-only RPC และ rollback |
| 2.1.R7.2 | Unified Product Creation Form Integration | แปลง Mockup เป็น Route/Form จริงและเรียก R7.1 เพียง command เดียว พร้อม R6 image pipeline และ draft recovery | Field validation, permission, 1–9 image upload, cleanup compensation และ responsive UI |
| 2.1.R7.3 | Creation Recovery & E2E Gate | ปิด end-to-end flow ตั้งแต่ Submit, Retry image, Activate ไปจนกลับ Products และ refresh read model | Authenticated E2E, duplicate/retry, accessibility, audit และ no partial state |
| 2.1.R8 | Export/Bulk & Release Gate | Export ตาม column/permission, bulk search, responsive/a11y/performance/security regression และ Preview verification | Build, SQL tests, advisors, authenticated E2E, Preview approval และ release evidence |

### สถานะ R5 — 15 สิงหาคม 2026

เจ้าของระบบอนุมัติ R5 แล้ว และได้สร้าง Product Domain Extension แบบ additive สำหรับ Category, Brand, Tags, Product metadata, SKU sale/cost/tax, physical/packaging, reorder policy, sell-unit conversion และ Bundle components พร้อม RLS, สิทธิ์ cost แยก, trusted idempotent command และ immutable audit/event แล้ว รายละเอียดอยู่ที่ `AVENZO_ONE_Phase_2.1.R5_Product_Domain_Extension_Gate.md` Local gate ผ่าน baseline verification 90/90 + 7 bridges, isolated replay ของ Phase 2.0.3.2–R5, behavioral/RLS rollback test, DB lint, targeted 4/4, regression 22/22 และ TypeScript โดย ณ checkpoint R5 ยังไม่ apply Production และยังไม่เริ่ม R6 หรือ R7

### สถานะ R6 — 15 สิงหาคม 2026

เจ้าของระบบอนุมัติ R6 แล้ว และ Product Image Gate ปิดเรียบร้อย: private bucket `product-images`, immutable tenant path, 1–9 ภาพ, 5 MiB JPEG/PNG/WebP allowlist, cover/order, trusted idempotent lifecycle command, Storage RLS, audit/event, cleanup compensation และ signed cover-image read model พร้อม `next/image` ถูกสร้างแล้ว รายละเอียดอยู่ที่ `AVENZO_ONE_Phase_2.1.R6_Product_Image_Gate.md` การตรวจผ่าน clean Production baseline replay 90/90 + 7 bridges, isolated Phase replay ถึง R6, SQL behavior/RLS rollback test, DB lint, targeted 5/5 และ TypeScript; migration R5/R6 ถูก apply เฉพาะ AVENZO ONE PREVIEW แล้ว โดย Supabase Production ยังไม่ถูกแตะ

### สถานะ R7.0 — 15 สิงหาคม 2026

เจ้าของระบบอนุมัติ R7.0 และ Production Products Visual Parity Gate ปิดแล้ว: compact heading, single create entry, unified filter/grid card, bounded multi-code dialog, clear/Excel-gate/Customize tools, safe status control และ responsive Light/Dark ถูกนำมาใช้กับ read model จริงโดยไม่เพิ่ม Schema หรือ privileged browser write รายละเอียดอยู่ที่ `AVENZO_ONE_Phase_2.1.R7.0_Products_Visual_Parity_Gate.md` การตรวจผ่าน targeted 5/5, R1–R7.0 regression 35/35, TypeScript และ authenticated Chrome; ขั้นถัดไปคือ R7.1 Atomic Product Creation Contract

### สถานะ R7.1 — 15 สิงหาคม 2026

เจ้าของระบบอนุมัติ R7.1 และ Atomic Product Creation Contract ปิด Local Gate แล้ว: command `product.create_with_initial_sku` สร้าง Product + SKU แรก + Category/Brand/Tags + ราคา/ภาษี/น้ำหนัก/ขนาด/Reorder + Sell Units/Bundle components แบบ Draft ใน transaction เดียว พร้อม idempotency, service-role-only RPC, event/audit และ rollback เมื่อ identifier ซ้ำ รายละเอียดอยู่ที่ `AVENZO_ONE_Phase_2.1.R7.1_Atomic_Product_Creation_Contract.md` การตรวจผ่าน targeted 5/5, R1–R7.1 regression 40/40, TypeScript และ transactional SQL behavior; รูปภาพยังผ่าน R6 และ Stock ยังผ่าน Inventory Command ต่อมา R7.1 ถูก apply เฉพาะ AVENZO ONE PREVIEW ระหว่าง R7.3 โดย Production ไม่ถูกแตะ

### สถานะ R7.2 — 15 สิงหาคม 2026

Route `/organizations/[id]/products/new` มี Backend/Form integration กับ R7.1 Atomic command และ R6 image pipeline แล้ว ช่วงแรก Owner พบ Visual/Interaction gap จึงเปิด R7.2 ใหม่และแก้ตาม Approved Mockup แบบทีละ Part จน R7.2.1–R7.2.5 ผ่าน Owner approval, Visual/Responsive Matrix และ Production parity ก่อนเริ่ม R7.3 รายละเอียดอยู่ที่ `AVENZO_ONE_Phase_2.1.R7.2_Unified_Product_Creation_Form_Integration.md`

### สถานะ R7.2.1 — 15 สิงหาคม 2026

เจ้าของระบบอนุมัติให้เริ่ม R7.2.1 และ Visual Parity Audit ปิด Gap Freeze แล้วโดยไม่มี Production UI code change รายการตรวจพบว่า Production มี Functional baseline ครบ 8 หมวด แต่ยังต่างจาก Approved Mockup ระดับโครงสร้างและ Interaction: Continuous surface 1 ชุดถูกแทนด้วย 8 การ์ด, Info guide 9 จุด/Modal 4 ชุด/Tags navigation/Physical tabs/Identifier assistant/Sales sequence/SKU staging/Security summary ยังไม่มี รายละเอียดและ Diff ID A-01–G-04 อยู่ที่ `AVENZO_ONE_Phase_2.1.R7.2.1_Visual_Parity_Audit.md` ขั้นถัดไปคือ R7.2.2 Page Structure หลัง Owner อนุมัติ Audit; ห้ามรวม R7.2.2–R7.2.4 ทำพร้อมกัน

### สถานะ R7.2.2 — 15 สิงหาคม 2026

เจ้าของระบบอนุมัติให้ Implement R7.2.2 และ Page Structure ตาม Diff A-01–A-08/F-01–F-03 ถูกนำมาใช้ใน Route จริงแล้ว: Continuous form surface, canvas/breakpoint ภายใน App Shell, Mockup heading/actions, truthful production note, required guide, empty-master state และ Summary progress/facts/timeline/actions รายละเอียดอยู่ที่ `AVENZO_ONE_Phase_2.1.R7.2.2_Page_Structure.md` การตรวจผ่าน targeted 4/4, Product regression 50/50, TypeScript และ authenticated Chrome 1920px Light/Dark โดยไม่สร้างข้อมูล ขั้นถัดไปคือ Owner visual review; ห้ามเริ่ม R7.2.3 ก่อนอนุมัติผลรอบนี้

### สถานะ R7.2.3A — 15 สิงหาคม 2026

Owner อนุมัติ R7.2.2 และให้เริ่ม R7.2.3 แบบทีละ Section แล้ว รอบนี้ทำเฉพาะ Section 1 `ข้อมูลทั่วไป` ตาม Diff B-01–B-06: Information guides, edit-icon master controls, connected product-structure button group, quantity examples, saved Tags navigation/editor และ internal product note ที่จำกัด 1,000 ตัวอักษร โดยไม่เปลี่ยน R7.1 command, R6 image lifecycle หรือ Stock boundary รายละเอียดอยู่ที่ `AVENZO_ONE_Phase_2.1.R7.2.3A_General_Form_Components.md` การตรวจผ่าน targeted 15/15, Product regression 55/55, TypeScript และ authenticated Chrome Light/Dark โดยไม่สร้างข้อมูล ขั้นถัดไปคือ Owner visual review; ห้ามเริ่ม R7.2.3B Section 2 ก่อนอนุมัติผลรอบนี้

### สถานะ R7.2.3B — 15 สิงหาคม 2026

Owner อนุมัติ R7.2.3A และให้เริ่ม Section 2 แล้ว รอบนี้ทำเฉพาะ `รูปสินค้า` ตาม Diff C-01–C-04: header count, real-file toolbar, 1:1 image grid/empty state, cover/reorder/remove controls, 5 MB/1200 × 1200 policy และ live upload status โดยไม่มีปุ่มเพิ่มภาพจำลอง และยังคง R6 prepare-upload-finalize/reorder/cleanup boundary เดิม รายละเอียดอยู่ที่ `AVENZO_ONE_Phase_2.1.R7.2.3B_Image_Form_Components.md` การตรวจผ่าน targeted 5/5, Product regression 60/60 และ TypeScript; Browser control ไม่พร้อมในรอบนี้ จึงรอ Owner visual review บน Route จริงก่อนเริ่ม R7.2.3C Section 3

### สถานะ R7.2.3C — 15 สิงหาคม 2026

Owner อนุมัติ R7.2.3B และให้เริ่ม Section 3 แล้ว รอบนี้ทำ `SKU แรกและรหัสสินค้า` ระดับ Form Components ตาม Diff D-01–D-10: name assistant, identifier guides/modes, Sales sequence preview, identifier advisory, Base Unit policy, truthful Draft status และ SKU staging surface โดยยังคง interaction เต็มไว้ R7.2.4 ตาม Gap Freeze และไม่เพิ่ม `sku.create` เข้า flow ปัจจุบัน รายละเอียดอยู่ที่ `AVENZO_ONE_Phase_2.1.R7.2.3C_SKU_Identifier_Form_Components.md` การตรวจผ่าน targeted 6/6, Product regression 66/66 และ TypeScript; ขั้นถัดไปคือ Owner visual review ก่อน R7.2.3D Section 4 ราคาและภาษี

### สถานะ R7.2.4A — 15 สิงหาคม 2026

Owner อนุมัติ R7.2.3H และให้เริ่ม R7.2.4 แบบทีละ Interaction แล้ว รอบนี้ทำเฉพาะ Dialog จัดการหมวดหมู่/แบรนด์: Search, Inline rename, Archive/Undo, Bulk add, Duplicate guard และ Keyboard interaction โดยทุก Mutation ผ่าน trusted `product.master.upsert` และ Selector แสดงเฉพาะ Active master รายละเอียดอยู่ที่ `AVENZO_ONE_Phase_2.1.R7.2.4A_Context_Master_Data_Interaction.md` การตรวจผ่าน targeted 7/7, Product regression 99/99 และ TypeScript; Owner อนุมัติ Part นี้แล้วเมื่อ 15 สิงหาคม 2026

### สถานะ R7.2.4B — 15 สิงหาคม 2026

หลัง Owner อนุมัติ R7.2.4A รอบนี้ทำเฉพาะ Saved Tags Interaction ตาม Approved Mockup: Quick menu แบบ Hover/Focus/Click, กลุ่มปักหมุด/ใช้ล่าสุด/ใช้บ่อย, Search + Multi-select modal, Empty state, 12-Tag limit, Create preview และ Tag master manager โดย Mutation ผ่าน `product.master.upsert` และ `ใช้ล่าสุด` เป็น Browser UI preference แยกตาม Organization สูงสุด 5 รายการ รายละเอียดอยู่ที่ `AVENZO_ONE_Phase_2.1.R7.2.4B_Saved_Tags_Interaction.md` การตรวจผ่าน targeted 8/8, Product regression 107/107, TypeScript และ authenticated Desktop Light โดยไม่เขียนข้อมูล; Owner อนุมัติ Part นี้แล้วเมื่อ 15 สิงหาคม 2026 ขั้นถัดไปที่เสนอคือ R7.2.4C Identifier Assistant Interaction เพียง Part เดียว

### สถานะ R7.2.4C — 15 สิงหาคม 2026

หลัง Owner อนุมัติให้เริ่ม R7.2.4C รอบนี้ทำเฉพาะ Identifier Assistant Interaction ตาม Approved Mockup: Live uppercase/sync modes, Stale state, Client validation, Authenticated Server advisory duplicate check ภายใน Organization ภายใต้ Session/RLS และ `product.manage`, Async stale-response guard, Loading/accessibility state และ Sales Code sequence แบบ Preview-only โดย Database transaction ยังคงเป็นผู้ยืนยัน Unique ขั้นสุดท้ายและไม่มีการจองรหัส รายละเอียดอยู่ที่ `AVENZO_ONE_Phase_2.1.R7.2.4C_Identifier_Assistant_Interaction.md` การตรวจผ่าน targeted 8/8, Product regression 115/115, TypeScript และ authenticated Desktop Light โดยไม่สร้าง Product/SKU หรือข้อมูลทดสอบ; Owner อนุมัติ Part นี้แล้วเมื่อ 15 สิงหาคม 2026

### สถานะ R7.2.4D — 15 สิงหาคม 2026

หลัง Owner อนุมัติ R7.2.4C และให้เริ่ม R7.2.4D รอบนี้ทำเฉพาะ SKU Staging Interaction ตาม Approved Mockup: add/edit/cancel/delete, Count/Empty/Table, Browser Draft recovery สูงสุด 100 รายการ/256 KB, local cross-SKU duplicate guard, Authenticated Server advisory check ก่อนเก็บ และ sequence progression แบบ Preview-only รายการแรก Map เข้า R7.1 initial SKU ได้ แต่ถ้ามากกว่า 1 รายการระบบหยุดก่อนส่งเพื่อไม่ให้ข้อมูลสูญหาย เพราะยังไม่มี Atomic multi-SKU command รายละเอียดอยู่ที่ `AVENZO_ONE_Phase_2.1.R7.2.4D_SKU_Staging_Interaction.md` การตรวจผ่าน targeted 10/10, Product regression 129/129, TypeScript และ authenticated Desktop Light โดยไม่สร้าง Product/SKU หรือข้อมูลทดสอบ; Owner อนุมัติ Part นี้แล้ว

### สถานะ R7.2.4E — 15 สิงหาคม 2026

R7.2.4E ทำ Validation Summary ตาม Approved Mockup โดยรวม issue ไว้ด้านบน เชื่อมปุ่มแต่ละ issue ไปยังช่องจริงด้วย Scroll/Focus/`aria-invalid`, แสดงจำนวน issue ใน Timeline และตรวจ Required, Image, SKU staging/identifier, Price, Physical, Packaging/Bundle, Inventory และ bounded text ก่อนเรียก Atomic command โดย Server transaction ยังเป็น Authority ขั้นสุดท้าย รายละเอียดอยู่ที่ `AVENZO_ONE_Phase_2.1.R7.2.4E_Validation_Summary_Interaction.md` การตรวจผ่าน targeted 10/10, Product regression 139/139, TypeScript และ authenticated Desktop Light โดยไม่เขียนข้อมูล ขั้นถัดไปตามลำดับที่ Owner อนุมัติคือ R7.2.4F Success & Recovery Interaction เพียง Part เดียว

### สถานะ R7.2.4F — 15 สิงหาคม 2026

R7.2.4F ปิด Success/Recovery Interaction ตาม Approved Mockup และ Production truth: Success dialog เปิดหลัง Atomic + Image pipeline สำเร็จครบ, รองรับ Focus trap/Escape/คืน Focus, แสดง Draft/No-stock state อย่างตรงไปตรงมา; Recovery record ถูก Validate/Bound ก่อน Restore และ Image retry ใช้ Product ID เดิมโดยไม่เรียก Atomic creation ซ้ำ รายละเอียดอยู่ที่ `AVENZO_ONE_Phase_2.1.R7.2.4F_Success_Recovery_Interaction.md` การตรวจผ่าน targeted 10/10, Product regression 149/149, TypeScript และ authenticated route verification โดยไม่สร้างข้อมูลทดสอบ ขั้นถัดไปตามลำดับคือ R7.2.5 Visual Parity & Responsive QA เพียง Part เดียว

### สถานะ R7.2.5 — 15 สิงหาคม 2026

R7.2.5 ปิด Local Visual/Responsive Gate ของ Unified Product Creation: Desktop canvas/Summary rail, 980 container collapse, 760 form stacking, 480 dialog/metadata layout, 44px touch target, mobile validation rows และ bounded horizontal editors ผ่าน Matrix 12/12; Product regression 161/161 และ TypeScript ผ่าน Authenticated Desktop 1920 Light/Dark ไม่มี horizontal overflow รายละเอียดอยู่ที่ `AVENZO_ONE_Phase_2.1.R7.2.5_Visual_Parity_Responsive_QA.md`

### สถานะ R7.3 — 15 สิงหาคม 2026

R7.3 ปิด Creation Recovery & E2E Gate ด้วย Controlled data เฉพาะ AVENZO ONE PREVIEW: Atomic retry คืน ID เดิม, duplicate rollback ไม่มี partial Product/SKU, image fail-retry-finalize ใช้ Product ID เดิม, authenticated Products read model แสดง signed cover image และ cleanup เหลือเฉพาะ immutable audit/history โดยไม่มี Inventory Balance หรือ Stock Movement การตรวจผ่าน targeted 10/10, Product regression 171/171 และ TypeScript; Supabase Production ไม่ถูกแตะ รายละเอียดอยู่ที่ `AVENZO_ONE_Phase_2.1.R7.3_Creation_Recovery_E2E_Gate.md`

### Next.js implementation boundary

- `page.tsx` เป็น Server Component สำหรับ auth, Organization/permission และ initial read; เริ่ม independent reads พร้อมกันเพื่อลด waterfall
- Client Components รับเฉพาะ serializable read models และดูแล search interaction, column preferences, menus, drawer และ form state
- Mutation ใช้ Server Actions/command service เดิม; ห้ามเรียก privileged Supabase client จาก Browser
- รูปสินค้าใช้ `next/image` พร้อมขนาด/`sizes` ที่ชัดเจนและ placeholder เพื่อไม่ให้ตารางกระโดด
- Search/filter/cursor ที่มีผลต่อข้อมูลใช้ URL state เพื่อ reload/share/back ได้; column width/order/pin เป็น UI preference ที่ validate ก่อนอ่านจาก local storage และค่อยพิจารณา cross-device persistence ภายหลัง
- Stock ใน Data Grid เป็น read-only aggregate; ทุกการเปลี่ยน Balance ต้องผ่าน Inventory Command/Movement และ resolve identifier เป็น `sku_id` เสมอ

### ลำดับอนุมัติที่แนะนำ

เริ่ม 2.1.R0 → R1 → R2 → R3 ก่อน เพื่อให้หน้า Products จริงใช้ UI ใหม่กับข้อมูลที่มีอยู่โดยไม่รอ Schema ใหม่ จากนั้นตรวจใช้งานจริงหนึ่งรอบ แล้วจึงอนุมัติ R4–R7 ทีละ Gate ส่วน Live Sale Sales Code Reservation ทำหลัง atomic Unified Product Creation พร้อม ไม่รวมในรอบ Data Grid แรก

## Prototype รอบที่ 1 — Layout + Data Grid

วันที่ 14 สิงหาคม 2026 สร้าง Standalone HTML Prototype สำหรับทดลองก่อนเชื่อมระบบจริง:

- Artifact: `docs/mockups/phase-2.1-products-workspace-ui.html`
- ขอบเขตมี 3 ส่วน: Breadcrumb, Heading + SKU Badge และ Products Data Grid
- ใช้ข้อมูลและภาพสินค้าจำลองภายในไฟล์เท่านั้น
- ทดลอง Search, Status filter, Sort, Row selection, Pagination, Row menu, CSV mock export และ Light/Dark Mode ได้
- ปุ่ม `สร้างสินค้า` เป็นเพียงจุดวางตำแหน่งและข้อความแจ้งเตือน ยังไม่มี Unified Product Creation form ใน Prototype รอบนี้
- ไม่มี API call, `fetch`, Supabase client, Auth, Database, Storage หรือการเชื่อม Route ของระบบจริง
- ตัวตรวจ: `node scripts/validate-phase-2.1-products-prototype.mjs` — ผ่าน 15/15 checks

Prototype นี้ใช้เก็บ feedback ด้านตำแหน่ง, ลำดับข้อมูล, ความหนาแน่นของตารางและ interaction เท่านั้น ห้ามนำไปวางทับ Production page โดยตรง

## Prototype รอบที่ 2 — Advanced Data Grid Interaction

วันที่ 14 สิงหาคม 2026 เจ้าของระบบอนุมัติให้ขยาย Standalone HTML Prototype โดยยังห้ามเชื่อมระบบจริง:

- Hover ภาพสินค้าเพื่อดู Preview ขนาดใหญ่ พร้อม keyboard focus
- แยกคอลัมน์ `รหัส CF` และเพิ่ม Copy action สำหรับ CF/SKU
- ลากปรับความกว้างคอลัมน์และจำค่าหลัง reload ด้วย `localStorage`
- Inline Edit สำหรับรหัส CF, Base Unit และ Stock; `Enter` บันทึก, `Esc` ยกเลิก
- Status Combobox สำหรับทดลองเปลี่ยน Draft/Active/Archived
- Bulk Search Modal รองรับ comma, space และ newline เช่น `B03,b11,BLZ-DBL-NVY`
- แสดงจำนวนรหัสทั้งหมด/พบ/ไม่พบ ตัดค่าซ้ำ และรองรับ `Ctrl+Enter`
- ปุ่ม Reset ล้างข้อมูลจำลอง, column width และ theme ที่บันทึกใน browser

Stock และ Status ในรอบนี้เป็น Interaction Prototype เท่านั้น ไม่ถือเป็นการอนุมัติให้ Production UI เขียน Inventory Balance หรือลัด Foundation Command/Lifecycle rule

## Prototype รอบที่ 3 — Search + Column Customization

วันที่ 14 สิงหาคม 2026 เจ้าของระบบอนุมัติให้ทำงาน 8 ข้อตามลำดับและห้ามทำพร้อมกัน โดยดำเนินการครบแล้วดังนี้:

1. ช่องค้นหาหลักรองรับหลายรหัสแบบ OR เช่น `CF-B03,B03` และแก้ปุ่ม Clear ซ้อนด้วย Custom X เพียงอันเดียว
2. ปุ่มค้นหาใน Bulk Search Modal มี Tooltip ด้านบนและรองรับ `Ctrl+Enter`
3. ผลสรุปเปลี่ยนเป็น Compact Alert พร้อม Custom SVG Icon สำหรับทั้งหมด/พบ/ไม่พบ/รหัสซ้ำ
4. Status Combobox ถูกล็อกความกว้าง 112px ไม่ยืดตามคอลัมน์
5. เพิ่ม Column Configuration Model สำหรับ order, width, visible และ pinned พร้อม normalization
6. เพิ่มปุ่มและ Popover `Customize` ต่อจากปุ่มล้างตัวกรอง
7. เปิดใช้งาน Show/Hide, Width, Pin สูงสุด 3 คอลัมน์, Reorder, Restore และ Save ด้วย `localStorage`
8. Static/logic verification ผ่าน 47/47 structure checks และ 10/10 interaction-model checks พร้อม `git diff --check`

System columns ได้แก่ Checkbox เลือกแถวและ Actions ไม่อยู่ในรายการ Customize; Checkbox ถูกตรึงด้านซ้ายโดยไม่ใช้โควตา 3 คอลัมน์ ส่วนคอลัมน์ที่ผู้ใช้ปักหมุดจะถูกย้ายต่อจาก Checkbox และแสดงเงาที่ขอบคอลัมน์ตรึงสุดท้าย

การทดสอบครั้งนี้ยังเป็น Standalone HTML เท่านั้น ไม่มี API, `fetch`, Supabase, Auth, Database หรือ Storage integration และไม่อนุมัติ Production behavior ของ Inline Stock/Status

## Prototype รอบที่ 4 — Compact Toolbar + Excel Tools

วันที่ 14 สิงหาคม 2026 เจ้าของระบบอนุมัติให้ปรับ Standalone HTML Prototype แบบทำทีละข้อ 1–8 และดำเนินการครบแล้วดังนี้:

1. ปรับ Status Combobox เป็นรูปแบบ default ที่กระชับ ความสูง 30px ความกว้างคงที่ 120px และเว้นลูกศรจากขอบขวา 10px
2. ย้ายปุ่ม `สร้างสินค้า` ให้อยู่ระดับเดียวกับคำอธิบายใต้ Heading และนำปุ่ม Theme/Reset/Export เดิมออกจาก Workspace Prototype
3. เปลี่ยน Clear Filters, Excel Tools และ Customize Columns เป็น Icon Toolbar แถวเดียวกัน
4. เพิ่ม Tooltip ด้านบน, accessible name และ keyboard navigation ด้วย Arrow Left/Right, Home และ End
5. เพิ่ม Excel Menu สำหรับเลือกไฟล์ Excel/CSV ในเครื่อง, ดาวน์โหลด CSV Template และเปิดการตั้งค่าคอลัมน์ส่งออก
6. เพิ่ม Export Columns Dialog ซึ่งบันทึกค่าด้วย `localStorage` แยกจากการแสดง/ซ่อนคอลัมน์ใน Data Grid
7. เก็บ Responsive layout, modal focus containment และรองรับ design token ของ Dark Theme โดยไม่มีปุ่มสลับ Theme ใน Prototype
8. Static/logic verification ผ่าน 72/72 structure checks และ 10/10 interaction-model checks พร้อม `git diff --check`

Theme และ Reset ถือเป็นความรับผิดชอบของ Application Shell ในระบบจริง จึงไม่แสดงเป็น action ของหน้า Products อีกต่อไป ส่วน Import/Template/Export Columns ในรอบนี้เป็น local interaction เท่านั้น ไม่มีการอัปโหลดหรือเชื่อม API ใด ๆ

## Prototype รอบที่ 5 — Heading + Inverse Badge + Default Select

วันที่ 14 สิงหาคม 2026 ปรับตามผลตรวจหน้าจอเพิ่มเติม:

1. ลดระยะระหว่าง Heading และคำอธิบาย พร้อมจัดคำอธิบายและปุ่ม `สร้างสินค้า` ให้จบที่แนวล่างเดียวกัน และลดช่องว่างก่อน Data Grid
2. เปลี่ยน SKU Badge เป็นพื้นดำ/ตัวอักษรขาวใน Light Theme และพื้นขาว/ตัวอักษรดำใน Dark Theme
3. กำหนด Select Field Pattern ของ Prototype ให้ซ่อน native arrow และใช้ custom chevron ที่ห่างขอบขวา 12px สำหรับ Status Filter, Status ในแต่ละแถว และ Rows per Page

การเปลี่ยนแปลงนี้ยังเป็น Prototype CSS/HTML เท่านั้น การนำ Select Field Pattern ไปใช้ทั้งระบบจริงต้องทำผ่าน Shared Component/Design System ใน Part implementation แยกต่างหาก

## Prototype รอบที่ 6 — Part 2.1.4A Unified Product Creation

วันที่ 14 สิงหาคม 2026 เจ้าของระบบอนุมัติให้สร้าง Unified Product Creation Form Mockup และเชื่อมจากปุ่ม `สร้างสินค้า` ใน Products Workspace โดยยังคงเป็น Standalone HTML เท่านั้น:

- Artifact: `docs/mockups/phase-2.1-unified-product-creation-form.html`
- Form หน้าเดียวแบ่ง 8 ส่วน: ข้อมูลทั่วไป, รูป 1–9 ภาพ, SKU แรก, ราคา/ภาษี, น้ำหนัก/ขนาด, Packaging/Bundle, สาขา/Inventory Policy และ System Metadata
- เพิ่ม Category, Product structure, Quantity behavior, Brand, Tags, Internal note, Sale price, Cost price, Tax category, Weight, Product dimensions และ Box dimensions
- แยก Read-only system metadata ได้แก่ Created at, Updated at และ Created by ออกจากช่องกรอกตอนสร้าง
- แยก Safety Stock, Reorder Point และ Target Stock Level จาก Available quantity ซึ่งเป็น Derived read model และห้ามกรอกโดยตรง
- ทดลอง Packaging conversion สำหรับการขายแพ็ก/ลัง โดยใช้ Factor แปลงกลับเป็น Base Unit พร้อม Barcode, Sales Code และราคาเฉพาะหน่วยขาย
- ทดลอง Virtual Bundle และ Pre-assembled Bundle พร้อม Component SKU และ Quantity โดยยืนยันว่า Stock authority ยังคงเป็น Component `sku_id`/Assembly Command
- รูปสินค้าเพิ่มจาก Mock image หรือ local file preview ได้สูงสุด 9 ภาพ พร้อม reorder, cover และ remove โดยไม่อัปโหลดออกจาก Browser
- เพิ่ม live summary, completion indicator, validation, local draft และ success state แบบจำลอง
- Products Workspace validator ผ่าน 78/78 structure checks + 10/10 interaction-model checks และ Unified Form validator ผ่าน 49/49 checks

Mockup นี้ไม่ถือเป็นการอนุมัติ Schema, Price Book, Tax, Costing, Reservation, Unit Conversion, Packaging, Bundle, Assembly หรือ Image Storage implementation งานเหล่านี้ต้องเปิด Domain/Data Decision และ Gate แยกก่อนเชื่อมระบบจริง

## Prototype รอบที่ 7 — Assisted Product Creation UX

วันที่ 14 สิงหาคม 2026 เจ้าของระบบอนุมัติให้ปรับ Part 2.1.4A Mockup แบบทำและทดสอบทีละข้อ 1–12 โดยต้องตรวจความถูกต้อง, UI design และ usability ก่อนเริ่มข้อถัดไป:

1. Auto-fill ชื่อรุ่น/ตัวเลือกสินค้าตาม Product structure พร้อมตัวเลือกใช้ชื่อเดียวกับสินค้า
2. Master Data controls สำหรับ Category และ Brand โดยใช้ Add/Manage action ที่มี accessible label/tooltip
3. Quantity behavior ช่วยแนะนำ Base Unit และจำกัดหน่วยที่ไม่เข้ากัน
4. SKU/Sales/Barcode assistant พร้อมวิธีกรอกเอง, ใช้รหัสร่วมแบบมีเงื่อนไข, สร้าง Internal Barcode และตรวจรหัสซ้ำ
5. Sales Code sequence พร้อม Prefix, Start number, Digit count และ Preview เช่น `A001 → A002`
6. เพิ่มรายการ SKU ต่อเนื่องภายใน Form โดยรหัสเป็น Preview จน Server จองเลขแบบ Atomic ตอนบันทึกจริง
7. Info Popover, guideline, example และ required-field guidance สำหรับช่องสำคัญ โดยรองรับ mouse, keyboard และ mobile tap
8. Product image preview อัตราส่วน 1:1, สูงสุด 9 ภาพ, JPEG/PNG/WebP และไม่เกิน 5 MB ต่อภาพ
9. แยก Physical attributes เป็น 2 Tabs: น้ำหนัก/ขนาดสินค้า และน้ำหนัก/ขนาดกล่อง พร้อม cross-field validation
10. กำหนด max length, numeric bounds, file/payload policy, code canonicalization และ Security states ใน Mockup
11. ตรวจ Light/Dark contract, Responsive, Keyboard, Screen-reader semantics และ Draft restore
12. อัปเดต Living Plan, validator evidence และให้เจ้าของระบบตรวจภาพก่อนเปิด Domain/Data implementation gate

กฎที่ล็อกในรอบนี้:

- Category และ Brand เพิ่มเองได้ผ่าน Master Data interaction; Quantity behavior เป็น System enum และห้ามเพิ่มอิสระ
- Base Unit เพิ่ม/แก้ได้เฉพาะสิทธิ์ที่กำหนด และ SKU ที่ใช้งานจริงยังคงมี Base Unit เดียวตาม Contract ปัจจุบัน
- อนุญาตให้เสนอ `Sales Code = SKU Code` และ Internal Barcode จาก SKU/Sales Code ใน Mockup แต่ห้ามผสมหลายรหัสเป็นข้อความเดียว
- Barcode จากผู้ผลิตและ Internal Barcode ต้องแยกชนิด และค่าที่สแกนต้อง resolve เป็น `sku_id` เดียวแบบ fail closed
- การตรวจรหัสระหว่างกรอกเป็น advisory; Server validation/unique constraint/atomic sequence ตอนบันทึกจริงเป็น authority
- Draft ไม่ควรจองเลข Sales Code ถาวร; การบันทึกจริงจึง allocate/confirm เลขเพื่อป้องกัน concurrent collision
- รูปภาพต้องตรวจ MIME/magic bytes, decode/re-encode, strip metadata, จำกัด pixel และสุ่ม Storage path ฝั่ง Server ก่อน Production
- ข้อความเก็บเป็น Plain text, จำกัดความยาว, normalize/trim, ปฏิเสธ control characters และห้ามเชื่อ Organization/actor/permission จาก Client payload

### ผลการทำและทดสอบตามลำดับ 1–12

| ข้อ | ผลลัพธ์ | หลักฐานเมื่อจบข้อนั้น |
|---:|---|---|
| 1 | Auto-fill ชื่อรุ่น/ตัวเลือกตาม Simple, Variant และ Bundle พร้อมหยุด Auto-fill เมื่อผู้ใช้แก้เอง | Unified Form validator 55/55 |
| 2 | Category/Brand Master Data Modal: ค้นหา, เพิ่มหลายรายการ, แก้ชื่อ, เก็บถาวร, Permission guidance และ Draft restore | 60/60 |
| 3 | Quantity behavior จำกัด Base Unit ที่เข้ากันและแสดง One-SKU/One-Base-Unit contract | 64/64 |
| 4 | SKU/Sales/Barcode assistant, source modes, advisory duplicate registry และ Server authority guidance | 69/69 |
| 5 | Sales Code Prefix/Start/Digits และ Preview ต่อเนื่อง พร้อม Atomic allocation policy | 73/73 |
| 6 | เก็บ/แก้ไข/ลบ SKU ต่อเนื่อง, กันรหัสซ้ำในรายการ และคืน SKU drafts | 78/78 |
| 7 | Required guide และ Info Popover ที่ใช้ได้ด้วย Mouse, Keyboard, Focus, Escape และ Mobile tap | 83/83 |
| 8 | ภาพ 1:1, 1–9 ภาพ, JPEG/PNG/WebP, 5 MB ต่อภาพ และ Live upload feedback | 88/88 |
| 9 | Product/Box Physical Tabs พร้อม Arrow/Home/End และ Gross/Net/Dimension cross-validation | 93/93 |
| 10 | Max length, numeric bounds, code pattern, NFKC normalization, control-character rejection, Draft 256 KB และ Server file/session policy | 102/102 |
| 11 | Light/Dark token contract, Responsive/Coarse pointer, Focus trap, modal return focus, Draft v2 sanitization และ malformed-draft fail-safe | 114/114 |
| 12 | Living Plan/README อัปเดตและรัน Products Workspace + Unified Form + diff verification รวม | Products 78/78 + interaction 10/10; Form 114/114; `git diff --check` ผ่าน |

ข้อจำกัดของหลักฐานรอบนี้:

- Standalone Mockup ยังคงไม่เรียก API, Supabase, Storage หรือ Command ใด ๆ
- ตัวตรวจสอบ Browser ในสภาพแวดล้อมนี้ไม่อนุญาตให้ Navigate ไป `file://` ด้วยนโยบายความปลอดภัย จึงใช้ Structure/Interaction/Accessibility contract validators และ syntax checks เป็นหลักฐานอัตโนมัติ
- เจ้าของระบบต้อง Refresh ไฟล์ Mockup และตรวจภาพ/ระยะ/ถ้อยคำใน Light/Dark และหน้าจอที่ใช้งานจริงอีกครั้งก่อนเปิด Domain/Data implementation gate

## Prototype รอบที่ 8 — Part 2.1.3B Products Data Grid Field Alignment

วันที่ 15 สิงหาคม 2026 เจ้าของระบบอนุมัติให้ปรับ Products Data Grid ให้สอดคล้องกับข้อมูลใน Unified Product Creation Form โดยยังเป็น Standalone UI Mockup และไม่เชื่อมระบบจริง

ขอบเขตที่อนุมัติ:

1. รักษาคอลัมน์หลักเริ่มต้นให้กระชับ: รูป/Product, รหัส CF, SKU/Variants, Stock, Base Unit, ราคา และ Status
2. เพิ่มคอลัมน์เสริมใน Customize: หมวดหมู่, แบรนด์, Barcode, วิธีนับ, ราคาต้นทุน, ภาษี, Tags, สาขา, วันที่สร้าง, วันที่แก้ไขล่าสุด และผู้สร้าง
3. ข้อมูลรายละเอียดสูง เช่น น้ำหนัก/ขนาดสินค้า, น้ำหนัก/ขนาดกล่อง, หมายเหตุ, Packaging และ Bundle Components ให้แสดงใน Quick View แทนการเปิดเป็นคอลัมน์เริ่มต้น
4. Product ที่มีหลาย SKU ต้องแสดงจำนวน Variants และเปิดดูรายการ SKU ย่อยได้โดยไม่สร้างคอลัมน์แยกต่อ Variant
5. Search ต้องค้นหา Product name, SKU Code, Sales Code, Barcode, Category, Brand และ Tags ได้ใน Mock interaction model
6. Customize ต้องกำหนด Show/Hide, Width, Pin และ Order ของคอลัมน์ใหม่ได้ โดยรักษาข้อจำกัดปักหมุดสูงสุด 3 คอลัมน์
7. Inline Edit ยังคงจำกัดเฉพาะข้อมูลที่ปลอดภัยใน Prototype; ข้อมูลด้านต้นทุน ภาษี และ Physical attributes ไม่แก้จาก Data Grid โดยตรง
8. ต้องเพิ่ม validator evidence และให้เจ้าของระบบตรวจภาพก่อนนำ Field Alignment ไปใช้ในระบบจริง

กฎการออกแบบ:

- ไม่เพิ่มทุก Field เป็น Default column เพราะจะทำให้ตารางกว้างและลดความเร็วในการอ่านงานหลัก
- `Stock` และ `Available` เป็นค่าที่มาจาก Inventory read model ไม่ใช่ช่อง Product master ที่แก้ได้โดยตรง
- Cost ต้องอยู่ภายใต้ Permission และไม่แสดงเป็น Default column
- Product Image, Category, Brand, Pricing, Packaging และ Bundle implementation ยังต้องผ่าน Domain/Data gate ที่เกี่ยวข้อง
- Quick View เป็นการจัดวางข้อมูลเท่านั้น ไม่ใช่การอนุมัติให้ Client อ่านข้อมูลที่ Permission ไม่อนุญาต

## Prototype รอบที่ 9 — Products UX Refinement 1–10

วันที่ 15 สิงหาคม 2026 เจ้าของระบบอนุมัติแผนปรับ UI จำนวน 10 หัวข้อ โดยกำหนดให้พัฒนาและทดสอบทีละหัวข้อ ห้ามรวมหลายหัวข้อในรอบเดียว:

1. `[Completed]` แก้ Quick View SKU Table ให้หัวตารางเรียงแนวนอนตรงกับข้อมูล ใช้พื้นดำ/ตัวอักษรขาว มีสัดส่วนคอลัมน์ หัวตาราง Sticky และพื้นที่เลื่อนที่ใช้ Keyboard ได้
2. `[Completed]` ปรับ Products Data Grid Header เป็นพื้นดำ/ตัวอักษรขาว รวม Header ที่ปักหมุดและเส้น Resize
3. `[Completed]` ทำ Category/Brand/Tags manager ให้ตรงกับ Master ที่แก้ โดยเปิดตรงจากปุ่มแต่ละประเภทและไม่มี Tab ข้ามประเภท
4. `[Completed]` ปรับคำอธิบายวิธีนับจำนวน แยกจำนวนเต็ม/ทศนิยมออกจาก Base Unit พร้อมตัวอย่าง
5. `[Completed]` แนะนำ Tags จากชื่อสินค้า รองรับภาษาไทยและ Combining Marks พร้อมเลือกทีละคำ/เพิ่มทั้งหมด/เพิ่มเอง/จัดการคำใช้บ่อย
6. `[Completed]` รองรับ Base Unit และ Selling/Packaging Unit conversion เช่น ชิ้น/คู่/แพ็ค/กล่อง/ชุด/ลัง พร้อม Preview การตัด Stock
7. `[Completed]` เปลี่ยน Navigation Summary เป็น Timeline แสดง Current/Completed/Incomplete/Optional และติดตาม Section ขณะเลื่อน
8. `[Completed]` เพิ่มปุ่มยกเลิกต่อจากบันทึกร่าง ใช้ Shared confirmation และป้องกันออกจากหน้าขณะมีข้อมูลยังไม่บันทึก
9. `[Completed]` เพิ่มปุ่มกลับด้านบนที่รองรับ Keyboard, Tooltip และ Reduced Motion
10. `[Completed]` ตรวจ Responsive, Theme contract, Keyboard และ Regression รวม

หลักฐานรอบสมบูรณ์:

- Products validator `97/97 structure + 14/14 interaction-model`
- Unified Product Form validator `142/142`
- Browser Desktop `1440×900`: Form 2-column + Sticky Summary + Timeline; Grid/Quick View Header `rgb(17,17,17)` และข้อความ `rgb(255,255,255)`
- Browser Mobile `390×844`: ไม่มี Body overflow, Form 1-column, Quick View กว้างไม่เกิน viewport และตาราง SKU เลื่อนเฉพาะภายในพื้นที่ตาราง
- Browser interaction: Suggested Tags จาก `ต่างหู Dior สีทอง` ได้ `ต่างหู`, `Dior`, `สีทอง`; Master Modal ปิดด้วย Escape; Timeline ท้ายหน้าระบุ Metadata; Back-to-top กลับ `scrollY = 0`
- Browser console ไม่มี Error/Warning ใน Products Grid + Quick View ที่ตรวจ
- Light/Dark token contract, Keyboard/Focus, Reduced Motion และ No-network/Supabase guards ผ่านตัวตรวจอัตโนมัติ
- `git diff --check` ผ่าน โดยยังคงเป็น Standalone Mockup ไม่เชื่อม Backend

## Prototype รอบที่ 10 — Part 2.1.4B Live Sale Sales Code Reservation

วันที่ 15 สิงหาคม 2026 เจ้าของระบบอนุมัติให้บันทึกแนวทางและสร้าง Mockup สำหรับผู้ขายออนไลน์ที่มีสินค้าเข้าเร็ว–ขายหมดเร็ว โดยให้ Sales Code เป็นภาษาหลักของผู้ใช้ และลดการกรอก Product/SKU เต็มรูปแบบ:

1. `[Completed]` แยกทางเข้า `สร้างสินค้าปกติ` และ `สร้างสินค้าขายด่วน / Live Sale` เพื่อไม่เพิ่มความซับซ้อนให้แต่ละงาน
2. `[Completed]` รองรับการทดลองจองชุด Sales Code ล่วงหน้า เช่น Prefix `B`, เริ่ม `001`, จำนวน `70` ได้ช่วง `B001–B070`
3. `[Completed]` แสดงผู้รับผิดชอบ, สาขา, ชื่อ Live/Campaign, จำนวนทั้งหมด, ใช้แล้ว, คงเหลือ และรหัสถัดไป
4. `[Completed]` ทำฟอร์มขายด่วนที่ใช้เพียง Sales Code, ชื่อสินค้า, ราคา, จำนวน, Base Unit, สาขา และหมายเหตุ
5. `[Completed]` เพิ่มคำสั่ง `บันทึกและสร้างรายการถัดไป` เพื่อเปลี่ยน `B001 → B002 → B003` ต่อเนื่องโดยผู้ใช้ไม่ต้องคิดรหัสเอง
6. `[Completed]` แสดงสถานะรายรหัส `จองไว้`, `รหัสถัดไป`, `ใช้แล้ว` และ `ข้าม` พร้อม Search/Filter/Copy
7. `[Completed]` แสดงกติกาว่ารหัสที่เผยแพร่ให้ลูกค้าแล้วห้ามนำกลับมาใช้กับสินค้าอื่น และช่องว่างของเลขไม่ถือเป็นความผิดพลาด
8. `[Completed]` จำกัดความยาวข้อความ/ช่วงตัวเลขใน Mockup และวางข้อกำหนด Atomic allocation + Organization uniqueness สำหรับระบบจริง
9. `[Completed]` คง Product ID และ SKU ID เป็นข้อมูลภายในที่ระบบสร้างให้อัตโนมัติ โดยการขายและตัด Stock ต้อง resolve Sales Code ไปเป็น SKU ID ก่อนเสมอ
10. `[Completed]` เจ้าของระบบตรวจและอนุมัติ Mockup สำหรับ Flow ชุดรหัสขายด่วน
11. `[Completed]` เพิ่ม `แก้ไขรายละเอียดชุดรหัส` สำหรับชื่อรอบ, ผู้รับผิดชอบ, สาขา, วันที่/รอบขาย, Campaign และหมายเหตุ โดยล็อกช่วงรหัส, ผู้สร้าง และเวลาสร้างเมื่อเริ่มใช้งานแล้ว
12. `[Completed]` เชื่อมจาก Products Workspace ผ่านเมนู `สร้างสินค้า` ที่เลือกได้ระหว่าง `สร้างสินค้าปกติ` และ `สร้างสินค้าขายด่วน / Live Sale`
13. `[Completed]` แยกผลลัพธ์ปุ่มท้ายฟอร์มให้ชัดเจน: `บันทึกและกลับ Products` กับ `บันทึกและสร้างรายการถัดไป`
14. `[Completed]` เพิ่มคอลัมน์ `สต็อกเริ่มต้น` ในตารางสถานะรหัส พร้อมแสดง Quantity และ Base Unit เช่น `5 คู่`
15. `[Completed]` เพิ่ม Saved Tags Picker ใน Unified Product Creation ให้เลือก Tags ระดับ Organization จากกลุ่มปักหมุด/ใช้ล่าสุด/ใช้บ่อย, ค้นหา, เลือกหลายรายการ และสร้าง Tag ใหม่ได้ โดยคงคำแนะนำจากชื่อสินค้าและเพดาน 12 Tags
16. `[Completed]` ปรับตัวเลือกรูปแบบสินค้าเป็น Segmented Button Group แบบขอบเชื่อม และเปลี่ยนปุ่ม Saved Tags เป็น Tag icon + Hover/Focus Navigation Menu พร้อมทางเข้า `ค้นหาและดู Tags ทั้งหมด` และรองรับการแตะบนมือถือ
17. `[Completed]` จัดแนวกลุ่มวิธีนับ Stock และกลุ่มป้ายกำกับให้หัวข้อกับช่องกรอกเริ่มระดับเดียวกันบน Desktop โดยคืน Layout แบบเรียงแนวตั้งบน Mobile
18. `[Completed]` ขยาย Products Workspace และ Data Grid ตามพื้นที่หน้าจอจริง: Desktop gutter 32px, จอกว้างตั้งแต่ 1600px gutter 48px, Laptop gutter 24px, Mobile gutter 14px และจำกัดความกว้างสูงสุด 1920px

Navigation contract ที่อนุมัติสำหรับ Prototype:

- จุดเริ่มต้นหลัก: `Products Workspace → สร้างสินค้า`
- `สร้างสินค้าปกติ` → Part 2.1.4A Unified Product Creation
- `สร้างสินค้าขายด่วน / Live Sale` → Part 2.1.4B Sales Code Reservation + Rapid Product Entry
- รายการที่สร้างจากทั้งสองทางต้องกลับมาปรากฏใน Products Data Grid เดียวกันในระบบจริง
- Sales/CF จะค้นด้วย Sales Code ได้ แต่ก่อนเปิดบิลหรือตัด Stock ระบบต้อง resolve เป็น SKU ID

ไฟล์ทดลอง:

- `docs/mockups/phase-2.1-live-sales-code-reservation.html`
- `scripts/validate-phase-2.1-live-sales-code-prototype.mjs`

หลักฐานรอบ Prototype:

- Live Sale validator `24/24`, Products validator `99/99 structure + 14/14 interaction-model` และ Unified Product Form `152/152`
- Desktop `1280×720`: Layout 2 คอลัมน์, ไม่มี Body overflow และเริ่มจาก `B001` ใช้แล้ว / `B002` รหัสถัดไป
- Interaction: บันทึก `ต่างหู Gucci สีเงิน` ด้วย `B002` แล้ว Used เปลี่ยน `1 → 2` และรหัสถัดไปเปลี่ยนเป็น `B003`
- Reservation preview: เริ่ม `71` จำนวน `70` คำนวณเป็น `B071–B140` และรหัสหลังจบชุดเป็น `B141`
- Mobile `390×844`: Layout เปลี่ยนเป็น 1 คอลัมน์, ไม่มี Body overflow และตารางเลื่อนภายในได้
- Modal ปิดด้วย Escape, Browser console ไม่มี Error/Warning และไม่มี External network call
- Batch Details: แก้ชื่อเป็น `Live Gucci รอบเย็น`, ผู้รับผิดชอบเป็น `แม่ค้า B`, สาขาเป็น `ONLINE` ได้ โดยช่วงรหัสยังเป็น `B001–B070` และข้อมูลผู้สร้างไม่เปลี่ยน
- Products connection: เมนู `สร้างสินค้า` แสดงสองทางเลือกและนำทางไปหน้า Live Sale ได้ถูกต้อง
- Save destinations: `บันทึกและสร้างรายการถัดไป` ใช้ `B002`, แสดง Stock `5 คู่`, เตรียม `B003` และล้างชื่อสินค้า; `บันทึกและกลับ Products` นำทางกลับ Products หลังบันทึก
- Saved Tags Picker: เลือก `งานใหม่` + `โปรโมชั่น` พร้อมกัน, ค้นหาและสร้าง `คอลเลกชันใหม่`, ป้องกัน `งานใหม่` ซ้ำ และแสดงผลเลือก `3 / 12` ถูกต้อง
- Saved Tags responsive: Modal กว้าง `350px` ภายใน Mobile viewport `390×844`, ไม่มี Body overflow และ Browser console ไม่มี Error/Warning
- Product structure control: ตัวเลือก `สินค้าปกติ / มีตัวเลือก / Bundle` แสดงเป็น Segmented Button Group ขอบเชื่อมต่อกัน โดยมุมซ้าย/กลาง/ขวาเท่ากับ `9px 0 0 9px` / `0` / `0 9px 9px 0`
- Saved Tags navigation: Tag icon + trigger เปิด Quick Menu ด้วย Hover/Focus/Click, เลือก Tag ด่วนได้ และคำสั่ง `ค้นหาและดู Tags ทั้งหมด` เปิด Saved Tags Picker เดิมได้โดยไม่มี Console Error/Warning
- Field alignment: หัวข้อและช่องกรอกของ `Stock ของสินค้านี้นับอย่างไร?` กับ `ป้ายกำกับสินค้า (Tags)` เริ่มบนแนวเดียวกันที่ Desktop และไม่บังคับความสูงเมื่อ Layout เปลี่ยนเป็นหนึ่งคอลัมน์
- Products workspace width: ยกเลิกกรอบคงที่ `1180px`, ใช้ความกว้างเต็ม Available Workspace พร้อม Responsive gutter `48 / 32 / 24 / 14px` และเพดาน `1920px`; ตารางกว้างยังเลื่อนภายใน Data Grid
- `git diff --check` ผ่าน

ขอบเขตรอบนี้ยังเป็น Standalone Interaction Prototype เท่านั้น ไม่จองรหัสจริง ไม่สร้าง Product/SKU ไม่เขียน Inventory และไม่แก้ Database/RLS

## Product Image Dependency Gate

Product Image ยังไม่มีใน Domain/Data contract ปัจจุบัน การนำ 2.1.3 และ 2.1.4 ไปพัฒนาจริงจึงต้องผ่าน Gate นี้ก่อน โดยไม่ถือว่าเป็นเพียงการตกแต่ง UI:

1. กำหนด Product ownership ของรูป, จำนวน 1–9 ภาพ, ลำดับ, ภาพหลัก และพฤติกรรมเมื่อ archive/delete Product
2. กำหนด Storage bucket/path convention, file allowlist, size limit, image processing และ cache policy
3. ตัดสินใจ Public หรือ Private access และกำหนด RLS/authorization ให้สอดคล้องกับ Organization boundary
4. กำหนด transaction/compensation เมื่อสร้าง Product/SKU สำเร็จแต่ upload บางภาพล้มเหลว หรือ upload สำเร็จแต่ command ล้มเหลว
5. เพิ่ม read model สำหรับภาพปกใน Data Grid โดยไม่สร้าง N+1 request และไม่ทำให้ cursor pagination เดิมผิดสัญญา
6. เพิ่ม audit/security test สำหรับ upload, replace, reorder และ delete โดย browser ห้ามใช้ privileged key

การอัปเดตเอกสารครั้งนี้เป็นการรับ requirement และวาง dependency เท่านั้น ยังไม่อนุมัติ Migration, Storage bucket, RLS policy หรือ implementation

R6 ปิด Product Image Dependency Gate แล้วเมื่อ 15 สิงหาคม 2026 ตามเอกสาร `AVENZO_ONE_Phase_2.1.R6_Product_Image_Gate.md`; ขอบเขต upload form และ atomic Product creation ยังคงอยู่ใน R7

## Approved Future Extension — Clinic Commerce

วันที่ 15 สิงหาคม 2569 เจ้าของระบบอนุมัติแนวทางรองรับธุรกิจคลินิก โดยคงขอบเขตของ Product Catalog ให้รับผิดชอบสินค้าที่มี Stock และไม่รวมข้อมูลผู้ป่วยหรือเวชระเบียนไว้ใน Product Form

แนวทาง Domain/UI ที่อนุมัติสำหรับการวางแผน:

1. จุดเริ่มสร้างรายการในอนาคตเลือกประเภท `สินค้ามี Stock`, `บริการ`, `คอร์ส/แพ็กเกจ` หรือ `Bundle/Kit`
2. Product Catalog ใช้กับเวชสำอาง อาหารเสริม อุปกรณ์ วัสดุสิ้นเปลือง และสินค้าขายหน้าคลินิก
3. Service Catalog แยกจาก Product Catalog และเชื่อมสูตรใช้วัสดุ เพื่อให้การขายบริการ resolve วัสดุเป็น `sku_id` ก่อนสร้าง Stock Command/Movement
4. Course/Package เก็บจำนวนสิทธิ์ การใช้สิทธิ์ และอายุแพ็กเกจ ไม่ใช้จำนวน Stock แทนจำนวนครั้งบริการ
5. Mixed Package รองรับ Service + Product โดยเก็บองค์ประกอบแยก ไม่สร้าง SKU ปลอมเพื่อแทนบริการทั้งหมด
6. สินค้าที่ต้องติดตามเพิ่ม Lot/Batch, วันผลิต, วันหมดอายุ, ผู้ผลิต/ผู้จำหน่าย, หน่วยซื้อ–เก็บ–ใช้ และนโยบาย FEFO หลังผ่าน Domain/Data/Security design
7. ข้อมูลผู้ป่วย ประวัติการรักษา Consent ผู้ให้บริการ และภาพก่อน–หลัง ต้องอยู่ในโมดูลที่แยกสิทธิ์และ Privacy boundary จาก Product Workspace

ลำดับแนะนำ: ปิด Product/SKU/Inventory vertical slice และนำ Products Mockup ไปใช้จริงให้เสถียรก่อน แล้วจึงทำ Clinic Catalog discovery และ Mockup แยก โดยรอบนี้ยังไม่เปลี่ยน Unified Product Creation Prototype หรือ Database

## ขอบเขตที่ไม่รวม

- การแก้ Database Schema หรือ Migration
- การเปลี่ยน uniqueness ของ SKU Code, Sales Code หรือ Barcode
- การรวม Product และ SKU เป็น Entity เดียว
- การเขียน Inventory Balance โดยตรงจาก UI
- Category, Vendor, Pricing, Unit conversion หรือ CF Code แบบแยกคอลัมน์ จนกว่าจะมี Domain decision แยก
- Service Catalog, Course/Package, เวชระเบียน ข้อมูลผู้ป่วย Consent และ Workflow การรักษาใน Phase 2.1 ปัจจุบัน
- การคัดลอก Source Code, Asset, Branding หรือ Navigation ของ Surge/ReUI โดยตรง

## Acceptance Criteria ระดับ Phase

1. ผู้ใช้สร้าง Product พร้อมรูปสินค้า 1–9 ภาพและ SKU แรกจาก Form หน้าเดียวได้ โดยไม่ต้องรู้ชื่อคำสั่งภายในระบบ
2. ผู้ใช้ preview, ลบ, จัดลำดับ และเลือกภาพปกได้ก่อนบันทึก โดยข้อผิดพลาดรายภาพไม่ล้างข้อมูลส่วนอื่นของ Form
3. Data Grid แสดงภาพปกหรือ placeholder ที่เสถียร พร้อม alt text และไม่ทำให้การค้นหา/แบ่งหน้าช้าผิดปกติ
4. งานหลักบนหน้ารายการหาได้ภายใน Page Header และ Data Grid โดยไม่ต้องเปิดหลาย Card
5. Search จาก Product name, SKU Code, Sales Code และ Barcode คืนผลถูกต้อง
6. UI ไม่เพิ่มช่องที่ Backend ยังไม่รองรับโดยไม่มี Contract และไม่เปลี่ยน Business Rule เดิม
7. Light/Dark, Desktop/Tablet/Mobile, keyboard, screen reader และ contrast ผ่านมาตรฐานเดิม
8. Product/SKU, Foundation Application, Auth/Session และ Operations UI regression ผ่าน
9. แต่ละ Part ต้องมี test evidence และการอนุมัติแยกก่อน commit/push/deploy

## Living Decision Log

| วันที่ | เรื่อง | ข้อสรุป | สถานะ |
|---|---|---|---|
| 14 ส.ค. 2569 | แนวทางหน้า Products | ใช้ Workspace + Data Grid ตามแนวคิดตัวอย่าง แต่ปรับให้ตรงกับข้อมูลจริงของ AVENZO ONE | Accepted for planning |
| 14 ส.ค. 2569 | การสร้างสินค้า | ใช้ปุ่ม `สร้างสินค้า` และ Form หน้าเดียวสำหรับ Product + SKU แรก | Accepted for planning |
| 14 ส.ค. 2569 | ภาพใน Products Data Grid | แสดงภาพปกสินค้าในแถว พร้อม placeholder และ alt text | Accepted for planning |
| 14 ส.ค. 2569 | ภาพใน Unified Product Creation | สินค้าต้องมีรูปอย่างน้อย 1 และสูงสุด 9 ภาพ พร้อม preview/reorder/cover | Accepted for planning |
| 14 ส.ค. 2569 | Product Image dependency | ต้องผ่าน Storage/Data/Permission/Image Contract Gate ก่อน implementation | Closed by approved R6 on 15 ส.ค. 2569 |
| 14 ส.ค. 2569 | Advanced Data Grid Mockup | อนุมัติ Hover image, Copy CF/SKU, Resize, Inline Edit, Status Combobox และ Bulk Search ใน Standalone HTML | Approved for prototype |
| 14 ส.ค. 2569 | Search + Column Customization Mockup | อนุมัติและทำครบ 8 ข้อแบบตามลำดับ: multi-term search, tooltip, alert icon, fixed status, column model, Customize, pin/show/hide/width/reorder และ verification | Completed prototype |
| 14 ส.ค. 2569 | Compact Toolbar + Excel Tools Mockup | อนุมัติและทำครบ 8 ข้อแบบตามลำดับ: compact status, heading action, icon toolbar, tooltip/keyboard, Excel menu, export-column preferences, responsive/accessibility และ verification | Completed prototype |
| 14 ส.ค. 2569 | Heading + Inverse Badge + Default Select | ลดช่องว่าง Heading, สลับสี SKU Badge ตาม Theme และใช้ลูกศร Select ระยะ 12px ใน Prototype | Completed prototype |
| 14 ส.ค. 2569 | Part 2.1.4A Unified Product Creation Mockup | Form หน้าเดียวครบ Product/SKU/Image/Pricing/Physical/Packaging/Bundle/Inventory Policy พร้อม Validation และ local draft โดยไม่เชื่อมระบบจริง | Completed prototype |
| 14 ส.ค. 2569 | Assisted Product Creation UX 1–12 | ทำครบ Auto-fill, Master Data, Identifier assistant/sequence, Multi-SKU, Info guide, 1:1 image/5MB, Physical tabs, Security/Draft/A11y พร้อมหลักฐาน Form 114/114 และ Workspace 78/78 + 10/10 | Completed prototype; owner visual recheck pending |
| 15 ส.ค. 2569 | Part 2.1.3B Products Data Grid Field Alignment | อนุมัติให้จัด Default/Optional columns, Search, Customize และ Quick View ให้สอดคล้องกับ Unified Product Creation โดยไม่เชื่อม Backend | Approved for prototype |
| 15 ส.ค. 2569 | Products UX Refinement 1–10 | พัฒนาและทดสอบทีละหัวข้อครบ: Table headers, Context Master Manager, Quantity guide, Suggested Tags, Unit conversion, Timeline, Cancel, Back-to-top และ Verification | Completed prototype; owner visual review pending |
| 15 ส.ค. 2569 | Part 2.1.4B Live Sale Sales Code Reservation | แยกโหมดขายด่วน รองรับชุดรหัส `B001–B070`, ฟอร์มกรอกเร็ว, รันรหัสต่อเนื่อง, แก้รายละเอียดชุดโดยไม่เปลี่ยนช่วงรหัส และเชื่อมจากเมนูสร้างสินค้าใน Products | Approved prototype |
| 15 ส.ค. 2569 | Clinic Commerce Extension | แยก Product, Service, Course/Package และ Mixed Package; สินค้าคลินิกวางแผน Lot/Expiry/FEFO/Unit conversion ส่วนข้อมูลผู้ป่วยและการรักษาแยก Privacy boundary | Approved for future discovery |
| 15 ส.ค. 2569 | Products Production Adoption | พัก Clinic Mockup และนำ Products Mockup ไปใช้จริงแบบ R0–R8: Contract freeze → Shell → Read Model → Data Grid → Detail → Domain/Image gates → Atomic Creation → Release | Approved planning; R0 is next |
| 15 ส.ค. 2569 | 2.1.R0 Contract & Gap Freeze | Field Matrix NOW/DERIVED/LATER/HIDDEN, R1–R3 contracts และ stock/identifier safety ผ่าน validator 25/25 โดยไม่มี Migration/Production code change | Owner Approved / Completed |
| 15 ส.ค. 2569 | 2.1.R1 Production Workspace Shell | Production route ได้ Breadcrumb, compact heading, truthful page-count badge และ responsive full-width gutters; targeted 4/4, regression 3/3, TypeScript และ authenticated browser 1920/1280/760 ผ่าน | Owner Approved / Completed |
| 15 ส.ค. 2569 | 2.1.R2 Product Workspace Read Model | เพิ่ม bounded batch read model สำหรับ Product + SKU + Inventory; ไม่รวม stock ข้าม Base Unit; exact Sales Code `A001` resolve สำเร็จ | Owner Approved / Completed; targeted 5/5 |
| 15 ส.ค. 2569 | 2.1.R3 Production Data Grid | ใช้ข้อมูลจริงแสดง Product/CF/SKU/Stock/Base Unit/Status/Updated; copy, multi-code search, real sort, responsive, dark inverse header และ validated per-Organization column preferences | Owner Approved / Completed; targeted 5/5 + authenticated browser passed |
| 15 ส.ค. 2569 | 2.1.R4 Product Detail & Safe Actions | เพิ่ม Product/SKU Drawer จาก read model จริง, SKU/identifier/stock summary, immutable SKU Code/Base Unit/Sales Code UI, version refresh, archive guard และ custom safe confirmation โดยไม่เปลี่ยน Schema | Owner Approved / Completed; targeted 6/6, regression 23/23 + authenticated Light/Dark browser passed |
| 15 ส.ค. 2569 | 2.1.R5 Product Domain Extension Gate | เพิ่ม Category, Brand, Tags, price/cost/tax, physical/packaging, sell units และ Bundle contracts แบบ additive พร้อม RLS/audit/trusted commands | Owner Approved / Local Gate Completed |
| 15 ส.ค. 2569 | 2.1.R6 Product Image Gate | เพิ่ม private Storage contract, 1–9 images/5 MiB allowlist, immutable tenant path, cover/order, compensation และ signed cover read model | Owner Approved / Local Gate Completed; targeted 5/5 |
| 15 ส.ค. 2569 | 2.1.R7.0 Products Visual Parity Gate | นำ heading/action/toolbar/grid ของ Mockup ไปใช้ใน Products route จริง พร้อม bounded multi-code search และ truthful deferred controls | Owner Approved / Completed; targeted 5/5 + regression 35/35 + authenticated Light/Dark |
| 15 ส.ค. 2569 | 2.1.R7.1 Atomic Product Creation Contract | เพิ่ม service-only idempotent command สำหรับ Product + SKU แรก + metadata แบบ Draft ใน transaction เดียว; รูปและ Stock ยังใช้ R6/Inventory workflows แยก | Owner Approved / Local Gate Completed; targeted 5/5 + regression 40/40 + SQL behavior + TypeScript |
| 15 ส.ค. 2569 | 2.1.R7.2 Unified Product Creation Form Integration | Backend/Form integration กับ R7.1/R6 และ Production UI ตรง Approved Mockup ผ่าน R7.2.1–R7.2.5 | Owner Approved / Completed |
| 15 ส.ค. 2569 | 2.1.R7.2.1 Visual Parity Audit | เทียบ Approved Mockup กับ authenticated Production ที่ Desktop/Mobile/Light/Dark และล็อก Diff A-01–G-04 โดยไม่แก้ UI code | Completed — Gap Freeze; next R7.2.2 pending Owner approval |
| 15 ส.ค. 2569 | 2.1.R7.2.3C SKU & Identifier Form Components | Section 3 ตรง Approved Mockup ในระดับ component; Identifier/Sequence/SKU staging interaction เต็มยังอยู่ R7.2.4 | Owner Approved / Completed |
| 15 ส.ค. 2569 | 2.1.R7.2.3D Pricing & Tax Form Components | Section 4 ใช้ Sale/Cost/Tax Category + Tax-inclusive choice ตาม Diff E-01 โดย map tax rate เข้าสู่ R7.1 contract เดิม | Owner Approved / Completed |
| 15 ส.ค. 2569 | 2.1.R7.2.3E Physical Form Components | Section 5 ใช้ Tabs สินค้า/กล่อง, suffix kg/cm และ Client cross-field guard ตาม Diff E-02 โดยคง Physical payload เดิม | Owner Approved / Completed |
| 15 ส.ค. 2569 | 2.1.R7.2.3F Packaging & Bundle Form Components | Section 6 ใช้ Switch, multi Sell Unit, presets, conversion preview, Bundle modes/components ตาม Diff E-03–E-04; field ที่ Contract ยังไม่รองรับถูกล็อกอย่างตรงไปตรงมา | Owner Approved / Completed; targeted 7/7 + regression 80/80 |
| 15 ส.ค. 2569 | 2.1.R7.2.3G Inventory Form Components | Section 7 ใช้ Branch checkbox cards, Safety/Min/Max cross-field guard, Available แบบ Derived และ Reserved/Allocated disclosure ตาม Diff E-05–E-06; Branch selection ยังเป็น Browser Draft เพราะ R7.1 ไม่มี sales-scope contract | Owner Approved / Completed; targeted 6/6 + regression 86/86 |
| 15 ส.ค. 2569 | 2.1.R7.2.3H Metadata & Security Form Components | Section 8 แสดง Created/Updated/Creator แบบ Read-only และ Security Guardrails ตาม Diff E-07–E-08; เพิ่ม Browser Draft cap 256 KB และเปิดเผย Image content hardening gap ตามสถานะจริง | Owner Approved / Completed; targeted 6/6 + regression 92/92 |
| 15 ส.ค. 2569 | 2.1.R7.2.4A Context Master Data Interaction | Dialog จัดการหมวดหมู่/แบรนด์รองรับ Search, Inline rename, Archive/Undo, Bulk add และ Keyboard interaction โดย Mutation ผ่าน `product.master.upsert` เท่านั้น | Owner Approved / Completed; targeted 7/7 + regression 99/99 + TypeScript |
| 15 ส.ค. 2569 | 2.1.R7.2.4B Saved Tags Interaction | Quick menu, Search/Multi-select modal, Empty state, 12-Tag limit, Create preview และ Tag manager โดย Mutation ผ่าน `product.master.upsert`; Recent เป็น Organization-scoped Browser UI preference | Owner Approved / Completed; targeted 8/8 + regression 107/107 + TypeScript + authenticated Desktop Light (no writes) |
| 15 ส.ค. 2569 | 2.1.R7.2.4C Identifier Assistant Interaction | Live sync/stale, Client guard และ Authenticated Server advisory duplicate check ภายใต้ RLS; Sales sequence เป็น Preview-only และ Atomic transaction ยังยืนยัน Unique ขั้นสุดท้าย | Owner Approved / Completed; targeted 8/8 + regression 115/115 + TypeScript + authenticated Desktop Light (no writes) |
| 15 ส.ค. 2569 | 2.1.R7.2.4D SKU Staging Interaction | Add/edit/cancel/delete, Browser Draft recovery, local/Server duplicate guard และ sequence progression; ป้องกัน silent loss เมื่อมีหลาย SKU ก่อนมี Atomic multi-SKU command | Implemented Locally / Awaiting Owner Visual Review; targeted 10/10 + regression 129/129 + TypeScript + authenticated Desktop Light (no writes) |
| 15 ส.ค. 2569 | 2.1.R7.2.4E–F Validation, Success & Recovery | รวม Validation Summary, issue navigation, validated pending recovery และ accessible success dialog โดยคง Draft/No-stock truth | Owner Approved / Completed |
| 15 ส.ค. 2569 | 2.1.R7.2.5 Visual Parity & Responsive QA | Responsive Matrix 12/12, Product regression 161/161, TypeScript และ authenticated 1920 Light/Dark ไม่มี horizontal overflow | Completed |
| 15 ส.ค. 2569 | 2.1.R7.3 Creation Recovery & E2E Gate | Controlled Atomic retry/duplicate rollback, image fail-retry-finalize, authenticated read model และ cleanup เฉพาะ AVENZO ONE PREVIEW; ไม่มี Stock write | Completed; targeted 10/10, Product regression 171/171, TypeScript; Production untouched |
| 15 ส.ค. 2569 | UI Mockup-First Repository Rule | ทุกหน้าต้องผ่าน Mockup approval ก่อน Implement; Approved Mockup เป็น Source of Truth และห้ามเปลี่ยนดีไซน์เอง | Owner Directive / Mandatory — ดู `AVENZO_ONE_UI_Mockup_First_Implementation_Guide_V1.md` |
| 16 ส.ค. 2569 | Products Search/Excel/Customize Interaction Parity | Reopen Visible Interaction ที่ยังไม่ตรง Mockup แล้วปิดตามลำดับ: live/bulk search, Excel preview tools, export preferences และ Customize draft/show-hide/width/pin/reorder พร้อม F5 persistence | Completed locally; regression 172/172 + slice 3/3 + TypeScript + authenticated browser |
| 16 ส.ค. 2569 | 2.1.R7.4.1 Product Field Contract Freeze | ล็อก Form → Atomic command → Database → Read Model → Grid/Quick View; Default Grid ต้องเพิ่มราคาขาย, Optional fields ใช้ Customize, Stock เป็น Inventory-derived, Cost permission-gated และ Branch/Multi-SKU ยัง Deferred | Completed locally / Awaiting Owner Review; R7.4.2 blocked |
| 14 ส.ค. 2569 | ขอบเขตระบบ | UI-only; รักษา Domain/Command/RLS/Audit/Inventory rules เดิม | Locked |
| 14 ส.ค. 2569 | การดูแลแผน | ใช้เอกสารนี้เป็น Living Plan และอัปเดต Decision Log เมื่อมีข้อเสนอแนะใหม่ | Active |

## วิธีอัปเดตเอกสารนี้

- เพิ่ม feedback ใหม่ในหัวข้อปัญหา/หลักการออกแบบ และบันทึกข้อสรุปใน Living Decision Log
- ทุกหน้าใหม่หรือ Visible UI change ต้องผ่าน Mockup-first Gates UI-0–UI-6 ก่อนปิด Part
- เปลี่ยนสถานะ Part เฉพาะเมื่อมีหลักฐาน implementation/test หรือได้รับการอนุมัติที่เกี่ยวข้อง
- ห้ามใช้ Functional/Backend test แทน Visual Parity และ Owner production approval
- หาก feedback กระทบ Schema, Permission, Stock rule หรือ Domain Contract ให้เปิด Decision/Phase ใหม่ ห้ามซ่อนไว้ในงาน UI
- เมื่อ Phase เริ่มพัฒนา ให้บันทึกไฟล์ที่เปลี่ยน, test evidence, browser evidence และข้อจำกัดที่เหลือในเอกสารนี้อย่างต่อเนื่อง

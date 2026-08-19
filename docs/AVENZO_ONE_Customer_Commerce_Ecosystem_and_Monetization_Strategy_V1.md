# AVENZO ONE — Customer Commerce Ecosystem & Monetization Strategy V1

**วันที่:** 19 สิงหาคม 2026  
**สถานะ:** Approved Strategy Plan — Future Planning Only  
**ขอบเขต:** ผู้ใช้งานทั่วไป, ร้านค้า, Customer Commerce Community, Creator Economy และรายได้ของแพลตฟอร์ม

เอกสารนี้กำหนดทิศทางเชิงผลิตภัณฑ์และธุรกิจของ AVENZO ONE ต่อจาก Customer Platform Plan V7.2 ไม่ใช่ข้อกำหนดให้เริ่ม Migration, Payment, Commission, Advertisement หรือ Social Feed ทันที ทุก Feature ต้องผ่าน UI Mockup Gate, Domain Contract, Security/Privacy Review และ Owner Approval ตามลำดับ

## 1. North Star

AVENZO ONE ต้องช่วยให้เกิดวงจรที่ตรวจสอบได้:

> สินค้าถูกต้อง → ลูกค้าค้นพบ → รีวิว/คอนเทนต์มีประโยชน์ → เกิดการซื้อ → ร้านมีรายได้ → ผู้สร้างมีรายได้ → ลูกค้ากลับมาซื้อซ้ำ

Community เป็น Commerce Community ไม่ใช่ Social Media ที่แยกออกจากระบบขาย ทุกฟีเจอร์ใหม่ต้องตอบอย่างน้อยหนึ่งข้อ:

- ช่วยให้ร้านขายได้มากขึ้นหรือขายซ้ำได้ดีขึ้น
- ช่วยให้ลูกค้าตัดสินใจซื้อได้มั่นใจขึ้น
- ช่วยให้ผู้สร้างได้รับรายได้จากผลงานที่มีคุณภาพ
- ลดต้นทุน เวลา หรือความผิดพลาดในการดำเนินงาน

## 2. ลำดับการเปิดระบบ

1. Product/SKU/Stock/Order ให้ถูกต้องและตรวจสอบย้อนกลับได้
2. Customer Identity, Customer 360 และ Verified Review
3. External Affiliate Attribution และ Commission Ledger
4. Follow, Feed, Review Commerce และ Fair Discovery
5. Creator Mission และ Content Rights Marketplace
6. Review Deal, Promoted Product และ Audience Activation
7. Advanced Analytics, API และ Enterprise Extensions

ห้ามเลื่อนลำดับเพียงเพราะ Feature นั้นดึงดูดผู้ใช้ หากแกน Order, Stock, Refund หรือ Ledger ยังไม่น่าเชื่อถือ

## 3. แบ่งประเภท Feature และรายได้

| ประเภท | ตัวอย่าง | วิธีคิดเงิน |
|---|---|---|
| Core Platform | Product, SKU, Warehouse, Order, Customer | Subscription |
| Usage | Storage, API, SMS, Email, AI, Video | ตามการใช้งาน/โควตา |
| Outcome | Affiliate, Review Deal, Attributed Order | Success Fee หรือ Campaign Fee |
| Promotion | Promoted Store/Product/Review/Live | งบโฆษณาของร้าน |
| Marketplace | Content License, Creator Mission | Marketplace Service Fee |
| Enterprise | SSO, SLA, Custom Integration, Support | Contract/Annual Fee |

ค่า Payment Provider, Social Ads, SMS, AI Compute และ Custom Development ต้องแสดงเป็น Third-party/Pass-through หรือ Custom Charge อย่างชัดเจน ไม่รวมเป็นค่าธรรมเนียม AVENZO แบบคลุมเครือ

## 4. แพ็กเกจเชิงกลยุทธ์

### 4.1 Preview

ใช้ทดลองจำกัดเวลาและโควตา ไม่มีการถอน Commission หรือ Production Scale

### 4.2 Business

Subscription ระดับร้านเล็ก–กลาง พร้อมเลือก Add-on เช่น Live, CRM, Affiliate, Storage และ Analytics; ค่าธรรมเนียม Order ต่ำหรือคิดเฉพาะบริการที่สร้างยอดขาย

### 4.3 Enterprise

รวม Platform Feature หลัก, Priority Access, API, SSO, SLA และ Support ตาม Fair-use Policy; ฟีเจอร์อนาคตที่อยู่ในขอบเขต Enterprise รวมได้ แต่ Third-party, Video/AI ปริมาณสูง และ Custom Work ไม่รวมโดยอัตโนมัติ

### 4.4 Performance Plan

ทางเลือกสำหรับร้านใหม่: ค่า Subscription ต่ำกว่า แต่แบ่ง Success Fee สูงกว่าเมื่อเกิดยอดขายจริง ต้องแสดงต้นทุนรวมและมีเพดาน/เงื่อนไขชัดเจน

## 5. Unit Economics Gate

ก่อนเปิดแผนหรือ Campaign ต้องคำนวณอย่างน้อย:

- รายได้ Subscription ต่อ Organization
- Storage, Egress, Image Transformation และ Backup
- Payment, Email, SMS, AI, Moderation และ Support Cost
- ต้นทุน AVENZO-funded Discount
- Creator Commission และ Return/Reversal Exposure
- CAC, Conversion, Repeat Purchase และ Gross Margin
- ค่าเฉลี่ยต้นทุนต่อ Consumer User และต่อ Attributed Order

ตัวเลข 3% Platform Discount, 10% Creator Commission, 1–15% Success Fee และราคาแพ็กเกจในเอกสารอื่นเป็น Planning Examples จนกว่า Cost Model และ Owner Approval จะผ่าน

## 6. Trust, Safety และ Fraud Baseline

- Verified Purchase แยกจาก Sponsored/Affiliate Disclosure
- ห้ามซื้อรีวิวเชิงบวกหรือบังคับคะแนน
- ป้องกัน Self-referral, บัญชีซ้ำ, ปั่นยอด, ปั่นวิว และคืนสินค้าหลังรับ Commission
- Commission เป็น Estimated → Pending → Available → Paid และ Reverse ตาม Order Item
- Content License ต้องระบุเจ้าของ ช่องทาง ระยะเวลา สิทธิ์แก้ไข และสถานะหมดอายุ
- Preview ใช้ Watermark และไฟล์ต้นฉบับปลดล็อกหลังชำระเงิน/อนุมัติสิทธิ์
- ทุก Override, Refund, Payout และ Moderation ต้องมี Reason และ Audit
- มี Report, Appeal, Strike, Risk Hold และ Recovery ที่ตรวจสอบย้อนหลังได้

## 7. Data Governance

- ใช้ `user_id` กลาง และ `organization_customer_id` แยกความสัมพันธ์ร้าน
- ร้านเห็นเฉพาะข้อมูลลูกค้าที่ตนมีสิทธิ์และมี Consent
- การยิงแคมเปญทำผ่าน Audience Activation ของ AVENZO ไม่ขายหรือแจกฐานข้อมูลส่วนตัว
- แยก `consumer_media_quota` และ `organization_media_quota`
- กำหนด Retention, Delete, Export, Account Linking และ Data Subject Request
- เก็บ Consent Version, Purpose, Channel, Timestamp และ Revocation
- ใช้ข้อมูลรวมสำหรับ Analytics/Benchmark โดยไม่เปิดเผย PII

## 8. KPI และเกณฑ์ความสำเร็จ

### 8.1 Product Usability

- เวลาสร้างสินค้าและแก้ข้อมูลลดลง
- จำนวน Validation Error และงานซ้ำลดลง
- ผู้ใช้ทดลองผ่านขั้นตอนสำคัญได้โดยไม่ต้องมีผู้เชี่ยวชาญช่วย

### 8.2 Commerce Quality

- Review-to-Product Click Rate
- Product Click-to-Order Conversion
- Repeat Purchase Rate
- Refund/Return Rate
- Attributed Order ที่ส่งมอบสำเร็จ

### 8.3 Creator Economy

- Creator ที่ผ่านการยืนยัน
- Creator ที่สร้าง Conversion จริง
- Commission ที่จ่ายสำเร็จเทียบกับ Reversal
- รายได้เฉลี่ยต่อ Creator
- อัตรา Fraud และ Dispute

### 8.4 Business Health

- Active Organization และ Retention
- Net Revenue Retention
- Gross Margin ต่อ Package
- CAC Payback
- Support Cost ต่อ Organization
- Storage/Egress Cost ต่อ Organization

## 9. Stop, Review และ Scale Gates

ต้องหยุดหรือทบทวนก่อนขยายเมื่อเกิดเหตุใดเหตุหนึ่ง:

- Community มี Engagement แต่ไม่สร้างการซื้อหรือการซื้อซ้ำ
- Review/Creator Fraud สูงเกินเกณฑ์
- Discount Subsidy สูงกว่ากำไรหรือยอดขายเพิ่ม
- Commission Reversal และ Dispute สูงผิดปกติ
- Storage, Video, AI หรือ Support Cost เกิน Fair-use
- ร้านค้าไม่เข้าใจค่าธรรมเนียมหรือมีต้นทุนรวมสูงกว่าที่คาด
- ความเป็นส่วนตัวหรือ Consent ยังตรวจสอบไม่ได้
- มีการผูกขาดการมองเห็นจน Creator ใหม่ไม่มีโอกาส

การเปิด Feature ระยะต่อไปต้องผ่าน Evidence Review, Cost Review, Security/Privacy Review และ Owner Decision Record

## 10. สิ่งที่ยังไม่ควรทำในระยะแรก

- รับประกันยอด View หรือยอดขายให้ Creator
- จ่ายเงินตาม Like/View เพียงอย่างเดียว
- ขายข้อมูลส่วนตัวของลูกค้า
- เปิด Multi-level Downline ก่อนมี Legal/Tax/Fraud Contract
- รวมค่าคอมมิชชัน ส่วนลด Payment และ Platform Fee เป็นตัวเลขเดียว
- สัญญา Enterprise ว่า Feature ใหม่ทุกอย่างฟรีโดยไม่มี Fair-use
- เปิด Social Feed เต็มรูปแบบก่อน Product/Order/Stock/Review เชื่อถือได้

## 11. Decision Gates ต่อไป

1. อนุมัติชื่อและขอบเขต Package ทั้งสามกลุ่ม
2. อนุมัติ Business/Enterprise Feature Matrix และ Add-on
3. อนุมัติ Cost Model และ Fair-use
4. อนุมัติ Review Deal และ Commission Base
5. อนุมัติ External Attribution Window และ Cross-device Fallback
6. อนุมัติ Content Ownership และ License Preset
7. อนุมัติ Audience Activation, Consent และ PDPA Review
8. อนุมัติ KPI, Fraud Threshold และ Scale Gate

## 12. ความสัมพันธ์กับเอกสารอื่น

- `AVENZO_ONE_Codex_Implementation_Starter_Plan_V7.md` เป็น Implementation Roadmap และ Customer Domain Plan
- `AVENZO_ONE_Product_Variant_Sales_Code_and_Live_CF_Development_Guide_V1.md` เป็น Product/Media/Live CF Future Guide
- เอกสาร Design System และ UI Mockup เป็น Authority ของหน้าจอที่ผู้ใช้มองเห็น
- เอกสารนี้เป็น Strategy Authority สำหรับขอบเขตธุรกิจ รายได้ ความเสี่ยง และเกณฑ์ตัดสินใจ

**สถานะปัจจุบัน:** วางแผนและอนุมัติแนวทางเท่านั้น ยังไม่อนุญาตให้เริ่มสร้างระบบจริงจนกว่าแต่ละ Decision Gate จะได้รับอนุมัติแยก

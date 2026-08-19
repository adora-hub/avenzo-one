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
| Customer Activation | ส่งสินค้าใหม่/เติมสต็อก/โปร/Live ให้ลูกค้าที่เกี่ยวข้อง | Subscription, Quota หรือ Success Fee |
| Marketplace | Content License, Creator Mission | Marketplace Service Fee |
| Enterprise | SSO, SLA, Custom Integration, Support | Contract/Annual Fee |

ค่า Payment Provider, Social Ads, SMS, AI Compute และ Custom Development ต้องแสดงเป็น Third-party/Pass-through หรือ Custom Charge อย่างชัดเจน ไม่รวมเป็นค่าธรรมเนียม AVENZO แบบคลุมเครือ

## 4. แพ็กเกจเชิงกลยุทธ์

### 4.1 Preview

ใช้ทดลองจำกัดเวลาและโควตา ไม่มีการถอน Commission หรือ Production Scale

### 4.2 Business

Subscription ระดับร้านเล็ก–กลาง พร้อมเลือก Add-on เช่น Live, CRM, Affiliate, Storage, Analytics และ Customer Activation; ค่าธรรมเนียม Order ต่ำหรือคิดเฉพาะบริการที่สร้างยอดขาย

### 4.3 Enterprise

รวม Platform Feature หลัก, Customer Activation, Priority Access, API, SSO, SLA และ Support ตาม Fair-use Policy; ฟีเจอร์อนาคตที่อยู่ในขอบเขต Enterprise รวมได้ แต่ Third-party, Video/AI ปริมาณสูง และ Custom Work ไม่รวมโดยอัตโนมัติ

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

## 7. Customer Activation แทน Ad Platform

AVENZO ONE ไม่ควรสร้างระบบประมูลโฆษณาเพื่อแย่งการมองเห็นแบบ Social Ad Network แกนหลักควรเป็น Permission-based Customer Activation: ร้านส่งข้อมูลที่เกี่ยวข้องให้ลูกค้าที่ติดตาม สนใจ หรืออนุญาตรับการสื่อสารอยู่แล้ว

ปุ่มหลักสำหรับผู้ประกอบการ:

> ส่งให้ลูกค้าที่เกี่ยวข้อง

หลังปุ่มนี้ ระบบสร้างกลุ่มและข้อความเริ่มต้นให้อัตโนมัติ แล้วแสดง Preview ก่อนส่ง:

- ลูกค้าที่ติดตามร้าน
- ลูกค้าที่เคยดู/บันทึก/ซื้อ SKU หรือหมวดหมู่นั้น
- ลูกค้าที่รอสินค้าเติมสต็อก
- ลูกค้าที่เคยเข้าร่วม Live
- ลูกค้าที่เปิดรับการแจ้งเตือน

Preset รุ่นแรก: สินค้าใหม่, เติมสต็อก, โปรโมชัน และแจ้งก่อน Live โดยต้องแสดงจำนวนผู้รับโดยประมาณ ช่องทาง Purpose และเวลา ส่งได้ด้วยการยืนยันครั้งเดียวหลัง Preview

### Notification Delivery Contract

Push ไม่ใช่แหล่งข้อมูลหลักและไม่รับประกันว่าระบบปฏิบัติการจะแสดงทันที ข้อความทุกประเภทต้องถูกบันทึกใน Notification Center/Inbox ของ AVENZO ก่อน แล้วจึงพยายามส่ง Push, Email, LINE หรือ SMS ตาม Consent และความเหมาะสม

- ลูกค้ากลับมาเปิดระบบภายหลังแล้วยังเห็นรายการที่พลาดหรือลืม
- มี Unread Badge, อ่านแล้ว/ยังไม่อ่าน, Archive, Search และ Deep Link ไปยังสินค้า/Order/Live
- เก็บ Delivery Log, Retry, Expired, Failed และเหตุผลที่ส่งไม่ได้
- Deduplicate เหตุการณ์เดียวกันไม่ให้ขึ้นซ้ำหลายช่องทาง
- Transactional Notification ต้องมี Retention ตาม Policy; Marketing Notification ต้องมี Consent และยกเลิกได้
- หาก Push ใช้ไม่ได้ ให้ Inbox เป็น Fallback หลัก และใช้ Email/LINE/SMS เฉพาะช่องทางที่ยินยอม
- iOS ต้องรองรับ PWA/Home Screen Web App; In-app Browser ต้องมีคำแนะนำให้เปิด Safari/Chrome เมื่อจำเป็น
- แจ้งเตือนสำคัญต้องมีหน้า Activity/Timeline ให้ตรวจย้อนหลัง ไม่พึ่ง Lock Screen อย่างเดียว

Guardrails:

- แยก Transactional กับ Marketing และตรวจ Consent ทุกช่องทาง
- จำกัดความถี่ต่อร้านและมี Quiet Hours
- ลูกค้าปิดรับเฉพาะประเภทข้อความได้
- มี Cancel/Stop Campaign, Delivery Log และ Audit
- ไม่ใช้ข้อมูลอ่อนไหวเพื่อเลือกกลุ่ม
- ไม่ลดการมองเห็นร้านเพราะไม่ซื้อโฆษณา
- SMS/LINE/Email ภายนอกคิดตามต้นทุนหรือโควตา ไม่แอบรวมเป็นค่าโฆษณา

รายได้มาจาก Subscription, Activation Add-on, Quota, ค่า Messaging ตามต้นทุน และ Success Fee เมื่อเกิด Order ไม่ใช่การขาย Impression หรือการประมูลพื้นที่

### Reservation Reliability & Payment Recovery

แนวคิดนี้เป็นจุดต่างของ AVENZO ONE: ให้ระบบจัดการการจอง สต็อก คิว และการชำระเงินที่ค้างแทนการให้แอดมินจำเอง

- Available = On hand - Reserved - Committed และ Reservation ห้ามทำให้ Available ติดลบ
- Reservation ยังไม่ใช่ยอดขายสำเร็จจนกว่าจะชำระเงิน
- สถานะหลัก: รอชำระ, ชำระแล้ว, เตรียมจัดส่ง, จัดส่งแล้ว
- เมื่อสินค้าหมดให้เลือก Waitlist แบบ FIFO, Pre-order หรือแจ้งเตือนเมื่อเติมสต็อก
- ทุก Reservation มี Deadline; หมดเวลาแล้ว Auto-release, แจ้งคิวถัดไป และเก็บ Audit
- มี Reservation Control Center แสดงรายการใกล้หมดเวลา, Payment Error, คิวเติมสินค้า และผู้รับผิดชอบ
- Live CF รวมบิลได้ แต่ต้องเก็บ Reservation แยกตาม SKU
- ลูกค้าที่ไม่ชำระซ้ำใช้ Risk Policy แบบค่อยเป็นค่อยไป เช่น ลดเวลาถือ Reservation หรือขอ Deposit ไม่แบนจากเหตุการณ์เดียว
- ต้องมี Reminder, Customer Timeline, Retry และ Payment Recovery

ระบบทั่วไปมักแยก Order, Stock และ Payment เป็นคนละส่วน เพราะ Workflow นี้ต้องจัดการ Concurrency, Refund, Queue, Notification และ Risk พร้อมกัน นี่จึงเป็นโอกาสลดงานแอดมินและการขายเกินสต็อกของ AVENZO ONE
## 7.1 Customer Journey & Smart Tags (Future Plan)

เป้าหมายคือทำให้ร้านเห็นพฤติกรรมลูกค้าแบบช่วยตัดสินใจ โดยใช้ Server Event Ledger ที่ตรวจสอบได้ ไม่ใช้ Pixel แอบติดตามหรือการอนุมานข้อมูลอ่อนไหว และยังไม่เริ่มทำระบบจริงจนกว่าจะผ่าน UI Mockup, Domain Contract, Security/Privacy Review และ Owner Approval

### Event ที่บันทึกได้

reservation_created, reservation_expired, order_created, payment_succeeded, payment_failed, fulfillment_delivered, return_created, refund_completed, product_viewed, product_saved, follow_store, live_joined, review_created, referral_converted, coupon_redeemed, stock_alert_requested

ทุก Event ต้องมี event_id, user_id, organization_id (ถ้าเกี่ยวข้อง), occurred_at, source, consent_context, metadata_minimized และ Audit/Retention ตาม Policy

### Smart Tag ที่อธิบายได้

- ข้อเท็จจริงการซื้อ: เคยซื้อ, ชำระสำเร็จ, คืนสินค้า, ขอคืนเงิน
- ความสนใจ: สนใจหมวดหมู่/แบรนด์/SKU จากการดู บันทึก หรือแจ้งเตือน
- การมีส่วนร่วม: ติดตามร้าน, เข้าร่วม Live, รีวิวแล้ว
- วงจรลูกค้า: ลูกค้าใหม่, ซื้อซ้ำ, inactive ตามช่วงเวลา
- การดำเนินงาน: รอชำระ, หมดเวลา, รอเติมสต็อก
- ที่มา Conversion: referral, campaign, coupon หรือ review link

ห้ามใช้ป้ายตีตรา เช่น “ลูกค้าไม่ดี” ให้แสดงข้อเท็จจริง จำนวนครั้ง ช่วงเวลา และแหล่งที่มาแทน

### Tag Lifecycle และสิทธิ์การมองเห็น

Tag ต้องเก็บ source_event, rule_version, confidence, first_seen, last_seen, expires_at และใช้ Time Decay/หมดอายุ เพื่อไม่ให้ข้อมูลเก่าติดถาวร ลูกค้าเห็นข้อมูลของตนเองได้ ส่วนร้านเห็นเฉพาะความสัมพันธ์กับ Organization ของตนและตาม Consent; ห้ามนำข้อมูลพฤติกรรมจากร้านหนึ่งไปเปิดให้อีกร้านเห็น

### Data Contract ที่ต้องเตรียม

customer_events, customer_behavior_tags, customer_segments, customer_consents, customer_tag_audits

ต้องรองรับ Purpose, ถอน Consent, ลบ/ส่งออกข้อมูล, Audit, สิทธิ์อุทธรณ์ และห้ามอนุมานสุขภาพ การเมือง ศาสนา หรือข้อมูลอ่อนไหวอื่น ๆ

## 7. Data Governance

- ใช้ `user_id` กลาง และ `organization_customer_id` แยกความสัมพันธ์ร้าน
- ร้านเห็นเฉพาะข้อมูลลูกค้าที่ตนมีสิทธิ์และมี Consent
- การยิงแคมเปญทำผ่าน Audience Activation ของ AVENZO ไม่ขายหรือแจกฐานข้อมูลส่วนตัว
- แยก `consumer_media_quota` และ `organization_media_quota`
- กำหนด Retention, Delete, Export, Account Linking และ Data Subject Request
- เก็บ Consent Version, Purpose, Channel, Timestamp และ Revocation
- ใช้ข้อมูลรวมสำหรับ Analytics/Benchmark โดยไม่เปิดเผย PII

## 7.2 Connected Commerce Intelligence (Future Plan)

ต่อยอดจาก Customer Journey & Smart Tags เพื่อให้การแจ้งเตือนและการแนะนำสินค้าเชื่อมกับมิติอื่นของ Commerce ไม่ใช่เพียงส่งข้อความแล้วรอให้ลูกค้าซื้อ

### ความสามารถที่ต้องเชื่อม

1. Purchase Intent Score: ประเมินจากการดู บันทึก ใส่ตะกร้า จอง ซื้อ และซื้อซ้ำ
2. Customer Availability & Timing: เรียนรู้ช่วงเวลาที่ลูกค้ามักเปิดอ่าน/ซื้อ พร้อม Quiet Hours
3. Real-time Stock & Price Guard: ตรวจสต็อก ราคา โปร และสถานะสินค้าก่อนส่งทุกครั้ง
4. Omnichannel Inbox: รวม Push, Email, LINE, SMS และ Inbox พร้อม Deduplicate
5. Contextual Recommendation: แนะนำสินค้าเสริม สินค้าทดแทน Bundle สี/ไซซ์ และสินค้าที่เกี่ยวข้อง
6. Trust & Care Signals: เชื่อม Verified Review, การจัดส่ง การคืนสินค้า และสถานะบริการ
7. Attribution & Commission: ระบุที่มาจาก Review, Referral, Live, Coupon หรือ Notification และคำนวณยอดขาย/ค่าคอม
8. Experiment & Feedback Loop: ทดสอบข้อความ เวลา และข้อเสนอ แล้ววัด Open, Click, View, Reserve, Paid และ Repeat
9. Frequency & Relevance Guardrails: จำกัดความถี่ อธิบายเหตุผลที่ได้รับข้อความ และให้ปิดรับเป็นรายประเภทได้

ลำดับข้อมูลหลักคือ พฤติกรรม → เจตนาซื้อ → สต็อก/ราคา → ข้อเสนอ → แจ้งเตือน → Order/Payment → รีวิว/ซื้อซ้ำ

ห้ามเริ่ม Recommendation หรือ Campaign อัตโนมัติจนกว่า Event Ledger, Consent, Stock/Price Authority, Attribution และ KPI จะผ่าน Decision Gate

## 7.3 Customer Transaction Standing & Fair Recovery (Future Plan)

เป้าหมายคือให้ลูกค้าเห็นสถานะการทำรายการของตนเอง เข้าใจสิ่งที่ต้องแก้ และรักษาสิทธิ์การซื้อได้ดีขึ้น โดยไม่ใช้คำตีตรา เช่น “ลูกค้าไม่น่าเชื่อถือ” และไม่ใช้คะแนนอัตโนมัติเป็นเหตุผลเดียวในการระงับบัญชี

### สถานะที่ผู้ใช้เห็น

- ปกติ: ทำรายการและชำระเงินตามปกติ
- ควรตรวจสอบ: มีรายการค้างชำระหรือยกเลิกหลายครั้งในช่วงเวลาที่กำหนด
- จำกัดชั่วคราว: ต้องชำระรายการค้าง ยืนยันตัวตน หรือรอการตรวจสอบ
- กลับมาใช้งานได้: แก้ไขปัญหาแล้วและระบบคืนสิทธิ์

แสดงข้อเท็จจริงที่ตรวจสอบได้ เช่น จำนวนการจอง จำนวนชำระสำเร็จ ยกเลิกก่อนชำระ หมดเวลาชำระ เหตุผล สถานะล่าสุด และวิธีแก้ไข

### Fair Risk Policy

1. แยกสาเหตุของการยกเลิก: ลูกค้ายกเลิก, ชำระไม่สำเร็จ, ร้านยกเลิก หรือระบบขัดข้อง
2. ไม่จำกัดสิทธิ์จากเหตุการณ์เดียว ใช้จำนวน ความถี่ และช่วงเวลา
3. ใช้ Progressive Friction ก่อนระงับ เช่น ลดเวลาถือ Reservation, จำกัดจำนวนการจองต่อวัน หรือขอการยืนยันเพิ่ม
4. มี Recovery Path ให้ชำระรายการค้าง ติดต่อร้าน ยืนยันตัวตน และยื่นคำร้อง
5. ใช้ Time Decay สถานะดีขึ้นเมื่อไม่มีเหตุการณ์เสี่ยงตามระยะเวลาที่กำหนด
6. แยกข้อมูลตาม Organization ร้านเห็นเฉพาะความสัมพันธ์ของตนเอง
7. กรณีระงับสิทธิ์ที่มีผลสำคัญต้องมี Human Review, เหตุผล และสิทธิ์อุทธรณ์

### Data Contract

เตรียม customer_transaction_standing, customer_risk_events, customer_recovery_actions, customer_restrictions, customer_appeals และ customer_risk_audits โดยต้องมี rule_version, evidence, effective_at, expires_at, reviewer และ consent/purpose ตามความเหมาะสม

## 7.4 Customer Benefits & Loyalty Layer (Future Plan)

ออกแบบสิทธิประโยชน์จากพฤติกรรมที่สร้างความไว้วางใจ โดยไม่ตีตราหรือจัดอันดับคุณค่าของบุคคล แบ่งเป็นสิทธิ์ที่ร้านค้ากำหนดเองและสิทธิ์กลางของ AVENZO ONE

### สิทธิ์ที่อาจให้ได้

- จองสินค้าได้นานขึ้นหรือได้คิวก่อน
- Early Access สินค้าใหม่และ Live
- ลดหรือยกเว้น Deposit ตามนโยบาย
- ค่าส่งหรือค่าบริการพิเศษ
- Loyalty Point/Credit และสิทธิ์จากการซื้อซ้ำ
- แจ้งเตือนเติมสต็อกก่อน
- Customer Support Priority
- ทดลอง Promotion/Bundle ก่อน
- โบนัสจาก Verified Review
- สิทธิ์สะสมข้ามร้านเฉพาะร้านที่เข้าร่วม

### ขอบเขตสิทธิ์

- Merchant Benefits: ร้านกำหนดเอง เช่น ซื้อซ้ำครบจำนวนแล้วได้ส่วนลดหรือจองก่อน
- Platform Benefits: AVENZO กำหนดจากข้อเท็จจริงที่ยืนยันได้ เช่น ชำระตรงเวลา ยืนยันบัญชี รีวิวจากการซื้อจริง และไม่มี Reservation ค้างซ้ำ

### Fairness Guardrails

สิทธิ์ต้องมีเหตุผลที่ผู้ใช้เข้าใจได้ มีวันหมดอายุและประเมินใหม่ ไม่ใช้ยอดใช้จ่ายอย่างเดียว ไม่เปิดเผยสถานะให้ร้านอื่นโดยอัตโนมัติ ไม่ริบสิทธิ์ทั้งหมดจากเหตุการณ์เดียว และมีช่องทางอุทธรณ์/กู้คืนสิทธิ์

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
9. อนุมัติ Reservation Deadline, FIFO/priority rule, Deposit, Waitlist, Auto-release และ Risk Policy
10. อนุมัติ Live CF Billing/Reservation, Admin Control Center และ Payment Recovery
11. อนุมัติ Event Taxonomy, Smart Tag Categories, Time Decay, Customer/Organization Views และ Privacy/Consent Contract
12. อนุมัติ Intent Score, Timing, Stock/Price Guard, Omnichannel, Recommendation, Attribution, Experiment และ Frequency Guardrails
13. อนุมัติ Customer Transaction Standing, Progressive Friction, Time Decay, Human Review, Recovery และ Appeal Contract
14. อนุมัติ Merchant Benefits, Platform Benefits, Eligibility, Expiry, Re-evaluation, Privacy และ Appeal Contract

## 12. ความสัมพันธ์กับเอกสารอื่น

- `AVENZO_ONE_Codex_Implementation_Starter_Plan_V7.md` เป็น Implementation Roadmap และ Customer Domain Plan
- `AVENZO_ONE_Product_Variant_Sales_Code_and_Live_CF_Development_Guide_V1.md` เป็น Product/Media/Live CF Future Guide
- เอกสาร Design System และ UI Mockup เป็น Authority ของหน้าจอที่ผู้ใช้มองเห็น
- เอกสารนี้เป็น Strategy Authority สำหรับขอบเขตธุรกิจ รายได้ ความเสี่ยง และเกณฑ์ตัดสินใจ

**สถานะปัจจุบัน:** วางแผนและอนุมัติแนวทางเท่านั้น ยังไม่อนุญาตให้เริ่มสร้างระบบจริงจนกว่าแต่ละ Decision Gate จะได้รับอนุมัติแยก

# AVENZO ONE — Phase 1.1.3.2 Payment Provider Comparison

อัปเดตล่าสุด: 8 สิงหาคม 2026

## เป้าหมาย

เปรียบเทียบ Payment Provider ที่รองรับประเทศไทยตามข้อกำหนด Phase 1.1.3.1 และเสนอผู้ให้บริการหลัก/สำรองสำหรับการทดสอบ Sandbox โดยยังไม่สมัครบัญชี ไม่สร้าง Secret Key และไม่ชำระค่าบริการ

ข้อมูลในเอกสารนี้ตรวจจากเว็บไซต์และเอกสารทางการของผู้ให้บริการ ณ วันที่อัปเดต ราคาและเงื่อนไขอาจเปลี่ยนได้ จึงต้องตรวจซ้ำก่อนเปิด Production หรือเซ็นสัญญา

## ขอบเขตการใช้งานที่นำมาเปรียบเทียบ

การเลือกครั้งนี้ใช้สำหรับรับชำระ **ค่าบริการ Subscription ของ AVENZO ONE เอง** เท่านั้น ไม่ใช่การรับเงินแทนร้านค้าในแต่ละ Organization และไม่ใช่ Marketplace/Payment Facilitator

หากในอนาคต AVENZO ONE รับเงินจากลูกค้าปลายทางแทนร้านค้า ต้องเริ่มการประเมิน Provider และข้อกฎหมายใหม่ เพราะผู้ให้บริการอาจจัดรูปแบบนั้นเป็น Payment Facilitation หรือ Marketplace ซึ่งมีข้อกำหนดต่างจาก SaaS Subscription

## รายชื่อที่ประเมิน

1. Stripe Thailand
2. Omise Thailand
3. 2C2P Thailand
4. GB Prime Pay / Xendit Tech — เก็บเป็น Watchlist เพราะข้อมูลราคาและเอกสาร API สาธารณะที่ตรวจสอบได้ยังไม่ครบพอสำหรับเลือกเป็น Provider หลัก

## สรุปเปรียบเทียบ

| หัวข้อ | Stripe Thailand | Omise Thailand | 2C2P Thailand | GB Prime Pay |
|---|---|---|---|---|
| PromptPay QR | รองรับ THB | รองรับ | รองรับ PPQR | รองรับ QR แต่รายละเอียดสาธารณะจำกัด |
| บัตร | Visa/Mastercard และบัตรเดบิต; ข้อจำกัดบางเครือข่ายในไทย | Visa/Mastercard/JCB/Amex/UnionPay ตามหน้าราคา | เครือข่ายบัตรสากลหลายราย | บัตรเต็มจำนวน/ผ่อน/Recurring/Tokenization |
| ราคา PromptPay สาธารณะ | 1.65% ต่อรายการ | 1.65% ต่อรายการ + VAT 7% บนค่าบริการ | ติดต่อฝ่ายขาย | ไม่พบราคาสาธารณะที่ยืนยันได้ |
| ราคาบัตรในประเทศ | 3.65% + 10 บาท | 3.65% ต่อรายการ + VAT 7% บนค่าบริการ | ติดต่อฝ่ายขาย | ไม่พบราคาสาธารณะที่ยืนยันได้ |
| ค่าตั้งต้น/รายเดือน | ราคามาตรฐานระบุว่าไม่มีค่าตั้งค่าและรายเดือน | ระบุว่าไม่มีค่าแรกเข้า/ค่าคงที่/ขั้นต่ำรายเดือนในข้อมูล FAQ; คิดตามรายการ | ต้องยืนยันใบเสนอราคา/สัญญา; แบบฟอร์ม 123 ที่เผยแพร่ระบุค่ารายเดือนเมื่อบัญชีไม่มีรายการตามเงื่อนไข | ต้องติดต่อฝ่ายขาย |
| Settlement/Payout | ไทยเริ่มต้น 7 วันทำการ; ค่าเริ่มต้นจ่ายอัตโนมัติรายวันหลังยอดพร้อม | Hold 7 วัน แล้วสั่ง/ตั้งโอน; เงินเข้าธนาคารวันทำการถัดไป; ค่าโอน 20 บาทเมื่อไม่เกิน 2 ล้านบาท | ขึ้นกับสัญญา/Acquirer ต้องขอใบเสนอราคา | ต้องยืนยันกับฝ่ายขาย |
| Refund | บัตรและ PromptPay ผ่าน Dashboard/API; PromptPay รองรับเต็ม/บางส่วน แต่ต้องให้ลูกค้ายืนยันบัญชีคืนเงิน | มี Refund API/Dashboard และ Event; เงื่อนไขขึ้นกับช่องทาง | มี Void, Full/Partial Refund, Refund Inquiry และ Notify URL | มีบริการ แต่เอกสารสาธารณะไม่ครบสำหรับยืนยัน Flow |
| Recurring/Tokenization | Card Tokenization/Subscription แข็งแรง; PromptPay ไม่ใช่ Auto-debit และใช้แบบส่ง Invoice | Tokenization และ Recurring Card รองรับ; PromptPay เป็นรายการที่ลูกค้าเริ่มเอง | รองรับ Tokenized Card และ Recurring Payment Plan | เว็บไซต์ระบุ Recurring และ Tokenization |
| Sandbox | Test mode, Test Clock/CLI และเอกสารครบ | Test Account และจำลอง Charge/Transfer/Webhook | Sandbox แยก Base URL มี Demo Merchant และ Test Card | มีระบบสมัคร/Developer แต่ข้อมูลสาธารณะน้อยกว่า |
| Webhook Security | ตรวจลายเซ็นด้วย Signing Secret และเอกสาร Idempotency ชัดเจน | มี Event/Webhook และ Secret Key; ต้องออกแบบตรวจ Event ซ้ำในระบบเรา | Request/Response ใช้ JWT HMAC SHA-256; API บางชุดใช้ JWE/JWS | ต้องยืนยันวิธีลงลายเซ็นกับทีมเทคนิค |
| KYC ไทย | รองรับบริษัท/หุ้นส่วน/บุคคล; ใช้บัตรประชาชนและ Company Affidavit DBD ไม่เกิน 6 เดือนเป็นหลัก | เอกสารบริษัท กรรมการ ผู้ถือหุ้น บัญชีธนาคารและหลักฐานธุรกิจค่อนข้างละเอียด | สมัครแบบ Merchant Agreement และเอกสารตามที่บริษัทกำหนด | ต้องติดต่อฝ่ายขาย/สมัครเพื่อตรวจรายการจริง |
| เหมาะกับ AVENZO ONE ตอนนี้ | สูงมาก | สูงมาก | ปานกลางถึงสูงเมื่อปริมาณมาก | ยังไม่พอสำหรับตัดสินใจ |

## คะแนนตามเกณฑ์ Phase 1.1.3.1

คะแนนเป็นการประเมินความเหมาะสมกับ AVENZO ONE รุ่นปัจจุบัน ไม่ได้หมายความว่า Provider คะแนนต่ำมีคุณภาพต่ำกว่า คะแนนส่วนที่ไม่มีราคา/เงื่อนไขสาธารณะจะถูกลดเพื่อสะท้อนความไม่แน่นอน

| เกณฑ์ | น้ำหนัก | Stripe | Omise | 2C2P | GB Prime Pay |
|---|---:|---:|---:|---:|---:|
| ช่องทางชำระและความเหมาะสมกับไทย | 25 | 23 | 25 | 25 | 22 |
| ความปลอดภัย, Webhook และ Idempotency | 20 | 20 | 17 | 18 | 12 |
| ค่าธรรมเนียมและ Settlement | 20 | 18 | 17 | 11 | 8 |
| Sandbox, API และ Documentation | 15 | 15 | 13 | 13 | 8 |
| Refund, Reconciliation และรายงาน | 10 | 9 | 8 | 9 | 6 |
| KYC, Support, SLA และความน่าเชื่อถือ | 10 | 9 | 9 | 9 | 7 |
| **รวม** | **100** | **94** | **89** | **85** | **63** |

## ข้อเสนอการเลือก

### Provider หลัก: Stripe Thailand

เหตุผล:

- ราคา PromptPay และบัตรเปิดเผยชัดเจน ไม่มีค่าตั้งค่า/รายเดือนในแผนมาตรฐาน
- Hosted Checkout, PaymentIntent, Webhook Signature, Idempotency และเอกสาร Node.js เหมาะกับ Next.js/Vercel
- PromptPay รองรับการคืนเต็มและบางส่วน รวมถึง Billing แบบส่ง Invoice
- Dashboard แสดง Payment, Refund, Dispute และ Payout ครบ เหมาะกับฐาน Reconciliation ที่สร้างไว้
- ลดเวลาพัฒนา Phase 1.1.3.3 และลดขอบเขต PCI เพราะใช้หน้า Checkout ที่ Provider โฮสต์

ข้อควรระวัง:

- ค่าบัตรในประเทศมีค่าคงที่เพิ่ม 10 บาทต่อรายการ จึงต้องประเมินผลต่อแพ็กเกจราคาต่ำ
- PromptPay ไม่ใช่ Auto-renew; ลูกค้าต้องเริ่มชำระแต่ละ Invoice เอง
- Refund PromptPay ต้องอาศัยข้อมูลบัญชีจากลูกค้าและอาจล้มเหลวได้
- ต้องยืนยันว่าธุรกิจและสินค้าของ AVENZO ONE ไม่เข้าหมวด Restricted ก่อนเปิด Live
- ใช้บัญชีนี้รับเฉพาะค่า SaaS ของ AVENZO ONE ห้ามรับเงินแทนร้านค้าหลายรายโดยไม่ได้รับอนุมัติรูปแบบ Platform/Connect

### Provider สำรอง: Omise Thailand

เหตุผล:

- ช่องทางไทยกว้างกว่า ทั้ง PromptPay, Mobile Banking, Direct Debit และ e-Wallet หลายประเภท
- ราคาหลักเปิดเผย และมี Test Account/API สำหรับเริ่มทดลองโดยไม่ตัดเงินจริง
- รองรับ Tokenization และ Recurring Card สำหรับ Auto-renew ในอนาคต
- ทีม KYC/Support และเอกสารสำหรับนิติบุคคลไทยชัดเจน

ข้อควรระวัง:

- ค่าบริการที่เผยแพร่ยังไม่รวม VAT 7% และมีค่าธรรมเนียมโอนออก
- เงินถูก Hold 7 วันก่อนเป็นยอดที่โอนได้ แล้วจึงเข้าธนาคารตามรอบโอน
- เอกสาร Webhook บางส่วนเก่ากว่า Stripe จึงต้องทดสอบ Event duplication, ordering และ signature/verification เพิ่มเติมใน Sandbox
- Omise ระบุบางธุรกิจ เช่น Marketplace ว่าอาจไม่รองรับ จึงต้องอธิบายชัดว่าใช้รับค่า Subscription ของ AVENZO ONE เอง

### Enterprise Alternative: 2C2P

เก็บเป็นตัวเลือกเมื่อยอดธุรกรรมสูง ต้องการช่องทางเอเชียจำนวนมาก หรือต้องต่อรองราคาตามปริมาณ เพราะ API รองรับ PromptPay, Card, Tokenization, Recurring, Refund และ Sandbox ครบ แต่ต้องติดต่อฝ่ายขายเพื่อทราบราคา Settlement, KYC และ SLA จริงก่อนตัดสินใจ

### Watchlist: GB Prime Pay

มีช่องทางบัตร QR Recurring และ Tokenization ที่น่าสนใจ แต่ข้อมูลราคา Settlement, Webhook Security, Refund และ Sandbox ที่เผยแพร่สาธารณะยังไม่ครบพอ จึงยังไม่ควรเป็น Provider หลักหรือสำรองของ Phase นี้

## ค่าใช้จ่ายตัวอย่างตามราคาสาธารณะ

ตัวอย่าง Invoice 1,500 บาท โดยยังไม่รวม VAT ของค่าบริการที่ Provider อาจเรียกเก็บ:

| ช่องทาง | Stripe | Omise |
|---|---:|---:|
| PromptPay 1.65% | 24.75 บาท | 24.75 บาท ก่อน VAT ของค่าบริการ |
| บัตรในประเทศ | 64.75 บาท (`3.65% + 10`) | 54.75 บาท ก่อน VAT ของค่าบริการ |

ตัวเลขนี้ใช้เปรียบเทียบเบื้องต้นเท่านั้น ไม่รวม Refund, Dispute, Currency Conversion, Payout/Transfer, ภาษี และราคาแบบต่อรอง

## เอกสารและข้อมูลที่ควรเตรียมก่อนสมัคร

- หนังสือรับรองนิติบุคคล DBD ฉบับล่าสุด
- บัตรประชาชน/หนังสือเดินทางของกรรมการและผู้มีอำนาจ
- รายชื่อผู้ถือหุ้นหรือข้อมูลผู้ถือผลประโยชน์ตามที่ Provider ขอ
- บัญชีธนาคารชื่อเดียวกับนิติบุคคล
- ภ.พ.20 หากจด VAT
- เว็บไซต์ Production, Terms of Service, Privacy Policy, Refund/Cancellation Policy และรายละเอียดแพ็กเกจ
- คำอธิบายชัดเจนว่า AVENZO ONE เก็บค่าบริการ SaaS ของตนเอง ไม่รับเงินแทนผู้ขายภายนอกใน Phase นี้

## Decision Record

- เลือก **Stripe Thailand** เป็น Provider หลักสำหรับ Phase 1.1.3.3 Sandbox Integration
- เลือก **Omise Thailand** เป็น Provider สำรอง แต่ยังไม่เชื่อมพร้อมกันในรอบแรก
- ไม่สมัครหรือสร้าง Live Secret จนกว่าผู้ใช้อนุมัติขั้นตอนสมัครโดยเฉพาะ
- Phase 1.1.3.3 ใช้ Test Mode เท่านั้นและห้ามสร้างรายการเงินจริง
- Production Provider Selection ยังถือเป็น `provisional` จนกว่า KYC, Restricted Business Review และ Sandbox E2E จะผ่าน

## แหล่งข้อมูลทางการ

### Stripe

- [Stripe Thailand pricing](https://stripe.com/th/pricing)
- [PromptPay payments and refund support](https://docs.stripe.com/payments/promptpay)
- [Thailand supported payment methods](https://support.stripe.com/questions/supported-payment-methods-currencies-and-businesses-for-stripe-accounts-in-thailand)
- [Payout schedules and Thailand settlement timing](https://docs.stripe.com/payouts)
- [Thailand verification documents](https://support.stripe.com/questions/what-documents-are-accepted-to-verify-my-account-in-thailand)
- [Restricted and prohibited businesses](https://stripe.com/th/legal/restricted-businesses)

### Omise

- [Omise Thailand pricing](https://www.omise.co/th/pricing/thailand)
- [Thailand integration and SDK support](https://docs.opn.ooo/integrations/thailand)
- [Omise test account](https://docs.omise.co/th/how-do-i-sign-up-for-test-account/thailand)
- [Thailand holding period and transfers](https://docs.omise.co/how-do-i-transfer-withdraw-my-balance/thailand)
- [Thailand live account documents](https://docs.omise.co/th/how-do-i-enable-live-account/thailand)
- [Merchant Service Agreement explanation](https://docs.omise.co/th/the-msa-explained/thailand)

### 2C2P

- [2C2P payment channels including PromptPay](https://developer.2c2p.com/docs/reference-payment-channels)
- [2C2P sandbox setup](https://developer.2c2p.com/docs/sandbox-setup)
- [2C2P Payment Token API](https://developer.2c2p.com/docs/api-payment-token)
- [2C2P payment maintenance, refund and recurring](https://developer.2c2p.com/docs/payment-maintenance-how-it-works)
- [2C2P Thailand Merchant Service Agreement](https://prod-2c2pwebsite.2c2p.com/wp-content/uploads/2026/04/08174646/TH-123-2C2P-MSA-Template_TH-March-2026.pdf)

### GB Prime Pay

- [GB Prime Pay products and account](https://www.gbprimepay.com/en/login)
- [GB Prime Pay Bill Payment](https://www.gbprimepay.com/bill_payment)

## Acceptance Criteria

- เปรียบเทียบ Provider อย่างน้อย 3 รายจากข้อมูลทางการ
- ครอบคลุมช่องทาง ราคา Settlement, Refund, Recurring, Sandbox, Webhook และ KYC
- ระบุข้อมูลที่ยังต้องขอใบเสนอราคาหรือยืนยันกับฝ่ายขาย
- เลือก Provider หลักและสำรองพร้อมเหตุผลและข้อควรระวัง
- ไม่มีการสมัครบัญชี สร้าง Secret เชื่อม API หรือตัดเงินจริง

## แผนถัดไป

Phase 1.1.3.3 Stripe Test-mode Integration: เชื่อม Stripe SDK ฝั่ง Server, สร้าง Hosted Checkout สำหรับ Card/PromptPay, Success/Cancel Page และเก็บ Provider Reference โดยใช้ Test Key เท่านั้น ก่อนทดสอบ Webhook และ Reconciliation ใน Phase 1.1.3.4

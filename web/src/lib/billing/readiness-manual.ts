export const readinessManualItems = [
  { key: 'stripe_account_kyc', label: 'บัญชี Stripe และการยืนยันตัวตนธุรกิจผ่านแล้ว', help: 'ตรวจชื่อบริษัท ผู้มีอำนาจ และสถานะ Account ใน Stripe' },
  { key: 'payout_bank_verified', label: 'บัญชีธนาคารรับเงินได้รับการตรวจสอบแล้ว', help: 'ชื่อบัญชีและนิติบุคคลต้องตรงกับเอกสารที่อนุมัติ' },
  { key: 'live_credentials_secured', label: 'Live Keys ถูกเก็บใน Secret Manager แล้ว', help: 'ห้ามวาง Key ใน Git, Browser, เอกสาร หรือช่องเหตุผลนี้' },
  { key: 'live_webhook_prepared', label: 'เตรียม Live Webhook สำหรับโดเมน Production แล้ว', help: 'Live Webhook ต้องมี Signing Secret คนละค่ากับ Test Mode' },
  { key: 'refund_dispute_policy', label: 'อนุมัตินโยบายคืนเงิน ข้อพิพาท และ Chargeback แล้ว', help: 'ระบุผู้อนุมัติ ระยะเวลา และหลักฐานที่ต้องเก็บ' },
  { key: 'alert_owner_assigned', label: 'กำหนดผู้รับผิดชอบ Alert และคิวเกินกำหนดแล้ว', help: 'ต้องมีคนรับผิดชอบและช่องทางติดต่อที่ใช้งานจริง' },
  { key: 'accounting_legal_review', label: 'บัญชี ภาษี กฎหมาย และ PDPA ตรวจแล้ว', help: 'Invoice ปัจจุบันยังไม่ใช่ใบกำกับภาษีอิเล็กทรอนิกส์' },
  { key: 'rollback_drill', label: 'ทดลองหยุด Checkout และ Rollback สำเร็จแล้ว', help: 'ทีมต้องหยุดรับเงินจริงได้ทันทีเมื่อเกิดเหตุผิดปกติ' },
  { key: 'live_safe_test_plan', label: 'อนุมัติแผนทดสอบ Live แบบยอดต่ำแล้ว', help: 'กำหนด Card, PromptPay, Failed, Expired, Duplicate และ Reconciliation' },
] as const

export type ReadinessManualKey = typeof readinessManualItems[number]['key']
export type ReadinessManualChecklist = Record<ReadinessManualKey, boolean>

export const billingStatusLabels: Record<string, { label: string; description: string }> = {
  pending: { label: 'รอชำระ', description: 'ออก Invoice แล้วและกำลังรอผลการชำระเงิน' },
  paid: { label: 'ชำระแล้ว', description: 'บันทึกยอดชำระครบถ้วนแล้ว' },
  failed: { label: 'ชำระไม่สำเร็จ', description: 'การชำระเงินไม่สำเร็จ สามารถบันทึกผลใหม่ได้' },
  canceled: { label: 'ยกเลิกแล้ว', description: 'Invoice นี้ถูกยกเลิกและไม่สามารถรับชำระต่อได้' },
}

export function billingErrorMessage(raw: string) {
  const messages: Array<[string, string]> = [
    ['platform_admin_aal2_required', 'ต้องเข้าสู่ระบบด้วย Platform Admin และยืนยัน MFA ก่อน'],
    ['subscription_not_found', 'ไม่พบ Subscription ของ Organization นี้'],
    ['subscription_plan_version_required', 'Subscription นี้ยังไม่มี Plan Version'],
    ['active_plan_price_not_found', 'ไม่พบราคาที่เปิดใช้งานสำหรับ Plan Version นี้'],
    ['invoice_due_date_in_past', 'วันครบกำหนดต้องไม่อยู่ในอดีต'],
    ['invalid_discount_amount', 'ส่วนลดต้องไม่ติดลบและไม่เกินยอดก่อนส่วนลด'],
    ['invalid_tax_amount', 'ภาษีต้องไม่ติดลบ'],
    ['billing_reason_too_short', 'กรุณาระบุเหตุผลอย่างน้อย 3 ตัวอักษร'],
    ['invoice_not_found', 'ไม่พบ Invoice ที่เลือก'],
    ['paid_invoice_is_final', 'Invoice นี้ชำระแล้ว ไม่สามารถแก้สถานะได้'],
    ['canceled_invoice_is_final', 'Invoice นี้ยกเลิกแล้ว ไม่สามารถแก้สถานะได้'],
    ['payment_amount_must_equal_invoice_total', 'ยอดที่ชำระต้องเท่ากับยอดสุทธิของ Invoice'],
    ['billing_issuer_profile_required', 'กรุณาตั้งค่าข้อมูลผู้ออกเอกสารก่อน'],
    ['billing_customer_profile_required', 'กรุณาตั้งค่าข้อมูลผู้รับเอกสารของ Organization นี้ก่อน'],
    ['issuer_legal_name_and_address_required', 'กรุณาระบุชื่อและที่อยู่ผู้ออกเอกสารให้ครบถ้วน'],
    ['customer_legal_name_and_address_required', 'กรุณาระบุชื่อและที่อยู่ผู้รับเอกสารให้ครบถ้วน'],
    ['invoice_document_already_issued', 'Invoice นี้ออกเอกสารแล้ว'],
    ['cannot_issue_document_for_canceled_invoice', 'Invoice ที่ยกเลิกแล้วไม่สามารถออกเอกสารได้'],
    ['cancel_invoice_before_canceling_document', 'ต้องยกเลิก Invoice ต้นทางก่อนจึงจะยกเลิกเอกสารได้'],
    ['credit_note_requires_paid_invoice', 'ออก Credit Note ได้เฉพาะ Invoice ที่ชำระแล้ว'],
    ['credit_note_exceeds_invoice_total', 'ยอด Credit Note รวมต้องไม่เกินยอดเอกสาร'],
    ['invoice_document_not_issued', 'เอกสารต้นทางยังไม่อยู่ในสถานะออกเอกสาร'],
  ]
  return messages.find(([code]) => raw.includes(code))?.[1] ?? raw
}

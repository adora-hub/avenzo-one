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
  ]
  return messages.find(([code]) => raw.includes(code))?.[1] ?? raw
}

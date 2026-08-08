export type StripePaymentMethod = 'promptpay' | 'card'

export const stripeTestFeeSchedule: Record<StripePaymentMethod, {
  label: string
  rateBps: number
  fixedAmount: number
  description: string
}> = {
  promptpay: {
    label: 'PromptPay QR',
    rateBps: 165,
    fixedAmount: 0,
    description: 'ประมาณ 1.65% ต่อรายการ',
  },
  card: {
    label: 'บัตรเครดิต/เดบิตในประเทศ',
    rateBps: 365,
    fixedAmount: 10,
    description: 'ประมาณ 3.65% + 10 บาทต่อรายการ',
  },
}
function roundMoney(value: number) {
  return Math.round((value + Number.EPSILON) * 100) / 100
}

export function calculateStripeFeeSnapshot(invoiceAmount: number, method: StripePaymentMethod) {
  const schedule = stripeTestFeeSchedule[method]
  const estimatedProviderFee = roundMoney((invoiceAmount * schedule.rateBps / 10_000) + schedule.fixedAmount)

  return {
    paymentMethod: method,
    feeRateBps: schedule.rateBps,
    feeFixedAmount: schedule.fixedAmount,
    estimatedProviderFee,
    customerFeeAmount: 0,
    customerChargeAmount: roundMoney(invoiceAmount),
    estimatedNetAmount: roundMoney(invoiceAmount - estimatedProviderFee),
  }
}

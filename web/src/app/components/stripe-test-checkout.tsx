'use client'

import { useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import { calculateStripeFeeSnapshot, stripeTestFeeSchedule, type StripePaymentMethod } from '@/lib/billing/stripe-fees'
import { billingErrorMessage } from './billing-labels'

function formatMoney(value: number, currency: string) {
  return new Intl.NumberFormat('th-TH', { style: 'currency', currency, minimumFractionDigits: 2 }).format(value)
}

const checkoutStatusLabels: Record<string, string> = {
  pending: 'รอผลการชำระ',
  succeeded: 'ชำระสำเร็จ',
  failed: 'ชำระไม่สำเร็จ',
  canceled: 'ยกเลิกแล้ว',
  expired: 'ลิงก์หมดอายุ',
}

export type StripeFeeAttemptSnapshot = {
  id: string
  status: string
  payment_method: StripePaymentMethod | null
  estimated_provider_fee: number | null
  customer_fee_amount: number
  customer_charge_amount: number | null
  provider_fee_actual: number | null
  provider_net_amount: number | null
  created_at: string
}

export function StripeFeeSnapshot({ attempt, currency, fallbackAmount }: {
  attempt: StripeFeeAttemptSnapshot
  currency: string
  fallbackAmount: number
}) {
  const router = useRouter()
  const [reconciling, setReconciling] = useState(false)
  const [reconcileMessage, setReconcileMessage] = useState('')
  const estimatedFee = attempt.estimated_provider_fee ?? 0
  const variance = attempt.provider_fee_actual === null ? null : attempt.provider_fee_actual - estimatedFee

  async function reconcile() {
    setReconciling(true)
    setReconcileMessage('')
    try {
      const response = await fetch('/api/billing/stripe/reconcile', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ attemptId: attempt.id }),
      })
      const result = await response.json() as { error?: string }
      if (!response.ok) throw new Error(result.error ?? 'stripe_reconciliation_failed')
      router.refresh()
    } catch (error) {
      setReconcileMessage(billingErrorMessage(error instanceof Error ? error.message : 'stripe_reconciliation_failed'))
    } finally {
      setReconciling(false)
    }
  }

  return <div className="stripe-fee-snapshot">
    <div><span className="history-label">FEE SNAPSHOT ล่าสุด</span><strong>{attempt.payment_method ? stripeTestFeeSchedule[attempt.payment_method].label : 'ไม่ระบุช่องทาง'}</strong></div>
    <dl>
      <div><dt>สถานะ Checkout</dt><dd>{checkoutStatusLabels[attempt.status] ?? attempt.status}</dd></div>
      <div><dt>ค่าธรรมเนียมประมาณการ</dt><dd>{formatMoney(estimatedFee, currency)}</dd></div>
      <div><dt>ค่าธรรมเนียมที่เรียกเก็บลูกค้า</dt><dd>{formatMoney(attempt.customer_fee_amount, currency)}</dd></div>
      <div><dt>ยอดที่ลูกค้าชำระ</dt><dd>{formatMoney(attempt.customer_charge_amount ?? fallbackAmount, currency)}</dd></div>
      {attempt.provider_fee_actual !== null && <div><dt>ค่าธรรมเนียมจริงจาก Stripe</dt><dd>{formatMoney(attempt.provider_fee_actual, currency)}</dd></div>}
      {attempt.provider_net_amount !== null && <div><dt>ยอดสุทธิหลังหักค่าธรรมเนียม</dt><dd>{formatMoney(attempt.provider_net_amount, currency)}</dd></div>}
      {variance !== null && <div><dt>ส่วนต่างจากประมาณการ</dt><dd>{variance >= 0 ? '+' : ''}{formatMoney(variance, currency)}</dd></div>}
    </dl>
    {attempt.status === 'succeeded' && attempt.provider_fee_actual === null && <button className="button secondary" type="button" disabled={reconciling} onClick={reconcile}>{reconciling ? 'กำลังตรวจสอบ…' : 'ตรวจค่าธรรมเนียมจริง'}</button>}
    {reconcileMessage && <div className="error">{reconcileMessage}</div>}
  </div>
}

export function StripeTestCheckout({ invoice, configured, latestAttempt }: {
  invoice: { id: string; invoice_number: string; total_amount: number; currency: string }
  configured: boolean
  latestAttempt?: StripeFeeAttemptSnapshot | null
}) {
  const [method, setMethod] = useState<StripePaymentMethod>('promptpay')
  const [loading, setLoading] = useState(false)
  const [message, setMessage] = useState('')
  const fee = useMemo(() => calculateStripeFeeSnapshot(invoice.total_amount, method), [invoice.total_amount, method])

  async function checkout() {
    setLoading(true)
    setMessage('')
    try {
      const response = await fetch('/api/billing/stripe/checkout', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ invoiceId: invoice.id, paymentMethod: method, commandId: crypto.randomUUID() }),
      })
      const result = await response.json() as { url?: string; error?: string }
      if (!response.ok || !result.url) throw new Error(result.error ?? 'stripe_checkout_failed')
      window.location.assign(result.url)
    } catch (error) {
      setMessage(billingErrorMessage(error instanceof Error ? error.message : 'stripe_checkout_failed'))
      setLoading(false)
    }
  }

  return <section className="stripe-test-panel">
    <div className="gateway-sandbox-heading">
      <div><span className="eyebrow">STRIPE TEST MODE</span><h4>ทดลอง Checkout จริงกับ Stripe</h4></div>
      <span className="status active">ไม่ตัดเงินจริง</span>
    </div>
    <p>เลือกช่องทางเพื่อดูค่าธรรมเนียมโดยประมาณก่อนเปิดหน้า Stripe Checkout</p>

    <div className="stripe-payment-methods" role="radiogroup" aria-label="ช่องทางชำระเงิน">
      {(Object.keys(stripeTestFeeSchedule) as StripePaymentMethod[]).map((item) => <label className={method === item ? 'stripe-method-card is-selected' : 'stripe-method-card'} key={item}>
        <input type="radio" name={`stripe-method-${invoice.id}`} value={item} checked={method === item} onChange={() => setMethod(item)} />
        <span><strong>{stripeTestFeeSchedule[item].label}</strong><small>{stripeTestFeeSchedule[item].description}</small></span>
      </label>)}
    </div>

    <dl className="stripe-fee-summary">
      <div><dt>ยอด Invoice</dt><dd>{formatMoney(invoice.total_amount, invoice.currency)}</dd></div>
      <div><dt>ค่าธรรมเนียม Stripe โดยประมาณ</dt><dd>{formatMoney(fee.estimatedProviderFee, invoice.currency)}</dd></div>
      <div><dt>ผู้รับภาระค่าธรรมเนียม</dt><dd>AVENZO ONE</dd></div>
      <div className="stripe-customer-total"><dt>ยอดที่ลูกค้าชำระ</dt><dd>{formatMoney(fee.customerChargeAmount, invoice.currency)}</dd></div>
    </dl>
    <div className="info-message"><span aria-hidden="true">i</span><p>ค่าธรรมเนียมเป็นค่าประมาณตามอัตรามาตรฐานและอาจต่างจากยอด Settlement จริง ลูกค้าไม่ถูกบวกค่าธรรมเนียมในรอบนี้</p></div>
    {latestAttempt && <StripeFeeSnapshot attempt={latestAttempt} currency={invoice.currency} fallbackAmount={invoice.total_amount} />}
    {!configured && <div className="warning">ยังไม่ได้ตั้งค่า Stripe Test Secret Key และ Webhook Secret บน Server</div>}
    {message && <div className="error">{message}</div>}
    <button className="button" type="button" disabled={loading || !configured} onClick={checkout}>
      {loading ? 'กำลังเปิด Stripe Checkout…' : `ทดลองชำระด้วย ${stripeTestFeeSchedule[method].label}`}
    </button>
  </section>
}

'use client'

import { FormEvent, useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/browser'
import { billingErrorMessage } from './billing-labels'

export type BillingOrganization = { id: string; name: string; slug: string; timezone: string; currency: string }
export type BillingSubscription = {
  id: string
  organization_id: string
  plan_version_id: string
  plan_name: string
  plan_version_label: string
  selected_price_id: string | null
  starts_at: string
  expires_at: string
}
export type BillingPrice = { id: string; plan_version_id: string; billing_interval: string; amount: number; currency: string }

function toLocalDateTime(value: Date) {
  const offset = value.getTimezoneOffset() * 60000
  return new Date(value.getTime() - offset).toISOString().slice(0, 16)
}

function formatMoney(value: number, currency: string) {
  return new Intl.NumberFormat('th-TH', { style: 'currency', currency, minimumFractionDigits: 2 }).format(value)
}

function formatDate(value: string, timezone = 'Asia/Bangkok') {
  return new Intl.DateTimeFormat('th-TH', { dateStyle: 'medium', timeStyle: 'short', timeZone: timezone }).format(new Date(value))
}

export function BillingInvoiceForm({ organizations, subscriptions, prices }: {
  organizations: BillingOrganization[]
  subscriptions: BillingSubscription[]
  prices: BillingPrice[]
}) {
  const router = useRouter()
  const firstSubscription = subscriptions[0]
  const [subscriptionId, setSubscriptionId] = useState(firstSubscription?.id ?? '')
  const [priceId, setPriceId] = useState(firstSubscription?.selected_price_id ?? prices.find((item) => item.plan_version_id === firstSubscription?.plan_version_id)?.id ?? '')
  const [periodStart, setPeriodStart] = useState(firstSubscription ? toLocalDateTime(new Date(firstSubscription.starts_at)) : '')
  const [periodEnd, setPeriodEnd] = useState(firstSubscription ? toLocalDateTime(new Date(firstSubscription.expires_at)) : '')
  const [dueAt, setDueAt] = useState(toLocalDateTime(new Date(Date.now() + 7 * 86400000)))
  const [discount, setDiscount] = useState('0')
  const [tax, setTax] = useState('0')
  const [reason, setReason] = useState('ออก Invoice สำหรับรอบ Subscription')
  const [preview, setPreview] = useState(false)
  const [commandId, setCommandId] = useState('')
  const [loading, setLoading] = useState(false)
  const [message, setMessage] = useState('')

  const selectedSubscription = useMemo(() => subscriptions.find((item) => item.id === subscriptionId), [subscriptionId, subscriptions])
  const selectedOrganization = useMemo(() => organizations.find((item) => item.id === selectedSubscription?.organization_id), [organizations, selectedSubscription])
  const availablePrices = useMemo(() => prices.filter((item) => item.plan_version_id === selectedSubscription?.plan_version_id), [prices, selectedSubscription])
  const selectedPrice = useMemo(() => availablePrices.find((item) => item.id === priceId) ?? availablePrices[0], [availablePrices, priceId])
  const discountAmount = Number(discount) || 0
  const taxAmount = Number(tax) || 0
  const total = (selectedPrice?.amount ?? 0) - discountAmount + taxAmount

  function resetPreview() { setPreview(false); setCommandId(''); setMessage('') }

  function selectSubscription(value: string) {
    const next = subscriptions.find((item) => item.id === value)
    setSubscriptionId(value)
    if (next) {
      setPeriodStart(toLocalDateTime(new Date(next.starts_at)))
      setPeriodEnd(toLocalDateTime(new Date(next.expires_at)))
      setPriceId(next.selected_price_id ?? prices.find((item) => item.plan_version_id === next.plan_version_id)?.id ?? '')
    }
    setDiscount('0')
    setTax('0')
    resetPreview()
  }

  function preparePreview(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!selectedSubscription || !selectedPrice) { setMessage('Subscription นี้ยังไม่มีราคาที่เปิดใช้งาน'); return }
    if (new Date(periodStart) >= new Date(periodEnd)) { setMessage('วันเริ่มรอบต้องมาก่อนวันสิ้นสุดรอบ'); return }
    if (discountAmount < 0 || discountAmount > selectedPrice.amount) { setMessage('ส่วนลดต้องไม่ติดลบและไม่เกินยอดก่อนส่วนลด'); return }
    if (taxAmount < 0 || total < 0) { setMessage('ภาษีและยอดสุทธิต้องไม่ติดลบ'); return }
    if (reason.trim().length < 3) { setMessage('กรุณาระบุเหตุผลอย่างน้อย 3 ตัวอักษร'); return }
    setMessage('')
    setCommandId(crypto.randomUUID())
    setPreview(true)
  }

  async function confirmInvoice() {
    if (!selectedSubscription || !selectedPrice || !commandId) return
    setLoading(true)
    setMessage('')
    try {
      const { error } = await createClient().rpc('platform_create_billing_invoice', {
        p_organization_id: selectedSubscription.organization_id,
        p_subscription_id: selectedSubscription.id,
        p_plan_price_id: selectedPrice.id,
        p_billing_period_start: new Date(periodStart).toISOString(),
        p_billing_period_end: new Date(periodEnd).toISOString(),
        p_discount_amount: discountAmount,
        p_tax_amount: taxAmount,
        p_due_at: new Date(dueAt).toISOString(),
        p_reason: reason.trim(),
        p_command_id: commandId,
        p_metadata: { source: 'platform_admin_billing_ui' },
      })
      if (error) throw error
      setMessage('สร้าง Invoice สำเร็จ')
      setPreview(false)
      setCommandId('')
      router.refresh()
    } catch (error) {
      const raw = error instanceof Error ? error.message : 'ไม่สามารถสร้าง Invoice ได้'
      setMessage(billingErrorMessage(raw))
    } finally { setLoading(false) }
  }

  if (!subscriptions.length) return <div className="empty">ยังไม่มี Subscription ที่ผูก Plan Version จึงยังออก Invoice ไม่ได้</div>

  return (
    <form className="form billing-form" noValidate onSubmit={preparePreview}>
      <label>Organization / Subscription<select value={subscriptionId} onChange={(event) => selectSubscription(event.target.value)}>{subscriptions.map((item) => {
        const organization = organizations.find((org) => org.id === item.organization_id)
        return <option key={item.id} value={item.id}>{organization?.name} · {item.plan_name} / {item.plan_version_label}</option>
      })}</select></label>
      <label>รอบราคา<select value={selectedPrice?.id ?? ''} onChange={(event) => { setPriceId(event.target.value); resetPreview() }}>{availablePrices.map((price) => <option key={price.id} value={price.id}>{price.billing_interval === 'monthly' ? 'รายเดือน' : price.billing_interval === 'yearly' ? 'รายปี' : 'ครั้งเดียว'} · {formatMoney(price.amount, price.currency)}</option>)}</select><span className="field-help">เลือกตามรอบราคาที่ตกลงกับลูกค้า ระบบจะเก็บเป็น Snapshot ใน Invoice</span></label>
      <div className="form-grid-two"><label>เริ่มรอบ Billing<input type="datetime-local" value={periodStart} onChange={(event) => { setPeriodStart(event.target.value); resetPreview() }} /></label><label>สิ้นสุดรอบ Billing<input type="datetime-local" value={periodEnd} onChange={(event) => { setPeriodEnd(event.target.value); resetPreview() }} /></label></div>
      <label>ครบกำหนดชำระ<input type="datetime-local" value={dueAt} onChange={(event) => { setDueAt(event.target.value); resetPreview() }} /></label>
      <div className="form-grid-two"><label>ส่วนลด<input type="number" min="0" step="0.01" value={discount} onChange={(event) => { setDiscount(event.target.value); resetPreview() }} /></label><label>ภาษี<input type="number" min="0" step="0.01" value={tax} onChange={(event) => { setTax(event.target.value); resetPreview() }} /></label></div>
      <label>เหตุผล<span className="field-help">บันทึกใน Audit Log</span><textarea rows={3} minLength={3} value={reason} onChange={(event) => { setReason(event.target.value); resetPreview() }} /></label>
      {message && <div className={message.includes('สำเร็จ') ? 'countdown' : 'error'}>{message}</div>}
      {!preview ? <button className="button" type="submit">ตรวจสอบก่อนสร้าง Invoice</button> : <section className="subscription-confirmation" aria-live="polite">
        <div className="subscription-confirmation-heading"><div><span className="eyebrow">ตรวจสอบครั้งสุดท้าย</span><h3>Invoice ใหม่</h3></div><span className="status active">ยังไม่บันทึก</span></div>
        <dl className="subscription-confirmation-grid">
          <div><dt>Organization</dt><dd>{selectedOrganization?.name}</dd></div><div><dt>Plan / Version</dt><dd>{selectedSubscription?.plan_name} / {selectedSubscription?.plan_version_label}</dd></div>
          <div><dt>ยอดก่อนส่วนลด</dt><dd>{formatMoney(selectedPrice?.amount ?? 0, selectedPrice?.currency ?? 'THB')}</dd></div><div><dt>ส่วนลด</dt><dd>{formatMoney(discountAmount, selectedPrice?.currency ?? 'THB')}</dd></div>
          <div><dt>ภาษี</dt><dd>{formatMoney(taxAmount, selectedPrice?.currency ?? 'THB')}</dd></div><div><dt>ยอดสุทธิ</dt><dd>{formatMoney(total, selectedPrice?.currency ?? 'THB')}</dd></div>
          <div><dt>รอบ Billing</dt><dd>{formatDate(periodStart, selectedOrganization?.timezone)} – {formatDate(periodEnd, selectedOrganization?.timezone)}</dd></div><div><dt>ครบกำหนด</dt><dd>{formatDate(dueAt, selectedOrganization?.timezone)}</dd></div>
        </dl>
        <div className="subscription-confirmation-note"><strong>หมายเหตุ</strong><span>ขั้นตอนนี้สร้างเอกสารและยอดค้างชำระเท่านั้น ยังไม่มีการตัดเงินจริง</span></div>
        <div className="button-row"><button className="button secondary" type="button" disabled={loading} onClick={() => setPreview(false)}>ย้อนกลับแก้ไข</button><button className="button" type="button" disabled={loading} onClick={confirmInvoice}>{loading ? 'กำลังสร้าง…' : 'ยืนยันสร้าง Invoice'}</button></div>
      </section>}
    </form>
  )
}

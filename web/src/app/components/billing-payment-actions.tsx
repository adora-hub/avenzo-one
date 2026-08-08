'use client'

import { FormEvent, useState } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/browser'
import { billingErrorMessage, billingStatusLabels } from './billing-labels'

export function BillingPaymentActions({ invoice }: { invoice: { id: string; invoice_number: string; status: string; total_amount: number; currency: string } }) {
  const router = useRouter()
  const [status, setStatus] = useState('paid')
  const [amount, setAmount] = useState(String(invoice.total_amount))
  const [provider, setProvider] = useState('manual')
  const [reference, setReference] = useState('')
  const [reason, setReason] = useState('บันทึกผลการชำระเงิน')
  const [preview, setPreview] = useState(false)
  const [commandId, setCommandId] = useState('')
  const [loading, setLoading] = useState(false)
  const [message, setMessage] = useState('')

  function resetPreview() { setPreview(false); setCommandId(''); setMessage('') }
  function preparePreview(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (reason.trim().length < 3) { setMessage('กรุณาระบุเหตุผลอย่างน้อย 3 ตัวอักษร'); return }
    if (status === 'paid' && Number(amount) !== invoice.total_amount) { setMessage('ยอดที่ชำระต้องเท่ากับยอดสุทธิของ Invoice'); return }
    setMessage('')
    setCommandId(crypto.randomUUID())
    setPreview(true)
  }
  async function confirm() {
    if (!commandId) return
    setLoading(true)
    setMessage('')
    try {
      const { error } = await createClient().rpc('platform_record_billing_payment', {
        p_invoice_id: invoice.id,
        p_status: status,
        p_amount: Number(amount),
        p_provider: provider.trim().toLowerCase(),
        p_provider_reference: reference.trim() || null,
        p_reason: reason.trim(),
        p_command_id: commandId,
        p_occurred_at: new Date().toISOString(),
        p_metadata: { source: 'platform_admin_billing_ui' },
      })
      if (error) throw error
      setMessage('บันทึกผล Payment สำเร็จ')
      setPreview(false)
      router.refresh()
    } catch (error) {
      const raw = error instanceof Error ? error.message : 'ไม่สามารถบันทึก Payment ได้'
      setMessage(billingErrorMessage(raw))
    } finally { setLoading(false) }
  }

  return <form className="form billing-payment-form" noValidate onSubmit={preparePreview}>
    <label>ผลการชำระ<select value={status} onChange={(event) => { setStatus(event.target.value); resetPreview() }}><option value="paid">ชำระแล้ว</option><option value="failed">ชำระไม่สำเร็จ</option><option value="pending">ยังรอชำระ</option><option value="canceled">ยกเลิก Invoice</option></select></label>
    <div className="form-grid-two"><label>ยอดเงิน<input type="number" min="0" step="0.01" value={amount} onChange={(event) => { setAmount(event.target.value); resetPreview() }} /></label><label>ผู้ให้บริการ<input value={provider} onChange={(event) => { setProvider(event.target.value); resetPreview() }} /></label></div>
    <label>เลขอ้างอิงจากผู้ให้บริการ (ถ้ามี)<input value={reference} onChange={(event) => { setReference(event.target.value); resetPreview() }} /></label>
    <label>เหตุผล<textarea rows={2} minLength={3} value={reason} onChange={(event) => { setReason(event.target.value); resetPreview() }} /></label>
    {message && <div className={message.includes('สำเร็จ') ? 'countdown' : 'error'}>{message}</div>}
    {!preview ? <button className={`button ${status === 'failed' || status === 'canceled' ? 'danger' : ''}`} type="submit">ตรวจสอบก่อนบันทึก</button> : <section className="subscription-confirmation">
      <div className="subscription-confirmation-heading"><div><span className="eyebrow">ตรวจสอบครั้งสุดท้าย</span><h3>{billingStatusLabels[status]?.label}</h3></div><span className="status active">ยังไม่บันทึก</span></div>
      <dl className="subscription-confirmation-grid"><div><dt>Invoice</dt><dd>{invoice.invoice_number}</dd></div><div><dt>ยอดเงิน</dt><dd>{new Intl.NumberFormat('th-TH', { style: 'currency', currency: invoice.currency }).format(Number(amount))}</dd></div><div><dt>ผู้ให้บริการ</dt><dd>{provider}</dd></div><div><dt>เลขอ้างอิง</dt><dd>{reference || 'ไม่มี'}</dd></div></dl>
      <div className="button-row"><button className="button secondary" type="button" disabled={loading} onClick={() => setPreview(false)}>ย้อนกลับแก้ไข</button><button className={`button ${status === 'failed' || status === 'canceled' ? 'danger' : ''}`} type="button" disabled={loading} onClick={confirm}>{loading ? 'กำลังบันทึก…' : `ยืนยัน${billingStatusLabels[status]?.label}`}</button></div>
    </section>}
  </form>
}

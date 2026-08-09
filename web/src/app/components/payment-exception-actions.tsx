'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import type { PaymentExceptionKind } from '@/lib/billing/payment-exceptions'
import type { StripePaymentMethod } from '@/lib/billing/stripe-fees'
import { billingErrorMessage } from './billing-labels'

type ExceptionAction = 'reconcile_fee' | 'refresh_provider_status' | 'retry_checkout'

const actionConfig: Record<PaymentExceptionKind, { action: ExceptionAction; label: string; confirmation: string }> = {
  reconciliation_pending: { action: 'reconcile_fee', label: 'ตรวจค่าธรรมเนียมอีกครั้ง', confirmation: 'ระบบจะอ่านค่าธรรมเนียมและยอดสุทธิจริงจาก Stripe Test Mode แล้วบันทึกลง Payment Attempt' },
  webhook_failed: { action: 'refresh_provider_status', label: 'ตรวจสถานะ Provider', confirmation: 'ระบบจะอ่านสถานะล่าสุดจาก Stripe และประมวลผลผลลัพธ์ใหม่โดยไม่สร้างยอดชำระซ้ำ' },
  invoice_mismatch: { action: 'refresh_provider_status', label: 'ตรวจและซ่อมสถานะ Invoice', confirmation: 'ระบบจะยืนยันสถานะกับ Stripe ก่อนซ่อม Invoice และจะไม่เปลี่ยนเป็นชำระแล้วหากไม่มีหลักฐานจาก Provider' },
  payment_failed: { action: 'retry_checkout', label: 'สร้าง Checkout ใหม่', confirmation: 'ระบบจะสร้าง Stripe Test Checkout ใหม่สำหรับ Invoice เดิม โดยไม่แก้ยอด Invoice' },
  payment_expired: { action: 'retry_checkout', label: 'สร้าง Checkout ใหม่', confirmation: 'ระบบจะสร้าง Stripe Test Checkout ใหม่แทนลิงก์เดิมที่หมดอายุ' },
  payment_canceled: { action: 'retry_checkout', label: 'สร้าง Checkout ใหม่', confirmation: 'ระบบจะสร้าง Stripe Test Checkout ใหม่แทนรายการเดิมที่ถูกยกเลิก' },
  payment_stale: { action: 'retry_checkout', label: 'สร้าง Checkout ใหม่', confirmation: 'ระบบจะสร้าง Stripe Test Checkout ใหม่ เนื่องจากรายการเดิมไม่มีผลลัพธ์เกิน 30 นาที' },
}

export function PaymentExceptionActions({
  attemptId,
  kind,
  invoiceNumber,
  paymentMethod,
}: {
  attemptId: string
  kind: PaymentExceptionKind
  invoiceNumber: string
  paymentMethod: string | null
}) {
  const router = useRouter()
  const config = actionConfig[kind]
  const [reviewing, setReviewing] = useState(false)
  const [reason, setReason] = useState('')
  const [method, setMethod] = useState<StripePaymentMethod>(paymentMethod === 'card' ? 'card' : 'promptpay')
  const [submitting, setSubmitting] = useState(false)
  const [message, setMessage] = useState('')
  const [error, setError] = useState('')

  async function submit() {
    const cleanReason = reason.trim()
    if (cleanReason.length < 3) {
      setError('กรุณากรอกเหตุผลอย่างน้อย 3 ตัวอักษร')
      return
    }

    setSubmitting(true)
    setMessage('')
    setError('')
    try {
      const response = await fetch('/api/billing/payment-exceptions/resolve', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          attemptId,
          action: config.action,
          commandId: crypto.randomUUID(),
          reason: cleanReason,
          paymentMethod: config.action === 'retry_checkout' ? method : undefined,
        }),
      })
      const result = await response.json() as { error?: string; outcome?: string; url?: string }
      if (!response.ok) throw new Error(result.error ?? 'payment_exception_action_failed')
      if (result.url) {
        window.location.assign(result.url)
        return
      }
      setMessage(result.outcome === 'provider_result_pending'
        ? 'Provider ยังไม่แจ้งผลสุดท้าย รายการจึงยังอยู่ในคิว'
        : 'ดำเนินการสำเร็จ ระบบกำลังปรับปรุงรายการ')
      setReviewing(false)
      router.refresh()
    } catch (caught) {
      setError(billingErrorMessage(caught instanceof Error ? caught.message : 'payment_exception_action_failed'))
    } finally {
      setSubmitting(false)
    }
  }

  return <div className="payment-exception-actions">
    {reviewing ? <div className="payment-exception-confirmation">
      <div className="payment-exception-confirmation-heading">
        <div><span className="eyebrow">ตรวจสอบครั้งสุดท้าย</span><h4>{config.label}</h4></div>
        <span className="status active">ยังไม่บันทึก</span>
      </div>
      <dl className="payment-exception-confirmation-grid">
        <div><dt>Invoice</dt><dd>{invoiceNumber}</dd></div>
        <div><dt>คำสั่ง</dt><dd>{config.label}</dd></div>
      </dl>
      <div className="info-message"><span aria-hidden="true">i</span><p>{config.confirmation}</p></div>
      {config.action === 'retry_checkout' ? <fieldset className="payment-exception-methods">
        <legend>ช่องทางสำหรับ Checkout ใหม่</legend>
        <label><input type="radio" name={`exception-method-${attemptId}`} checked={method === 'promptpay'} onChange={() => setMethod('promptpay')} /> PromptPay QR</label>
        <label><input type="radio" name={`exception-method-${attemptId}`} checked={method === 'card'} onChange={() => setMethod('card')} /> บัตร</label>
      </fieldset> : null}
      <label>เหตุผล <span className="field-help">บันทึกใน Audit Log</span>
        <textarea value={reason} maxLength={500} onChange={(event) => setReason(event.target.value)} placeholder="ระบุเหตุผลอย่างน้อย 3 ตัวอักษร" />
      </label>
      {error ? <div className="error" role="alert">{error}</div> : null}
      <div className="feature-actions">
        <button className="button secondary" type="button" disabled={submitting} onClick={() => { setReviewing(false); setError('') }}>ย้อนกลับ</button>
        <button className="button" type="button" disabled={submitting} onClick={submit}>{submitting ? 'กำลังดำเนินการ…' : `ยืนยัน${config.label}`}</button>
      </div>
    </div> : <button className="button secondary payment-exception-action-button" type="button" onClick={() => { setReviewing(true); setMessage(''); setError('') }}>{config.label}</button>}
    {message ? <div className="success" role="status">{message}</div> : null}
  </div>
}

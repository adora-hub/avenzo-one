'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/browser'
import { billingErrorMessage } from './billing-labels'

export type BillingGatewayAttempt = {
  id: string
  provider?: string
  provider_session_id: string
  status: string
  amount: number
  currency: string
  created_at: string
  completed_at: string | null
}

const attemptLabels: Record<string, string> = {
  pending: 'กำลังรอผลทดสอบ',
  succeeded: 'ทดสอบชำระสำเร็จ',
  failed: 'ทดสอบชำระไม่สำเร็จ',
  canceled: 'ยกเลิกแล้ว',
}

export function BillingGatewaySandbox({ invoice, latestAttempt }: {
  invoice: { id: string; invoice_number: string; status: string; total_amount: number; currency: string }
  latestAttempt: BillingGatewayAttempt | null
}) {
  const router = useRouter()
  const [loading, setLoading] = useState(false)
  const [message, setMessage] = useState('')
  const [confirmResult, setConfirmResult] = useState<'succeeded' | 'failed' | null>(null)

  async function createAttempt() {
    setLoading(true)
    setMessage('')
    try {
      const { error } = await createClient().rpc('platform_create_sandbox_payment_attempt', {
        p_invoice_id: invoice.id,
        p_command_id: crypto.randomUUID(),
      })
      if (error) throw error
      setMessage('สร้างรายการทดสอบแล้ว กรุณาเลือกผลจำลองด้านล่าง')
      router.refresh()
    } catch (error) {
      setMessage(billingErrorMessage(error instanceof Error ? error.message : 'ไม่สามารถสร้างรายการ Sandbox ได้'))
    } finally {
      setLoading(false)
    }
  }

  async function simulateResult() {
    if (!latestAttempt || !confirmResult) return
    setLoading(true)
    setMessage('')
    try {
      const { error } = await createClient().rpc('platform_simulate_sandbox_payment_event', {
        p_attempt_id: latestAttempt.id,
        p_result_status: confirmResult,
        p_command_id: crypto.randomUUID(),
      })
      if (error) throw error
      setMessage(confirmResult === 'succeeded' ? 'จำลองการชำระสำเร็จแล้ว' : 'จำลองการชำระไม่สำเร็จแล้ว')
      setConfirmResult(null)
      router.refresh()
    } catch (error) {
      setMessage(billingErrorMessage(error instanceof Error ? error.message : 'ไม่สามารถจำลองผล Gateway ได้'))
    } finally {
      setLoading(false)
    }
  }

  const canCreate = !latestAttempt || latestAttempt.status !== 'pending'

  return <section className="gateway-sandbox-panel">
    <div className="gateway-sandbox-heading">
      <div><span className="eyebrow">SANDBOX — ไม่ตัดเงินจริง</span><h4>ทดลอง Payment Gateway</h4></div>
      <span className="status active">ฟรีสำหรับการทดสอบ</span>
    </div>
    <p>จำลอง Checkout และ Webhook เพื่อยืนยันว่า Invoice, Payment History และการป้องกัน Event ซ้ำทำงานถูกต้อง</p>

    {latestAttempt && <dl className="subscription-confirmation-grid">
      <div><dt>สถานะล่าสุด</dt><dd>{attemptLabels[latestAttempt.status] ?? latestAttempt.status}</dd></div>
      <div><dt>Session ทดสอบ</dt><dd>{latestAttempt.provider_session_id}</dd></div>
      <div><dt>ยอดทดสอบ</dt><dd>{new Intl.NumberFormat('th-TH', { style: 'currency', currency: latestAttempt.currency }).format(latestAttempt.amount)}</dd></div>
      <div><dt>Invoice</dt><dd>{invoice.invoice_number}</dd></div>
    </dl>}

    {message && <div className={message.includes('ไม่สามารถ') ? 'error' : 'countdown'}>{message}</div>}

    {!latestAttempt || canCreate ? <button className="button secondary" type="button" disabled={loading} onClick={createAttempt}>
      {loading ? 'กำลังสร้าง…' : latestAttempt ? 'สร้างรายการทดสอบใหม่' : 'สร้างรายการ Sandbox'}
    </button> : !confirmResult ? <div className="button-row">
      <button className="button" type="button" disabled={loading} onClick={() => setConfirmResult('succeeded')}>จำลองชำระสำเร็จ</button>
      <button className="button danger" type="button" disabled={loading} onClick={() => setConfirmResult('failed')}>จำลองชำระไม่สำเร็จ</button>
    </div> : <section className="subscription-confirmation">
      <div className="subscription-confirmation-heading"><div><span className="eyebrow">ตรวจสอบครั้งสุดท้าย</span><h4>{confirmResult === 'succeeded' ? 'จำลองชำระสำเร็จ' : 'จำลองชำระไม่สำเร็จ'}</h4></div><span className="status active">ยังไม่บันทึก</span></div>
      <p>นี่เป็น Sandbox เท่านั้น ไม่มีการตัดเงินจริง แต่จะบันทึก Payment และเปลี่ยนสถานะ Invoice เพื่อทดสอบกระบวนการครบเส้นทาง</p>
      <div className="button-row"><button className="button secondary" type="button" disabled={loading} onClick={() => setConfirmResult(null)}>ย้อนกลับ</button><button className={confirmResult === 'failed' ? 'button danger' : 'button'} type="button" disabled={loading} onClick={simulateResult}>{loading ? 'กำลังบันทึก…' : 'ยืนยันผลจำลอง'}</button></div>
    </section>}
  </section>
}

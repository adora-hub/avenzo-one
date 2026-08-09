'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import type { BillingLiveSafetyState } from '@/lib/billing/live-safety'
import { createClient } from '@/lib/supabase/browser'

const actionCopy: Record<BillingLiveSafetyState, { title: string; detail: string; confirm: string }> = {
  locked: {
    title: 'ล็อกรับเงินจริง / Emergency Stop',
    detail: 'บังคับคงสถานะปลอดภัยและบันทึกผู้ดำเนินการ โดยยังใช้ Stripe Test Mode เท่านั้น',
    confirm: 'ยืนยันล็อกรับเงินจริง',
  },
  review_ready: {
    title: 'ทำเครื่องหมายพร้อมทบทวนขั้นต่อไป',
    detail: 'รับรองว่ารายการ Manual Checklist ครบแล้ว แต่ Emergency Stop จะยังเปิดอยู่และยังรับเงินจริงไม่ได้',
    confirm: 'ยืนยันพร้อมทบทวน',
  },
}

export function BillingLiveSafetyControl({
  currentState,
  canMarkReviewReady,
}: {
  currentState: BillingLiveSafetyState
  canMarkReviewReady: boolean
}) {
  const router = useRouter()
  const [nextState, setNextState] = useState<BillingLiveSafetyState>('locked')
  const [reason, setReason] = useState('')
  const [preview, setPreview] = useState(false)
  const [loading, setLoading] = useState(false)
  const [message, setMessage] = useState('')
  const reasonValid = reason.trim().length >= 10

  function prepare() {
    setMessage('')
    if (!reasonValid) {
      setMessage('กรุณาระบุเหตุผลอย่างน้อย 10 ตัวอักษร')
      return
    }
    if (nextState === 'review_ready' && !canMarkReviewReady) {
      setMessage('ต้องบันทึกรายการตรวจด้วยผู้ดูแลครบ 9 ข้อก่อน')
      return
    }
    setPreview(true)
  }

  async function confirm() {
    setLoading(true)
    setMessage('')
    try {
      const { error } = await createClient().rpc('platform_set_billing_live_safety_state', {
        p_command_id: crypto.randomUUID(),
        p_next_state: nextState,
        p_reason: reason.trim(),
      })
      if (error) throw error
      setPreview(false)
      setReason('')
      setMessage(nextState === 'locked'
        ? 'ล็อกรับเงินจริงและบันทึก Audit Log แล้ว'
        : 'บันทึกว่าพร้อมทบทวนขั้นต่อไปแล้ว โดยยังไม่เปิดรับเงินจริง')
      router.refresh()
    } catch (error) {
      const raw = error instanceof Error ? error.message : ''
      setMessage(raw.includes('platform_admin_aal2_required')
        ? 'กรุณายืนยัน MFA ก่อนดำเนินการ'
        : raw.includes('billing_readiness_manual_review_required')
          ? 'ต้องบันทึกรายการตรวจด้วยผู้ดูแลครบ 9 ข้อก่อน'
          : 'ไม่สามารถบันทึกสถานะความปลอดภัยได้ กรุณาลองใหม่')
    } finally {
      setLoading(false)
    }
  }

  return <section className="live-safety-control-card">
    <div className="feature-list-heading"><div><div className="eyebrow">คำสั่งความปลอดภัย</div><h2>ควบคุมขั้นเตรียม Live</h2><p>ทุกตัวเลือกใน Phase นี้ยังคง Emergency Stop และไม่เปิดรับเงินจริง</p></div><span className="status pending">ล็อกอยู่</span></div>
    {!preview ? <>
      <label className="readiness-note">รายการที่ต้องการทำ
        <select value={nextState} onChange={(event) => setNextState(event.target.value as BillingLiveSafetyState)}>
          <option value="locked">{actionCopy.locked.title}</option>
          <option value="review_ready" disabled={!canMarkReviewReady}>{actionCopy.review_ready.title}</option>
        </select>
        <span className="field-help">{actionCopy[nextState].detail}</span>
      </label>
      <label className="readiness-note">เหตุผลสำหรับ Audit Log
        <textarea value={reason} maxLength={2000} onChange={(event) => setReason(event.target.value)} placeholder="เช่น ทดสอบ Emergency Stop หลัง Deploy และตรวจว่า Checkout ยังเป็น Test Mode" />
        <span className="field-help">อย่างน้อย 10 ตัวอักษร · ห้ามใส่ Secret Key หรือข้อมูลบัญชีเต็ม</span>
      </label>
      {message ? <div className={message.includes('แล้ว') ? 'success' : 'error'} role="status">{message}</div> : null}
      <button className="button" type="button" onClick={prepare}>ตรวจสอบก่อนยืนยัน</button>
    </> : <div className="subscription-confirmation">
      <div className="subscription-confirmation-heading"><div><span className="eyebrow">ตรวจสอบครั้งสุดท้าย</span><h3>{actionCopy[nextState].title}</h3></div><span className="status pending">ยังไม่บันทึก</span></div>
      <div className="readiness-preview-note"><strong>สถานะปัจจุบัน</strong><span>{currentState === 'locked' ? 'ล็อกรับเงินจริง' : 'พร้อมทบทวน โดยยังล็อกรับเงินจริง'}</span></div>
      <div className="readiness-preview-note"><strong>ผลหลังยืนยัน</strong><span>{actionCopy[nextState].detail}</span></div>
      <div className="readiness-preview-note"><strong>เหตุผล</strong><span>{reason.trim()}</span></div>
      <div className="button-row"><button className="button secondary" type="button" disabled={loading} onClick={() => setPreview(false)}>ย้อนกลับแก้ไข</button><button className="button danger" type="button" disabled={loading} onClick={confirm}>{loading ? 'กำลังบันทึก…' : actionCopy[nextState].confirm}</button></div>
    </div>}
  </section>
}

'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import type { BillingLiveActivationRequest } from '@/lib/billing/live-safety'
import { createClient } from '@/lib/supabase/browser'

type ApprovalAction = 'request' | 'approve' | 'reject' | 'cancel' | null

function dateTime(value: string) {
  return new Intl.DateTimeFormat('th-TH', {
    dateStyle: 'medium',
    timeStyle: 'short',
    timeZone: 'Asia/Bangkok',
  }).format(new Date(value))
}

function statusLabel(status: BillingLiveActivationRequest['status']) {
  return {
    pending: 'รอผู้อนุมัติคนที่ 2',
    approved: 'อนุมัติครบ 2 คน',
    rejected: 'ไม่อนุมัติ',
    canceled: 'ยกเลิกคำขอ',
    expired: 'คำขอหมดอายุ',
  }[status]
}

function errorMessage(error: unknown) {
  const raw = error instanceof Error ? error.message : ''
  if (raw.includes('platform_admin_aal2_required')) return 'กรุณายืนยัน MFA ก่อนดำเนินการ'
  if (raw.includes('billing_live_reason_invalid')) return 'กรุณาระบุเหตุผลอย่างน้อย 10 ตัวอักษร'
  if (raw.includes('billing_live_readiness_required')) return 'ต้องผ่าน Production Readiness และทำสถานะพร้อมทบทวนก่อน'
  if (raw.includes('billing_live_active_tester_required')) return 'ต้องมีผู้ทดสอบที่ได้รับอนุญาตอย่างน้อย 1 คน'
  if (raw.includes('billing_live_two_active_admins_required')) return 'ต้องมี Platform Admin ที่ใช้งานอยู่ไม่น้อยกว่า 2 บัญชี'
  if (raw.includes('billing_live_approval_pending_exists')) return 'มีคำขอที่กำลังรออนุมัติอยู่แล้ว'
  if (raw.includes('billing_live_second_admin_required')) return 'ผู้ขอไม่สามารถอนุมัติคำขอของตนเอง ต้องใช้ Platform Admin คนที่ 2'
  if (raw.includes('billing_live_approval_not_pending')) return 'คำขอนี้ถูกดำเนินการแล้ว กรุณาโหลดข้อมูลล่าสุด'
  if (raw.includes('billing_live_requester_only')) return 'เฉพาะผู้สร้างคำขอเท่านั้นที่ยกเลิกได้'
  if (raw.includes('billing_live_not_safely_locked')) return 'ระบบไม่ได้อยู่ในสถานะล็อกที่ปลอดภัย จึงไม่สามารถสร้างคำขอได้'
  if (raw.includes('billing_live_approval_snapshot_changed')) return 'กติกาหรือรายชื่อผู้ทดสอบเปลี่ยนหลังส่งคำขอ กรุณายกเลิกและสร้างคำขอใหม่'
  return 'ไม่สามารถบันทึกคำสั่งอนุมัติได้ กรุณาลองใหม่'
}

export function BillingLiveApprovalControl({
  currentUserId,
  requests,
  serverNow,
}: {
  currentUserId: string
  requests: BillingLiveActivationRequest[]
  serverNow: string
}) {
  const router = useRouter()
  const [reason, setReason] = useState('')
  const [action, setAction] = useState<ApprovalAction>(null)
  const [loading, setLoading] = useState(false)
  const [message, setMessage] = useState('')
  const pendingRequest = requests.find((request) => request.status === 'pending')
  const pendingExpired = pendingRequest ? new Date(pendingRequest.expires_at).getTime() <= new Date(serverNow).getTime() : false
  const isRequester = pendingRequest?.requested_by === currentUserId

  function prepare(nextAction: Exclude<ApprovalAction, null>) {
    setMessage('')
    if (reason.trim().length < 10) {
      setMessage('กรุณาระบุเหตุผลอย่างน้อย 10 ตัวอักษร')
      return
    }
    setAction(nextAction)
  }

  async function confirm() {
    if (!action) return
    setLoading(true)
    setMessage('')
    try {
      const supabase = createClient()
      if (action === 'request') {
        const { error } = await supabase.rpc('platform_request_billing_live_activation', {
          p_command_id: crypto.randomUUID(),
          p_reason: reason.trim(),
        })
        if (error) throw error
        setMessage('สร้างคำขอแล้ว กรุณาให้ Platform Admin คนที่ 2 เข้าระบบเพื่อพิจารณา')
      } else if (action === 'cancel') {
        if (!pendingRequest) return
        const { error } = await supabase.rpc('platform_cancel_billing_live_activation', {
          p_command_id: crypto.randomUUID(),
          p_request_id: pendingRequest.id,
          p_reason: reason.trim(),
        })
        if (error) throw error
        setMessage('ยกเลิกคำขออนุมัติแล้ว')
      } else {
        if (!pendingRequest) return
        const { data, error } = await supabase.rpc('platform_review_billing_live_activation', {
          p_command_id: crypto.randomUUID(),
          p_request_id: pendingRequest.id,
          p_decision: action,
          p_reason: reason.trim(),
        })
        if (error) throw error
        const result = data as BillingLiveActivationRequest | null
        setMessage(result?.status === 'expired'
          ? 'คำขอนี้หมดอายุแล้ว กรุณาสร้างคำขอใหม่'
          : action === 'approve'
            ? 'อนุมัติครบ 2 คนแล้ว แต่ระบบยังไม่เปิดรับเงินจริง'
            : 'บันทึกผลไม่อนุมัติแล้ว')
      }
      setReason('')
      setAction(null)
      router.refresh()
    } catch (error) {
      setMessage(errorMessage(error))
    } finally {
      setLoading(false)
    }
  }

  const confirmationTitle = action === 'request'
    ? 'ยืนยันส่งคำขอให้ผู้อนุมัติคนที่ 2'
    : action === 'approve'
      ? 'ยืนยันอนุมัติในฐานะคนที่ 2'
      : action === 'reject'
        ? 'ยืนยันไม่อนุมัติคำขอนี้'
        : 'ยืนยันยกเลิกคำขอของคุณ'

  return <section className="readiness-review-card live-approval-card">
    <div className="feature-list-heading"><div><div className="eyebrow">Phase 1.1.3.7.4 · Two-person Approval</div><h2>อนุมัติร่วมกัน 2 คนก่อนเปิด Pilot</h2><p>ผู้ขอและผู้อนุมัติต้องเป็น Platform Admin คนละบัญชี ทั้งคู่ต้องผ่าน MFA และคำขอมีอายุ 24 ชั่วโมง</p></div><span className="status pending">ยังไม่เปิดรับเงินจริง</span></div>

    {pendingRequest ? <>
      <div className="live-approval-state">
        <div><span>สถานะคำขอ</span><strong>{pendingExpired ? 'คำขอหมดอายุ' : statusLabel(pendingRequest.status)}</strong></div>
        <div><span>ผู้ขอคนที่ 1</span><strong>{pendingRequest.requested_by_email}</strong></div>
        <div><span>สร้างเมื่อ</span><strong>{dateTime(pendingRequest.requested_at)}</strong></div>
        <div><span>หมดอายุ</span><strong>{dateTime(pendingRequest.expires_at)}</strong></div>
      </div>
      <div className="live-approval-snapshot">
        <strong>Snapshot กติกาที่ขออนุมัติ</strong>
        <span>Policy v{pendingRequest.policy_version}</span>
        <span>ต่อครั้งไม่เกิน ฿{Number(pendingRequest.max_amount_per_charge).toLocaleString('th-TH')}</span>
        <span>ยอดรวมไม่เกิน ฿{Number(pendingRequest.max_total_amount).toLocaleString('th-TH')}</span>
        <span>ไม่เกิน {pendingRequest.max_successful_charges} รายการ</span>
        <span>ผู้ทดสอบ {pendingRequest.tester_count} คน</span>
      </div>
      <div className="readiness-preview-note"><strong>เหตุผลของผู้ขอ</strong><span>{pendingRequest.request_reason}</span></div>
      {pendingExpired ? <div className="error" role="status">คำขอเกิน 24 ชั่วโมงแล้ว ผู้อนุมัติคนที่ 2 กดพิจารณาเพื่อปิดคำขอที่หมดอายุ จากนั้นจึงสร้างคำขอใหม่ได้</div> : isRequester
        ? <div className="readiness-preview-note"><strong>ขั้นตอนต่อไป</strong><span>ออกจากบัญชีนี้ แล้วให้ Platform Admin คนที่ 2 Login, ผ่าน MFA และเปิดหน้านี้เพื่ออนุมัติหรือปฏิเสธ</span></div>
        : <div className="success"><strong>คุณคือผู้พิจารณาคนที่ 2</strong><br />ตรวจ Snapshot และเหตุผลให้ครบก่อนเลือกอนุมัติหรือไม่อนุมัติ</div>}
    </> : <div className="empty-state">ยังไม่มีคำขอเปิด Limited Live Pilot ที่รอการอนุมัติ</div>}

    <label className="readiness-note">เหตุผลสำหรับ Audit Log<textarea value={reason} maxLength={2000} onChange={(event) => setReason(event.target.value)} placeholder={pendingRequest ? 'เช่น ตรวจสอบขีดจำกัด ผู้ทดสอบ และหลักฐานความพร้อมแล้ว' : 'เช่น ขออนุมัติ Limited Live Pilot ตามขีดจำกัดที่ตรวจสอบแล้ว'} /></label>
    <div className="button-row">
      {!pendingRequest ? <button className="button" type="button" onClick={() => prepare('request')}>ตรวจสอบก่อนส่งคำขอ</button> : null}
      {pendingRequest && isRequester ? <button className="button danger" type="button" onClick={() => prepare('cancel')}>ตรวจสอบก่อนยกเลิกคำขอ</button> : null}
      {pendingRequest && !isRequester ? <><button className="button secondary" type="button" onClick={() => prepare('reject')}>ตรวจสอบก่อนปฏิเสธ</button><button className="button" type="button" onClick={() => prepare('approve')}>ตรวจสอบก่อนอนุมัติ</button></> : null}
    </div>

    {message ? <div className={message.includes('แล้ว') || message.includes('ครบ 2 คน') ? 'success live-rollout-message' : 'error live-rollout-message'} role="status">{message}</div> : null}

    {action ? <section className="subscription-confirmation live-rollout-confirmation">
      <div className="subscription-confirmation-heading"><div><span className="eyebrow">ตรวจสอบครั้งสุดท้าย</span><h3>{confirmationTitle}</h3></div><span className="status pending">ยังไม่บันทึก</span></div>
      <div className="readiness-preview-note"><strong>ผลด้านความปลอดภัย</strong><span>คำสั่งนี้ไม่เปิด Pilot, ไม่ปลด Emergency Stop และไม่รับเงินจริง</span></div>
      <div className="readiness-preview-note"><strong>เหตุผล</strong><span>{reason.trim()}</span></div>
      <div className="button-row"><button className="button secondary" type="button" disabled={loading} onClick={() => setAction(null)}>ย้อนกลับแก้ไข</button><button className={`button ${action === 'reject' || action === 'cancel' ? 'danger' : ''}`} type="button" disabled={loading} onClick={confirm}>{loading ? 'กำลังบันทึก…' : confirmationTitle}</button></div>
    </section> : null}

    {requests.length ? <div className="live-approval-history"><h3>คำขอล่าสุด</h3>{requests.map((request) => <article key={request.id}><div><strong>{statusLabel(request.status)}</strong><span>{request.requested_by_email} · {dateTime(request.requested_at)}</span></div><div><span>{request.reviewed_by_email ? `พิจารณาโดย ${request.reviewed_by_email}` : 'ยังไม่มีผู้พิจารณา'}</span><small>{request.review_reason ?? request.request_reason}</small></div></article>)}</div> : null}
  </section>
}

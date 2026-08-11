'use client'

import { useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/browser'

export type TransferProofReviewItem = {
  proof_id: string
  invoice_id: string
  invoice_number: string
  invoice_status: string
  invoice_total: number
  currency: string
  organization_id: string
  organization_name: string
  transfer_channel_id: string
  channel_display_name: string
  channel_provider_name: string
  channel_account_name: string
  channel_account_identifier: string
  storage_bucket: string
  storage_path: string
  original_file_name: string
  mime_type: string
  file_size_bytes: number
  claimed_amount: number
  claimed_transfer_at: string
  customer_note: string | null
  proof_status: 'submitted' | 'under_review'
  uploaded_by: string
  uploader_email: string | null
  submitted_at: string | null
  created_at: string
}

type Decision = 'accept' | 'reject'

function money(value: number, currency: string) {
  return new Intl.NumberFormat('th-TH', { style: 'currency', currency, minimumFractionDigits: 2 }).format(value)
}

function dateTime(value: string | null) {
  if (!value) return 'ไม่ระบุ'
  return new Intl.DateTimeFormat('th-TH', {
    dateStyle: 'medium', timeStyle: 'short', timeZone: 'Asia/Bangkok',
  }).format(new Date(value))
}

function fileSize(value: number) {
  return value >= 1024 * 1024 ? `${(value / 1024 / 1024).toFixed(2)} MB` : `${Math.ceil(value / 1024)} KB`
}

function reviewError(error: unknown) {
  const raw = error instanceof Error ? error.message : String((error as { message?: string } | null)?.message ?? error ?? '')
  if (raw.includes('platform_admin_aal2_required')) return 'กรุณายืนยัน MFA ก่อนตรวจหลักฐาน'
  if (raw.includes('transfer_proof_review_reason_invalid')) return 'กรุณาระบุเหตุผลอย่างน้อย 3 ตัวอักษร'
  if (raw.includes('transfer_proof_already_reviewed')) return 'หลักฐานนี้ถูกตรวจไปแล้ว กรุณาโหลดข้อมูลล่าสุด'
  if (raw.includes('billing_invoice_transfer_proof_already_accepted')) return 'Invoice นี้มีหลักฐานที่รับรองแล้ว ไม่สามารถรับรองซ้ำได้'
  if (raw.includes('billing_invoice_not_pending')) return 'Invoice ไม่ได้อยู่ในสถานะรอชำระ จึงรับรองหลักฐานนี้ไม่ได้'
  return 'ดำเนินการไม่สำเร็จ กรุณาลองใหม่หรือตรวจสอบข้อมูลล่าสุด'
}

function pendingApprovalTimeline(item: TransferProofReviewItem) {
  return [
    {
      state: 'complete',
      title: 'ส่งหลักฐาน',
      actor: item.uploader_email ?? item.uploaded_by,
      timestamp: item.submitted_at ?? item.created_at,
      description: item.original_file_name,
    },
    {
      state: 'current',
      title: item.proof_status === 'under_review' ? 'กำลังตรวจหลักฐาน' : 'รอตรวจหลักฐาน',
      actor: 'Platform Admin คนที่ 1',
      timestamp: null,
      description: 'ตรวจยอดเงิน วันเวลา ช่องทางรับโอน และไฟล์หลักฐาน',
    },
    {
      state: 'pending',
      title: 'รอการอนุมัติตามนโยบาย',
      actor: 'Platform Admin',
      timestamp: null,
      description: 'ระบบจะคำนวณจำนวนผู้อนุมัติจากวงเงินและสัญญาณความเสี่ยงหลังตรวจหลักฐานผ่าน',
    },
    {
      state: 'pending',
      title: 'สร้าง Payment · ชำระ Invoice · ต่อ Subscription',
      actor: 'ระบบ AVENZO ONE',
      timestamp: null,
      description: 'จะดำเนินการเมื่อการอนุมัติครบตามนโยบาย',
    },
  ] as const
}

export function BillingTransferProofReview({ initialItems }: { initialItems: TransferProofReviewItem[] }) {
  const router = useRouter()
  const [items, setItems] = useState(initialItems)
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [decision, setDecision] = useState<Decision | null>(null)
  const [reason, setReason] = useState('')
  const [riskFlagged, setRiskFlagged] = useState(false)
  const [riskReason, setRiskReason] = useState('')
  const [message, setMessage] = useState('')
  const [loading, setLoading] = useState(false)
  const [openingId, setOpeningId] = useState<string | null>(null)
  const selected = useMemo(() => items.find((item) => item.proof_id === selectedId) ?? null, [items, selectedId])

  function beginReview(item: TransferProofReviewItem, nextDecision: Decision) {
    setSelectedId(item.proof_id)
    setDecision(nextDecision)
    setReason(nextDecision === 'accept' ? 'ตรวจสอบยอดเงิน วันเวลา ช่องทางรับโอน และหลักฐานครบถ้วนแล้ว' : '')
    setRiskFlagged(false)
    setRiskReason('')
    setMessage('')
    requestAnimationFrame(() => document.getElementById('transfer-proof-confirmation')?.scrollIntoView({ behavior: 'smooth', block: 'center' }))
  }

  async function openEvidence(item: TransferProofReviewItem) {
    setOpeningId(item.proof_id)
    setMessage('')
    const preview = window.open('', '_blank')
    try {
      const { data, error } = await createClient().storage.from(item.storage_bucket).createSignedUrl(item.storage_path, 120)
      if (error || !data?.signedUrl) throw error ?? new Error('signed_url_missing')
      if (preview) {
        preview.opener = null
        preview.location.href = data.signedUrl
      } else {
        window.location.assign(data.signedUrl)
      }
    } catch {
      preview?.close()
      setMessage('เปิดไฟล์หลักฐานไม่สำเร็จ กรุณาตรวจว่า Login ด้วย Platform Admin และยืนยัน MFA แล้ว')
    } finally {
      setOpeningId(null)
    }
  }

  async function confirmReview() {
    if (!selected || !decision || reason.trim().length < 3) {
      setMessage('กรุณาระบุเหตุผลอย่างน้อย 3 ตัวอักษร')
      return
    }
    if (decision === 'accept' && riskFlagged && riskReason.trim().length < 3) {
      setMessage('กรุณาระบุเหตุผลที่จัดเป็นรายการเสี่ยงอย่างน้อย 3 ตัวอักษร')
      return
    }
    setLoading(true)
    setMessage('')
    try {
      const { error } = await createClient().rpc('platform_review_billing_transfer_proof_v2', {
        p_proof_id: selected.proof_id,
        p_decision: decision,
        p_reason: reason.trim(),
        p_command_id: crypto.randomUUID(),
        p_risk_flagged: decision === 'accept' && riskFlagged,
        p_risk_reason: decision === 'accept' && riskFlagged ? riskReason.trim() : null,
      })
      if (error) throw error
      setItems((current) => current.filter((item) => item.proof_id !== selected.proof_id))
      setSelectedId(null)
      setDecision(null)
      setReason('')
      setRiskFlagged(false)
      setRiskReason('')
      setMessage(decision === 'accept'
        ? 'รับรองหลักฐานแล้ว — Invoice ยังเป็น “รอชำระ” จนกว่าจะบันทึก Payment ในเฟสถัดไป'
        : 'ปฏิเสธหลักฐานแล้วและบันทึกเหตุผลใน Audit Log')
      router.refresh()
    } catch (error) {
      setMessage(reviewError(error))
    } finally {
      setLoading(false)
    }
  }

  if (!items.length) return <div className="empty-state transfer-proof-empty"><strong>ไม่มีหลักฐานที่รอตรวจ</strong><p>เมื่อ Owner หรือ Admin ส่งหลักฐาน รายการจะปรากฏที่นี่โดยอัตโนมัติ</p>{message && <div className="success">{message}</div>}</div>

  return <>
    {message && <div className={message.startsWith('รับรอง') || message.startsWith('ปฏิเสธ') ? 'success' : 'error'} role="status">{message}</div>}
    <div className="transfer-proof-review-list">
      {items.map((item) => {
        const amountMatches = Math.abs(item.claimed_amount - item.invoice_total) < 0.01
        const timeline = pendingApprovalTimeline(item)
        return <article className="card transfer-proof-review-card" key={item.proof_id}>
          <div className="transfer-proof-review-heading">
            <div><div className="inline-title-row"><span className="status pending">รอตรวจ</span><h2>{item.invoice_number}</h2></div><p>{item.organization_name} · ส่งโดย {item.uploader_email ?? item.uploaded_by}</p></div>
            <span className={`status ${amountMatches ? 'active' : 'suspended'}`}>{amountMatches ? 'ยอดตรง Invoice' : 'ยอดไม่ตรง'}</span>
          </div>
          <dl className="subscription-overview-grid transfer-proof-review-grid">
            <div><dt>ยอดตาม Invoice</dt><dd>{money(item.invoice_total, item.currency)}</dd></div>
            <div><dt>ยอดที่ลูกค้าแจ้ง</dt><dd>{money(item.claimed_amount, item.currency)}</dd></div>
            <div><dt>วันและเวลาโอน</dt><dd>{dateTime(item.claimed_transfer_at)}</dd></div>
            <div><dt>ส่งหลักฐานเมื่อ</dt><dd>{dateTime(item.submitted_at)}</dd></div>
            <div><dt>ช่องทางรับโอน</dt><dd>{item.channel_display_name} · {item.channel_provider_name}</dd></div>
            <div><dt>บัญชีปลายทาง</dt><dd>{item.channel_account_name} · {item.channel_account_identifier}</dd></div>
            <div><dt>ไฟล์หลักฐาน</dt><dd>{item.original_file_name} · {fileSize(item.file_size_bytes)}</dd></div>
            <div><dt>สถานะ Invoice</dt><dd>{item.invoice_status === 'pending' ? 'รอชำระ' : item.invoice_status}</dd></div>
          </dl>
          {item.customer_note && <div className="transfer-proof-note"><span>หมายเหตุจากลูกค้า</span><strong>{item.customer_note}</strong></div>}
          <section className="approval-timeline" aria-labelledby={`review-approval-timeline-${item.proof_id}`}>
            <div className="approval-timeline-heading">
              <div><span className="eyebrow">APPROVAL TIMELINE</span><h3 id={`review-approval-timeline-${item.proof_id}`}>ประวัติการอนุมัติ</h3></div>
              <span className="status pending">กำลังดำเนินการ</span>
            </div>
            <ol className="approval-timeline-list">
              {timeline.map((event, index) => <li className={`approval-timeline-item ${event.state}`} key={`${item.proof_id}-${event.title}`}>
                <span className="approval-timeline-marker" aria-hidden="true">{event.state === 'complete' ? '✓' : index + 1}</span>
                <div className="approval-timeline-content">
                  <div><strong>{event.title}</strong><span>{event.state === 'complete' ? 'เสร็จแล้ว' : event.state === 'current' ? 'ขั้นตอนปัจจุบัน' : 'รอดำเนินการ'}</span></div>
                  <p>{event.actor}{event.timestamp ? ` · ${dateTime(event.timestamp)}` : ''}</p>
                  <small>{event.description}</small>
                </div>
              </li>)}
            </ol>
          </section>
          <div className="button-row transfer-proof-review-actions">
            <button className="button secondary" type="button" disabled={openingId === item.proof_id} onClick={() => openEvidence(item)}>{openingId === item.proof_id ? 'กำลังเปิด…' : 'เปิดไฟล์หลักฐาน'}</button>
            <button className="button primary" type="button" onClick={() => beginReview(item, 'accept')}>ตรวจแล้ว · รับรองหลักฐาน</button>
            <button className="button danger" type="button" onClick={() => beginReview(item, 'reject')}>ปฏิเสธหลักฐาน</button>
          </div>
        </article>
      })}
    </div>
    {selected && decision && <section className="confirmation-card transfer-proof-confirmation" id="transfer-proof-confirmation">
      <div className="confirmation-card-heading"><div><div className="eyebrow">ตรวจสอบครั้งสุดท้าย</div><h2>{decision === 'accept' ? 'ยืนยันรับรองหลักฐาน' : 'ยืนยันปฏิเสธหลักฐาน'}</h2></div><span className="status pending">ยังไม่บันทึก</span></div>
      <dl className="subscription-overview-grid"><div><dt>Invoice</dt><dd>{selected.invoice_number}</dd></div><div><dt>Organization</dt><dd>{selected.organization_name}</dd></div><div><dt>ยอดที่แจ้ง</dt><dd>{money(selected.claimed_amount, selected.currency)}</dd></div><div><dt>ผลที่จะบันทึก</dt><dd>{decision === 'accept' ? 'หลักฐานผ่านการตรวจ' : 'หลักฐานไม่ผ่านการตรวจ'}</dd></div></dl>
      <label className="field-stack"><span>เหตุผลสำหรับ Audit Log</span><textarea value={reason} maxLength={500} onChange={(event) => setReason(event.target.value)} placeholder="ระบุสิ่งที่ตรวจพบอย่างน้อย 3 ตัวอักษร" /></label>
      {decision === 'accept' && <div className="transfer-risk-review">
        <label className="checkbox-row">
          <input type="checkbox" checked={riskFlagged} onChange={(event) => { setRiskFlagged(event.target.checked); if (!event.target.checked) setRiskReason('') }} />
          <span><strong>รายการนี้มีสัญญาณเสี่ยง</strong><small>เมื่อติ๊ก ระบบจะบังคับให้ Platform Admin คนที่ 2 ยืนยันรับชำระตามนโยบาย</small></span>
        </label>
        {riskFlagged && <label className="field-stack"><span>เหตุผลที่จัดเป็นรายการเสี่ยง</span><textarea value={riskReason} maxLength={500} onChange={(event) => setRiskReason(event.target.value)} placeholder="เช่น ชื่อผู้โอนไม่ตรง หรือเวลาบนหลักฐานผิดปกติ" /></label>}
      </div>}
      <div className="safety-note"><strong>ขอบเขตความปลอดภัย</strong><p>คำสั่งนี้ตัดสินเฉพาะหลักฐาน ยังไม่สร้าง Payment และยังไม่เปลี่ยน Invoice หรือ Subscription</p></div>
      <div className="button-row"><button className="button secondary" type="button" disabled={loading} onClick={() => { setSelectedId(null); setDecision(null); setReason(''); setRiskFlagged(false); setRiskReason('') }}>ย้อนกลับแก้ไข</button><button className={`button ${decision === 'accept' ? 'primary' : 'danger'}`} type="button" disabled={loading || reason.trim().length < 3 || (decision === 'accept' && riskFlagged && riskReason.trim().length < 3)} onClick={confirmReview}>{loading ? 'กำลังบันทึก…' : decision === 'accept' ? 'ยืนยันรับรองหลักฐาน' : 'ยืนยันปฏิเสธหลักฐาน'}</button></div>
    </section>}
  </>
}

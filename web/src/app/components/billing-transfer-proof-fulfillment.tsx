'use client'

import { useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/browser'

export type TransferProofFulfillmentItem = {
  proof_id: string
  invoice_id: string
  invoice_number: string
  invoice_status: string
  invoice_total: number
  currency: string
  billing_period_start: string
  billing_period_end: string
  organization_id: string
  organization_name: string
  subscription_id: string
  subscription_status: string
  plan_code: string
  plan_version_id: string
  plan_version_label: string
  grace_period_days: number
  channel_display_name: string
  channel_provider_name: string
  channel_account_name: string
  channel_account_identifier: string
  claimed_amount: number
  claimed_transfer_at: string
  original_file_name: string
  reviewed_by: string
  reviewer_email: string | null
  reviewed_at: string
  review_reason: string
  risk_flagged: boolean
  risk_reason: string | null
  approval_required_count: number
  approval_policy_version: number
  single_admin_limit: number
  uploaded_by: string | null
  uploader_display_name: string | null
  submitted_at: string | null
}

function money(value: number, currency: string) {
  return new Intl.NumberFormat('th-TH', { style: 'currency', currency, minimumFractionDigits: 2 }).format(value)
}

function dateTime(value: string) {
  return new Intl.DateTimeFormat('th-TH', { dateStyle: 'medium', timeStyle: 'short', timeZone: 'Asia/Bangkok' }).format(new Date(value))
}

function invoiceStatusLabel(status: string) {
  const labels: Record<string, string> = {
    pending: 'รอชำระ', paid: 'ชำระแล้ว', failed: 'ชำระไม่สำเร็จ', canceled: 'ยกเลิกแล้ว', expired: 'หมดอายุ',
  }
  return labels[status] ?? status
}

function subscriptionStatusLabel(status: string) {
  const labels: Record<string, string> = {
    trial: 'ช่วงทดลองใช้', active: 'ใช้งานปกติ', grace: 'ช่วงผ่อนผัน', suspended: 'พักการใช้งานชั่วคราว', expired: 'หมดอายุ', canceled: 'ยกเลิกแล้ว',
  }
  return labels[status] ?? status
}

function approvalTimeline(item: TransferProofFulfillmentItem, currentUserId: string) {
  const requiresSecondAdmin = item.approval_required_count === 2
  const isFirstReviewer = item.reviewed_by === currentUserId
  const currentTitle = requiresSecondAdmin
    ? isFirstReviewer ? 'รอ Platform Admin คนที่ 2' : 'พร้อมให้คุณอนุมัติคนที่ 2'
    : 'พร้อมยืนยันรับชำระ'
  const currentDescription = requiresSecondAdmin
    ? `นโยบาย Version ${item.approval_policy_version} กำหนดผู้ดูแล ${item.approval_required_count} คน`
    : `ผ่านเกณฑ์ผู้ดูแล 1 คน ตามนโยบาย Version ${item.approval_policy_version}`

  return [
    {
      state: 'complete',
      title: 'ส่งหลักฐาน',
      actor: item.uploader_display_name ?? 'ผู้ใช้ Organization',
      timestamp: item.submitted_at,
      description: item.original_file_name,
    },
    {
      state: 'complete',
      title: 'ตรวจหลักฐานผ่าน',
      actor: item.reviewer_email ?? item.reviewed_by,
      timestamp: item.reviewed_at,
      description: item.review_reason,
    },
    {
      state: 'current',
      title: currentTitle,
      actor: requiresSecondAdmin ? 'Platform Admin คนที่ 2' : item.reviewer_email ?? item.reviewed_by,
      timestamp: null,
      description: currentDescription,
    },
    {
      state: 'pending',
      title: 'สร้าง Payment · ชำระ Invoice · ต่อ Subscription',
      actor: 'ระบบ AVENZO ONE',
      timestamp: null,
      description: 'จะบันทึกพร้อมกันหลังการยืนยันรับชำระสำเร็จ',
    },
  ] as const
}

function approvalRoute(item: TransferProofFulfillmentItem, currentUserId: string) {
  const requiresSecondAdmin = item.approval_required_count === 2
  const isFirstReviewer = item.reviewed_by === currentUserId
  const overLimit = item.invoice_total > item.single_admin_limit
  const reasons = [
    overLimit ? `ยอด ${money(item.invoice_total, item.currency)} สูงกว่าวงเงินผู้อนุมัติคนเดียว ${money(item.single_admin_limit, item.currency)}` : null,
    item.risk_flagged ? 'รายการถูกระบุว่ามีสัญญาณเสี่ยง' : null,
  ].filter(Boolean)

  if (!requiresSecondAdmin) return {
    tone: 'active', label: 'พร้อมยืนยันรับชำระ', route: 'ผู้ดูแล 1 คน',
    description: 'ผู้ตรวจหลักฐานคนแรกสามารถยืนยันรับชำระต่อได้',
    reason: `ยอดไม่เกิน ${money(item.single_admin_limit, item.currency)} และไม่มีสัญญาณเสี่ยง`,
  }
  if (isFirstReviewer) return {
    tone: 'pending', label: 'รอผู้อนุมัติคนที่ 2', route: 'ผู้ดูแล 2 คน',
    description: 'คุณเป็นผู้ตรวจหลักฐานคนแรก ต้องให้ Platform Admin อีกบัญชียืนยันรับชำระ',
    reason: reasons.join(' และ '),
  }
  return {
    tone: 'active', label: 'พร้อมให้คุณอนุมัติคนที่ 2', route: 'ผู้ดูแล 2 คน',
    description: 'ผู้ดูแลคนแรกตรวจหลักฐานแล้ว คุณสามารถตรวจทานและยืนยันรับชำระต่อได้',
    reason: reasons.join(' และ '),
  }
}

function fulfillmentAction(item: TransferProofFulfillmentItem, currentUserId: string) {
  const isFirstReviewer = item.reviewed_by === currentUserId
  const requiresSecondAdmin = item.approval_required_count === 2
  const amountMatches = Math.abs(item.claimed_amount - item.invoice_total) < 0.01

  if (!amountMatches) return {
    canStart: false,
    tone: 'blocked',
    badge: 'ดำเนินการไม่ได้',
    title: 'ยอดหลักฐานไม่ตรงกับยอด Invoice',
    description: 'ต้องตรวจสอบและแก้ไขข้อมูลหลักฐานก่อน จึงจะยืนยันรับชำระได้',
    buttonLabel: 'ยอดไม่ตรง — ยังยืนยันไม่ได้',
  }
  if (requiresSecondAdmin && isFirstReviewer) return {
    canStart: false,
    tone: 'waiting',
    badge: 'รออีกบัญชี',
    title: 'คุณดำเนินการขั้นแรกเสร็จแล้ว',
    description: 'ตามกฎผู้ดูแล 2 คน บัญชีนี้ห้ามยืนยันซ้ำ กรุณาให้ Platform Admin อีกบัญชีดำเนินการต่อ',
    buttonLabel: 'รอ Platform Admin คนที่ 2',
  }
  if (requiresSecondAdmin) return {
    canStart: true,
    tone: 'ready',
    badge: 'สิทธิ์ผู้อนุมัติคนที่ 2',
    title: 'บัญชีนี้ดำเนินการต่อได้',
    description: 'ตรวจทานยอด หลักฐาน และผลกระทบครั้งสุดท้ายก่อนยืนยันรับชำระ',
    buttonLabel: 'ตรวจทานและอนุมัติคนที่ 2',
  }
  if (isFirstReviewer) return {
    canStart: true,
    tone: 'ready',
    badge: 'สิทธิ์ผู้ดูแล 1 คน',
    title: 'บัญชีนี้ดำเนินการต่อได้',
    description: 'รายการอยู่ในวงเงินและไม่มีสัญญาณเสี่ยง คุณจึงยืนยันรับชำระต่อได้',
    buttonLabel: 'ตรวจสอบและยืนยันรับชำระ',
  }
  return {
    canStart: true,
    tone: 'ready',
    badge: 'สิทธิ์ Platform Admin',
    title: 'บัญชีนี้ดำเนินการแทนได้',
    description: 'รายการใช้ผู้ดูแล 1 คน คุณสามารถตรวจทานแทนผู้ตรวจหลักฐานและยืนยันรับชำระได้',
    buttonLabel: 'ตรวจทานและยืนยันรับชำระ',
  }
}

function fulfillmentError(error: unknown) {
  const raw = error instanceof Error ? error.message : String((error as { message?: string } | null)?.message ?? error ?? '')
  if (raw.includes('second_platform_admin_required')) return 'ต้องให้ Platform Admin คนที่ 2 เป็นผู้ยืนยันรับชำระ'
  if (raw.includes('accepted_transfer_proof_required')) return 'หลักฐานนี้ยังไม่ผ่านการรับรอง'
  if (raw.includes('transfer_amount_must_equal_invoice_total')) return 'ยอดในหลักฐานไม่ตรงกับยอด Invoice'
  if (raw.includes('billing_invoice_not_pending')) return 'Invoice นี้ไม่ได้อยู่ในสถานะรอชำระ'
  if (raw.includes('transfer_proof_already_fulfilled')) return 'รายการนี้ถูกยืนยันรับชำระแล้ว กรุณาโหลดข้อมูลล่าสุด'
  if (raw.includes('active_subscription_required')) return 'Subscription ไม่ได้เปิดใช้งาน จึงไม่สามารถต่ออายุอัตโนมัติได้'
  if (raw.includes('platform_admin_aal2_required')) return 'กรุณา Login ด้วย Platform Admin และยืนยัน MFA ก่อน'
  return 'ยืนยันรับชำระไม่สำเร็จ ระบบไม่ได้เปลี่ยน Payment, Invoice หรือ Subscription'
}

export function BillingTransferProofFulfillment({ initialItems, currentUserId }: { initialItems: TransferProofFulfillmentItem[]; currentUserId: string }) {
  const router = useRouter()
  const [items, setItems] = useState(initialItems)
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [reason, setReason] = useState('')
  const [message, setMessage] = useState('')
  const [loading, setLoading] = useState(false)
  const selected = useMemo(() => items.find((item) => item.proof_id === selectedId) ?? null, [items, selectedId])

  function beginFulfillment(item: TransferProofFulfillmentItem) {
    if (!fulfillmentAction(item, currentUserId).canStart) return
    setSelectedId(item.proof_id)
    setReason(`ยืนยันรับชำระ ${item.invoice_number} หลังตรวจหลักฐานและผลอนุมัติครบถ้วน`)
    setMessage('')
    requestAnimationFrame(() => document.getElementById('transfer-fulfillment-confirmation')?.scrollIntoView({ behavior: 'smooth', block: 'center' }))
  }

  async function confirmFulfillment() {
    if (!selected || reason.trim().length < 3) return
    setLoading(true)
    setMessage('')
    try {
      const { data, error } = await createClient().rpc('platform_fulfill_billing_transfer_proof', {
        p_proof_id: selected.proof_id,
        p_reason: reason.trim(),
        p_command_id: crypto.randomUUID(),
      })
      if (error) throw error
      const paymentNumber = (data as Array<{ payment_number?: string }> | null)?.[0]?.payment_number
      setItems((current) => current.filter((item) => item.proof_id !== selected.proof_id))
      setSelectedId(null)
      setReason('')
      setMessage(`ยืนยันรับชำระสำเร็จ${paymentNumber ? ` · ${paymentNumber}` : ''} · Invoice ชำระแล้วและ Subscription ต่ออายุแล้ว`)
      router.refresh()
    } catch (error) {
      setMessage(fulfillmentError(error))
    } finally {
      setLoading(false)
    }
  }

  return <>
    {message && <div className={message.startsWith('ยืนยันรับชำระสำเร็จ') ? 'success' : 'error'} role="status">{message}</div>}
    {!items.length ? <div className="empty-state transfer-proof-empty"><strong>ไม่มีหลักฐานที่รอยืนยันรับชำระ</strong><p>เมื่อ Admin คนที่ 1 รับรองหลักฐาน รายการจะปรากฏที่นี่</p></div> : <div className="transfer-proof-review-list">
      {items.map((item) => {
        const isReviewer = item.reviewed_by === currentUserId
        const requiresSecondAdmin = item.approval_required_count === 2
        const amountMatches = Math.abs(item.claimed_amount - item.invoice_total) < 0.01
        const workflow = approvalRoute(item, currentUserId)
        const action = fulfillmentAction(item, currentUserId)
        const timeline = approvalTimeline(item, currentUserId)
        return <article className="card transfer-proof-review-card" key={item.proof_id}>
          <div className={`transfer-workflow-status ${workflow.tone}`}>
            <span className={`status ${workflow.tone}`}>{workflow.label}</span>
            <div><strong>{workflow.description}</strong><p>{workflow.reason}</p></div>
          </div>
          <div className="transfer-proof-review-heading"><div><div className="inline-title-row"><span className="status active">หลักฐานผ่าน</span><h2>{item.invoice_number}</h2></div><p>{item.organization_name} · ตรวจโดย {item.reviewer_email ?? item.reviewed_by}</p></div><span className={`status ${amountMatches ? 'active' : 'suspended'}`}>{amountMatches ? 'ยอดตรง Invoice' : 'ยอดไม่ตรง'}</span></div>
          <dl className="subscription-overview-grid transfer-proof-review-grid">
            <div><dt>ยอดที่จะรับชำระ</dt><dd>{money(item.invoice_total, item.currency)}</dd></div>
            <div><dt>ช่องทาง</dt><dd>{item.channel_display_name} · {item.channel_provider_name}</dd></div>
            <div><dt>บัญชีปลายทาง</dt><dd>{item.channel_account_name} · {item.channel_account_identifier}</dd></div>
            <div><dt>วันเวลาโอน</dt><dd>{dateTime(item.claimed_transfer_at)}</dd></div>
            <div><dt>Plan / Version</dt><dd>{item.plan_code} / {item.plan_version_label}</dd></div>
            <div><dt>สถานะ Invoice</dt><dd>{invoiceStatusLabel(item.invoice_status)}</dd></div>
            <div><dt>สถานะ Subscription</dt><dd>{subscriptionStatusLabel(item.subscription_status)}</dd></div>
            <div><dt>เส้นทางอนุมัติ</dt><dd>{workflow.route} · Policy Version {item.approval_policy_version}</dd></div>
            <div><dt>ผู้ตรวจหลักฐานคนแรก</dt><dd>{item.reviewer_email ?? item.reviewed_by} · {dateTime(item.reviewed_at)}</dd></div>
            <div><dt>Subscription หลังยืนยัน</dt><dd>ถึง {dateTime(item.billing_period_end)} · ผ่อนผัน {item.grace_period_days} วัน</dd></div>
          </dl>
          <div className="transfer-proof-note"><span>เหตุผลที่รับรองหลักฐาน</span><strong>{item.review_reason}</strong></div>
          <section className="approval-timeline" aria-labelledby={`approval-timeline-${item.proof_id}`}>
            <div className="approval-timeline-heading">
              <div><span className="eyebrow">APPROVAL TIMELINE</span><h3 id={`approval-timeline-${item.proof_id}`}>ประวัติการอนุมัติ</h3></div>
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
          <div className={`transfer-approval-requirement ${requiresSecondAdmin ? 'requires-two' : 'requires-one'}`}>
            <span className={`status ${requiresSecondAdmin ? 'pending' : 'active'}`}>{requiresSecondAdmin ? 'ผู้ดูแล 2 คน' : 'ผู้ดูแล 1 คน'}</span>
            <div><strong>{requiresSecondAdmin ? 'ต้องมี Platform Admin คนที่ 2 ยืนยัน' : 'ผู้ตรวจหลักฐานยืนยันรับชำระต่อได้'}</strong><p>{requiresSecondAdmin
              ? `${item.invoice_total > item.single_admin_limit ? `ยอดมากกว่า ${money(item.single_admin_limit, item.currency)}` : ''}${item.invoice_total > item.single_admin_limit && item.risk_flagged ? ' และ ' : ''}${item.risk_flagged ? 'รายการมีสัญญาณเสี่ยง' : ''}`
              : `ยอดไม่เกิน ${money(item.single_admin_limit, item.currency)} และไม่มีสัญญาณเสี่ยง`}</p></div>
          </div>
          {item.risk_flagged && <div className="transfer-proof-warning"><strong>เหตุผลความเสี่ยง</strong><span>{item.risk_reason}</span></div>}
          <div className={`transfer-action-panel ${action.tone}`}>
            <div className="transfer-action-copy"><span className={`status ${action.canStart ? 'active' : action.tone === 'waiting' ? 'pending' : 'suspended'}`}>{action.badge}</span><div><strong>{action.title}</strong><p>{action.description}</p></div></div>
            <button className={`button ${action.canStart ? 'primary' : 'secondary'}`} type="button" disabled={!action.canStart} onClick={() => beginFulfillment(item)}>{action.buttonLabel}</button>
          </div>
        </article>
      })}
    </div>}
    {selected && <section className="confirmation-card transfer-proof-confirmation" id="transfer-fulfillment-confirmation">
      <div className="confirmation-card-heading"><div><div className="eyebrow">ตรวจสอบครั้งสุดท้าย</div><h2>ยืนยันรับชำระและต่ออายุ Subscription</h2></div><span className="status pending">{selected.approval_required_count === 2 ? 'ผู้อนุมัติคนที่ 2' : 'ผู้ยืนยันรับชำระ'}</span></div>
      <dl className="subscription-overview-grid"><div><dt>Invoice</dt><dd>{selected.invoice_number}</dd></div><div><dt>ยอดรับชำระ</dt><dd>{money(selected.invoice_total, selected.currency)}</dd></div><div><dt>ผู้รับรองหลักฐาน</dt><dd>{selected.reviewer_email ?? selected.reviewed_by}</dd></div><div><dt>ผู้ยืนยันรับชำระ</dt><dd>{selected.approval_required_count === 2 ? 'Platform Admin คนที่ 2 (บัญชีปัจจุบัน)' : 'ผู้ตรวจหลักฐานบัญชีปัจจุบัน (ตามวงเงินและความเสี่ยง)'}</dd></div><div><dt>นโยบายที่ใช้</dt><dd>Version {selected.approval_policy_version} · ผู้ดูแล {selected.approval_required_count} คน</dd></div><div><dt>รอบใหม่</dt><dd>{dateTime(selected.billing_period_start)} – {dateTime(selected.billing_period_end)}</dd></div><div><dt>สิ้นสุดช่วงผ่อนผัน</dt><dd>{dateTime(new Date(new Date(selected.billing_period_end).getTime() + selected.grace_period_days * 86400000).toISOString())}</dd></div></dl>
      <label className="field-stack"><span>เหตุผลสำหรับ Audit Log</span><textarea value={reason} maxLength={500} onChange={(event) => setReason(event.target.value)} /></label>
      <div className="transfer-fulfillment-impact"><strong>ผลเมื่อกดยืนยัน</strong><ul><li>สร้าง Payment แบบ Bank Transfer หนึ่งรายการ</li><li>เปลี่ยน Invoice เป็น “ชำระแล้ว”</li><li>ต่ออายุ Subscription ตามรอบใน Invoice</li></ul><p>ทั้งสามขั้นตอนสำเร็จพร้อมกันหรือยกเลิกทั้งหมด และคำสั่งเดิมทำซ้ำไม่ได้</p></div>
      <div className="button-row"><button className="button secondary" type="button" disabled={loading} onClick={() => { setSelectedId(null); setReason('') }}>ย้อนกลับแก้ไข</button><button className="button danger" type="button" disabled={loading || reason.trim().length < 3} onClick={confirmFulfillment}>{loading ? 'กำลังบันทึก…' : 'ยืนยันรับชำระและต่ออายุ'}</button></div>
    </section>}
  </>
}

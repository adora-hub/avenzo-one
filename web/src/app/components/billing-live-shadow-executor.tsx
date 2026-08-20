'use client'

import { useEffect, useMemo, useState } from 'react'
import type { BillingLiveCheckoutDryRun, BillingLiveShadowCommand } from '@/lib/billing/live-safety'

type Props = {
  dryRuns: BillingLiveCheckoutDryRun[]
  initialCommands: BillingLiveShadowCommand[]
}

function money(value: number) {
  return new Intl.NumberFormat('th-TH', { style: 'currency', currency: 'THB', minimumFractionDigits: 2 }).format(value)
}

const checkLabels: Partial<Record<keyof BillingLiveCheckoutDryRun['checks'], string>> = {
  production_readiness_complete: 'การตรวจความพร้อม Production ยังไม่ครบ',
  approval_valid: 'คำอนุมัติร่วมกัน 2 คนไม่พร้อมหรือหมดอายุ',
  tester_allowed: 'บัญชีผู้ทดสอบยังไม่ได้รับอนุญาต',
  amount_valid: 'ยอดทดสอบไม่ถูกต้อง',
  amount_within_limit: 'ยอดทดสอบเกินวงเงินต่อครั้ง',
  count_within_limit: 'จำนวนรายการถึงขีดจำกัด',
  total_within_limit: 'ยอดรวมถึงขีดจำกัด',
  reference_valid: 'รหัสอ้างอิงไม่ครบตามเงื่อนไข',
  live_credentials_configured: 'ยังตั้งค่า Stripe Live Secret และ Live Webhook Secret ไม่ครบ',
  environment_locked: 'Environment Lock ไม่อยู่ในสถานะปลอดภัย',
  emergency_stop_active: 'Emergency Stop ไม่ได้เปิดอยู่',
  pilot_disabled: 'Limited Live Pilot ยังไม่ปิด',
  code_test_only: 'โค้ดไม่ได้อยู่ในโหมดทดสอบเท่านั้น',
}

export function BillingLiveShadowExecutor({ dryRuns, initialCommands }: Props) {
  const [commands, setCommands] = useState(initialCommands)
  const eligibleDryRuns = useMemo(() => dryRuns.filter((item) => item.eligible && !commands.some((command) => command.source_dry_run_id === item.id)), [dryRuns, commands])
  const [dryRunId, setDryRunId] = useState(eligibleDryRuns[0]?.id ?? '')
  const [reason, setReason] = useState('')
  const [previewing, setPreviewing] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [message, setMessage] = useState('')
  const [error, setError] = useState('')
  const selected = dryRuns.find((item) => item.id === dryRunId)
  const latestDryRun = dryRuns[0]
  const latestFailedChecks = latestDryRun
    ? Object.entries(latestDryRun.checks)
      .filter(([, passed]) => !passed)
      .map(([key]) => checkLabels[key as keyof BillingLiveCheckoutDryRun['checks']] ?? key)
    : []

  useEffect(() => {
    if (dryRunId && eligibleDryRuns.some((item) => item.id === dryRunId)) return
    setDryRunId(eligibleDryRuns[0]?.id ?? '')
    setPreviewing(false)
  }, [dryRunId, eligibleDryRuns])

  function inspectBeforeReservation() {
    setMessage('')
    setError('')
    if (!selected || reason.trim().length < 10) {
      setError('กรุณาเลือก Dry-run ที่ผ่าน และระบุเหตุผลอย่างน้อย 10 ตัวอักษร')
      return
    }
    setPreviewing(true)
  }

  async function reserveCommand() {
    if (!selected) return
    setSubmitting(true)
    setError('')
    setMessage('')
    try {
      const response = await fetch('/api/billing/stripe/live-shadow-executor', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ commandId: crypto.randomUUID(), dryRunId: selected.id, reason }),
      })
      const payload = await response.json() as { command?: BillingLiveShadowCommand; error?: string }
      if (!response.ok || !payload.command) throw new Error(payload.error ?? 'shadow_executor_reservation_failed')
      setCommands((current) => [payload.command!, ...current.filter((item) => item.id !== payload.command!.id)].slice(0, 10))
      setMessage(payload.command.status === 'reserved'
        ? 'จองคำสั่ง Shadow และบันทึก Audit สำเร็จ โดยไม่ได้เรียก Stripe API'
        : 'บันทึกคำสั่ง Shadow เป็นสถานะถูกบล็อกแล้ว กรุณาตรวจรายการที่ไม่ผ่าน')
      setDryRunId('')
      setReason('')
      setPreviewing(false)
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'shadow_executor_reservation_failed')
    } finally {
      setSubmitting(false)
    }
  }

  return <section className="readiness-review-card controlled-checkout-card">
    <div className="feature-list-heading">
      <div><div className="eyebrow">Phase 1.1.3.7.5.6 · Shadow Executor</div><h2>จองคำสั่งจำลองและบันทึก Audit</h2><p>ใช้ผล Dry-run ที่ผ่านเพื่อจำลองลำดับ Executor โดยไม่มีการเรียก Stripe Live API และไม่มีเงินจริงเคลื่อนย้าย</p></div>
      <span className="status pending">Shadow เท่านั้น · ไม่รับเงินจริง</span>
    </div>
    <div className="controlled-checkout-warning" role="note"><strong>Shadow Command ไม่ใช่รายการชำระเงิน</strong><span>ระบบจอง Command ID และ Idempotency Key เท่านั้น ขั้นสร้าง Checkout, Payment Attempt และ Webhook Fulfillment ยังถูกบล็อก</span></div>
    <div className="controlled-checkout-form">
      <label>ผล Dry-run ที่ผ่าน
        <select value={dryRunId} onChange={(event) => { setDryRunId(event.target.value); setPreviewing(false); setMessage(''); setError('') }} disabled={!eligibleDryRuns.length}>
          {!eligibleDryRuns.length ? <option value="">ยังไม่มี Dry-run ที่ผ่านและยังไม่ถูกใช้</option> : null}
          {eligibleDryRuns.map((item) => <option key={item.id} value={item.id}>{item.reference} · {money(Number(item.requested_amount))}</option>)}
        </select>
      </label>
      <label className="controlled-checkout-reference">เหตุผลสำหรับ Audit Log
        <input value={reason} minLength={10} maxLength={500} disabled={!eligibleDryRuns.length} onChange={(event) => { setReason(event.target.value); setPreviewing(false); setMessage(''); setError('') }} placeholder="เช่น ทดสอบการจองคำสั่ง Shadow ก่อนพัฒนา Executor จริง" />
      </label>
    </div>
    {eligibleDryRuns.length ? <button className="button" type="button" onClick={inspectBeforeReservation}>ตรวจสอบก่อนจองคำสั่ง Shadow</button> : <div className="controlled-checkout-warning" role="status">
      <strong>{latestDryRun ? 'ปุ่มยังไม่พร้อม เพราะ Dry-run ล่าสุดยังไม่ผ่าน' : 'ปุ่มยังไม่พร้อม เพราะยังไม่มี Dry-run'}</strong>
      <span>{latestFailedChecks.length ? `เงื่อนไขที่ต้องแก้: ${latestFailedChecks.join(' · ')}` : 'กรุณาสร้าง Dry-run จากส่วนทดลองตรวจ Checkout แบบควบคุมก่อน'}</span>
      <div className="button-row">
        <a className="button secondary" href="#controlled-live-checkout">ไปสร้าง Dry-run ใหม่</a>
        <a className="button secondary" href="/platform-admin/billing/readiness">ตรวจความพร้อม Production</a>
      </div>
    </div>}
    {error ? <div className="error" role="alert">{error}</div> : null}
    {message ? <div className="success" role="status">{message}</div> : null}
    {previewing && selected ? <section className="subscription-confirmation controlled-checkout-review">
      <div className="subscription-confirmation-heading"><div><span className="eyebrow">ตรวจสอบครั้งสุดท้าย</span><h3>ยืนยันจองคำสั่ง Shadow</h3></div><span className="status pending">ยังไม่บันทึก</span></div>
      <dl className="live-safety-state-grid"><div><dt>Dry-run</dt><dd>{selected.reference}</dd></div><div><dt>ยอดจำลอง</dt><dd>{money(Number(selected.requested_amount))}</dd></div><div><dt>ผู้ทดสอบ</dt><dd>{selected.tester_email}</dd></div><div><dt>ผลด้านการเงิน</dt><dd>ไม่เรียก Stripe · ไม่รับเงินจริง</dd></div></dl>
      <div className="button-row"><button className="button secondary" type="button" onClick={() => setPreviewing(false)}>ย้อนกลับแก้ไข</button><button className="button" type="button" disabled={submitting} onClick={reserveCommand}>{submitting ? 'กำลังจองคำสั่ง...' : 'ยืนยันจองคำสั่ง Shadow'}</button></div>
    </section> : null}
    <section className="readiness-review-card">
      <div className="feature-list-heading"><div><div className="eyebrow">Shadow Command Audit</div><h3>ประวัติคำสั่ง Shadow</h3><p>แสดง 10 รายการล่าสุด ข้อมูลแก้ไขหรือลบย้อนหลังไม่ได้</p></div><span className="feature-count">{commands.length} รายการ</span></div>
      {commands.length ? <div className="live-safety-events">{commands.map((command) => <article key={command.id}><div><strong>{command.status === 'reserved' ? 'จองคำสั่ง Shadow แล้ว' : 'คำสั่ง Shadow ถูกบล็อก'}</strong><span>{command.actor_email} · {new Date(command.created_at).toLocaleString('th-TH')}</span></div><div><p>{command.reference} · {money(Number(command.requested_amount))}</p><span>Stripe API: ไม่ถูกเรียก · รับเงินจริง: ไม่</span></div></article>)}</div> : <div className="empty-state">ยังไม่มีคำสั่ง Shadow</div>}
    </section>
  </section>
}

'use client'

import { FormEvent, useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/browser'
import { subscriptionErrorMessage } from './subscription-labels'

type Organization = { id: string; name: string; slug: string; timezone: string; currency: string }
export type ActivePlanVersion = {
  id: string
  plan_code: string
  plan_name: string
  label: string
  duration_days: number
  grace_period_days: number
}
export type ActivePlanPrice = {
  id: string
  plan_version_id: string
  billing_interval: string
  amount: number
  currency: string
  trial_days: number
}

function toLocalDateTime(value: Date) {
  const offset = value.getTimezoneOffset() * 60000
  return new Date(value.getTime() - offset).toISOString().slice(0, 16)
}

function addDays(value: string, days: number) {
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return ''
  date.setDate(date.getDate() + days)
  return toLocalDateTime(date)
}

function formatDate(value: string, timezone = 'Asia/Bangkok') {
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return 'วันที่ไม่ถูกต้อง'
  return new Intl.DateTimeFormat('th-TH', {
    dateStyle: 'medium', timeStyle: 'short', timeZone: timezone,
  }).format(date)
}

function formatPrice(amount: number, currency: string) {
  return new Intl.NumberFormat('th-TH', {
    style: 'currency', currency, minimumFractionDigits: 2,
  }).format(amount)
}

function billingIntervalLabel(interval: string) {
  if (interval === 'monthly') return 'รายเดือน'
  if (interval === 'yearly') return 'รายปี'
  if (interval === 'one_time') return 'ชำระครั้งเดียว'
  return interval
}

export function SubscriptionProvisionForm({ organizations, planVersions, planPrices }: {
  organizations: Organization[]
  planVersions: ActivePlanVersion[]
  planPrices: ActivePlanPrice[]
}) {
  const router = useRouter()
  const initialVersion = planVersions[0]
  const initialStart = toLocalDateTime(new Date())
  const [organizationId, setOrganizationId] = useState(organizations[0]?.id ?? '')
  const [planVersionId, setPlanVersionId] = useState(initialVersion?.id ?? '')
  const [planPriceId, setPlanPriceId] = useState(planPrices.find((price) => price.plan_version_id === initialVersion?.id)?.id ?? '')
  const [startsAt, setStartsAt] = useState(initialStart)
  const [expiresAt, setExpiresAt] = useState(addDays(initialStart, initialVersion?.duration_days ?? 30))
  const [graceEndsAt, setGraceEndsAt] = useState(addDays(initialStart, (initialVersion?.duration_days ?? 30) + (initialVersion?.grace_period_days ?? 3)))
  const [reason, setReason] = useState('เริ่มต้น Subscription ของ Organization')
  const [message, setMessage] = useState('')
  const [loading, setLoading] = useState(false)
  const [showPreview, setShowPreview] = useState(false)
  const [commandId, setCommandId] = useState('')
  const [reasonTouched, setReasonTouched] = useState(false)

  const selectedOrganization = useMemo(() => organizations.find((item) => item.id === organizationId), [organizationId, organizations])
  const selectedVersion = useMemo(() => planVersions.find((item) => item.id === planVersionId), [planVersionId, planVersions])
  const availablePrices = useMemo(() => planPrices.filter((item) => item.plan_version_id === planVersionId), [planPrices, planVersionId])
  const selectedPrice = useMemo(() => planPrices.find((item) => item.id === planPriceId), [planPriceId, planPrices])
  const trialEndsAt = selectedPrice?.trial_days ? addDays(startsAt, selectedPrice.trial_days) : ''
  const reasonLength = reason.trim().length
  const reasonHint = reasonTouched && reasonLength < 3
    ? reasonLength === 0 ? 'กรุณาระบุเหตุผลอย่างน้อย 3 ตัวอักษร' : `กรุณาพิมพ์เหตุผลเพิ่มอีก ${3 - reasonLength} ตัวอักษร`
    : ''

  function resetPreview() { setShowPreview(false); setCommandId(''); setMessage('') }

  function calculateDates(start: string, version = selectedVersion) {
    if (!version) return
    const expires = addDays(start, version.duration_days)
    setExpiresAt(expires)
    setGraceEndsAt(addDays(expires, version.grace_period_days))
  }

  function applyPlanVersion(id: string) {
    const version = planVersions.find((item) => item.id === id)
    const firstPrice = planPrices.find((price) => price.plan_version_id === id)
    setPlanVersionId(id)
    setPlanPriceId(firstPrice?.id ?? '')
    calculateDates(startsAt, version)
    resetPreview()
  }

  function updateStart(value: string) {
    setStartsAt(value)
    calculateDates(value)
    resetPreview()
  }

  function validate() {
    if (!selectedOrganization || !selectedVersion) return 'กรุณาเลือก Organization และ Plan Version'
    const start = new Date(startsAt).getTime()
    const expiry = new Date(expiresAt).getTime()
    const grace = new Date(graceEndsAt).getTime()
    if ([start, expiry, grace].some(Number.isNaN)) return 'กรุณาตรวจสอบวันที่และเวลา'
    if (expiry <= start) return 'วันหมดอายุต้องอยู่หลังวันเริ่มต้น'
    if (grace < expiry) return 'Grace Period ต้องสิ้นสุดพร้อมหรือหลังวันหมดอายุ'
    if (reason.trim().length < 3) return 'กรุณาระบุเหตุผลอย่างน้อย 3 ตัวอักษร'
    if (selectedPrice?.trial_days && new Date(trialEndsAt).getTime() > expiry) return 'จำนวนวันทดลองมากกว่าอายุ Subscription กรุณาตรวจสอบ Plan Version'
    return ''
  }

  function preview(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setReasonTouched(true)
    const error = validate()
    if (error) {
      setMessage(error === 'กรุณาระบุเหตุผลอย่างน้อย 3 ตัวอักษร' ? '' : error)
      setShowPreview(false)
      return
    }
    setMessage('')
    setCommandId(crypto.randomUUID())
    setShowPreview(true)
  }

  async function confirmSubscription() {
    if (!selectedVersion || !commandId) return
    const errorMessage = validate()
    if (errorMessage) { setMessage(errorMessage); setShowPreview(false); return }
    setLoading(true)
    setMessage('')
    try {
      const supabase = createClient()
      const { error } = await supabase.rpc('platform_transition_organization_subscription', {
        p_organization_id: organizationId,
        p_plan_code: selectedVersion.plan_code,
        p_plan_version_id: selectedVersion.id,
        p_starts_at: new Date(startsAt).toISOString(),
        p_expires_at: new Date(expiresAt).toISOString(),
        p_grace_ends_at: new Date(graceEndsAt).toISOString(),
        p_event_type: 'provision',
        p_reason: reason.trim(),
        p_command_id: commandId,
        p_metadata: {
          phase: '1.0.4.1', price_id: selectedPrice?.id ?? null,
          billing_interval: selectedPrice?.billing_interval ?? null,
          amount: selectedPrice?.amount ?? null, currency: selectedPrice?.currency ?? null,
          trial_days: selectedPrice?.trial_days ?? 0,
          trial_ends_at: trialEndsAt ? new Date(trialEndsAt).toISOString() : null,
          date_calculation: 'subscription_duration_from_start',
        },
      })
      if (error) throw error
      setMessage('บันทึก Subscription และ Plan Version สำเร็จ')
      setShowPreview(false)
      setReasonTouched(false)
      router.refresh()
    } catch (error) {
      const raw = error instanceof Error ? error.message : 'ไม่สามารถบันทึก Subscription ได้'
      setMessage(subscriptionErrorMessage(raw))
    } finally { setLoading(false) }
  }

  if (!organizations.length) return <div className="empty">ยังไม่มี Organization ที่พร้อมใช้งาน</div>
  if (!planVersions.length) return <div className="empty">ยังไม่มี Plan Version ที่ Active — ไปที่ Plans &amp; Prices เปิดใช้งาน Feature ที่อ้างอิงก่อน แล้วจึงเปิดใช้งาน Version</div>

  return (
    <form className="form subscription-provision-form" noValidate onSubmit={preview}>
      <label>Organization<select value={organizationId} onChange={(event) => { setOrganizationId(event.target.value); resetPreview() }}>{organizations.map((item) => <option value={item.id} key={item.id}>{item.name} / {item.slug}</option>)}</select></label>
      <label>Plan Version<select value={planVersionId} onChange={(event) => applyPlanVersion(event.target.value)}>{planVersions.map((item) => <option value={item.id} key={item.id}>{item.plan_name} · {item.label} · {item.duration_days} วัน + Grace {item.grace_period_days} วัน</option>)}</select></label>
      <label>ราคา<select value={planPriceId} onChange={(event) => { setPlanPriceId(event.target.value); resetPreview() }}>{!availablePrices.length && <option value="">ยังไม่กำหนดราคา Active</option>}{availablePrices.map((price) => <option value={price.id} key={price.id}>{formatPrice(price.amount, price.currency)} / {billingIntervalLabel(price.billing_interval)} · ทดลอง {price.trial_days} วัน</option>)}</select><span className="field-help">ราคานี้ใช้เป็นข้อมูลอ้างอิง ยังไม่มีการเรียกเก็บเงินจริงใน Phase นี้</span></label>
      <label>เริ่มต้น<input type="datetime-local" required value={startsAt} onChange={(event) => updateStart(event.target.value)} /></label>
      <div className="form-grid-two">
        <label>หมดอายุ (คำนวณอัตโนมัติ)<input type="datetime-local" required readOnly value={expiresAt} /></label>
        <label>สิ้นสุด Grace Period (คำนวณอัตโนมัติ)<input type="datetime-local" required readOnly value={graceEndsAt} /></label>
      </div>
      <label>เหตุผล<textarea aria-describedby={reasonHint ? 'provision-reason-hint' : undefined} aria-invalid={reasonHint ? 'true' : 'false'} minLength={3} value={reason} onChange={(event) => { setReason(event.target.value); setReasonTouched(true); resetPreview() }} rows={3} />{reasonHint && <span id="provision-reason-hint" className="form-message info" role="status"><span className="form-message-icon" aria-hidden="true">i</span>{reasonHint}</span>}</label>
      {message && <div className={message.includes('สำเร็จ') ? 'countdown' : 'error'}>{message}</div>}
      {!showPreview ? <button className="button" type="submit">ตรวจสอบก่อนบันทึก</button> : (
        <section className="subscription-confirmation" aria-live="polite">
          <div className="subscription-confirmation-heading"><div><span className="eyebrow">ตรวจสอบครั้งสุดท้าย</span><h3>สรุป Subscription ก่อนบันทึก</h3></div><span className="status active">พร้อมบันทึก</span></div>
          <dl className="subscription-confirmation-grid">
            <div><dt>Organization</dt><dd>{selectedOrganization?.name}</dd></div>
            <div><dt>Plan / Version</dt><dd>{selectedVersion?.plan_name} / {selectedVersion?.label}</dd></div>
            <div><dt>ราคาอ้างอิง</dt><dd>{selectedPrice ? `${formatPrice(selectedPrice.amount, selectedPrice.currency)} / ${billingIntervalLabel(selectedPrice.billing_interval)}` : 'ยังไม่กำหนดราคา'}</dd></div>
            <div><dt>ระยะทดลอง</dt><dd>{selectedPrice?.trial_days ? `${selectedPrice.trial_days} วัน · ถึง ${formatDate(trialEndsAt, selectedOrganization?.timezone)}` : 'ไม่มีระยะทดลอง'}</dd></div>
            <div><dt>เริ่มต้น</dt><dd>{formatDate(startsAt, selectedOrganization?.timezone)}</dd></div>
            <div><dt>หมดอายุ</dt><dd>{formatDate(expiresAt, selectedOrganization?.timezone)}</dd></div>
            <div><dt>Grace Period สิ้นสุด</dt><dd>{formatDate(graceEndsAt, selectedOrganization?.timezone)}</dd></div>
            <div><dt>รายการ</dt><dd>เริ่ม Subscription</dd></div>
          </dl>
          <div className="subscription-confirmation-note"><strong>เหตุผล</strong><span>{reason.trim()}</span></div>
          <div className="button-row"><button className="button secondary" type="button" disabled={loading} onClick={() => setShowPreview(false)}>ย้อนกลับแก้ไข</button><button className="button" type="button" disabled={loading} onClick={confirmSubscription}>{loading ? 'กำลังบันทึก…' : 'ยืนยันและบันทึก Subscription'}</button></div>
        </section>
      )}
    </form>
  )
}

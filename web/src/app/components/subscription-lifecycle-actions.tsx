'use client'

import { FormEvent, useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/browser'
import type { ActivePlanPrice, ActivePlanVersion } from './subscription-provision-form'
import { subscriptionErrorMessage, subscriptionEventLabels } from './subscription-labels'

type CurrentSubscription = {
  id: string
  organization_id: string
  organization_name: string
  plan_code: string
  plan_version_id: string
  plan_name: string
  plan_version_label: string
  lifecycle_status: string
  starts_at: string
  expires_at: string
  grace_ends_at: string
  timezone: string
}

function toLocalDateTime(value: Date) {
  const offset = value.getTimezoneOffset() * 60000
  return new Date(value.getTime() - offset).toISOString().slice(0, 16)
}

function addDays(value: string, days: number) {
  const date = new Date(value)
  date.setDate(date.getDate() + days)
  return toLocalDateTime(date)
}

function formatDate(value: string, timezone: string) {
  return new Intl.DateTimeFormat('th-TH', { dateStyle: 'medium', timeStyle: 'short', timeZone: timezone }).format(new Date(value))
}

function formatPrice(amount: number, currency: string) {
  return new Intl.NumberFormat('th-TH', { style: 'currency', currency, minimumFractionDigits: 2 }).format(amount)
}

export function SubscriptionLifecycleActions({ subscription, planVersions, planPrices }: {
  subscription: CurrentSubscription
  planVersions: ActivePlanVersion[]
  planPrices: ActivePlanPrice[]
}) {
  const router = useRouter()
  const initialAction = subscription.lifecycle_status === 'suspended' ? 'resume' : 'renew'
  const currentVersion = planVersions.find((item) => item.id === subscription.plan_version_id)
  const defaultPlanVersionId = currentVersion?.id ?? planVersions[0]?.id ?? subscription.plan_version_id
  const defaultPlanVersion = planVersions.find((item) => item.id === defaultPlanVersionId)
  const initialRenewStart = toLocalDateTime(new Date(subscription.expires_at) > new Date() ? new Date(subscription.expires_at) : new Date())
  const initialExpiry = initialAction === 'renew' && defaultPlanVersion ? addDays(initialRenewStart, defaultPlanVersion.duration_days) : toLocalDateTime(new Date(subscription.expires_at))
  const [action, setAction] = useState(initialAction)
  const [planVersionId, setPlanVersionId] = useState(defaultPlanVersionId)
  const [reason, setReason] = useState('')
  const [startsAt, setStartsAt] = useState(initialAction === 'renew' ? initialRenewStart : toLocalDateTime(new Date(subscription.starts_at)))
  const [expiresAt, setExpiresAt] = useState(initialExpiry)
  const [graceEndsAt, setGraceEndsAt] = useState(initialAction === 'renew' && defaultPlanVersion ? addDays(initialExpiry, defaultPlanVersion.grace_period_days) : toLocalDateTime(new Date(subscription.grace_ends_at)))
  const [preview, setPreview] = useState(false)
  const [commandId, setCommandId] = useState('')
  const [loading, setLoading] = useState(false)
  const [message, setMessage] = useState('')

  const selectedVersion = useMemo(() => planVersions.find((item) => item.id === planVersionId), [planVersionId, planVersions])
  const selectedPrice = useMemo(() => planPrices.find((item) => item.plan_version_id === planVersionId), [planPrices, planVersionId])
  const changesPlan = action === 'renew' || action === 'adjust'

  function calculateDates(start: string, version = selectedVersion) {
    if (!version) return
    const expiry = addDays(start, version.duration_days)
    setExpiresAt(expiry)
    setGraceEndsAt(addDays(expiry, version.grace_period_days))
  }

  function resetPreview() { setPreview(false); setCommandId(''); setMessage('') }

  function selectAction(value: string) {
    setAction(value)
    if (value === 'renew') {
      const start = toLocalDateTime(new Date(subscription.expires_at) > new Date() ? new Date(subscription.expires_at) : new Date())
      setStartsAt(start)
      calculateDates(start)
    } else if (value === 'adjust') {
      const start = toLocalDateTime(new Date())
      setStartsAt(start)
      calculateDates(start)
    } else {
      setPlanVersionId(subscription.plan_version_id)
      setStartsAt(toLocalDateTime(new Date(subscription.starts_at)))
      setExpiresAt(toLocalDateTime(new Date(subscription.expires_at)))
      setGraceEndsAt(toLocalDateTime(new Date(subscription.grace_ends_at)))
    }
    resetPreview()
  }

  function preparePreview(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (reason.trim().length < 3) { setMessage('กรุณาระบุเหตุผลอย่างน้อย 3 ตัวอักษร'); return }
    if (changesPlan && !selectedVersion) { setMessage('ไม่พบ Plan Version ที่เปิดใช้งาน กรุณาเลือก Version ใหม่'); return }
    setMessage('')
    setCommandId(crypto.randomUUID())
    setPreview(true)
  }

  async function confirm() {
    if (!commandId || (changesPlan && !selectedVersion)) return
    setLoading(true)
    setMessage('')
    try {
      const supabase = createClient()
      const { error } = await supabase.rpc('platform_transition_organization_subscription', {
        p_organization_id: subscription.organization_id,
        p_plan_code: changesPlan ? selectedVersion!.plan_code : subscription.plan_code,
        p_plan_version_id: changesPlan ? selectedVersion!.id : subscription.plan_version_id,
        p_starts_at: new Date(startsAt).toISOString(),
        p_expires_at: new Date(expiresAt).toISOString(),
        p_grace_ends_at: new Date(graceEndsAt).toISOString(),
        p_event_type: action,
        p_reason: reason.trim(),
        p_command_id: commandId,
        p_metadata: changesPlan ? {
          price_id: selectedPrice?.id ?? null,
          amount: selectedPrice?.amount ?? null,
          currency: selectedPrice?.currency ?? null,
          billing_interval: selectedPrice?.billing_interval ?? null,
          trial_days: 0,
          trial_ends_at: null,
        } : {},
      })
      if (error) throw error
      setMessage(`${subscriptionEventLabels[action]}สำเร็จ`)
      setPreview(false)
      setReason('')
      router.refresh()
    } catch (error) {
      const raw = error instanceof Error ? error.message : 'ไม่สามารถจัดการ Subscription ได้'
      setMessage(subscriptionErrorMessage(raw))
    } finally { setLoading(false) }
  }

  const actionOptions = subscription.lifecycle_status === 'suspended'
    ? [{ value: 'resume', label: 'เปิดใช้งานต่อ' }, { value: 'cancel', label: 'ยกเลิก Subscription' }]
    : [
        { value: 'renew', label: 'ต่ออายุ' },
        { value: 'adjust', label: 'เปลี่ยนแพ็กเกจ/ปรับสิทธิ์' },
        { value: 'suspend', label: 'พักการใช้งานชั่วคราว' },
        { value: 'cancel', label: 'ยกเลิก Subscription' },
      ]

  return (
    <form className="form subscription-action-form" onSubmit={preparePreview}>
      <label>รายการที่ต้องการทำ<select value={action} onChange={(event) => selectAction(event.target.value)}>{actionOptions.map((item) => <option key={item.value} value={item.value}>{item.label}</option>)}</select></label>
      {changesPlan && <>
        <label>Plan Version<select value={planVersionId} onChange={(event) => { const id = event.target.value; setPlanVersionId(id); calculateDates(startsAt, planVersions.find((item) => item.id === id)); resetPreview() }}>{planVersions.map((item) => <option key={item.id} value={item.id}>{item.plan_name} · {item.label}</option>)}</select></label>
        <label>เริ่มรอบใหม่<input type="datetime-local" value={startsAt} onChange={(event) => { setStartsAt(event.target.value); calculateDates(event.target.value); resetPreview() }} /></label>
        <div className="form-grid-two"><label>หมดอายุ<input type="datetime-local" readOnly value={expiresAt.slice(0, 16)} /></label><label>สิ้นสุดช่วงผ่อนผัน<input type="datetime-local" readOnly value={graceEndsAt.slice(0, 16)} /></label></div>
      </>}
      <label>เหตุผล<span className="field-help">จำเป็นสำหรับประวัติและ Audit Log</span><textarea rows={3} minLength={3} required value={reason} onChange={(event) => { setReason(event.target.value); resetPreview() }} /></label>
      {message && <div className={message.includes('สำเร็จ') ? 'countdown' : 'error'}>{message}</div>}
      {!preview ? <button className={`button ${action === 'cancel' || action === 'suspend' ? 'danger' : ''}`} type="submit">ตรวจสอบก่อนยืนยัน</button> : (
        <section className="subscription-confirmation">
          <div className="subscription-confirmation-heading"><div><span className="eyebrow">ตรวจสอบครั้งสุดท้าย</span><h3>{subscriptionEventLabels[action]}</h3></div><span className="status active">ยังไม่บันทึก</span></div>
          <dl className="subscription-confirmation-grid">
            <div><dt>Organization</dt><dd>{subscription.organization_name}</dd></div>
            <div><dt>Plan / Version</dt><dd>{selectedVersion?.plan_name ?? subscription.plan_name} / {selectedVersion?.label ?? subscription.plan_version_label}</dd></div>
            {changesPlan && <div><dt>ราคาอ้างอิง</dt><dd>{selectedPrice ? formatPrice(selectedPrice.amount, selectedPrice.currency) : 'ยังไม่กำหนดราคา'}</dd></div>}
            <div><dt>เริ่มต้น</dt><dd>{formatDate(startsAt, subscription.timezone)}</dd></div>
            <div><dt>หมดอายุ</dt><dd>{formatDate(expiresAt, subscription.timezone)}</dd></div>
            <div><dt>เหตุผล</dt><dd>{reason.trim()}</dd></div>
          </dl>
          <div className="button-row"><button className="button secondary" type="button" disabled={loading} onClick={() => setPreview(false)}>ย้อนกลับแก้ไข</button><button className={`button ${action === 'cancel' || action === 'suspend' ? 'danger' : ''}`} type="button" disabled={loading} onClick={confirm}>{loading ? 'กำลังบันทึก…' : `ยืนยัน${subscriptionEventLabels[action]}`}</button></div>
        </section>
      )}
    </form>
  )
}

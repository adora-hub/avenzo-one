'use client'

import { FormEvent, useState } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/browser'

type Organization = { id: string; name: string; slug: string }
type Plan = { code: string; name: string; duration_days: number; grace_period_days: number }

function localDateTimeOffset(days: number) {
  const value = new Date(Date.now() + days * 86400000)
  const offset = value.getTimezoneOffset() * 60000
  return new Date(value.getTime() - offset).toISOString().slice(0, 16)
}

export function SubscriptionProvisionForm({ organizations, plans }: { organizations: Organization[]; plans: Plan[] }) {
  const router = useRouter()
  const [organizationId, setOrganizationId] = useState(organizations[0]?.id ?? '')
  const [planCode, setPlanCode] = useState(plans[0]?.code ?? '')
  const [startsAt, setStartsAt] = useState(localDateTimeOffset(0))
  const [expiresAt, setExpiresAt] = useState(localDateTimeOffset(30))
  const [graceEndsAt, setGraceEndsAt] = useState(localDateTimeOffset(33))
  const [eventType, setEventType] = useState('provision')
  const [reason, setReason] = useState('เริ่มต้น Subscription ของ Organization')
  const [message, setMessage] = useState('')
  const [loading, setLoading] = useState(false)

  function applyPlan(code: string) {
    const plan = plans.find((item) => item.code === code)
    setPlanCode(code)
    if (plan) {
      setExpiresAt(localDateTimeOffset(plan.duration_days))
      setGraceEndsAt(localDateTimeOffset(plan.duration_days + plan.grace_period_days))
    }
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setLoading(true)
    setMessage('')

    try {
      const supabase = createClient()
      const { error } = await supabase.rpc('platform_set_organization_subscription', {
        p_organization_id: organizationId,
        p_plan_code: planCode,
        p_starts_at: new Date(startsAt).toISOString(),
        p_expires_at: new Date(expiresAt).toISOString(),
        p_grace_ends_at: new Date(graceEndsAt).toISOString(),
        p_lifecycle_status: eventType === 'cancel' ? 'canceled' : 'active',
        p_event_type: eventType,
        p_reason: reason,
        p_metadata: {},
      })
      if (error) throw error
      setMessage('บันทึก Subscription สำเร็จ')
      router.refresh()
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'ไม่สามารถบันทึก Subscription ได้')
    } finally {
      setLoading(false)
    }
  }

  if (!organizations.length || !plans.length) return <div className="empty">ไม่พบ Organization หรือ Plan ที่พร้อมใช้งานสำหรับบัญชีนี้</div>

  return (
    <form className="form" onSubmit={submit}>
      <label>Organization<select value={organizationId} onChange={(event) => setOrganizationId(event.target.value)}>{organizations.map((item) => <option value={item.id} key={item.id}>{item.name} / {item.slug}</option>)}</select></label>
      <label>Plan<select value={planCode} onChange={(event) => applyPlan(event.target.value)}>{plans.map((item) => <option value={item.code} key={item.code}>{item.name} · {item.duration_days} วัน + Grace {item.grace_period_days} วัน</option>)}</select></label>
      <label>ประเภท Event<select value={eventType} onChange={(event) => setEventType(event.target.value)}><option value="provision">Provision</option><option value="renew">Renew</option><option value="adjust">Adjust</option><option value="cancel">Cancel</option></select></label>
      <label>เริ่มต้น<input type="datetime-local" required value={startsAt} onChange={(event) => setStartsAt(event.target.value)} /></label>
      <label>หมดอายุ<input type="datetime-local" required value={expiresAt} onChange={(event) => setExpiresAt(event.target.value)} /></label>
      <label>สิ้นสุด Grace Period<input type="datetime-local" required value={graceEndsAt} onChange={(event) => setGraceEndsAt(event.target.value)} /></label>
      <label>เหตุผล<textarea required minLength={3} value={reason} onChange={(event) => setReason(event.target.value)} rows={3} /></label>
      {message && <div className={message.includes('สำเร็จ') ? 'countdown' : 'error'}>{message}</div>}
      <button className="button" disabled={loading}>{loading ? 'กำลังบันทึก…' : 'บันทึก Subscription'}</button>
    </form>
  )
}

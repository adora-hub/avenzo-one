'use client'

import { FormEvent, useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/browser'

type Organization = { id: string; name: string; slug: string }
export type ActivePlanVersion = {
  id: string
  plan_code: string
  plan_name: string
  label: string
  duration_days: number
  grace_period_days: number
}

function localDateTimeOffset(days: number) {
  const value = new Date(Date.now() + days * 86400000)
  const offset = value.getTimezoneOffset() * 60000
  return new Date(value.getTime() - offset).toISOString().slice(0, 16)
}

export function SubscriptionProvisionForm({
  organizations,
  planVersions,
}: {
  organizations: Organization[]
  planVersions: ActivePlanVersion[]
}) {
  const router = useRouter()
  const [organizationId, setOrganizationId] = useState(organizations[0]?.id ?? '')
  const [planVersionId, setPlanVersionId] = useState(planVersions[0]?.id ?? '')
  const [startsAt, setStartsAt] = useState(localDateTimeOffset(0))
  const [expiresAt, setExpiresAt] = useState(localDateTimeOffset(planVersions[0]?.duration_days ?? 30))
  const [graceEndsAt, setGraceEndsAt] = useState(localDateTimeOffset(
    (planVersions[0]?.duration_days ?? 30) + (planVersions[0]?.grace_period_days ?? 3),
  ))
  const [eventType, setEventType] = useState('provision')
  const [reason, setReason] = useState('เริ่มต้น Subscription ของ Organization')
  const [message, setMessage] = useState('')
  const [loading, setLoading] = useState(false)
  const selectedVersion = useMemo(
    () => planVersions.find((item) => item.id === planVersionId),
    [planVersionId, planVersions],
  )

  function applyPlanVersion(id: string) {
    const version = planVersions.find((item) => item.id === id)
    setPlanVersionId(id)
    if (version) {
      setExpiresAt(localDateTimeOffset(version.duration_days))
      setGraceEndsAt(localDateTimeOffset(version.duration_days + version.grace_period_days))
    }
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!selectedVersion) return
    setLoading(true)
    setMessage('')

    try {
      const supabase = createClient()
      const { error } = await supabase.rpc('platform_set_organization_subscription_versioned', {
        p_organization_id: organizationId,
        p_plan_code: selectedVersion.plan_code,
        p_plan_version_id: selectedVersion.id,
        p_starts_at: new Date(startsAt).toISOString(),
        p_expires_at: new Date(expiresAt).toISOString(),
        p_grace_ends_at: new Date(graceEndsAt).toISOString(),
        p_lifecycle_status: eventType === 'cancel' ? 'canceled' : 'active',
        p_event_type: eventType,
        p_reason: reason,
        p_metadata: {},
      })
      if (error) throw error
      setMessage('บันทึก Subscription และ Plan Version สำเร็จ')
      router.refresh()
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'ไม่สามารถบันทึก Subscription ได้')
    } finally {
      setLoading(false)
    }
  }

  if (!organizations.length) return <div className="empty">ยังไม่มี Organization ที่พร้อมใช้งาน</div>
  if (!planVersions.length) {
    return (
      <div className="empty">
        ยังไม่มี Plan Version ที่ Active — ไปที่ Plans &amp; Prices เปิดใช้งาน Feature ที่อ้างอิงก่อน แล้วจึงเปิดใช้งาน Version
      </div>
    )
  }

  return (
    <form className="form" onSubmit={submit}>
      <label>
        Organization
        <select value={organizationId} onChange={(event) => setOrganizationId(event.target.value)}>
          {organizations.map((item) => <option value={item.id} key={item.id}>{item.name} / {item.slug}</option>)}
        </select>
      </label>
      <label>
        Plan Version
        <select value={planVersionId} onChange={(event) => applyPlanVersion(event.target.value)}>
          {planVersions.map((item) => (
            <option value={item.id} key={item.id}>
              {item.plan_name} · {item.label} · {item.duration_days} วัน + Grace {item.grace_period_days} วัน
            </option>
          ))}
        </select>
      </label>
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

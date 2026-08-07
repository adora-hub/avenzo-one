'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/browser'

export type SubscriptionNotificationRule = {
  id: string
  name_th: string
  timing_anchor: string
  offset_minutes: number
  is_enabled: boolean
}

const anchorLabels: Record<string, string> = {
  trial_ends_at: 'วันสิ้นสุดทดลองใช้',
  expires_at: 'วันหมดอายุ Subscription',
  grace_ends_at: 'วันสิ้นสุดช่วงผ่อนผัน',
}

function timingLabel(rule: SubscriptionNotificationRule) {
  const anchor = anchorLabels[rule.timing_anchor] ?? rule.timing_anchor
  if (rule.offset_minutes === 0) return `ตรงกับ${anchor}`
  const days = Math.abs(rule.offset_minutes) / 1440
  return rule.offset_minutes < 0 ? `${days} วันก่อน${anchor}` : `${days} วันหลัง${anchor}`
}

export function SubscriptionNotificationControls({ rules }: { rules: SubscriptionNotificationRule[] }) {
  const router = useRouter()
  const [busy, setBusy] = useState('')
  const [message, setMessage] = useState('')

  async function generateQueue() {
    setBusy('generate')
    setMessage('')
    const supabase = createClient()
    const { data, error } = await supabase.rpc('platform_generate_subscription_notification_queue')
    setBusy('')
    if (error) {
      setMessage(error.message.includes('platform_admin_aal2_required') ? 'กรุณายืนยัน MFA ก่อนคำนวณคิว' : error.message)
      return
    }
    setMessage(Number(data) > 0 ? `สร้างคิวใหม่ ${data} รายการ` : 'ตรวจสอบแล้ว ไม่มีรายการใหม่และไม่มีคิวซ้ำ')
    router.refresh()
  }

  async function toggleRule(rule: SubscriptionNotificationRule) {
    setBusy(rule.id)
    setMessage('')
    const supabase = createClient()
    const { error } = await supabase.rpc('platform_set_subscription_notification_rule', {
      p_rule_id: rule.id,
      p_is_enabled: !rule.is_enabled,
    })
    setBusy('')
    if (error) {
      setMessage(error.message)
      return
    }
    setMessage(rule.is_enabled ? 'ปิดกฎและยกเลิกคิวที่ยังไม่ส่งแล้ว' : 'เปิดกฎแจ้งเตือนแล้ว')
    router.refresh()
  }

  return <div className="notification-rule-manager">
    <div className="notification-toolbar">
      <div><h2>กฎแจ้งเตือน</h2><p>เปิดหรือปิดแต่ละช่วงเวลาได้ การปิดกฎจะยกเลิกคิวที่ยังไม่ส่ง</p></div>
      <button className="button" type="button" disabled={Boolean(busy)} onClick={generateQueue}>
        {busy === 'generate' ? 'กำลังคำนวณ…' : 'คำนวณคิวแจ้งเตือน'}
      </button>
    </div>
    {message ? <div className="countdown" role="status">{message}</div> : null}
    <div className="notification-rule-list">
      {rules.map((rule) => <article className="notification-rule-row" key={rule.id}>
        <div><strong>{rule.name_th}</strong><span>{timingLabel(rule)}</span></div>
        <span className={`status ${rule.is_enabled ? 'active' : 'expired'}`}>{rule.is_enabled ? 'เปิดใช้งาน' : 'ปิดใช้งาน'}</span>
        <button className={`button compact-button ${rule.is_enabled ? 'danger' : 'secondary'}`} type="button" disabled={Boolean(busy)} onClick={() => toggleRule(rule)}>
          {busy === rule.id ? 'กำลังบันทึก…' : rule.is_enabled ? 'ปิดกฎ' : 'เปิดกฎ'}
        </button>
      </article>)}
    </div>
  </div>
}

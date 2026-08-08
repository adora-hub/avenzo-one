'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/browser'

type WorkerResult = {
  runId: string | null
  mode: 'preview' | 'live'
  generated: number
  due: number
  claimed: number
  sent: number
  suppressed: number
  retrying: number
  failed: number
  errors: string[]
}

export function SubscriptionNotificationWorkerControls({ deliveryMode }: { deliveryMode: 'preview' | 'live' }) {
  const router = useRouter()
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState('')

  async function runWorker() {
    setBusy(true)
    setMessage('')
    try {
      const response = await fetch('/api/platform-admin/subscription-notifications/run', { method: 'POST' })
      const data = await response.json() as WorkerResult & { error?: string }
      if (!response.ok) throw new Error(data.error || 'worker_failed')
      setMessage(data.mode === 'preview'
        ? `โหมดตรวจสอบ: มี ${data.due} รายการถึงกำหนด โดยยังไม่ส่งอีเมล`
        : `Resend รับคำขอแล้ว ${data.sent} · ระงับก่อนส่ง ${data.suppressed} · รอลองใหม่ ${data.retrying} · ล้มเหลว ${data.failed}`)
      router.refresh()
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'ไม่สามารถประมวลผลคิวได้')
    } finally {
      setBusy(false)
    }
  }

  return <div className="notification-worker-control">
    <div>
      <strong>Delivery Worker</strong>
      <span>โหมดปัจจุบัน: {deliveryMode === 'live' ? 'ส่งอีเมลจริง' : 'ตรวจสอบเท่านั้น'}</span>
    </div>
    <button className="button" type="button" disabled={busy} onClick={runWorker}>
      {busy ? 'กำลังประมวลผล…' : deliveryMode === 'live' ? 'ประมวลผลและส่งรายการถึงกำหนด' : 'ตรวจรายการถึงกำหนด'}
    </button>
    {message ? <div className="countdown" role="status">{message}</div> : null}
  </div>
}

export function RetryNotificationButton({ queueId }: { queueId: string }) {
  const router = useRouter()
  const [busy, setBusy] = useState(false)

  async function retry() {
    setBusy(true)
    const supabase = createClient()
    const { error } = await supabase.rpc('platform_retry_subscription_notification', { p_queue_id: queueId })
    setBusy(false)
    if (!error) router.refresh()
  }

  return <button className="button secondary compact-button" type="button" disabled={busy} onClick={retry}>
    {busy ? 'กำลังตั้งค่า…' : 'ลองส่งใหม่'}
  </button>
}

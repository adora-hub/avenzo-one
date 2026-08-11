'use client'

import { useEffect, useRef, useState } from 'react'
import { createClient } from '@/lib/supabase/browser'
import {
  calculateAppSessionExpiryState,
  expiryKindToLogoutReason,
  SESSION_HEARTBEAT_MIN_INTERVAL_MS,
  touchCurrentAppSession,
  type AppSessionActivityStatus,
} from '@/lib/session-activity'
import {
  getCurrentSessionDeviceMetadata,
  updateCurrentSessionDeviceMetadata,
} from '@/lib/session-device'

const ACTIVITY_EVENTS: ReadonlyArray<keyof WindowEventMap> = [
  'focus',
  'keydown',
  'pointerdown',
  'scroll',
  'touchstart',
]

export function SessionActivityHeartbeat() {
  const [status, setStatus] = useState<AppSessionActivityStatus | null>(null)
  const [observedAtMs, setObservedAtMs] = useState(0)
  const [nowMs, setNowMs] = useState(() => Date.now())
  const [refreshing, setRefreshing] = useState(false)
  const [enforcingLogout, setEnforcingLogout] = useState(false)
  const [message, setMessage] = useState<string | null>(null)
  const forceHeartbeatRef = useRef<(() => Promise<void>) | null>(null)
  const warningVisibleRef = useRef(false)
  const logoutStartedRef = useRef(false)

  useEffect(() => {
    const supabase = createClient()
    let disposed = false
    let requestInFlight = false
    let activityPending = true
    let lastRequestAt = 0
    let deviceMetadataRecorded = false

    const sendHeartbeat = async (force = false) => {
      const now = Date.now()
      if (
        disposed
        || requestInFlight
        || document.visibilityState === 'hidden'
        || (!force && (!activityPending || now - lastRequestAt < SESSION_HEARTBEAT_MIN_INTERVAL_MS))
      ) return

      const { data: { session } } = await supabase.auth.getSession()
      if (disposed || !session) return

      if (!deviceMetadataRecorded) {
        const deviceResult = await updateCurrentSessionDeviceMetadata(
          supabase,
          getCurrentSessionDeviceMetadata(window.navigator.userAgent),
        )
        if (deviceResult.errorMessage) {
          console.warn('[session-device] metadata update failed', {
            message: deviceResult.errorMessage,
          })
        } else {
          deviceMetadataRecorded = true
          void fetch('/api/account/security/session-notifications', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ type: 'new_device_login' }),
          }).catch((error: unknown) => {
            console.warn('[session-security-email] request failed safely', {
              code: error instanceof Error ? error.name : 'unknown_error',
            })
          })
        }
      }

      requestInFlight = true
      lastRequestAt = now

      const result = await touchCurrentAppSession(supabase)
      requestInFlight = false

      if (disposed) return

      if (result.errorMessage) {
        console.warn('[session-activity] heartbeat failed', { message: result.errorMessage })
        if (force) setMessage('ยังตรวจสอบ Session ไม่สำเร็จ กรุณาลองอีกครั้ง')
        return
      }

      activityPending = false

      if (result.status) {
        const observedNow = Date.now()
        setStatus(result.status)
        setObservedAtMs(observedNow)
        setNowMs(observedNow)
      }

      if (
        result.status
        && (result.status.idleExpired || result.status.absoluteExpired || result.status.revoked)
      ) {
        console.warn('[session-activity] inactive session observed', {
          idleExpired: result.status.idleExpired,
          absoluteExpired: result.status.absoluteExpired,
          revoked: result.status.revoked,
        })
      }
    }

    forceHeartbeatRef.current = () => sendHeartbeat(true)

    const markActivity = () => {
      if (warningVisibleRef.current) return
      activityPending = true
      void sendHeartbeat()
    }

    const handleVisibilityChange = () => {
      if (document.visibilityState === 'visible') markActivity()
    }

    for (const eventName of ACTIVITY_EVENTS) {
      window.addEventListener(eventName, markActivity, { passive: true })
    }
    document.addEventListener('visibilitychange', handleVisibilityChange)

    const intervalId = window.setInterval(
      () => void sendHeartbeat(),
      SESSION_HEARTBEAT_MIN_INTERVAL_MS,
    )

    void sendHeartbeat(true)

    return () => {
      disposed = true
      forceHeartbeatRef.current = null
      window.clearInterval(intervalId)
      for (const eventName of ACTIVITY_EVENTS) {
        window.removeEventListener(eventName, markActivity)
      }
      document.removeEventListener('visibilitychange', handleVisibilityChange)
    }
  }, [])

  useEffect(() => {
    if (!status) return
    const countdownId = window.setInterval(() => setNowMs(Date.now()), 1_000)
    return () => window.clearInterval(countdownId)
  }, [status])

  const expiry = status
    ? calculateAppSessionExpiryState(status, observedAtMs, nowMs)
    : null

  useEffect(() => {
    warningVisibleRef.current = Boolean(expiry?.showWarning)
  }, [expiry?.showWarning])

  useEffect(() => {
    if (!expiry?.expired || logoutStartedRef.current) return

    logoutStartedRef.current = true
    setEnforcingLogout(true)
    const reason = expiryKindToLogoutReason(expiry.kind)

    void (async () => {
      const supabase = createClient()
      const { error } = await supabase.auth.signOut({ scope: 'local' })
      if (error) {
        console.warn('[session-activity] local sign out failed', { message: error.message })
      }
      window.location.replace(`/?session=${reason}`)
    })()
  }, [expiry?.expired, expiry?.kind])

  if (!expiry?.showWarning) return null

  const isIdleExtendable = expiry.kind === 'idle' && !expiry.expired
  const minutes = Math.floor(expiry.remainingSeconds / 60)
  const seconds = expiry.remainingSeconds % 60
  const countdown = `${minutes}:${String(seconds).padStart(2, '0')}`
  const title = expiry.expired
    ? expiry.kind === 'revoked' ? 'Session นี้ถูกยกเลิกแล้ว' : 'Session หมดอายุแล้ว'
    : isIdleExtendable ? 'Session กำลังจะหมดอายุ' : 'ใกล้ครบอายุสูงสุดของ Session'

  const handleRefresh = async () => {
    setRefreshing(true)
    setMessage(null)
    await forceHeartbeatRef.current?.()
    setRefreshing(false)
    setMessage(isIdleExtendable ? 'ต่อเวลา Session ให้แล้ว' : 'ตรวจสอบสถานะ Session ล่าสุดแล้ว')
  }

  return (
    <div className="session-expiry-backdrop" role="presentation">
      <section
        className={`session-expiry-dialog ${expiry.expired ? 'expired' : ''}`}
        role="alertdialog"
        aria-modal="true"
        aria-labelledby="session-expiry-title"
        aria-describedby="session-expiry-description"
      >
        <span className="eyebrow">ความปลอดภัยของบัญชี</span>
        <h2 id="session-expiry-title">{title}</h2>
        <p id="session-expiry-description">
          {expiry.expired
            ? 'ระบบตรวจพบว่า Session นี้ไม่สามารถใช้งานต่อได้ กำลังออกจากระบบและกลับไปหน้าเข้าสู่ระบบ'
            : isIdleExtendable
              ? 'ระบบจะออกจากบัญชีเมื่อไม่มีการใช้งานต่อเนื่อง กด “ใช้งานต่อ” เพื่อยืนยันว่าคุณยังอยู่'
              : 'Session นี้กำลังครบเวลาสูงสุดและไม่สามารถต่อเวลาได้ กรุณาบันทึกงานที่ยังค้างอยู่'}
        </p>

        {!expiry.expired ? (
          <div className="session-expiry-countdown" aria-live="polite">
            <span>เวลาที่เหลือ</span>
            <strong>{countdown}</strong>
          </div>
        ) : null}

        {message ? <p className="session-expiry-message" role="status">{message}</p> : null}

        {expiry.expired ? (
          <button className="button primary session-expiry-action" type="button" disabled>
            {enforcingLogout ? 'กำลังออกจากระบบ…' : 'กำลังตรวจสอบ Session…'}
          </button>
        ) : (
          <button
            className="button primary session-expiry-action"
            type="button"
            disabled={refreshing}
            onClick={() => void handleRefresh()}
          >
            {refreshing ? 'กำลังตรวจสอบ…' : isIdleExtendable ? 'ใช้งานต่อ' : 'ตรวจสอบสถานะอีกครั้ง'}
          </button>
        )}
        <small>ระบบใช้เวลาจาก Server เพื่อป้องกันเวลาบนอุปกรณ์คลาดเคลื่อน</small>
      </section>
    </div>
  )
}

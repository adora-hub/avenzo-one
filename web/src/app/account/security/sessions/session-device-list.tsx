'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { revokeDeviceSession, revokeOtherDeviceSessions } from './actions'

export type SessionState = 'active' | 'idle_expired' | 'absolute_expired' | 'revoked'

export type AppSessionRow = {
  app_session_id: string
  is_current: boolean
  device_label: string | null
  browser_name: string | null
  operating_system: string | null
  policy_tier: 'privileged' | 'organization'
  policy_version: number
  started_at: string
  last_seen_at: string
  idle_expires_at: string
  absolute_expires_at: string
  revoked_at: string | null
  session_state: SessionState
}

const stateLabels: Record<SessionState, { label: string; className: string; description: string }> = {
  active: { label: 'ใช้งานอยู่', className: 'active', description: 'Session นี้ยังใช้งานได้ตามนโยบายปัจจุบัน' },
  idle_expired: { label: 'หมดเวลาเพราะไม่ได้ใช้งาน', className: 'expired', description: 'Session นี้ไม่มีการใช้งานต่อเนื่องเกินเวลาที่กำหนด' },
  absolute_expired: { label: 'ครบอายุสูงสุด', className: 'expired', description: 'Session นี้ครบอายุสูงสุดและไม่สามารถต่อเวลาได้' },
  revoked: { label: 'ออกจากระบบแล้ว', className: 'canceled', description: 'Session นี้ถูกยกเลิกและไม่สามารถใช้งานต่อได้' },
}

function formatDate(value: string) {
  return new Intl.DateTimeFormat('th-TH', {
    dateStyle: 'medium',
    timeStyle: 'short',
    timeZone: 'Asia/Bangkok',
  }).format(new Date(value))
}

function policyLabel(tier: AppSessionRow['policy_tier']) {
  return tier === 'privileged' ? 'บัญชีสิทธิ์สูง' : 'บัญชีองค์กร'
}

export function SessionDeviceList({ sessions }: { sessions: AppSessionRow[] }) {
  const router = useRouter()
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [isConfirmingAll, setIsConfirmingAll] = useState(false)
  const [feedback, setFeedback] = useState<string | null>(null)
  const [isPending, startTransition] = useTransition()
  const activeOtherCount = sessions.filter((session) => !session.is_current && session.session_state === 'active').length

  function confirmRevoke(appSessionId: string) {
    setFeedback(null)
    startTransition(async () => {
      const result = await revokeDeviceSession(appSessionId)
      setFeedback(result.message)
      if (result.success) {
        setSelectedId(null)
        router.refresh()
      }
    })
  }

  function confirmRevokeAll() {
    setFeedback(null)
    startTransition(async () => {
      const result = await revokeOtherDeviceSessions()
      setFeedback(result.message)
      if (result.success) {
        setIsConfirmingAll(false)
        setSelectedId(null)
        router.refresh()
      }
    })
  }

  return (
    <div className="session-device-list">
      {feedback ? <div className="session-action-feedback" role="status">{feedback}</div> : null}
      <section className="card session-bulk-revoke-panel" aria-labelledby="revoke-other-devices-title">
        <div>
          <div className="status-title-row">
            <h2 id="revoke-other-devices-title">ออกจากระบบอุปกรณ์อื่นทั้งหมด</h2>
            <span className="status invited">{activeOtherCount} อุปกรณ์</span>
          </div>
          <p>อุปกรณ์ที่คุณกำลังใช้งานอยู่นี้จะไม่ถูกนำออกจากระบบ</p>
        </div>
        {activeOtherCount > 0 ? (
          isConfirmingAll ? (
            <div className="session-revoke-confirmation" role="group" aria-label="ยืนยันออกจากระบบอุปกรณ์อื่นทั้งหมด">
              <div>
                <strong>ยืนยันออกจากระบบอีก {activeOtherCount} อุปกรณ์หรือไม่?</strong>
                <p>ทุกอุปกรณ์อื่นจะต้อง Login ใหม่เมื่อเปิดหน้าที่มีการป้องกันครั้งถัดไป แต่อุปกรณ์นี้ยังใช้งานต่อได้</p>
              </div>
              <div className="session-revoke-actions">
                <button className="button secondary" disabled={isPending} onClick={() => setIsConfirmingAll(false)} type="button">ยกเลิก</button>
                <button className="button danger" disabled={isPending} onClick={confirmRevokeAll} type="button">
                  {isPending ? 'กำลังออกจากระบบ…' : 'ยืนยันออกจากระบบทั้งหมด'}
                </button>
              </div>
            </div>
          ) : (
            <button
              className="button danger"
              onClick={() => {
                setSelectedId(null)
                setIsConfirmingAll(true)
              }}
              type="button"
            >
              ออกจากระบบอุปกรณ์อื่นทั้งหมด
            </button>
          )
        ) : <p className="helper-text">ขณะนี้ไม่มีอุปกรณ์อื่นที่ต้องออกจากระบบ</p>}
      </section>
      {sessions.map((session) => {
        const state = stateLabels[session.session_state]
        const isConfirming = selectedId === session.app_session_id

        return (
          <article className={`card session-device-card ${session.is_current ? 'current' : ''}`} key={session.app_session_id}>
            <div className="session-device-header">
              <div>
                <div className="status-title-row">
                  <h2>{session.device_label ?? 'ไม่ทราบชื่ออุปกรณ์'}</h2>
                  {session.is_current ? <span className="status invited">อุปกรณ์นี้</span> : null}
                  <span className={`status ${state.className}`}>{state.label}</span>
                </div>
                <p>{state.description}</p>
              </div>
              <span className="session-policy-label">{policyLabel(session.policy_tier)} · Policy v{session.policy_version}</span>
            </div>

            <dl className="session-device-grid">
              <div><dt>เบราว์เซอร์</dt><dd>{session.browser_name ?? 'ยังไม่มีข้อมูล'}</dd></div>
              <div><dt>ระบบปฏิบัติการ</dt><dd>{session.operating_system ?? 'ยังไม่มีข้อมูล'}</dd></div>
              <div><dt>เข้าสู่ระบบเมื่อ</dt><dd>{formatDate(session.started_at)}</dd></div>
              <div><dt>ใช้งานล่าสุด</dt><dd>{formatDate(session.last_seen_at)}</dd></div>
              <div><dt>หมดเวลาหากไม่มีการใช้งาน</dt><dd>{formatDate(session.idle_expires_at)}</dd></div>
              <div><dt>ครบอายุสูงสุด</dt><dd>{formatDate(session.absolute_expires_at)}</dd></div>
            </dl>

            {!session.is_current && session.session_state === 'active' ? (
              isConfirming ? (
                <div className="session-revoke-confirmation" role="group" aria-label="ยืนยันออกจากระบบอุปกรณ์">
                  <div>
                    <strong>ยืนยันออกจากระบบอุปกรณ์นี้หรือไม่?</strong>
                    <p>อุปกรณ์นี้จะถูกพาออกจาก AVENZO ONE เมื่อเปิดหน้าถัดไป ส่วนอุปกรณ์ที่คุณกำลังใช้อยู่จะไม่หลุด</p>
                  </div>
                  <div className="session-revoke-actions">
                    <button className="button secondary" disabled={isPending} onClick={() => setSelectedId(null)} type="button">ยกเลิก</button>
                    <button className="button danger" disabled={isPending} onClick={() => confirmRevoke(session.app_session_id)} type="button">
                      {isPending ? 'กำลังออกจากระบบ…' : 'ยืนยันออกจากระบบ'}
                    </button>
                  </div>
                </div>
              ) : (
                <button className="button danger session-revoke-button" onClick={() => {
                  setIsConfirmingAll(false)
                  setSelectedId(session.app_session_id)
                }} type="button">
                  ออกจากระบบอุปกรณ์นี้
                </button>
              )
            ) : null}
          </article>
        )
      })}
    </div>
  )
}

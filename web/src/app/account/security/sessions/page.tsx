import Link from 'next/link'
import { redirect } from 'next/navigation'
import { SignOutButton } from '@/app/components/sign-out-button'
import { createClient } from '@/lib/supabase/server'

export const dynamic = 'force-dynamic'

type SessionState = 'active' | 'idle_expired' | 'absolute_expired' | 'revoked'

type AppSessionRow = {
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
  revoked: { label: 'ถูกยกเลิก', className: 'canceled', description: 'Session นี้ถูกยกเลิกและไม่สามารถใช้งานต่อได้' },
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

export default async function SessionDeviceManagementPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/?next=%2Faccount%2Fsecurity%2Fsessions')

  const { data, error } = await supabase.rpc('app_list_my_sessions')
  const sessions = (data ?? []) as AppSessionRow[]
  const activeCount = sessions.filter((session) => session.session_state === 'active').length

  return (
    <main className="dashboard">
      <header className="topbar">
        <div className="brand">AVENZO ONE / ความปลอดภัยของบัญชี</div>
        <div className="topbar-actions">
          <span>{user.email}</span>
          <Link className="button secondary" href="/dashboard">กลับ Dashboard</Link>
          <SignOutButton />
        </div>
      </header>

      <section className="content session-management-content">
        <div className="hero session-management-hero">
          <div>
            <div className="eyebrow">Phase 1.2.2.5.1 · Session &amp; Device Management</div>
            <h1>อุปกรณ์ที่เข้าใช้งาน</h1>
            <p>ตรวจสอบว่า Account ของคุณกำลังใช้งานอยู่บนอุปกรณ์ใด และ Session จะหมดอายุเมื่อไร</p>
          </div>
          <span className="feature-count">ใช้งานอยู่ {activeCount} Session</span>
        </div>

        <aside className="session-management-notice" aria-label="ขอบเขตการทำงานใน Phase นี้">
          <span aria-hidden="true">i</span>
          <div>
            <strong>ขั้นนี้เป็นการดูข้อมูลเท่านั้น</strong>
            <p>ยังไม่มีปุ่มออกจากระบบอุปกรณ์ การยกเลิก Session รายเครื่องจะทำใน Phase 1.2.2.5.2</p>
          </div>
        </aside>

        {error ? (
          <div className="error" role="alert">
            ยังโหลดรายการ Session ไม่สำเร็จ กรุณาตรวจสอบว่า Migration Phase 1.2.2.5.1 ถูกนำไปใช้แล้ว
          </div>
        ) : sessions.length ? (
          <div className="session-device-list">
            {sessions.map((session) => {
              const state = stateLabels[session.session_state]
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
                </article>
              )
            })}
          </div>
        ) : (
          <div className="empty">ยังไม่มีข้อมูล Session สำหรับบัญชีนี้ กรุณาออกจากระบบแล้ว Login ใหม่หนึ่งครั้ง</div>
        )}

        <aside className="session-privacy-note">
          <strong>ข้อมูลที่ระบบไม่แสดง</strong>
          <p>หน้านี้ไม่แสดง Access Token, Refresh Token, Session ID ดิบ หรือ IP Address</p>
        </aside>
      </section>
    </main>
  )
}

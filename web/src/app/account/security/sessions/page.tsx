import Link from 'next/link'
import { redirect } from 'next/navigation'
import { SignOutButton } from '@/app/components/sign-out-button'
import { createClient } from '@/lib/supabase/server'
import { SessionDeviceList, type AppSessionRow } from './session-device-list'
import { SessionSecurityActivity, type SessionSecurityActivityRow } from './session-security-activity'

export const dynamic = 'force-dynamic'

export default async function SessionDeviceManagementPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/?next=%2Faccount%2Fsecurity%2Fsessions')

  const [sessionResult, activityResult] = await Promise.all([
    supabase.rpc('app_list_my_sessions'),
    supabase.rpc('app_list_my_session_security_activity', { p_limit: 20 }),
  ])
  const sessions = (sessionResult.data ?? []) as AppSessionRow[]
  const activities = (activityResult.data ?? []) as SessionSecurityActivityRow[]
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
            <div className="eyebrow">Phase 1.2.2.5.4 · Session &amp; Device Management</div>
            <h1>อุปกรณ์ที่เข้าใช้งาน</h1>
            <p>ตรวจสอบอุปกรณ์ที่ใช้ Account ของคุณ และออกจากระบบอุปกรณ์ที่ไม่รู้จักได้อย่างปลอดภัย</p>
          </div>
          <span className="feature-count">ใช้งานอยู่ {activeCount} Session</span>
        </div>

        <aside className="session-management-notice" aria-label="คำแนะนำความปลอดภัย">
          <span aria-hidden="true">i</span>
          <div>
            <strong>ตัดได้เฉพาะ Session ของบัญชีคุณ</strong>
            <p>ระบบไม่อนุญาตให้ปุ่มนี้ตัดอุปกรณ์ปัจจุบัน และทุกคำสั่งจะถูกบันทึกใน Audit Log</p>
          </div>
        </aside>

        {sessionResult.error ? (
          <div className="error" role="alert">
            ยังโหลดรายการ Session ไม่สำเร็จ กรุณาตรวจสอบว่า Migration ของ Session Management ถูกนำไปใช้ครบแล้ว
          </div>
        ) : sessions.length ? (
          <SessionDeviceList sessions={sessions} />
        ) : (
          <div className="empty">ยังไม่มีข้อมูล Session สำหรับบัญชีนี้ กรุณาออกจากระบบแล้ว Login ใหม่หนึ่งครั้ง</div>
        )}

        <SessionSecurityActivity
          activities={activities}
          errorMessage={activityResult.error
            ? 'ยังโหลดประวัติกิจกรรมไม่สำเร็จ กรุณาตรวจสอบว่า Migration Phase 1.2.2.5.4 ถูกนำไปใช้แล้ว'
            : undefined}
        />

        <aside className="session-privacy-note">
          <strong>ข้อมูลที่ระบบไม่แสดง</strong>
          <p>หน้านี้ไม่แสดง Access Token, Refresh Token, Session ID ดิบ, User ID, Event Metadata หรือ IP Address</p>
        </aside>
      </section>
    </main>
  )
}

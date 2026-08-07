import Link from 'next/link'
import { redirect } from 'next/navigation'
import { SignOutButton } from '@/app/components/sign-out-button'
import { SubscriptionNotificationControls, type SubscriptionNotificationRule } from '@/app/components/subscription-notification-controls'
import { RetryNotificationButton, SubscriptionNotificationWorkerControls } from '@/app/components/subscription-notification-worker-controls'
import { createClient } from '@/lib/supabase/server'

const PAGE_SIZE = 10

const queueStatusLabels: Record<string, string> = {
  pending: 'รอถึงเวลาส่ง',
  processing: 'กำลังส่ง',
  sent: 'ส่งสำเร็จ',
  failed: 'ส่งไม่สำเร็จ',
  canceled: 'ยกเลิกแล้ว',
}

const deliveryOutcomeLabels: Record<string, string> = {
  sent: 'ส่งสำเร็จ',
  retrying: 'รอลองใหม่',
  failed: 'หยุดหลังลองครบ',
}

function formatDate(value: string, timezone = 'Asia/Bangkok') {
  return new Intl.DateTimeFormat('th-TH', { dateStyle: 'medium', timeStyle: 'short', timeZone: timezone }).format(new Date(value))
}

function pageHref(page: number) {
  return `/platform-admin/subscription-notifications${page > 1 ? `?queue_page=${page}` : ''}`
}

export default async function SubscriptionNotificationsPage({ searchParams }: {
  searchParams: Promise<{ queue_page?: string }>
}) {
  const query = await searchParams
  const requestedPage = Math.max(1, Number.parseInt(query.queue_page ?? '1', 10) || 1)
  const from = (requestedPage - 1) * PAGE_SIZE
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/?next=/platform-admin/subscription-notifications')

  const [platformAdminResult, assuranceResult] = await Promise.all([
    supabase.from('platform_admins').select('status').eq('user_id', user.id).maybeSingle(),
    supabase.auth.mfa.getAuthenticatorAssuranceLevel(),
  ])
  if (platformAdminResult.data?.status !== 'active') redirect('/dashboard')
  if (assuranceResult.data?.currentLevel !== 'aal2') redirect('/auth/mfa?next=/platform-admin/subscription-notifications')

  const [rulesResult, queueResult, organizationsResult, deliveriesResult] = await Promise.all([
    supabase.from('subscription_notification_rules').select('id, name_th, timing_anchor, offset_minutes, is_enabled').order('timing_anchor').order('offset_minutes'),
    supabase.from('subscription_notification_queue').select('id, rule_id, organization_id, subscription_id, recipient_user_id, scheduled_for, next_attempt_at, status, attempt_count, max_attempts, provider_message_id, last_error, created_at', { count: 'exact' }).order('scheduled_for', { ascending: true }).range(from, from + PAGE_SIZE - 1),
    supabase.from('organizations').select('id, name, timezone'),
    supabase.from('subscription_notification_deliveries').select('id, queue_id, attempt_number, outcome, provider_message_id, error_code, error_message, started_at, finished_at').order('created_at', { ascending: false }).limit(20),
  ])

  const rules = (rulesResult.data ?? []) as SubscriptionNotificationRule[]
  const queue = queueResult.data ?? []
  const deliveries = deliveriesResult.data ?? []
  const rulesById = new Map(rules.map((rule) => [rule.id, rule]))
  const organizationsById = new Map((organizationsResult.data ?? []).map((organization) => [organization.id, organization]))
  const totalCount = queueResult.count ?? 0
  const totalPages = Math.max(1, Math.ceil(totalCount / PAGE_SIZE))
  const currentPage = Math.min(requestedPage, totalPages)
  if (requestedPage !== currentPage) redirect(pageHref(currentPage))
  const pageNumbers = Array.from(new Set([1, totalPages, currentPage - 1, currentPage, currentPage + 1].filter((page) => page >= 1 && page <= totalPages))).sort((a, b) => a - b)
  const firstError = [rulesResult, queueResult, organizationsResult, deliveriesResult].find((result) => result.error)?.error
  const deliveryMode = process.env.SUBSCRIPTION_NOTIFICATION_DELIVERY_MODE === 'live' ? 'live' : 'preview'

  return <main className="dashboard">
    <header className="topbar">
      <div className="brand">AVENZO ONE / Subscription Notifications</div>
      <div className="topbar-actions"><span>{user.email}</span><SignOutButton /></div>
    </header>
    <section className="content notification-content">
      <div className="hero">
        <div><div className="eyebrow">Phase 1.0.5.2</div><h1>แจ้งเตือน Subscription</h1><p>ตั้งกฎ ตรวจคิว และติดตามการส่งอีเมลแบบป้องกันรายการซ้ำ</p></div>
        <Link className="button secondary" href="/platform-admin">กลับ Platform Admin</Link>
      </div>
      {firstError ? <div className="error">ไม่สามารถอ่านข้อมูลแจ้งเตือนได้: {firstError.message}</div> : <>
        <section className="card"><SubscriptionNotificationControls rules={rules} /></section>
        <section className="card"><SubscriptionNotificationWorkerControls deliveryMode={deliveryMode} /></section>
        <section className="subscription-management-section">
          <div className="feature-list-heading"><div><div className="eyebrow">QUEUE PREVIEW</div><h2>คิวแจ้งเตือน</h2><p>แสดงหน้าละ {PAGE_SIZE} รายการ ผู้รับคือ Owner ที่ยังใช้งานอยู่</p></div><span className="feature-count">{totalCount} รายการ</span></div>
          {queue.length ? <div className="notification-queue-wrap"><table className="notification-queue-table">
            <thead><tr><th>กำหนดส่ง</th><th>Organization</th><th>เหตุการณ์</th><th>ผู้รับ</th><th>สถานะ</th></tr></thead>
            <tbody>{queue.map((item) => {
              const organization = organizationsById.get(item.organization_id)
              const rule = rulesById.get(item.rule_id)
              return <tr key={item.id}>
                <td><strong>{formatDate(item.scheduled_for, organization?.timezone)}</strong><small>สร้าง {formatDate(item.created_at, organization?.timezone)}</small></td>
                <td><strong>{organization?.name ?? item.organization_id}</strong></td>
                <td>{rule?.name_th ?? 'ไม่พบกฎ'}</td>
                <td><strong>Owner</strong><small>{item.recipient_user_id}</small></td>
                <td><span className={`status ${item.status}`}>{queueStatusLabels[item.status] ?? item.status}</span><small>ลองแล้ว {item.attempt_count}/{item.max_attempts} ครั้ง</small>{item.provider_message_id ? <small>Resend: {item.provider_message_id}</small> : null}{item.last_error ? <small>{item.last_error}</small> : null}{item.status === 'failed' ? <RetryNotificationButton queueId={item.id} /> : null}</td>
              </tr>
            })}</tbody>
          </table></div> : <div className="empty">ยังไม่มีคิว กด “คำนวณคิวแจ้งเตือน” เพื่อสร้างรายการทดลอง</div>}
          {totalPages > 1 ? <nav className="pagination" aria-label="หน้าคิวแจ้งเตือน">
            <Link className={`pagination-link ${currentPage <= 1 ? 'disabled' : ''}`} href={pageHref(Math.max(1, currentPage - 1))}>ก่อนหน้า</Link>
            {pageNumbers.map((page, index) => <span className="pagination-number-wrap" key={page}>{index > 0 && pageNumbers[index - 1] < page - 1 ? <span>…</span> : null}<Link className={`pagination-link ${page === currentPage ? 'current' : ''}`} href={pageHref(page)}>{page}</Link></span>)}
            <Link className={`pagination-link ${currentPage >= totalPages ? 'disabled' : ''}`} href={pageHref(Math.min(totalPages, currentPage + 1))}>ถัดไป</Link>
            <form className="pagination-jump" method="get"><label>ไปหน้าที่ <input name="queue_page" type="number" min="1" max={totalPages} defaultValue={currentPage} /></label><button className="button secondary" type="submit">ไป</button></form>
          </nav> : null}
        </section>
        <section className="subscription-management-section">
          <div className="feature-list-heading"><div><div className="eyebrow">DELIVERY LOG</div><h2>ประวัติการส่งล่าสุด</h2><p>เก็บผลทุกครั้งโดยไม่บันทึกอีเมลผู้รับซ้ำใน Log</p></div><span className="feature-count">{deliveries.length} รายการล่าสุด</span></div>
          {deliveries.length ? <div className="notification-queue-wrap"><table className="notification-queue-table">
            <thead><tr><th>เสร็จเมื่อ</th><th>Queue ID</th><th>ครั้งที่</th><th>ผลลัพธ์</th><th>รายละเอียด</th></tr></thead>
            <tbody>{deliveries.map((delivery) => <tr key={delivery.id}>
              <td><strong>{formatDate(delivery.finished_at)}</strong></td>
              <td><small>{delivery.queue_id}</small></td>
              <td>{delivery.attempt_number}</td>
              <td><span className={`status ${delivery.outcome}`}>{deliveryOutcomeLabels[delivery.outcome] ?? delivery.outcome}</span></td>
              <td>{delivery.provider_message_id ? <small>Resend: {delivery.provider_message_id}</small> : null}{delivery.error_code ? <small>{delivery.error_code}</small> : null}{delivery.error_message ? <small>{delivery.error_message}</small> : null}</td>
            </tr>)}</tbody>
          </table></div> : <div className="empty">ยังไม่มีประวัติการส่ง เพราะไม่มีรายการที่ถึงกำหนดหรือระบบยังอยู่ในโหมดตรวจสอบ</div>}
        </section>
      </>}
    </section>
  </main>
}

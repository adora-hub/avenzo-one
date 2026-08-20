import { redirect } from 'next/navigation'
import Link from 'next/link'
import type { CSSProperties } from 'react'
import { createClient } from '@/lib/supabase/server'
import { ApplicationShell } from '../components/application-shell'
import { SubscriptionLifecycleActions } from '../components/subscription-lifecycle-actions'
import { SubscriptionProvisionForm, type ActivePlanPrice, type ActivePlanVersion } from '../components/subscription-provision-form'
import { getSubscriptionDisplayStatus, subscriptionEventLabels, subscriptionStatusLabels } from '../components/subscription-labels'

const HISTORY_PAGE_SIZE = 10

function statusLabel(status: string) {
  if (status === 'active') return 'ใช้งานปกติ'
  if (status === 'suspended') return 'พักการใช้งานชั่วคราว'
  if (status === 'canceled') return 'ยกเลิกแล้ว'
  return status || 'ไม่เคยมีสถานะ'
}

function formatDate(value: string, timezone = 'Asia/Bangkok') {
  return new Intl.DateTimeFormat('th-TH', { dateStyle: 'medium', timeStyle: 'short', timeZone: timezone }).format(new Date(value))
}

export default async function PlatformAdminPage({ searchParams }: {
  searchParams: Promise<{ history_page?: string }>
}) {
  const query = await searchParams
  const requestedPage = Math.max(1, Number.parseInt(query.history_page ?? '1', 10) || 1)
  const historyFrom = (requestedPage - 1) * HISTORY_PAGE_SIZE
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/')

  const [platformAdminResult, assuranceResult] = await Promise.all([
    supabase.from('platform_admins').select('status').eq('user_id', user.id).maybeSingle(),
    supabase.auth.mfa.getAuthenticatorAssuranceLevel(),
  ])
  if (platformAdminResult.data?.status !== 'active') redirect('/dashboard')
  if (assuranceResult.data?.nextLevel === 'aal2' && assuranceResult.data.currentLevel !== 'aal2') redirect('/auth/mfa?next=/platform-admin')

  const [organizationsResult, plansResult, planVersionsResult, planPricesResult, subscriptionsResult, entitlementsResult, eventsResult, invoicesResult, transferReviewResult, transferFulfillmentResult, platformAdminsCountResult] = await Promise.all([
    supabase.from('organizations').select('id, name, slug, timezone, currency, status, updated_at').order('updated_at', { ascending: false }),
    supabase.from('subscription_plans').select('code, name, duration_days, grace_period_days').order('name'),
    supabase.from('subscription_plan_versions').select('id, plan_code, label, duration_days, grace_period_days, lifecycle_status').order('label'),
    supabase.from('subscription_plan_prices').select('id, plan_version_id, billing_interval, amount, currency, trial_days').eq('is_active', true).order('amount'),
    supabase.from('organization_subscriptions').select('id, organization_id, plan_code, plan_version_id, lifecycle_status, starts_at, expires_at, grace_ends_at, canceled_at, metadata, updated_at').order('updated_at', { ascending: false }),
    supabase.from('organization_branch_entitlements').select('organization_id, current_count, max_count'),
    supabase.from('subscription_events').select('id, organization_id, subscription_id, event_type, previous_status, new_status, reason, metadata, performed_by, created_at', { count: 'exact' }).order('created_at', { ascending: false }).range(historyFrom, historyFrom + HISTORY_PAGE_SIZE - 1),
    supabase.from('billing_invoices').select('id, status, total_amount, currency, due_at, issued_at').order('issued_at', { ascending: false }).limit(500),
    supabase.rpc('platform_billing_transfer_proof_review_queue'),
    supabase.rpc('platform_billing_transfer_fulfillment_queue_v2'),
    supabase.from('platform_admins').select('id', { count: 'exact', head: true }).eq('status', 'active'),
  ])

  const organizations = organizationsResult.data ?? []
  const plans = plansResult.data ?? []
  const plansByCode = new Map(plans.map((plan) => [plan.code, plan]))
  const organizationsById = new Map(organizations.map((organization) => [organization.id, organization]))
  const versionRows = planVersionsResult.data ?? []
  const versionsById = new Map(versionRows.map((version) => [version.id, version]))
  const planVersions: ActivePlanVersion[] = versionRows.flatMap((version) => {
    const plan = plansByCode.get(version.plan_code)
    return plan && version.lifecycle_status === 'active'
      ? [{ id: version.id, plan_code: version.plan_code, plan_name: plan.name, label: version.label, duration_days: version.duration_days, grace_period_days: version.grace_period_days }]
      : []
  })
  const planPrices: ActivePlanPrice[] = (planPricesResult.data ?? []).map((price) => ({ ...price, amount: Number(price.amount) }))
  const entitlementsByOrg = new Map((entitlementsResult.data ?? []).map((item) => [item.organization_id, item]))
  const currentRows = (subscriptionsResult.data ?? []).filter((item) => item.lifecycle_status === 'active' || item.lifecycle_status === 'suspended')
  const currentOrganizationIds = new Set(currentRows.map((item) => item.organization_id))
  const provisionableOrganizations = organizations.filter((organization) => !currentOrganizationIds.has(organization.id))
  const currentSubscriptions = currentRows.flatMap((item) => {
    const organization = organizationsById.get(item.organization_id)
    const plan = plansByCode.get(item.plan_code)
    const version = item.plan_version_id ? versionsById.get(item.plan_version_id) : null
    if (!organization || !plan || !version || !item.plan_version_id) return []
    return [{
      ...item,
      metadata: (item.metadata ?? {}) as Record<string, unknown>,
      organization_name: organization.name,
      organization_slug: organization.slug,
      timezone: organization.timezone,
      plan_name: plan.name,
      plan_version_id: item.plan_version_id,
      plan_version_label: version.label,
    }]
  })
  const history = eventsResult.data ?? []
  const historyCount = eventsResult.count ?? 0
  const totalPages = Math.max(1, Math.ceil(historyCount / HISTORY_PAGE_SIZE))
  const pageNumbers = Array.from(new Set([
    1,
    totalPages,
    requestedPage - 2,
    requestedPage - 1,
    requestedPage,
    requestedPage + 1,
    requestedPage + 2,
  ].filter((page) => page >= 1 && page <= totalPages))).sort((left, right) => left - right)

  const now = new Date()
  const allSubscriptions = subscriptionsResult.data ?? []
  const allInvoices = (invoicesResult.data ?? []).map((invoice) => ({ ...invoice, total_amount: Number(invoice.total_amount) }))
  const paidInvoices = allInvoices.filter((invoice) => invoice.status === 'paid')
  const pendingInvoices = allInvoices.filter((invoice) => invoice.status === 'pending')
  const otherInvoices = allInvoices.filter((invoice) => invoice.status !== 'paid' && invoice.status !== 'pending')
  const overdueInvoices = pendingInvoices.filter((invoice) => invoice.due_at && new Date(invoice.due_at) < now)
  const paidRevenue = paidInvoices.reduce((sum, invoice) => sum + invoice.total_amount, 0)
  const invoiceTotal = Math.max(1, allInvoices.length)
  const paidShare = Math.round((paidInvoices.length / invoiceTotal) * 100)
  const pendingShare = Math.round((pendingInvoices.length / invoiceTotal) * 100)
  const otherShare = Math.max(0, 100 - paidShare - pendingShare)
  const suspendedSubscriptions = allSubscriptions.filter((subscription) => subscription.lifecycle_status === 'suspended')
  const activeSubscriptions = allSubscriptions.filter((subscription) => subscription.lifecycle_status === 'active')
  const reviewQueueCount = Array.isArray(transferReviewResult.data) ? transferReviewResult.data.length : 0
  const fulfillmentQueueCount = Array.isArray(transferFulfillmentResult.data) ? transferFulfillmentResult.data.length : 0
  const approvalQueueCount = reviewQueueCount + fulfillmentQueueCount
  const activeOrganizationCount = organizations.filter((organization) => organization.status === 'active').length
  const updateTimestamps = [
    ...organizations.map((organization) => organization.updated_at),
    ...allSubscriptions.map((subscription) => subscription.updated_at),
    ...allInvoices.map((invoice) => invoice.issued_at),
  ].filter((value): value is string => Boolean(value)).sort()
  const latestUpdatedAt = updateTimestamps[updateTimestamps.length - 1]
  const dashboardAlerts = [
    overdueInvoices.length ? { tone: 'danger', title: 'Invoice เกินกำหนดชำระ', detail: `${overdueInvoices.length} รายการต้องติดตาม`, href: '/platform-admin/billing' } : null,
    suspendedSubscriptions.length ? { tone: 'warning', title: 'Subscription ถูกพักใช้งาน', detail: `${suspendedSubscriptions.length} องค์กร`, href: '#subscription-operations' } : null,
    approvalQueueCount ? { tone: 'info', title: 'คิวอนุมัติรอดำเนินการ', detail: `${approvalQueueCount} รายการ`, href: '/platform-admin/billing/transfer-proofs' } : null,
  ].filter((alert): alert is { tone: string; title: string; detail: string; href: string } => Boolean(alert))

  return (
    <ApplicationShell email={user.email ?? ''} isPlatformAdmin section="platform">
      <section className="content platform-subscription-content">
        <section className="operations-overview" aria-labelledby="operations-overview-title">
          <div className="operations-overview-heading">
            <div>
              <div className="eyebrow">OPERATIONS OVERVIEW</div>
              <h1 id="operations-overview-title">ภาพรวมการดำเนินงาน</h1>
              <p>ติดตามสิ่งที่ต้องจัดการ รายรับ และความพร้อมของแพลตฟอร์มจากข้อมูลล่าสุดในระบบ</p>
            </div>
            <div className="overview-freshness" title="เวลาล่าสุดจากข้อมูลที่หน้า Overview โหลดได้">
              <span aria-hidden="true">↻</span>
              <span>อัปเดตล่าสุด<br /><strong>{latestUpdatedAt ? formatDate(latestUpdatedAt) : 'ยังไม่มีข้อมูล'}</strong></span>
            </div>
          </div>

          <div className="operations-grid operations-grid-top">
            <article className="operations-panel alert-panel">
              <div className="operations-panel-heading"><h2>ศูนย์แจ้งเตือน</h2><span className={`overview-count ${dashboardAlerts.length ? 'danger' : 'success'}`}>{dashboardAlerts.length}</span></div>
              {dashboardAlerts.length ? <div className="overview-list">{dashboardAlerts.map((alert) => <Link className="overview-list-row" href={alert.href} key={alert.title}>
                <span className={`overview-indicator ${alert.tone}`} aria-hidden="true">!</span><span><strong>{alert.title}</strong><small>{alert.detail}</small></span><span aria-hidden="true">›</span>
              </Link>)}</div> : <div className="overview-empty"><span>✓</span><strong>ไม่มีรายการเร่งด่วน</strong><small>สถานะสำคัญอยู่ในเกณฑ์ปกติ</small></div>}
            </article>

            <article className="operations-panel approval-panel">
              <div className="operations-panel-heading"><h2>คิวอนุมัติ</h2><span className={`overview-count ${approvalQueueCount ? 'warning' : 'success'}`}>{approvalQueueCount}</span></div>
              <div className="overview-stat-pair"><div><span>รอตรวจหลักฐาน</span><strong>{reviewQueueCount}</strong></div><div><span>รอยืนยันรับชำระ</span><strong>{fulfillmentQueueCount}</strong></div></div>
              <Link className="operations-panel-link" href="/platform-admin/billing/transfer-proofs">เปิดคิวอนุมัติ <span aria-hidden="true">›</span></Link>
            </article>

            <article className="operations-panel billing-panel">
              <div className="operations-panel-heading"><h2>สถานะ Billing</h2><Link href="/platform-admin/billing" aria-label="เปิด Billing">›</Link></div>
              <div className="billing-summary"><div><span>รายได้ที่รับแล้ว (THB)</span><strong>{new Intl.NumberFormat('th-TH', { style: 'currency', currency: 'THB', maximumFractionDigits: 0 }).format(paidRevenue)}</strong><small>จาก Invoice ที่สถานะชำระแล้ว</small></div><div><span>Invoice ที่รอชำระ</span><strong>{pendingInvoices.length}</strong><small>{overdueInvoices.length ? `${overdueInvoices.length} รายการเกินกำหนด` : 'ไม่มีรายการเกินกำหนด'}</small></div></div>
              <div className="billing-distribution">
                <div className="billing-donut" style={{ '--paid-share': `${paidShare * 3.6}deg`, '--pending-share': `${(paidShare + pendingShare) * 3.6}deg` } as CSSProperties}><span><strong>{allInvoices.length}</strong><small>Invoice</small></span></div>
                <ul><li><span className="dot paid" />ชำระแล้ว <strong>{paidInvoices.length} ({paidShare}%)</strong></li><li><span className="dot pending" />รอชำระ <strong>{pendingInvoices.length} ({pendingShare}%)</strong></li><li><span className="dot other" />สถานะอื่น <strong>{otherInvoices.length} ({otherShare}%)</strong></li></ul>
              </div>
            </article>
          </div>

          <div className="operations-grid operations-grid-bottom">
            <article className="operations-panel health-panel">
              <div className="operations-panel-heading"><h2>ความพร้อมระบบ</h2><Link href="/platform-admin/billing/readiness" aria-label="เปิดหน้าตรวจความพร้อม">›</Link></div>
              <div className="health-list">
                <div><span className={`health-dot ${organizationsResult.error ? 'danger' : 'success'}`} /><span>ฐานข้อมูลและองค์กร</span><strong>{organizationsResult.error ? 'ต้องตรวจสอบ' : 'ปกติ'}</strong></div>
                <div><span className={`health-dot ${invoicesResult.error ? 'danger' : 'success'}`} /><span>Billing Service</span><strong>{invoicesResult.error ? 'ต้องตรวจสอบ' : 'ปกติ'}</strong></div>
                <div><span className={`health-dot ${transferReviewResult.error ? 'danger' : 'success'}`} /><span>คิวตรวจหลักฐาน</span><strong>{transferReviewResult.error ? 'ต้องตรวจสอบ' : 'ปกติ'}</strong></div>
                <div><span className="health-dot neutral" /><span>Uptime Monitoring</span><strong>ยังไม่ได้เชื่อม</strong></div>
              </div>
            </article>

            <article className="operations-panel usage-panel">
              <div className="operations-panel-heading"><h2>การใช้งานแพลตฟอร์ม</h2></div>
              <div className="usage-metrics"><div><span>องค์กรทั้งหมด</span><strong>{organizations.length}</strong><small>{activeOrganizationCount} เปิดใช้งาน</small></div><div><span>Subscription ใช้งาน</span><strong>{activeSubscriptions.length}</strong><small>{suspendedSubscriptions.length} พักชั่วคราว</small></div><div><span>Platform Admin</span><strong>{platformAdminsCountResult.count ?? '—'}</strong><small>บัญชีที่เปิดใช้งาน</small></div></div>
              <div className="usage-bars" aria-label="สัดส่วนองค์กรและ Subscription ที่เปิดใช้งาน">
                <div><span>องค์กรเปิดใช้งาน</span><i><b style={{ width: `${organizations.length ? Math.round(activeOrganizationCount / organizations.length * 100) : 0}%` }} /></i><strong>{organizations.length ? Math.round(activeOrganizationCount / organizations.length * 100) : 0}%</strong></div>
                <div><span>Subscription ใช้งาน</span><i><b style={{ width: `${allSubscriptions.length ? Math.round(activeSubscriptions.length / allSubscriptions.length * 100) : 0}%` }} /></i><strong>{allSubscriptions.length ? Math.round(activeSubscriptions.length / allSubscriptions.length * 100) : 0}%</strong></div>
              </div>
            </article>

            <article className="operations-panel quick-actions-panel">
              <div className="operations-panel-heading"><h2>งานด่วน</h2></div>
              <div className="quick-actions-grid"><Link href="/platform-admin/access"><span>＋</span><strong>เพิ่มผู้ดูแล</strong></Link><Link href="/platform-admin/plans"><span>◇</span><strong>จัดการ Plan</strong></Link><Link href="/platform-admin/billing"><span>▤</span><strong>ออก Invoice</strong></Link><Link href="/platform-admin/billing/transfer-proofs"><span>✓</span><strong>ตรวจหลักฐาน</strong></Link><Link href="/platform-admin/subscription-notifications"><span>◉</span><strong>การแจ้งเตือน</strong></Link><Link href="/platform-admin/security/mfa"><span>⌾</span><strong>ความปลอดภัย</strong></Link></div>
            </article>
          </div>

          <div className="operations-foundation">
            <div><span className="foundation-icon">⌾</span><span><strong>สถานะความปลอดภัย</strong><small>MFA ระดับ AAL2 พร้อมใช้งาน</small></span></div>
            <div><span className="foundation-icon">▣</span><span><strong>ที่จัดเก็บข้อมูล</strong><small>Supabase Project ของ AVENZO ONE</small></span></div>
            <div><span className="foundation-icon">◷</span><span><strong>เวลาทำงานของระบบ</strong><small>ยังไม่ได้เชื่อมบริการ Monitoring</small></span></div>
          </div>
        </section>

        <div id="subscription-operations" className="section-divider-heading"><span>SUBSCRIPTION OPERATIONS</span><h2>จัดการ Subscription</h2><p>งานควบคุม Subscription รายองค์กรและประวัติการเปลี่ยนแปลง</p></div>
        <div className="hero">
          <div><div className="eyebrow">Control Plane</div><h1>จัดการ Subscription</h1><p>ตรวจสอบสิทธิ์ ต่ออายุ พัก เปิดต่อ หรือยกเลิก พร้อมประวัติภาษาไทย</p></div>
          <div className="platform-admin-actions"><Link className="button secondary" href="/platform-admin/access">จัดการ Platform Admin</Link><Link className="button secondary" href="/platform-admin/features">Feature Catalog</Link><Link className="button secondary" href="/platform-admin/plans">Plans &amp; Prices</Link><Link className="button secondary" href="/platform-admin/billing">Billing &amp; Invoice</Link><Link className="button secondary" href="/platform-admin/subscription-notifications">แจ้งเตือน Subscription</Link><Link className="button secondary" href="/platform-admin/security/mfa">ตั้งค่า MFA</Link></div>
        </div>

        <section className="subscription-management-section">
          <div className="feature-list-heading"><div><div className="eyebrow">CURRENT</div><h2>Subscription ปัจจุบัน</h2><p>สถานะคำนวณจากวันจริงของระบบ</p></div><span className="feature-count">{currentSubscriptions.length} รายการ</span></div>
          {currentSubscriptions.length ? <div className="subscription-management-list">{currentSubscriptions.map((subscription) => {
            const displayStatus = getSubscriptionDisplayStatus(subscription)
            const status = subscriptionStatusLabels[displayStatus]
            const entitlement = entitlementsByOrg.get(subscription.organization_id)
            return (
              <article className="card subscription-management-card" key={subscription.id}>
                <div className="subscription-management-header">
                  <div><div className="status-title-row"><h3>{subscription.organization_name}</h3><span className={`subscription-state ${displayStatus}`}>{status.label}</span></div><p className="meta">/{subscription.organization_slug}</p></div>
                  <div className="subscription-plan-highlight"><span>Plan</span><strong>{subscription.plan_name}</strong><small>{subscription.plan_version_label}</small></div>
                </div>
                <p className="subscription-status-description">{status.description}{displayStatus === 'grace' ? ` ใช้งานได้ถึง ${formatDate(subscription.grace_ends_at, subscription.timezone)}` : ''}</p>
                <dl className="subscription-overview-grid">
                  <div><dt>เริ่มต้น</dt><dd>{formatDate(subscription.starts_at, subscription.timezone)}</dd></div>
                  <div><dt>หมดอายุ</dt><dd>{formatDate(subscription.expires_at, subscription.timezone)}</dd></div>
                  <div><dt>สิ้นสุดช่วงผ่อนผัน</dt><dd>{formatDate(subscription.grace_ends_at, subscription.timezone)}</dd></div>
                  <div><dt>การใช้งานสาขา</dt><dd>{entitlement ? `${entitlement.current_count} / ${entitlement.max_count ?? 'ไม่จำกัด'} สาขา` : 'ยังไม่มีข้อมูลสิทธิ์'}</dd></div>
                </dl>
                <details className="subscription-action-panel"><summary>จัดการ Subscription นี้</summary><SubscriptionLifecycleActions key={`${subscription.id}:${subscription.lifecycle_status}:${subscription.updated_at}`} subscription={subscription} planVersions={planVersions} planPrices={planPrices} /></details>
              </article>
            )
          })}</div> : <div className="empty">ยังไม่มี Subscription ที่กำลังใช้งานหรือพักอยู่</div>}
        </section>

        <section className="subscription-management-section">
          <div className="feature-list-heading"><div><div className="eyebrow">NEW</div><h2>เริ่ม Subscription ใหม่</h2><p>แสดงเฉพาะ Organization ที่ยังไม่มี Subscription ปัจจุบัน</p></div></div>
          <div className="card"><SubscriptionProvisionForm organizations={provisionableOrganizations} planVersions={planVersions} planPrices={planPrices} /></div>
        </section>

        <section className="subscription-management-section">
          <div className="feature-list-heading"><div><div className="eyebrow">HISTORY</div><h2>ประวัติ Subscription</h2><p>เก็บทุกการเริ่ม ต่ออายุ ปรับ พัก เปิดต่อ และยกเลิก</p></div><span className="feature-count">{historyCount} รายการ</span></div>
          {history.length ? <div className="subscription-history-list">{history.map((event) => {
            const organization = organizationsById.get(event.organization_id)
            return <article className="subscription-history-row" key={event.id}>
              <div><strong>{subscriptionEventLabels[event.event_type] ?? event.event_type}</strong><span>{organization?.name ?? event.organization_id}</span></div>
              <div><span className="history-label">เปลี่ยนสถานะ</span><strong>{statusLabel(event.previous_status ?? '')} → {statusLabel(event.new_status)}</strong></div>
              <div><span className="history-label">เหตุผล</span><strong>{event.reason}</strong></div>
              <time>{formatDate(event.created_at, organization?.timezone)}</time>
            </article>
          })}</div> : <div className="empty">ยังไม่มีประวัติ Subscription</div>}
          {totalPages > 1 && <nav className="pagination" aria-label="หน้าประวัติ Subscription">
            <Link className={`button secondary ${requestedPage <= 1 ? 'is-disabled' : ''}`} href={`?history_page=${Math.max(1, requestedPage - 1)}`}>ก่อนหน้า</Link>
            {pageNumbers.map((page, index) => <span key={page} className="pagination-number-wrap">{index > 0 && pageNumbers[index - 1] < page - 1 && <span>…</span>}<Link className={`pagination-number ${page === requestedPage ? 'active' : ''}`} href={`?history_page=${page}`}>{page}</Link></span>)}
            <Link className={`button secondary ${requestedPage >= totalPages ? 'is-disabled' : ''}`} href={`?history_page=${Math.min(totalPages, requestedPage + 1)}`}>ถัดไป</Link>
            <form className="pagination-jump" method="get"><label>ไปหน้าที่<input name="history_page" type="number" min="1" max={totalPages} defaultValue={requestedPage} /></label><button className="button secondary" type="submit">ไป</button></form>
          </nav>}
        </section>
      </section>
    </ApplicationShell>
  )
}

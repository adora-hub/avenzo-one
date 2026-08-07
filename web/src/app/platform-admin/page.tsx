import { redirect } from 'next/navigation'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/server'
import { SignOutButton } from '../components/sign-out-button'
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

  const [organizationsResult, plansResult, planVersionsResult, planPricesResult, subscriptionsResult, entitlementsResult, eventsResult] = await Promise.all([
    supabase.from('organizations').select('id, name, slug, timezone, currency, status, updated_at').order('updated_at', { ascending: false }),
    supabase.from('subscription_plans').select('code, name, duration_days, grace_period_days').order('name'),
    supabase.from('subscription_plan_versions').select('id, plan_code, label, duration_days, grace_period_days, lifecycle_status').order('label'),
    supabase.from('subscription_plan_prices').select('id, plan_version_id, billing_interval, amount, currency, trial_days').eq('is_active', true).order('amount'),
    supabase.from('organization_subscriptions').select('id, organization_id, plan_code, plan_version_id, lifecycle_status, starts_at, expires_at, grace_ends_at, canceled_at, metadata, updated_at').order('updated_at', { ascending: false }),
    supabase.from('organization_branch_entitlements').select('organization_id, current_count, max_count'),
    supabase.from('subscription_events').select('id, organization_id, subscription_id, event_type, previous_status, new_status, reason, metadata, performed_by, created_at', { count: 'exact' }).order('created_at', { ascending: false }).range(historyFrom, historyFrom + HISTORY_PAGE_SIZE - 1),
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

  return (
    <main className="dashboard">
      <header className="topbar">
        <div className="brand">AVENZO ONE / Platform Admin</div>
        <div className="topbar-actions"><span>{user.email}</span><Link className="button secondary" href="/dashboard">กลับ Dashboard</Link><SignOutButton /></div>
      </header>
      <section className="content platform-subscription-content">
        <div className="hero">
          <div><div className="eyebrow">Control Plane</div><h1>จัดการ Subscription</h1><p>ตรวจสอบสิทธิ์ ต่ออายุ พัก เปิดต่อ หรือยกเลิก พร้อมประวัติภาษาไทย</p></div>
          <div className="platform-admin-actions"><Link className="button secondary" href="/platform-admin/features">Feature Catalog</Link><Link className="button secondary" href="/platform-admin/plans">Plans &amp; Prices</Link><Link className="button secondary" href="/platform-admin/security/mfa">ตั้งค่า MFA</Link></div>
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
                  <div><span className={`subscription-state ${displayStatus}`}>{status.label}</span><h3>{subscription.organization_name}</h3><p className="meta">/{subscription.organization_slug}</p></div>
                  <div className="subscription-plan-highlight"><span>Plan</span><strong>{subscription.plan_name}</strong><small>{subscription.plan_version_label}</small></div>
                </div>
                <p className="subscription-status-description">{status.description}{displayStatus === 'grace' ? ` ใช้งานได้ถึง ${formatDate(subscription.grace_ends_at, subscription.timezone)}` : ''}</p>
                <dl className="subscription-overview-grid">
                  <div><dt>เริ่มต้น</dt><dd>{formatDate(subscription.starts_at, subscription.timezone)}</dd></div>
                  <div><dt>หมดอายุ</dt><dd>{formatDate(subscription.expires_at, subscription.timezone)}</dd></div>
                  <div><dt>สิ้นสุดช่วงผ่อนผัน</dt><dd>{formatDate(subscription.grace_ends_at, subscription.timezone)}</dd></div>
                  <div><dt>การใช้งานสาขา</dt><dd>{entitlement ? `${entitlement.current_count} / ${entitlement.max_count ?? 'ไม่จำกัด'} สาขา` : 'ยังไม่มีข้อมูลสิทธิ์'}</dd></div>
                </dl>
                <details className="subscription-action-panel"><summary>จัดการ Subscription นี้</summary><SubscriptionLifecycleActions subscription={subscription} planVersions={planVersions} planPrices={planPrices} /></details>
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
    </main>
  )
}

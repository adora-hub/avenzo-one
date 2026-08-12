import { redirect } from 'next/navigation'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/server'
import { Countdown } from '../components/countdown'
import { ApplicationShell } from '../components/application-shell'
import { OrganizationAccessSummaryCard } from '../components/organization-access-summary'
import { subscriptionAccessStateLabel } from '../components/subscription-labels'
import type { OrganizationAccessSummary } from '@/lib/organization-access'

type SubscriptionStatus = {
  organization_id: string
  plan_name: string
  access_state: string
  expires_at: string
  days_remaining: number
  hours_remaining: number
  seconds_remaining: number
}

export default async function DashboardPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/')

  const [organizationsResult, subscriptionsResult, creationPermissionResult, accessResult, platformAdminResult] = await Promise.all([
    supabase.from('organizations').select('id, name, slug, status, timezone, currency').order('name'),
    supabase
    .from('organization_subscription_status')
    .select('organization_id, plan_name, access_state, expires_at, days_remaining, hours_remaining, seconds_remaining'),
    supabase.rpc('current_user_can_create_organization'),
    supabase.rpc('current_user_organization_access', { p_organization_id: null }),
    supabase.from('platform_admins').select('status').eq('user_id', user.id).maybeSingle(),
  ])

  const organizations = organizationsResult.data
  const subscriptions = subscriptionsResult.data
  const canCreateOrganization = creationPermissionResult.data
  const accessSummaries = (accessResult.data ?? []) as OrganizationAccessSummary[]
  const subscriptionStatuses = ((subscriptions as SubscriptionStatus[] | null) ?? [])
  const subscriptionByOrganization = new Map(
    subscriptionStatuses.map((subscription) => [subscription.organization_id, subscription]),
  )
  const accessByOrganization = new Map(accessSummaries.map((access) => [access.organization_id, access]))
  const organizationCount = organizations?.length ?? 0
  const usableSubscriptionCount = subscriptionStatuses.filter((subscription) => ['trial', 'active', 'grace'].includes(subscription.access_state)).length
  const isPlatformAdmin = platformAdminResult.data?.status === 'active'

  if (accessResult.error) {
    console.error('[dashboard-page] organization access summary lookup failed', {
      userId: user.id,
      error: accessResult.error.message,
    })
  }

  return (
    <ApplicationShell email={user.email ?? ''} isPlatformAdmin={isPlatformAdmin} section="workspace">
      <section className="content workspace-dashboard">
        <div className="workspace-dashboard-hero">
          <div>
            <div className="eyebrow">Workspace overview</div>
            <h1>ภาพรวมการใช้งานของคุณ</h1>
            <p>ดูสถานะ Organization, Subscription และทางลัดที่บัญชีนี้ได้รับอนุญาตจากหน้าเดียว</p>
          </div>
          {canCreateOrganization === true && <Link className="button" href="/onboarding">สร้าง Organization</Link>}
        </div>

        <section className="workspace-overview-grid" aria-label="สรุปภาพรวม Workspace">
          <article className="workspace-metric-card">
            <span>Organization ที่เข้าถึงได้</span>
            <strong>{organizationCount}</strong>
            <small>พื้นที่ทำงานในบัญชีนี้</small>
          </article>
          <article className="workspace-metric-card">
            <span>Subscription ที่ใช้งานได้</span>
            <strong>{usableSubscriptionCount}</strong>
            <small>รวมช่วงทดลอง ใช้งานปกติ และ Grace</small>
          </article>
          <article className="workspace-metric-card">
            <span>สิทธิ์ระดับ Platform</span>
            <strong className="workspace-metric-text">{isPlatformAdmin ? 'Platform Admin' : 'ผู้ใช้งาน Workspace'}</strong>
            <small>{isPlatformAdmin ? 'เข้าถึงศูนย์ควบคุมระบบได้' : 'ใช้งานตาม Role ของแต่ละ Organization'}</small>
          </article>
        </section>

        <section className="workspace-quick-actions" aria-labelledby="workspace-quick-actions-title">
          <div className="workspace-section-heading">
            <div>
              <div className="eyebrow">Quick actions</div>
              <h2 id="workspace-quick-actions-title">ทางลัดของคุณ</h2>
            </div>
          </div>
          <div className="workspace-action-grid">
            {organizations?.[0] && (
              <a className="workspace-action-card" href="#workspace-list">
                <strong>เลือก Workspace</strong>
                <span>ดู Organization ทั้งหมดแล้วเลือกพื้นที่ทำงานที่ต้องการ</span>
              </a>
            )}
            <Link className="workspace-action-card" href="/account/security/sessions">
              <strong>อุปกรณ์และ Session</strong>
              <span>ตรวจสอบอุปกรณ์ที่เข้าสู่ระบบและความปลอดภัยของบัญชี</span>
            </Link>
            {isPlatformAdmin && (
              <Link className="workspace-action-card" href="/platform-admin">
                <strong>ศูนย์ควบคุม Platform</strong>
                <span>จัดการแผน Billing สิทธิ์ และความพร้อมของระบบ</span>
              </Link>
            )}
          </div>
        </section>

        <section className="workspace-list" id="workspace-list" aria-labelledby="workspace-list-title">
          <div className="workspace-section-heading">
            <div>
              <div className="eyebrow">Your workspaces</div>
              <h2 id="workspace-list-title">Organization ของคุณ</h2>
              <p>เลือกพื้นที่ทำงานเพื่อดูรายละเอียดและดำเนินงานตาม Role ที่ได้รับ</p>
            </div>
            <span className="workspace-count-tag">{organizationCount} รายการ</span>
          </div>
        {organizations?.length ? (
          <div className="workspace-organization-grid">
            {organizations.map((organization) => {
              const subscription = subscriptionByOrganization.get(organization.id)
              const access = accessByOrganization.get(organization.id)
              return (
                <article className="card workspace-organization-card" key={organization.id}>
                  <div className="workspace-organization-heading">
                    <div>
                      <div className="meta">Organization</div>
                      <h3>{organization.name}</h3>
                    </div>
                    {subscription
                      ? <span className={`status ${subscription.access_state}`}>{subscriptionAccessStateLabel(subscription.access_state)}</span>
                      : <span className={`status ${organization.status}`}>{organization.status}</span>}
                  </div>
                  <div className="workspace-organization-meta">
                    <span>/{organization.slug}</span>
                    <span>{organization.timezone}</span>
                    <span>{organization.currency}</span>
                  </div>
                  {access && <OrganizationAccessSummaryCard access={access} compact />}
                  {subscription ? (
                    <div className="workspace-subscription-summary">
                      <div>
                        <span>แพ็กเกจ</span>
                        <strong>{subscription.plan_name}</strong>
                      </div>
                      {['trial', 'active', 'grace'].includes(subscription.access_state)
                        ? <div className="countdown">เหลือเวลา<Countdown expiresAt={subscription.expires_at} initialSeconds={subscription.seconds_remaining} /></div>
                        : <div className="workspace-subscription-message">Subscription ไม่อยู่ในสถานะที่ใช้งานได้ตามปกติ</div>}
                    </div>
                  ) : <div className="workspace-subscription-message">ยังไม่มี Subscription</div>}
                  <Link className="button secondary workspace-manage-button" href={`/organizations/${organization.id}`}>เปิด Workspace</Link>
                </article>
              )
            })}
          </div>
        ) : <div className="empty">{canCreateOrganization === true ? 'ยังไม่มี Organization ในบัญชีนี้ เริ่มต้นด้วยการสร้าง Organization ใหม่' : 'บัญชีนี้ยังไม่มี Organization ที่ได้รับอนุญาตให้เข้าถึง'}</div>}
        </section>
      </section>
    </ApplicationShell>
  )
}

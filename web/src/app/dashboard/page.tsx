import { redirect } from 'next/navigation'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/server'
import { Countdown } from '../components/countdown'
import { SignOutButton } from '../components/sign-out-button'
import { OrganizationAccessSummaryCard } from '../components/organization-access-summary'
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
  const subscriptionByOrganization = new Map(
    ((subscriptions as SubscriptionStatus[] | null) ?? []).map((subscription) => [subscription.organization_id, subscription]),
  )
  const accessByOrganization = new Map(accessSummaries.map((access) => [access.organization_id, access]))

  if (accessResult.error) {
    console.error('[dashboard-page] organization access summary lookup failed', {
      userId: user.id,
      error: accessResult.error.message,
    })
  }

  return (
    <main className="dashboard">
      <header className="topbar">
        <div className="brand">AVENZO ONE</div>
        <div className="topbar-actions">
          <span>{user.email}</span>
          {platformAdminResult.data?.status === 'active' && <Link className="button secondary" href="/platform-admin">Platform Admin</Link>}
          <SignOutButton />
        </div>
      </header>
      <section className="content">
        <div className="hero"><div><div className="eyebrow">Workspace</div><h1>Subscription ของคุณ</h1><p>เวลาคงเหลือคำนวณจากเวลาจริงของระบบ</p></div></div>
        <div className="hero"><div><h2>Organizations</h2><p>พื้นที่ทำงานที่บัญชีนี้เข้าถึงได้</p></div>{canCreateOrganization === true && <a className="button" href="/onboarding">สร้าง Organization</a>}</div>
        {organizations?.length ? (
          <div className="grid">
            {organizations.map((organization) => {
              const subscription = subscriptionByOrganization.get(organization.id)
              const access = accessByOrganization.get(organization.id)
              return (
                <article className="card" key={organization.id}>
                  <div className={`status ${organization.status}`}>{organization.status}</div>
                  <h3>{organization.name}</h3>
                  <div className="meta">/{organization.slug} · {organization.currency}</div>
                  {access && <OrganizationAccessSummaryCard access={access} compact />}
                  {subscription ? (
                    <>
                      <div className={`status ${subscription.access_state}`}>{subscription.access_state}</div>
                      <div className="countdown">เหลือเวลา<Countdown expiresAt={subscription.expires_at} initialSeconds={subscription.seconds_remaining} /></div>
                    </>
                  ) : <div className="meta">ยังไม่มี Subscription</div>}
                  <a className="button secondary" style={{ marginTop: 14 }} href={`/organizations/${organization.id}`}>จัดการ Workspace</a>
                </article>
              )
            })}
          </div>
        ) : <div className="empty">{canCreateOrganization === true ? 'ยังไม่มี Organization ในบัญชีนี้ เริ่มต้นด้วยการสร้าง Organization ใหม่' : 'บัญชีนี้ยังไม่มี Organization ที่ได้รับอนุญาตให้เข้าถึง'}</div>}
      </section>
    </main>
  )
}

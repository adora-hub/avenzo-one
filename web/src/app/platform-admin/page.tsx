import { redirect } from 'next/navigation'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/server'
import { SignOutButton } from '../components/sign-out-button'
import { SubscriptionProvisionForm, type ActivePlanVersion } from '../components/subscription-provision-form'

export default async function PlatformAdminPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/')

  const [platformAdminResult, assuranceResult] = await Promise.all([
    supabase.from('platform_admins').select('status').eq('user_id', user.id).maybeSingle(),
    supabase.auth.mfa.getAuthenticatorAssuranceLevel(),
  ])
  if (platformAdminResult.data?.status !== 'active') redirect('/dashboard')
  if (assuranceResult.data?.nextLevel === 'aal2' && assuranceResult.data.currentLevel !== 'aal2') {
    redirect('/auth/mfa?next=/platform-admin')
  }

  const [organizationsResult, plansResult, planVersionsResult, subscriptionsResult] = await Promise.all([
    supabase.from('organizations').select('id, name, slug, status, updated_at').order('updated_at', { ascending: false }),
    supabase.from('subscription_plans').select('code, name, duration_days, grace_period_days').order('name'),
    supabase.from('subscription_plan_versions').select('id, plan_code, label').eq('lifecycle_status', 'active').order('label'),
    supabase.from('organization_branch_entitlements').select('organization_id, plan_name, plan_version_label, access_state, current_count, max_count'),
  ])
  const organizations = organizationsResult.data ?? []
  const plans = plansResult.data ?? []
  const plansByCode = new Map(plans.map((plan) => [plan.code, plan]))
  const planVersions: ActivePlanVersion[] = (planVersionsResult.data ?? []).flatMap((version) => {
    const plan = plansByCode.get(version.plan_code)
    return plan ? [{
      id: version.id,
      plan_code: version.plan_code,
      plan_name: plan.name,
      label: version.label,
      duration_days: plan.duration_days,
      grace_period_days: plan.grace_period_days,
    }] : []
  })
  const subscriptions = subscriptionsResult.data ?? []

  return (
    <main className="dashboard">
      <header className="topbar">
        <div className="brand">AVENZO ONE / Platform Admin</div>
        <div className="topbar-actions">
          <span>{user.email}</span>
          <Link className="button secondary" href="/dashboard">กลับ Dashboard</Link>
          <SignOutButton />
        </div>
      </header>
      <section className="content">
        <div className="hero">
          <div><div className="eyebrow">Control Plane</div><h1>Organizations</h1><p>ตรวจสอบ Organization และจัดการ Subscription</p></div>
          <div className="platform-admin-actions">
            <Link className="button secondary" href="/platform-admin/features">Feature Catalog</Link>
            <Link className="button secondary" href="/platform-admin/plans">Plans &amp; Prices</Link>
            <Link className="button secondary" href="/platform-admin/security/mfa">ตั้งค่า MFA</Link>
          </div>
        </div>

        {organizations.length ? (
          <div className="grid">
            {organizations.map((organization) => (
              <article className="card" key={organization.id}>
                <div className={`status ${organization.status}`}>{organization.status}</div>
                <h3>{organization.name}</h3>
                <div className="meta">/{organization.slug}</div>
                <div className="meta">อัปเดต {new Date(organization.updated_at).toLocaleString('th-TH')}</div>
              </article>
            ))}
          </div>
        ) : <div className="empty">ยังไม่พบ Organization หรือบัญชีนี้ไม่ใช่ Platform Admin</div>}

        <div className="hero" style={{ marginTop: 40 }}>
          <div><h2>Provision Subscription</h2><p>กำหนด Active Plan Version ให้ Organization และบันทึก Subscription Event</p></div>
        </div>
        <div className="card">
          <SubscriptionProvisionForm organizations={organizations} planVersions={planVersions} />
        </div>

        {subscriptions.length ? (
          <div className="grid" style={{ marginTop: 18 }}>
            {subscriptions.map((subscription) => (
              <article className="card" key={subscription.organization_id}>
                <div className={`status ${subscription.access_state}`}>{subscription.access_state}</div>
                <h3>{subscription.plan_name}</h3>
                <div className="meta">Version: {subscription.plan_version_label ?? 'ยังไม่ได้กำหนด'}</div>
                <div className="meta">สาขา: {subscription.current_count}{subscription.max_count === null ? ' / ไม่จำกัด' : ` / ${subscription.max_count}`}</div>
              </article>
            ))}
          </div>
        ) : null}
      </section>
    </main>
  )
}

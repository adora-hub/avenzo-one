import Link from 'next/link'
import { redirect } from 'next/navigation'
import { PlansPricesManager } from '@/app/components/plans-prices-manager'
import type { CatalogFeatureRow, PlanFeatureRow, PlanPriceRow, PlanRow, PlanVersionRow } from '@/app/components/plans-prices-manager'
import { SignOutButton } from '@/app/components/sign-out-button'
import { createClient } from '@/lib/supabase/server'

export default async function PlatformAdminPlansPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/?next=/platform-admin/plans')

  const [platformAdminResult, assuranceResult] = await Promise.all([
    supabase.from('platform_admins').select('status').eq('user_id', user.id).maybeSingle(),
    supabase.auth.mfa.getAuthenticatorAssuranceLevel(),
  ])
  if (platformAdminResult.data?.status !== 'active') redirect('/dashboard')
  if (assuranceResult.data?.currentLevel !== 'aal2') redirect('/auth/mfa?next=/platform-admin/plans')

  const [plansResult, versionsResult, pricesResult, featuresResult, catalogResult] = await Promise.all([
    supabase.from('subscription_plans').select('code, name, description, duration_days, grace_period_days, lifecycle_status').order('name'),
    supabase.from('subscription_plan_versions').select('id, plan_code, version_no, label, description, lifecycle_status').order('plan_code').order('version_no', { ascending: false }),
    supabase.from('subscription_plan_prices').select('id, plan_version_id, billing_interval, amount, currency, trial_days, is_active').order('billing_interval'),
    supabase.from('subscription_plan_features').select('id, plan_version_id, feature_id, boolean_value, integer_value'),
    supabase.from('feature_catalog').select('id, feature_key, name, value_type, unit, lifecycle_status').order('name'),
  ])
  const firstError = [plansResult, versionsResult, pricesResult, featuresResult, catalogResult].find((result) => result.error)?.error

  return (
    <main className="dashboard">
      <header className="topbar">
        <div className="brand">AVENZO ONE / Plans & Prices</div>
        <div className="topbar-actions"><span>{user.email}</span><SignOutButton /></div>
      </header>
      <section className="content feature-catalog-content">
        <div className="hero">
          <div><div className="eyebrow">Phase 1.0.2</div><h1>Plans & Prices</h1><p>สร้างแพ็กเกจ รุ่นราคา ทดลองใช้ และกำหนดค่า Feature สำหรับใช้ในขั้นตอน Entitlement ถัดไป</p></div>
          <Link className="button secondary" href="/platform-admin">กลับ Platform Admin</Link>
        </div>
        {firstError ? <div className="error">ไม่สามารถอ่าน Plans & Prices ได้: {firstError.message}</div> : <PlansPricesManager
          plans={(plansResult.data as PlanRow[] | null) ?? []}
          versions={(versionsResult.data as PlanVersionRow[] | null) ?? []}
          prices={(pricesResult.data as PlanPriceRow[] | null) ?? []}
          features={(featuresResult.data as PlanFeatureRow[] | null) ?? []}
          catalog={(catalogResult.data as CatalogFeatureRow[] | null) ?? []}
        />}
      </section>
    </main>
  )
}

import Link from 'next/link'
import { redirect } from 'next/navigation'
import { FeatureCatalogManager } from '@/app/components/feature-catalog-manager'
import type { CatalogFeature } from '@/app/components/feature-catalog-manager'
import { SignOutButton } from '@/app/components/sign-out-button'
import { createClient } from '@/lib/supabase/server'

export default async function PlatformAdminFeaturesPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/?next=/platform-admin/features')

  const [platformAdminResult, assuranceResult] = await Promise.all([
    supabase.from('platform_admins').select('status').eq('user_id', user.id).maybeSingle(),
    supabase.auth.mfa.getAuthenticatorAssuranceLevel(),
  ])
  if (platformAdminResult.data?.status !== 'active') redirect('/dashboard')
  if (assuranceResult.data?.currentLevel !== 'aal2') redirect('/auth/mfa?next=/platform-admin/features')

  const { data: features, error } = await supabase
    .from('feature_catalog')
    .select('id, feature_key, name, description, value_type, unit, lifecycle_status, updated_at')
    .order('lifecycle_status')
    .order('name')

  return (
    <main className="dashboard">
      <header className="topbar">
        <div className="brand">AVENZO ONE / Feature Catalog</div>
        <div className="topbar-actions"><span>{user.email}</span><SignOutButton /></div>
      </header>
      <section className="content feature-catalog-content">
        <div className="hero">
          <div><div className="eyebrow">Phase 1.0.1</div><h1>Feature Catalog</h1><p>ทะเบียนฟีเจอร์กลางสำหรับ Plans, Limits และ Entitlements ในขั้นถัดไป</p></div>
          <Link className="button secondary" href="/platform-admin">กลับ Platform Admin</Link>
        </div>
        {error ? <div className="error">ไม่สามารถอ่าน Feature Catalog ได้: {error.message}</div> : <FeatureCatalogManager initialFeatures={(features as CatalogFeature[] | null) ?? []} />}
      </section>
    </main>
  )
}

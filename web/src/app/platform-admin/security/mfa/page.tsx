import Link from 'next/link'
import { redirect } from 'next/navigation'
import { MfaEnrollment } from '@/app/components/mfa-enrollment'
import { SignOutButton } from '@/app/components/sign-out-button'
import { createClient } from '@/lib/supabase/server'

export default async function PlatformAdminMfaPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/?next=/platform-admin/security/mfa')

  const [platformAdminResult, assuranceResult] = await Promise.all([
    supabase.from('platform_admins').select('status').eq('user_id', user.id).maybeSingle(),
    supabase.auth.mfa.getAuthenticatorAssuranceLevel(),
  ])

  if (platformAdminResult.data?.status !== 'active') redirect('/dashboard')
  if (assuranceResult.data?.nextLevel === 'aal2' && assuranceResult.data.currentLevel !== 'aal2') {
    redirect('/auth/mfa?next=/platform-admin/security/mfa')
  }

  return (
    <main className="dashboard">
      <header className="topbar">
        <div className="brand">AVENZO ONE / Platform Admin Security</div>
        <div className="topbar-actions"><span>{user.email}</span><SignOutButton /></div>
      </header>
      <section className="content mfa-content">
        <div className="hero">
          <div>
            <div className="eyebrow">Phase 0.10.4</div>
            <h1>จัดการ TOTP MFA</h1>
            <p>เพิ่มเครื่องสำรอง ถอดอุปกรณ์ และยกเลิก Session อื่นอย่างปลอดภัย</p>
          </div>
          <Link className="button secondary" href="/platform-admin">กลับ Platform Admin</Link>
        </div>
        <MfaEnrollment />
      </section>
    </main>
  )
}

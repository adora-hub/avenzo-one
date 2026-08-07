import { redirect } from 'next/navigation'
import { MfaChallengeForm } from '@/app/components/mfa-challenge-form'
import { SignOutButton } from '@/app/components/sign-out-button'
import { createClient } from '@/lib/supabase/server'

type MfaChallengePageProps = {
  searchParams: Promise<{ next?: string }>
}

function safeNextPath(next: string | undefined) {
  return next?.startsWith('/') && !next.startsWith('//') ? next : '/platform-admin'
}

export default async function MfaChallengePage({ searchParams }: MfaChallengePageProps) {
  const { next } = await searchParams
  const nextPath = safeNextPath(next)
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect(`/?next=${encodeURIComponent(nextPath)}`)

  const [platformAdminResult, assuranceResult] = await Promise.all([
    supabase.from('platform_admins').select('status').eq('user_id', user.id).maybeSingle(),
    supabase.auth.mfa.getAuthenticatorAssuranceLevel(),
  ])

  if (platformAdminResult.data?.status !== 'active') redirect('/dashboard')
  if (assuranceResult.error) redirect('/platform-admin/security/mfa')
  if (assuranceResult.data.currentLevel === 'aal2') redirect(nextPath)
  if (assuranceResult.data.nextLevel !== 'aal2') redirect('/platform-admin/security/mfa')

  return (
    <main className="shell">
      <section className="auth-card mfa-challenge-card">
        <div className="eyebrow">PLATFORM ADMIN SECURITY</div>
        <h1>ยืนยันตัวตนอีกครั้ง</h1>
        <p>เปิดแอป Authenticator แล้วกรอกรหัส 6 หลัก เพื่อเข้าสู่พื้นที่ Platform Admin</p>
        <MfaChallengeForm nextPath={nextPath} />
        <div className="mfa-challenge-signout"><SignOutButton /></div>
      </section>
    </main>
  )
}

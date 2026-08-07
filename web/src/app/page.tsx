import { AuthForm } from './components/auth-form'
import Link from 'next/link'
import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'

type HomePageProps = {
  searchParams: Promise<{ next?: string }>
}

export const dynamic = 'force-dynamic'

export default async function HomePage({ searchParams }: HomePageProps) {
  const supabase = await createClient()
  const [{ data: { user } }, params] = await Promise.all([
    supabase.auth.getUser(),
    searchParams,
  ])

  if (user) {
    const requestedPath = params.next
    const nextPath = requestedPath
      && requestedPath.startsWith('/')
      && !requestedPath.startsWith('//')
      && requestedPath !== '/'
      ? requestedPath
      : null
    const [platformAdminResult, assuranceResult] = await Promise.all([
      supabase.from('platform_admins').select('status').eq('user_id', user.id).maybeSingle(),
      supabase.auth.mfa.getAuthenticatorAssuranceLevel(),
    ])

    if (platformAdminResult.data?.status === 'active') {
      const destination = nextPath ?? '/platform-admin'
      if (assuranceResult.data?.nextLevel === 'aal2' && assuranceResult.data.currentLevel !== 'aal2') {
        redirect(`/auth/mfa?next=${encodeURIComponent(destination)}`)
      }
      redirect(destination)
    }

    redirect(nextPath ?? '/dashboard')
  }

  return (
    <main className="shell">
      <section className="auth-card">
        <div className="eyebrow">AVENZO ONE</div>
        <h1>เข้าสู่ระบบ</h1>
        <p>พื้นที่ทำงานสำหรับองค์กร ร้านค้า สาขา และการจัดการ Subscription</p>
        <AuthForm />
        <nav className="auth-legal" aria-label="ข้อมูลทางกฎหมาย">
          <Link href="/privacy">ความเป็นส่วนตัว</Link>
          <span aria-hidden="true">•</span>
          <Link href="/terms">ข้อกำหนดการใช้งาน</Link>
        </nav>
      </section>
    </main>
  )
}

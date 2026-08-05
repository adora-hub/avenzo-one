import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { Countdown } from '../components/countdown'
import { SignOutButton } from '../components/sign-out-button'

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

  const [{ data: organizations }, { data: subscriptions }] = await Promise.all([
    supabase.from('organizations').select('id, name, slug, status, timezone, currency').order('name'),
    supabase
    .from('organization_subscription_status')
    .select('organization_id, plan_name, access_state, expires_at, days_remaining, hours_remaining, seconds_remaining')
  ])

  return (
    <main className="dashboard">
      <header className="topbar"><div className="brand">AVENZO ONE</div><div className="topbar-actions"><span>{user.email}</span><SignOutButton /></div></header>
      <section className="content">
        <div className="hero"><div><div className="eyebrow">Workspace</div><h1>Subscription ของคุณ</h1><p>เวลาคงเหลือคำนวณจากเวลาจริงของระบบ</p></div></div>
        <div className="hero"><div><h2>Organizations</h2><p>พื้นที่ทำงานที่บัญชีนี้เข้าถึงได้</p></div><a className="button" href="/onboarding">สร้าง Organization</a></div>
        {organizations?.length ? <div className="grid">{organizations.map((organization) => { const subscription = (subscriptions as SubscriptionStatus[] | null)?.find((item) => item.organization_id === organization.id); return <article className="card" key={organization.id}><div className={`status ${organization.status}`}>{organization.status}</div><h3>{organization.name}</h3><div className="meta">/{organization.slug} · {organization.currency}</div>{subscription ? <><div className={`status ${subscription.access_state}`}>{subscription.access_state}</div><div className="countdown">เหลือเวลา<Countdown expiresAt={subscription.expires_at} initialSeconds={subscription.seconds_remaining} /></div></> : <div className="meta">ยังไม่มี Subscription</div>}</article>})}</div> : <div className="empty">ยังไม่มี Organization ในบัญชีนี้ เริ่มต้นด้วยการสร้าง Organization ใหม่</div>}
      </section>
    </main>
  )
}

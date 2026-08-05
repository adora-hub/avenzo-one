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

  const { data: subscriptions } = await supabase
    .from('organization_subscription_status')
    .select('organization_id, plan_name, access_state, expires_at, days_remaining, hours_remaining, seconds_remaining')

  return (
    <main className="dashboard">
      <header className="topbar"><div className="brand">AVENZO ONE</div><div className="topbar-actions"><span>{user.email}</span><SignOutButton /></div></header>
      <section className="content">
        <div className="hero"><div><div className="eyebrow">Workspace</div><h1>Subscription ของคุณ</h1><p>เวลาคงเหลือคำนวณจากเวลาจริงของระบบ</p></div></div>
        {(subscriptions as SubscriptionStatus[] | null)?.length ? <div className="grid">{(subscriptions as SubscriptionStatus[]).map((subscription) => <article className="card" key={subscription.organization_id}><div className={`status ${subscription.access_state}`}>{subscription.access_state}</div><h3>{subscription.plan_name}</h3><div className="meta">หมดอายุ {new Date(subscription.expires_at).toLocaleString('th-TH')}</div><div className="countdown">เหลือเวลา<Countdown expiresAt={subscription.expires_at} initialSeconds={subscription.seconds_remaining} /></div></article>)}</div> : <div className="empty">ยังไม่มี Subscription ที่เชื่อมกับบัญชีนี้</div>}
      </section>
    </main>
  )
}

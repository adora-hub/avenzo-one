import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { SignOutButton } from '../components/sign-out-button'

export default async function PlatformAdminPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/')

  const { data: organizations } = await supabase.from('organizations').select('id, name, slug, status, updated_at').order('updated_at', { ascending: false })

  return (
    <main className="dashboard">
      <header className="topbar"><div className="brand">AVENZO ONE / Platform Admin</div><div className="topbar-actions"><span>{user.email}</span><SignOutButton /></div></header>
      <section className="content"><div className="hero"><div><div className="eyebrow">Control Plane</div><h1>Organizations</h1><p>หน้าจอเริ่มต้นสำหรับตรวจสอบสถานะองค์กร</p></div></div>
        {organizations?.length ? <div className="grid">{organizations.map((organization) => <article className="card" key={organization.id}><div className={`status ${organization.status}`}>{organization.status}</div><h3>{organization.name}</h3><div className="meta">/{organization.slug}</div><div className="meta">อัปเดต {new Date(organization.updated_at).toLocaleString('th-TH')}</div></article>)}</div> : <div className="empty">ยังไม่พบ Organization หรือบัญชีนี้ยังไม่ใช่ Platform Admin</div>}
      </section>
    </main>
  )
}

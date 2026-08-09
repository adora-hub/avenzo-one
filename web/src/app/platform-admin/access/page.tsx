import Link from 'next/link'
import { redirect } from 'next/navigation'
import { PlatformAdminAccessManager, type PlatformAdminDirectoryEntry } from '@/app/components/platform-admin-access-manager'
import { SignOutButton } from '@/app/components/sign-out-button'
import { createClient } from '@/lib/supabase/server'

export default async function PlatformAdminAccessPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/?next=/platform-admin/access')

  const [adminResult, assuranceResult] = await Promise.all([
    supabase.from('platform_admins').select('status, role_code').eq('user_id', user.id).maybeSingle(),
    supabase.auth.mfa.getAuthenticatorAssuranceLevel(),
  ])
  if (adminResult.data?.status !== 'active') redirect('/dashboard')
  if (assuranceResult.data?.currentLevel !== 'aal2') redirect('/auth/mfa?next=/platform-admin/access')

  const { data, error } = await supabase.rpc('platform_admin_directory')
  const admins = (data ?? []) as PlatformAdminDirectoryEntry[]

  return <main className="dashboard">
    <header className="topbar"><div className="brand">AVENZO ONE / Platform Admin Access</div><div className="topbar-actions"><span>{user.email}</span><Link className="button secondary" href="/platform-admin">กลับ Platform Admin</Link><SignOutButton /></div></header>
    <section className="content platform-access-content">
      <div className="hero"><div><div className="eyebrow">Phase 1.1.3.7.4.1</div><h1>จัดการ Platform Admin</h1><p>เพิ่มผู้ดูแล กำหนดระดับสิทธิ์ พักชั่วคราว และเปิดสิทธิ์กลับ พร้อม Audit Log</p></div><div className="platform-access-safety"><strong>กฎความปลอดภัย</strong><span>ต้องผ่าน MFA · ห้ามลดสิทธิ์ตัวเอง · ห้ามพัก Super Admin คนสุดท้าย</span></div></div>
      {error ? <div className="error">โหลดรายชื่อผู้ดูแลไม่สำเร็จ: {error.message}</div> : <PlatformAdminAccessManager initialAdmins={admins} canManage={adminResult.data?.role_code === 'super_admin'} />}
    </section>
  </main>
}

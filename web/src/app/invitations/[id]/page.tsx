import { notFound, redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { SignOutButton } from '../../components/sign-out-button'
import { AcceptInvitationForm } from '../../components/accept-invitation-form'

type Props = { params: Promise<{ id: string }> }

export default async function InvitationPage({ params }: Props) {
  const { id } = await params
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/')

  const { data: invitation } = await supabase.from('organization_invitations').select('id, email, role_code, status, expires_at').eq('id', id).maybeSingle()
  if (!invitation) notFound()

  const expired = new Date(invitation.expires_at).getTime() <= Date.now()
  const unavailable = invitation.status !== 'pending' || expired

  return <main className="dashboard"><header className="topbar"><div className="brand">AVENZO ONE</div><div className="topbar-actions"><span>{user.email}</span><SignOutButton /></div></header><section className="content"><div className="auth-card" style={{ margin: '48px auto' }}><div className="eyebrow">Invitation</div><h1>คำเชิญเข้าร่วม Workspace</h1><p>คำเชิญนี้ส่งถึง {invitation.email} พร้อม Role: {invitation.role_code}</p>{unavailable ? <div className="error">คำเชิญนี้{expired ? 'หมดอายุแล้ว' : `อยู่ในสถานะ ${invitation.status}`}</div> : <AcceptInvitationForm invitationId={invitation.id} />}<a className="button secondary" style={{ marginTop: 14, width: '100%' }} href="/dashboard">กลับ Dashboard</a></div></section></main>
}

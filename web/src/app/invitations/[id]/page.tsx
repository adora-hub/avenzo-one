import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { SignOutButton } from '../../components/sign-out-button'
import { AcceptInvitationForm } from '../../components/accept-invitation-form'
import { InvitationLinkNotice } from '../../components/invitation-link-notice'
import { InvitationPasswordSetupForm } from '../../components/invitation-password-setup-form'

type Props = {
  params: Promise<{ id: string }>
  searchParams: Promise<{ setup?: string }>
}

type Invitation = {
  id: string
  email: string
  role_code: string
  status: string
  expires_at: string
}

function InvitationCard({ children }: { children: React.ReactNode }) {
  return (
    <main className="dashboard">
      <header className="topbar"><div className="brand">AVENZO ONE</div></header>
      <section className="content">
        <div className="auth-card" style={{ margin: '48px auto' }}>
          <div className="eyebrow">Invitation</div>
          <h1>คำเชิญเข้าร่วม Workspace</h1>
          {children}
        </div>
      </section>
    </main>
  )
}

export default async function InvitationPage({ params, searchParams }: Props) {
  const { id } = await params
  const { setup } = await searchParams
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) {
    redirect(`/?next=${encodeURIComponent(`/invitations/${id}`)}`)
  }

  let invitation: Invitation | null = null
  let lookupError = ''

  try {
    const admin = createAdminClient()
    const { data, error } = await admin
      .from('organization_invitations')
      .select('id, email, role_code, status, expires_at')
      .eq('id', id)
      .maybeSingle()

    invitation = data
    lookupError = error?.message ?? ''
  } catch (error) {
    lookupError = error instanceof Error ? error.message : 'invitation_lookup_failed'
  }

  if (lookupError) {
    console.error('[invitation-page] lookup failed', { invitationId: id, error: lookupError })
    return (
      <InvitationCard>
        <div className="error">ระบบไม่สามารถตรวจสอบคำเชิญได้ กรุณาติดต่อผู้ดูแลระบบ</div>
        <a className="button secondary" style={{ marginTop: 14, width: '100%' }} href="/dashboard">กลับ Dashboard</a>
      </InvitationCard>
    )
  }

  if (!invitation) {
    return (
      <InvitationCard>
        <div className="error">ไม่พบคำเชิญนี้ กรุณาตรวจสอบว่าคัดลอกลิงก์มาครบถ้วน</div>
        <a className="button secondary" style={{ marginTop: 14, width: '100%' }} href="/dashboard">กลับ Dashboard</a>
      </InvitationCard>
    )
  }

  const signedInEmail = user.email?.trim().toLowerCase() ?? ''
  const invitedEmail = invitation.email.trim().toLowerCase()
  const emailMismatch = signedInEmail !== invitedEmail
  const expired = new Date(invitation.expires_at).getTime() <= Date.now()
  const unavailable = invitation.status !== 'pending' || expired
  const returnToInvitation = `/?next=${encodeURIComponent(`/invitations/${invitation.id}`)}`

  return (
    <main className="dashboard">
      <header className="topbar">
        <div className="brand">AVENZO ONE</div>
        <div className="topbar-actions"><span>{user.email}</span><SignOutButton /></div>
      </header>
      <section className="content">
        <div className="auth-card" style={{ margin: '48px auto' }}>
          <div className="eyebrow">Invitation</div>
          <h1>คำเชิญเข้าร่วม Workspace</h1>
          <InvitationLinkNotice />
          <p>คำเชิญนี้ส่งถึง <strong>{invitation.email}</strong><br />Role: {invitation.role_code}</p>

          {unavailable ? (
            <div className="error">
              {expired
                ? 'คำเชิญนี้หมดอายุแล้ว กรุณาให้ผู้ดูแลสร้างคำเชิญใหม่'
                : invitation.status === 'revoked'
                  ? 'คำเชิญนี้ถูกยกเลิกแล้ว กรุณาให้ผู้ดูแลสร้างคำเชิญใหม่'
                  : invitation.status === 'accepted'
                    ? 'คำเชิญนี้ได้รับการตอบรับแล้ว'
                    : `คำเชิญนี้อยู่ในสถานะ ${invitation.status}`}
            </div>
          ) : emailMismatch ? (
            <div className="form">
              <div className="error">
                บัญชีที่กำลังใช้อยู่คือ {user.email} ซึ่งไม่ตรงกับอีเมลผู้รับคำเชิญ กรุณาออกจากระบบแล้วเข้าสู่ระบบด้วย {invitation.email}
              </div>
              <SignOutButton redirectTo={returnToInvitation} label="ออกจากระบบเพื่อเปลี่ยนบัญชี" />
            </div>
          ) : setup === '1' ? (
            <InvitationPasswordSetupForm invitationId={invitation.id} />
          ) : (
            <AcceptInvitationForm invitationId={invitation.id} />
          )}

          <a className="button secondary" style={{ marginTop: 14, width: '100%' }} href="/dashboard">กลับ Dashboard</a>
        </div>
      </section>
    </main>
  )
}

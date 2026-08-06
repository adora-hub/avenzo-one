import { notFound, redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { SignOutButton } from '../../components/sign-out-button'
import { CreateBranchForm } from '../../components/create-branch-form'
import { InviteMemberForm } from '../../components/invite-member-form'
import { CancelInvitationButton } from '../../components/cancel-invitation-button'
import { OrganizationAccessSummaryCard } from '../../components/organization-access-summary'
import type { OrganizationAccessSummary } from '@/lib/organization-access'

type Props = { params: Promise<{ id: string }> }

export default async function OrganizationPage({ params }: Props) {
  const { id } = await params
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/')

  const [organizationResult, branchesResult, accessResult] = await Promise.all([
    supabase.from('organizations').select('id, name, slug, status, timezone, currency').eq('id', id).maybeSingle(),
    supabase.from('branches').select('id, code, name, status').eq('organization_id', id).order('code'),
    supabase.rpc('current_user_organization_access', { p_organization_id: id }),
  ])

  const organization = organizationResult.data
  const branches = branchesResult.data ?? []
  if (!organization) notFound()

  if (accessResult.error) {
    console.error('[organization-page] organization access summary lookup failed', {
      organizationId: id,
      userId: user.id,
      error: accessResult.error.message,
    })
  }

  const access = (accessResult.data?.[0] ?? null) as OrganizationAccessSummary | null
  const permissions = new Set<string>(access?.permissions.map((permission) => permission.code) ?? [])
  const canCreateBranch = permissions.has('branch.create')
  const canInviteMembers = permissions.has('member.invite')
  const canReadMembers = permissions.has('member.read')

  const [membersResult, invitationsResult, rolesResult] = await Promise.all([
    canReadMembers
      ? supabase.from('organization_members').select('id, user_id, membership_status, scope, created_at').eq('organization_id', id).order('created_at')
      : Promise.resolve({ data: [] }),
    canReadMembers
      ? supabase.from('organization_invitations').select('id, email, role_code, branch_id, status, expires_at, created_at').eq('organization_id', id).order('created_at', { ascending: false })
      : Promise.resolve({ data: [] }),
    canInviteMembers
      ? supabase.from('organization_roles').select('code, name').eq('organization_id', id).order('code')
      : Promise.resolve({ data: [] }),
  ])

  const members = membersResult.data ?? []
  const invitations = invitationsResult.data ?? []
  const roles = rolesResult.data ?? []
  const hasManagementPermission = canCreateBranch || canInviteMembers || canReadMembers

  return (
    <main className="dashboard">
      <header className="topbar">
        <div className="brand">AVENZO ONE / {organization.name}</div>
        <div className="topbar-actions"><span>{user.email}</span><SignOutButton /></div>
      </header>
      <section className="content">
        <div className="hero">
          <div>
            <div className="eyebrow">Workspace</div>
            <h1>{organization.name}</h1>
            <p>/{organization.slug} · {organization.timezone} · {organization.currency}</p>
          </div>
          <a className="button secondary" href="/dashboard">กลับ Dashboard</a>
        </div>

        <div className="grid">
          <article className="card">
            <h2>Branches</h2>
            <p>สาขาภายใน Organization</p>
            {branches.length
              ? <div>{branches.map((branch) => <div className="meta" key={branch.id}>{branch.code} · {branch.name} · {branch.status}</div>)}</div>
              : <div className="empty">ยังไม่มี Branch</div>}
            {canCreateBranch && <CreateBranchForm organizationId={id} />}
          </article>

          {access
            ? <OrganizationAccessSummaryCard access={access} />
            : <article className="card"><h2>ตำแหน่งและหน้าที่ของคุณ</h2><div className="empty">ไม่สามารถอ่านข้อมูล Role และ Permission ได้</div></article>}
        </div>

        {canInviteMembers && (
          <div className="card" style={{ marginTop: 18 }}>
            <h2>เชิญสมาชิก</h2>
            <p>สร้างคำเชิญพร้อม Role และ Branch Scope</p>
            <InviteMemberForm organizationId={id} roles={roles} branches={branches} />
          </div>
        )}

        {canReadMembers && (
          <div className="card" style={{ marginTop: 18 }}>
            <h2>สมาชิก</h2>
            {members.length
              ? <div className="table">{members.map((member) => <div className="table-row" key={member.id}><span>{member.user_id}</span><span>{member.membership_status}</span><span>{member.scope}</span></div>)}</div>
              : <div className="empty">ยังไม่มีสมาชิก</div>}
          </div>
        )}

        {canReadMembers && (
          <div className="card" style={{ marginTop: 18 }}>
            <h2>คำเชิญล่าสุด</h2>
            {invitations.length
              ? <div className="table">{invitations.map((invitation) => <div className="table-row invitation-row" key={invitation.id}><span>{invitation.email}</span><span>{invitation.role_code}</span><span>{invitation.status}</span>{invitation.status === 'pending' && canInviteMembers ? <CancelInvitationButton invitationId={invitation.id} /> : <a className="button secondary" href={`/invitations/${invitation.id}`}>เปิดคำเชิญ</a>}</div>)}</div>
              : <div className="empty">ยังไม่มีคำเชิญ</div>}
          </div>
        )}

        {!hasManagementPermission && accessResult.error && (
          <div className="error" style={{ marginTop: 18 }}>ไม่สามารถตรวจสอบสิทธิ์การจัดการได้ ระบบจึงซ่อนเครื่องมือจัดการเพื่อความปลอดภัย</div>
        )}
      </section>
    </main>
  )
}

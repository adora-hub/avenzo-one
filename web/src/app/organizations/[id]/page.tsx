import { notFound, redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { SignOutButton } from '../../components/sign-out-button'
import { CreateBranchForm } from '../../components/create-branch-form'
import { InviteMemberForm } from '../../components/invite-member-form'
import { InvitationHistory } from '../../components/invitation-history'
import { OrganizationAuditLog } from '../../components/organization-audit-log'
import { OrganizationAccessSummaryCard } from '../../components/organization-access-summary'
import { MemberManagement } from '../../components/member-management'
import type { OrganizationAccessSummary } from '@/lib/organization-access'
import type { OrganizationMemberDirectoryEntry } from '@/lib/organization-member-directory'
import type { InvitationStatus, OrganizationInvitationHistoryResult } from '@/lib/organization-invitation-history'
import type { AuditCategory, OrganizationAuditLogResult } from '@/lib/organization-audit-log'
import { branchEntitlementMessage, type OrganizationBranchEntitlement } from '@/lib/branch-entitlement'
import { subscriptionAccessStateLabel } from '../../components/subscription-labels'
import {
  BillingTransferProofUpload,
  type TransferChannelOption,
  type TransferInvoiceOption,
  type TransferProofSummary,
} from '../../components/billing-transfer-proof-upload'

type SearchParams = Record<string, string | string[] | undefined>
type InvitationFilterStatus = 'all' | InvitationStatus
type AuditFilterCategory = 'all' | AuditCategory
type Props = { params: Promise<{ id: string }>; searchParams: Promise<SearchParams> }

const invitationStatuses = new Set<InvitationFilterStatus>(['all', 'pending', 'accepted', 'revoked', 'expired'])
const invitationPageSize = 10
const auditCategories = new Set<AuditFilterCategory>(['all', 'organization', 'branch', 'member', 'invitation', 'subscription', 'moderation', 'security'])
const auditPageSize = 10

function firstParam(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] ?? '' : value ?? ''
}

export default async function OrganizationPage({ params, searchParams }: Props) {
  const [{ id }, queryParams] = await Promise.all([params, searchParams])
  const invitationSearch = firstParam(queryParams.inviteSearch).trim().slice(0, 160)
  const requestedStatus = firstParam(queryParams.inviteStatus).toLowerCase() as InvitationFilterStatus
  const invitationStatus = invitationStatuses.has(requestedStatus) ? requestedStatus : 'all'
  const parsedPage = Number.parseInt(firstParam(queryParams.invitePage), 10)
  const invitationPage = Number.isFinite(parsedPage) && parsedPage > 0 ? parsedPage : 1
  const auditSearch = firstParam(queryParams.auditSearch).trim().slice(0, 160)
  const requestedAuditCategory = firstParam(queryParams.auditCategory).toLowerCase() as AuditFilterCategory
  const auditCategory = auditCategories.has(requestedAuditCategory) ? requestedAuditCategory : 'all'
  const parsedAuditPage = Number.parseInt(firstParam(queryParams.auditPage), 10)
  const auditPage = Number.isFinite(parsedAuditPage) && parsedAuditPage > 0 ? parsedAuditPage : 1
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/')

  const [organizationResult, branchesResult, accessResult, entitlementResult] = await Promise.all([
    supabase.from('organizations').select('id, name, slug, status, timezone, currency').eq('id', id).maybeSingle(),
    supabase.from('branches').select('id, code, name, status').eq('organization_id', id).order('code'),
    supabase.rpc('current_user_organization_access', { p_organization_id: id }),
    supabase.from('organization_branch_entitlements').select('*').eq('organization_id', id).maybeSingle(),
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
  const branchEntitlement = (entitlementResult.data ?? null) as OrganizationBranchEntitlement | null
  const permissions = new Set<string>(access?.permissions.map((permission) => permission.code) ?? [])
  const canCreateBranch = permissions.has('branch.create')
  const canInviteMembers = permissions.has('member.invite')
  const canReadMembers = permissions.has('member.read')
  const canUpdateMembers = permissions.has('member.update')
  const canManageRoles = permissions.has('role.manage')
  const canManageOwners = access?.roles.some((role) => role.code === 'owner') ?? false
  const canReadAudit = permissions.has('audit.read')
  const canReadBilling = permissions.has('billing.read')

  const [membersResult, invitationHistoryResult, rolesResult, auditResult, invoicesResult, channelsResult, proofsResult] = await Promise.all([
    canReadMembers
      ? supabase.rpc('organization_member_directory', { p_organization_id: id })
      : Promise.resolve({ data: [] }),
    canReadMembers
      ? supabase.rpc('organization_invitation_history', {
          p_organization_id: id,
          p_search: invitationSearch,
          p_status: invitationStatus,
          p_page: invitationPage,
          p_page_size: invitationPageSize,
        })
      : Promise.resolve({ data: { items: [], total_count: 0 } }),
    canInviteMembers || canUpdateMembers || canManageRoles
      ? supabase.from('organization_roles').select('code, name').eq('organization_id', id).order('code')
      : Promise.resolve({ data: [] }),
    canReadAudit
      ? supabase.rpc('organization_audit_history', {
          p_organization_id: id,
          p_search: auditSearch,
          p_category: auditCategory,
          p_page: auditPage,
          p_page_size: auditPageSize,
        })
      : Promise.resolve({ data: { items: [], total_count: 0 } }),
    canReadBilling
      ? supabase.from('billing_invoices')
          .select('id, invoice_number, total_amount, currency, due_at')
          .eq('organization_id', id)
          .eq('status', 'pending')
          .order('issued_at', { ascending: false })
          .limit(20)
      : Promise.resolve({ data: [] }),
    canReadBilling
      ? supabase.rpc('customer_active_billing_transfer_channels', { p_organization_id: id })
      : Promise.resolve({ data: [] }),
    canReadBilling
      ? supabase.from('billing_transfer_proofs')
          .select('id, invoice_id, original_file_name, claimed_amount, claimed_transfer_at, status, submitted_at, fulfilled_payment_id, fulfilled_at, fulfilled_payment:billing_payments!billing_transfer_proofs_fulfilled_payment_id_fkey(payment_number)')
          .eq('organization_id', id)
          .order('created_at', { ascending: false })
          .limit(10)
      : Promise.resolve({ data: [] }),
  ])

  if ('error' in membersResult && membersResult.error) {
    console.error('[organization-page] member directory lookup failed', {
      organizationId: id,
      userId: user.id,
      error: membersResult.error.message,
    })
  }

  const members = (membersResult.data ?? []) as OrganizationMemberDirectoryEntry[]
  if ('error' in invitationHistoryResult && invitationHistoryResult.error) {
    console.error('[organization-page] invitation history lookup failed', {
      organizationId: id,
      userId: user.id,
      error: invitationHistoryResult.error.message,
    })
  }

  const invitationHistory = (invitationHistoryResult.data ?? { items: [], total_count: 0 }) as OrganizationInvitationHistoryResult
  const invitationTotalPages = Math.max(1, Math.ceil(invitationHistory.total_count / invitationPageSize))
  if (canReadMembers && !('error' in invitationHistoryResult && invitationHistoryResult.error) && invitationPage > invitationTotalPages) {
    const canonicalParams = new URLSearchParams()
    if (invitationTotalPages > 1) canonicalParams.set('invitePage', String(invitationTotalPages))
    if (invitationSearch) canonicalParams.set('inviteSearch', invitationSearch)
    if (invitationStatus !== 'all') canonicalParams.set('inviteStatus', invitationStatus)
    const canonicalQuery = canonicalParams.toString()
    redirect(`/organizations/${id}${canonicalQuery ? `?${canonicalQuery}` : ''}#invitation-history`)
  }
  const roles = rolesResult.data ?? []
  if ('error' in auditResult && auditResult.error) {
    console.error('[organization-page] audit history lookup failed', {
      organizationId: id,
      userId: user.id,
      error: auditResult.error.message,
    })
  }
  const auditHistory = (auditResult.data ?? { items: [], total_count: 0 }) as OrganizationAuditLogResult
  const billingInvoices = (invoicesResult.data ?? []) as TransferInvoiceOption[]
  const transferChannels = (channelsResult.data ?? []) as TransferChannelOption[]
  const transferProofs = (proofsResult.data ?? []).map((proof) => {
    const payment = Array.isArray(proof.fulfilled_payment) ? proof.fulfilled_payment[0] : proof.fulfilled_payment
    return {
      ...proof,
      payment_number: payment?.payment_number ?? null,
    }
  }) as TransferProofSummary[]
  const invitationRoles = canManageOwners ? roles : roles.filter((role) => role.code !== 'owner')
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
            {branchEntitlement?.plan_version_label && (
              <section className="subscription-overview" aria-label="ข้อมูล Subscription และสิทธิ์สาขา">
                <div className="subscription-overview-header">
                  <strong>สิทธิ์ Subscription</strong>
                  <span className={`subscription-state ${branchEntitlement.access_state}`}>
                    {subscriptionAccessStateLabel(branchEntitlement.access_state)}
                  </span>
                </div>
                <dl className="subscription-overview-grid">
                  <div><dt>Plan</dt><dd>{branchEntitlement.plan_name}</dd></div>
                  <div><dt>Version</dt><dd>{branchEntitlement.plan_version_label}</dd></div>
                  <div><dt>สถานะ Subscription</dt><dd>{subscriptionAccessStateLabel(branchEntitlement.access_state)}</dd></div>
                  <div><dt>สิทธิ์สาขา</dt><dd>{branchEntitlement.current_count} / {branchEntitlement.max_count ?? 'ไม่จำกัด'} สาขา</dd></div>
                </dl>
              </section>
            )}
            {!canCreateBranch && (
              <div className={branchEntitlement?.can_create === false ? 'error' : 'countdown'} style={{ marginTop: 14 }}>
                {branchEntitlementMessage(branchEntitlement)}
              </div>
            )}
            {canCreateBranch && <CreateBranchForm organizationId={id} entitlement={branchEntitlement} />}
          </article>

          {access
            ? <OrganizationAccessSummaryCard access={access} />
            : <article className="card"><h2>ตำแหน่งและหน้าที่ของคุณ</h2><div className="empty">ไม่สามารถอ่านข้อมูล Role และ Permission ได้</div></article>}
        </div>

        {canReadBilling && (
          <div style={{ marginTop: 18 }}>
            {'error' in invoicesResult && invoicesResult.error
              ? <div className="error">ไม่สามารถโหลด Invoice ที่รอชำระได้ กรุณา Refresh อีกครั้ง</div>
              : 'error' in channelsResult && channelsResult.error
                ? <div className="error">ไม่สามารถโหลดช่องทางรับโอนได้ กรุณา Refresh อีกครั้ง</div>
                : <BillingTransferProofUpload invoices={billingInvoices} channels={transferChannels} proofs={transferProofs} />}
          </div>
        )}

        {canInviteMembers && (
          <div className="card" style={{ marginTop: 18 }}>
            <h2>เชิญสมาชิก</h2>
            <p>สร้างคำเชิญพร้อม Role และ Branch Scope</p>
            <InviteMemberForm organizationId={id} roles={invitationRoles} branches={branches} />
          </div>
        )}

        {canReadMembers && (
          <div className="card" style={{ marginTop: 18 }}>
            <h2>สมาชิก</h2>
            <p>รายชื่อ ตำแหน่ง Role ขอบเขต และสถานะสมาชิกภายใน Organization</p>
            <MemberManagement
              members={members}
              roles={roles}
              branches={branches}
              canUpdateMembers={canUpdateMembers}
              canManageRoles={canManageRoles}
              canManageOwners={canManageOwners}
            />
          </div>
        )}

        {canReadAudit && (
          <div className="card" style={{ marginTop: 18 }}>
            <h2>Audit Log</h2>
            <p>ประวัติกิจกรรมสำคัญของ Organization แก้ไขหรือลบย้อนหลังไม่ได้ และแสดงหน้าละ {auditPageSize} รายการ</p>
            {'error' in auditResult && auditResult.error
              ? <div className="error">ไม่สามารถโหลด Audit Log ได้ กรุณาลอง Refresh อีกครั้ง</div>
              : <OrganizationAuditLog
                  organizationId={id}
                  items={auditHistory.items}
                  totalCount={auditHistory.total_count}
                  page={auditPage}
                  pageSize={auditPageSize}
                  search={auditSearch}
                  category={auditCategory}
                  timezone={organization.timezone}
                />}
          </div>
        )}

        {canReadMembers && (
          <div className="card" style={{ marginTop: 18 }}>
            <h2>ประวัติคำเชิญ</h2>
            <p>ค้นหา กรองสถานะ และแสดงหน้าละ {invitationPageSize} รายการ</p>
            {'error' in invitationHistoryResult && invitationHistoryResult.error
              ? <div className="error">ไม่สามารถโหลดประวัติคำเชิญได้ กรุณาลอง Refresh อีกครั้ง</div>
              : <InvitationHistory
                  organizationId={id}
                  invitations={invitationHistory.items}
                  totalCount={invitationHistory.total_count}
                  page={invitationPage}
                  pageSize={invitationPageSize}
                  search={invitationSearch}
                  status={invitationStatus}
                  timezone={organization.timezone}
                  canInviteMembers={canInviteMembers}
                />}
          </div>
        )}

        {!hasManagementPermission && accessResult.error && (
          <div className="error" style={{ marginTop: 18 }}>ไม่สามารถตรวจสอบสิทธิ์การจัดการได้ ระบบจึงซ่อนเครื่องมือจัดการเพื่อความปลอดภัย</div>
        )}
      </section>
    </main>
  )
}

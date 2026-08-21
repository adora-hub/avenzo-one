import { redirect } from 'next/navigation'
import { ApplicationShell } from '@/app/components/application-shell'
import { ProductHeaderBreadcrumb } from '@/app/components/product-header-breadcrumb'
import { createClient } from '@/lib/supabase/server'
import type { OrganizationAccessSummary } from '@/lib/organization-access'
import { RapidEntryWorkspaceShell } from './rapid-entry-workspace-shell'

type Props = { params: Promise<{ id: string }> }

export default async function LiveSaleRapidEntryPage({ params }: Props) {
  const { id: organizationId } = await params
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/')

  const [organizationResult, accessResult, platformAdminResult] = await Promise.all([
    supabase.from('organizations').select('id, name').eq('id', organizationId).maybeSingle(),
    supabase.rpc('current_user_organization_access', { p_organization_id: organizationId }),
    supabase.from('platform_admins').select('status').eq('user_id', user.id).maybeSingle(),
  ])

  const organization = organizationResult.data
  const access = (accessResult.data?.[0] ?? null) as OrganizationAccessSummary | null
  if (!organization || !access || access.membership_status !== 'active') redirect('/dashboard')

  const permissions = new Set(access.permissions.map((permission) => permission.code))
  if (!permissions.has('product.read')) redirect(`/organizations/${organizationId}`)

  return <ApplicationShell
    email={user.email ?? ''}
    isPlatformAdmin={platformAdminResult.data?.status === 'active'}
    section="workspace"
    organizationId={organizationId}
    organizationName={organization.name}
    headerBreadcrumb={<ProductHeaderBreadcrumb organizationId={organizationId} currentPage="live-sale-rapid-entry" />}
  >
    <section className="content product-workspace-page live-sale-page live-sale-rapid-entry-page">
      <RapidEntryWorkspaceShell
        organizationId={organizationId}
        organizationName={organization.name}
        actorUserId={user.id}
        canManage={permissions.has('product.create')}
      />
    </section>
  </ApplicationShell>
}

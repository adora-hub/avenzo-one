import { redirect } from 'next/navigation'
import { ApplicationShell } from '@/app/components/application-shell'
import { ProductHeaderBreadcrumb } from '@/app/components/product-header-breadcrumb'
import { createClient } from '@/lib/supabase/server'
import type { OrganizationAccessSummary } from '@/lib/organization-access'
import type { RapidRangeSelection } from './rapid-prefix-assistant'
import { RapidEntryWorkspaceShell } from './rapid-entry-workspace-shell'

type Props = { params: Promise<{ id: string }> }

export default async function LiveSaleRapidEntryPage({ params }: Props) {
  const { id: organizationId } = await params
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/')

  const [organizationResult, accessResult, platformAdminResult, categoryResult] = await Promise.all([
    supabase.from('organizations').select('id, name').eq('id', organizationId).maybeSingle(),
    supabase.rpc('current_user_organization_access', { p_organization_id: organizationId }),
    supabase.from('platform_admins').select('status').eq('user_id', user.id).maybeSingle(),
    supabase.from('product_categories').select('id, name').eq('organization_id', organizationId).eq('status', 'active').order('name').limit(100),
  ])

  const organization = organizationResult.data
  const access = (accessResult.data?.[0] ?? null) as OrganizationAccessSummary | null
  if (!organization || !access || access.membership_status !== 'active') redirect('/dashboard')

  const permissions = new Set(access.permissions.map((permission) => permission.code))
  if (!permissions.has('product.read')) redirect(`/organizations/${organizationId}`)

  let activeReservation: RapidRangeSelection | null = null
  let assignedSalesCodes: string[] = []
  if (permissions.has('product.create')) {
    const { data: batch } = await supabase
      .from('sales_code_reservation_batches')
      .select('id, sequence_id, start_number, end_number, expires_at')
      .eq('organization_id', organizationId)
      .eq('created_by', user.id)
      .eq('purpose', 'permanent_sales')
      .eq('status', 'active')
      .gt('expires_at', new Date().toISOString())
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle()

    if (batch) {
      const { data: sequence } = await supabase
        .from('sales_code_sequences')
        .select('prefix')
        .eq('organization_id', organizationId)
        .eq('id', batch.sequence_id)
        .maybeSingle()
      if (sequence?.prefix) {
        const { data: assignedReservations } = await supabase
          .from('sales_code_reservations')
          .select('code')
          .eq('organization_id', organizationId)
          .eq('batch_id', batch.id)
          .eq('status', 'assigned')
          .order('sequence_number')
        assignedSalesCodes = (assignedReservations ?? []).map((reservation) => reservation.code)
        activeReservation = {
          prefix: sequence.prefix,
          start: Number(batch.start_number),
          end: Number(batch.end_number),
          occupiedUntil: Math.max(0, Number(batch.start_number) - 1),
          requestedPrefix: sequence.prefix,
          authoritative: true,
          reserved: true,
          reservationBatchId: batch.id,
          expiresAt: batch.expires_at,
        }
      }
    }
  }

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
        activeReservation={activeReservation}
        assignedSalesCodes={assignedSalesCodes}
        categories={(categoryResult.data ?? []).map((category) => ({ id: category.id, name: category.name }))}
      />
    </section>
  </ApplicationShell>
}

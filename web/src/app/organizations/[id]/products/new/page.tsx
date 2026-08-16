import { redirect } from 'next/navigation'
import { ApplicationShell } from '@/app/components/application-shell'
import { ProductHeaderBreadcrumb } from '@/app/components/product-header-breadcrumb'
import { createClient } from '@/lib/supabase/server'
import type { OrganizationAccessSummary } from '@/lib/organization-access'
import { UnifiedProductCreationForm } from './unified-product-creation-form'

type Props = { params: Promise<{ id: string }> }

export type ProductMasterOption = {
  id: string
  name: string
  status: 'active' | 'archived'
  version: number
}

export type ProductBranchOption = Pick<ProductMasterOption, 'id' | 'name'> & {
  code: string
}

export type ProductBundleSkuOption = Pick<ProductMasterOption, 'id' | 'name'> & {
  skuCode: string
}

export default async function NewProductPage({ params }: Props) {
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
  const canManage = permissions.has('product.manage')

  const [categoriesResult, brandsResult, tagsResult, branchesResult, bundleSkusResult] = await Promise.all([
    supabase.from('product_categories').select('id, name, status, version').eq('organization_id', organizationId).order('name').limit(200),
    supabase.from('product_brands').select('id, name, status, version').eq('organization_id', organizationId).order('name').limit(200),
    supabase.from('product_tags').select('id, name, status, version').eq('organization_id', organizationId).order('name').limit(200),
    supabase.from('branches').select('id, code, name').eq('organization_id', organizationId).eq('status', 'active').order('code').limit(100),
    supabase.from('skus').select('id, sku_code, name').eq('organization_id', organizationId).eq('status', 'active').order('sku_code').limit(300),
  ])

  const isPlatformAdmin = platformAdminResult.data?.status === 'active'
  const productsHref = `/organizations/${organizationId}/products`

  return <ApplicationShell
    email={user.email ?? ''}
    isPlatformAdmin={isPlatformAdmin}
    section="workspace"
    organizationId={organizationId}
    organizationName={organization.name}
    headerBreadcrumb={<ProductHeaderBreadcrumb organizationId={organizationId} currentPage="create-product" />}
  >
    <section className="content product-workspace-page product-creation-page">
      <UnifiedProductCreationForm
        organizationId={organizationId}
        organizationName={organization.name}
        productsHref={productsHref}
        canManage={canManage}
        actorEmail={user.email ?? ''}
        categories={categoriesResult.data ?? []}
        brands={brandsResult.data ?? []}
        tags={tagsResult.data ?? []}
        branches={branchesResult.data ?? []}
        bundleSkus={(bundleSkusResult.data ?? []).map((sku) => ({
          id: sku.id,
          name: sku.name,
          skuCode: sku.sku_code,
        }))}
      />
    </section>
  </ApplicationShell>
}

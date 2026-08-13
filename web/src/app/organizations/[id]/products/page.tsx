import { redirect } from 'next/navigation'
import { ApplicationShell } from '@/app/components/application-shell'
import {
  OperationsCardList,
  OperationsPageHeader,
  OperationsStatusBadge,
  OperationsSummaryCard,
} from '@/app/components/operations-ui'
import { createFoundationReadRepository } from '@/lib/foundation/server-read'
import { createClient } from '@/lib/supabase/server'
import type { OrganizationAccessSummary } from '@/lib/organization-access'
import { ProductSkuWorkspace } from './product-sku-workspace'
import { uuidPattern } from '@/lib/foundation/contracts'
import type { ProductReadModel, SkuReadModel } from '@/lib/foundation/repositories'

type SearchParams = Record<string, string | string[] | undefined>
type Props = { params: Promise<{ id: string }>; searchParams: Promise<SearchParams> }

const statuses = new Set(['', 'draft', 'active', 'archived'])

function firstParam(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] ?? '' : value ?? ''
}

export default async function ProductSkuPage({ params, searchParams }: Props) {
  const [{ id: organizationId }, query] = await Promise.all([params, searchParams])
  const view = firstParam(query.view) === 'skus' ? 'skus' : 'products'
  const search = firstParam(query.q).trim().slice(0, 160)
  const requestedStatus = firstParam(query.status).toLowerCase()
  const status = statuses.has(requestedStatus) ? requestedStatus : ''
  const cursor = firstParam(query.cursor) || null
  const requestedProductId = firstParam(query.product)
  const requestedSkuId = firstParam(query.sku)
  const productId = uuidPattern.test(requestedProductId) ? requestedProductId : ''
  const skuId = uuidPattern.test(requestedSkuId) ? requestedSkuId : ''

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
  const canRead = permissions.has('product.read')
  const canManage = permissions.has('product.manage')
  const isPlatformAdmin = platformAdminResult.data?.status === 'active'

  if (!canRead) {
    return <ApplicationShell
      email={user.email ?? ''}
      isPlatformAdmin={isPlatformAdmin}
      section="workspace"
      organizationId={organizationId}
      organizationName={organization.name}
    >
      <section className="content product-workspace-page">
        <OperationsPageHeader eyebrow="Phase 2.0.5 · Product/SKU" title="Product & SKU" description="จัดการสินค้าและรหัสที่ใช้ขายภายใน Organization" />
        <div className="operations-empty-state warning" role="alert"><span aria-hidden="true">!</span><div><h3>ไม่มีสิทธิ์อ่าน Product/SKU</h3><p>บัญชีนี้ต้องได้รับสิทธิ์ product.read จากผู้ดูแล Organization ก่อน</p></div></div>
      </section>
    </ApplicationShell>
  }

  const repository = await createFoundationReadRepository()
  const listPromise = view === 'products'
    ? repository.listProducts({ organizationId, search, status: status || undefined, cursor, pageSize: 20 })
    : repository.listSkus({ organizationId, search, status: status || undefined, cursor, pageSize: 20 })
  const [listResult, productOptionsResult, selectedProduct, selectedSku] = await Promise.all([
    listPromise,
    repository.listProducts({ organizationId, pageSize: 100 }),
    productId ? repository.getProduct({ organizationId, productId }) : Promise.resolve(null),
    skuId ? repository.getSku({ organizationId, skuId }) : Promise.resolve(null),
  ])
  const products = view === 'products' ? listResult.items as ProductReadModel[] : []
  const skus = view === 'skus' ? listResult.items as SkuReadModel[] : []
  const activeCount = listResult.items.filter((item) => item.status === 'active').length
  const draftCount = listResult.items.filter((item) => item.status === 'draft').length

  return <ApplicationShell
    email={user.email ?? ''}
    isPlatformAdmin={isPlatformAdmin}
    section="workspace"
    organizationId={organizationId}
    organizationName={organization.name}
  >
    <section className="content product-workspace-page">
      <OperationsPageHeader
        eyebrow="Phase 2.0.5 · Foundation Vertical Slice"
        title="Product & SKU"
        description={`จัดการสินค้า รหัส SKU, Sales Code และ Barcode ของ ${organization.name} โดยทุกคำสั่งผ่าน Server authorization และ audit`}
        actions={<OperationsStatusBadge tone={canManage ? 'success' : 'info'}>{canManage ? 'จัดการได้' : 'อ่านอย่างเดียว'}</OperationsStatusBadge>}
      />

      <OperationsCardList label="สรุปรายการ Product และ SKU" columns={3}>
        <OperationsSummaryCard label={`รายการ ${view === 'products' ? 'Product' : 'SKU'} ในหน้านี้`} value={listResult.items.length} description="แสดงสูงสุด 20 รายการต่อหน้า" />
        <OperationsSummaryCard label="ใช้งาน" value={activeCount} description="นับจากรายการในหน้าปัจจุบัน" meta={<OperationsStatusBadge tone="success">Active</OperationsStatusBadge>} />
        <OperationsSummaryCard label="ฉบับร่าง" value={draftCount} description="พร้อมตรวจสอบก่อนเปิดใช้งาน" meta={<OperationsStatusBadge tone="info">Draft</OperationsStatusBadge>} />
      </OperationsCardList>

      <section className="product-workspace-panel" aria-label="รายการ Product และ SKU">
        <ProductSkuWorkspace
          organizationId={organizationId}
          view={view}
          search={search}
          status={status}
          products={products}
          skus={skus}
          productOptions={productOptionsResult.items}
          selectedProduct={selectedProduct}
          selectedSku={selectedSku}
          nextCursor={listResult.nextCursor}
          canManage={canManage}
        />
      </section>
    </section>
  </ApplicationShell>
}

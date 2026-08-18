import { redirect } from 'next/navigation'
import { ApplicationShell } from '@/app/components/application-shell'
import { ProductHeaderBreadcrumb } from '@/app/components/product-header-breadcrumb'
import { OperationsPageHeader } from '@/app/components/operations-ui'
import { createFoundationReadRepository } from '@/lib/foundation/server-read'
import { createClient } from '@/lib/supabase/server'
import type { OrganizationAccessSummary } from '@/lib/organization-access'
import { ProductSkuWorkspace } from './product-sku-workspace'
import { uuidPattern } from '@/lib/foundation/contracts'
import type { ProductWorkspaceRow, SkuReadModel } from '@/lib/foundation/repositories'

type SearchParams = Record<string, string | string[] | undefined>
type Props = { params: Promise<{ id: string }>; searchParams: Promise<SearchParams> }

const statuses = new Set(['', 'draft', 'active', 'archived'])
const productPageSizes = new Set([10, 25, 50, 100, 300, 400])

function firstParam(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] ?? '' : value ?? ''
}

function validDateParam(value: string) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return ''
  const parsed = new Date(`${value}T00:00:00Z`)
  return Number.isNaN(parsed.getTime()) || parsed.toISOString().slice(0, 10) !== value ? '' : value
}
function validMoneyParam(value: string) {
  const normalized = value.trim()
  if (!/^\d{1,9}(?:\.\d{1,2})?$/.test(normalized)) return ''
  const amount = Number(normalized)
  return Number.isFinite(amount) && amount <= 999_999_999.99 ? normalized : ''
}

function validQuantityParam(value: string) {
  const normalized = value.trim()
  if (!/^\d{1,12}(?:\.\d{1,3})?$/.test(normalized)) return ''
  const amount = Number(normalized)
  return Number.isFinite(amount) && amount <= 999_999_999_999.999 ? normalized : ''
}


export default async function ProductSkuPage({ params, searchParams }: Props) {
  const [{ id: organizationId }, query] = await Promise.all([params, searchParams])
  const view = firstParam(query.view) === 'skus' ? 'skus' : 'products'
  const search = firstParam(query.q).trim().slice(0, 400)
  const bulkSearchActive = firstParam(query.bulk) === '1'
  const requestedStatus = firstParam(query.status).toLowerCase()
  const status = statuses.has(requestedStatus) ? requestedStatus : ''
  const dateField = firstParam(query.date_by) === 'updated' ? 'updated' : 'created'
  const dateFrom = validDateParam(firstParam(query.date_from))
  const dateTo = validDateParam(firstParam(query.date_to))
  const brandId = uuidPattern.test(firstParam(query.brand_id)) ? firstParam(query.brand_id) : ''
  const categoryId = uuidPattern.test(firstParam(query.category_id)) ? firstParam(query.category_id) : ''
  const tagIds = Array.from(new Set(firstParam(query.tag_ids).split(',').filter((value) => uuidPattern.test(value)))).slice(0, 12)
  const priceMin = validMoneyParam(firstParam(query.price_min))
  const priceMax = validMoneyParam(firstParam(query.price_max))
  const stockMin = validQuantityParam(firstParam(query.stock_min))
  const stockMax = validQuantityParam(firstParam(query.stock_max))
  const cursor = firstParam(query.cursor) || null
  const requestedProductPageSize = Number(firstParam(query.page_size))
  const productPageSize = productPageSizes.has(requestedProductPageSize) ? requestedProductPageSize : 25
  const productPage = Math.max(1, Math.trunc(Number(firstParam(query.page)) || 1))
  const sort = firstParam(query.sort) === 'updated_asc' ? 'updated_asc' : 'updated_desc'
  const requestedProductId = firstParam(query.product)
  const requestedProductAction = firstParam(query.action)
  const productAction = requestedProductAction === 'edit' || requestedProductAction === 'skus' || requestedProductAction === 'price' ? requestedProductAction : ''
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
  const canReadInventory = permissions.has('inventory.read')
  const canAdjustInventory = permissions.has('inventory.adjust')
  const canReadCost = permissions.has('product.cost.read')
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
    ? repository.listProductWorkspaceRows({
      organizationId,
      search,
      status: status || undefined,
      dateField,
      dateFrom: dateFrom || undefined,
      dateTo: dateTo || undefined,
      brandId: brandId || undefined,
      categoryId: categoryId || undefined,
      tagIds,
      page: productPage,
      priceMin: priceMin ? Number(priceMin) : undefined,
      priceMax: priceMax ? Number(priceMax) : undefined,
      stockMin: canReadInventory && stockMin ? Number(stockMin) : undefined,
      stockMax: canReadInventory && stockMax ? Number(stockMax) : undefined,
      pageSize: productPageSize,
      includeInventory: canReadInventory,
      includeCost: canReadCost,
      sort,
    })
    : repository.listSkus({ organizationId, search, status: status || undefined, cursor, pageSize: 20 })
  const [listResult, productOptionsResult, brandOptionsResult, categoryOptionsResult, tagOptionsResult, selectedProduct, selectedSku, inventoryLocationsResult, activeWarehousesResult] = await Promise.all([
    listPromise,
    repository.listProducts({ organizationId, pageSize: 100 }),
    supabase.from('product_brands').select('id, name, status, version').eq('organization_id', organizationId).order('name').limit(200),
    supabase.from('product_categories').select('id, name, status, version').eq('organization_id', organizationId).order('name').limit(200),
    supabase.from('product_tags').select('id, name, status, version').eq('organization_id', organizationId).order('name').limit(200),
    productId ? repository.getProductWorkspaceDetail({
      organizationId, productId, includeInventory: canReadInventory, includeCost: canReadCost, quickMode: productAction === '',
    }) : Promise.resolve(null),
    skuId ? repository.getSkuWorkspaceDetail({
      organizationId, skuId, includeInventory: canReadInventory,
    }) : Promise.resolve(null),
    canAdjustInventory ? repository.listLocations({ organizationId, status: 'active', pageSize: 100 }) : Promise.resolve([]),
    canAdjustInventory ? repository.listWarehouses({ organizationId, status: 'active', pageSize: 100 }) : Promise.resolve({ items: [], nextCursor: null }),
  ])
  const activeWarehouseIds = new Set(activeWarehousesResult.items.map((warehouse) => warehouse.id))
  const inventoryLocationOptions = inventoryLocationsResult
    .filter((location) => activeWarehouseIds.has(location.warehouseId))
    .map((location) => ({ id: location.id, name: location.name, code: location.code, warehouseName: location.warehouseName }))
  const productWorkspaceRows = view === 'products' ? listResult.items as ProductWorkspaceRow[] : []
  const skus = view === 'skus' ? listResult.items as SkuReadModel[] : []
  const productTotalCount = view === 'products' ? listResult.totalCount ?? productWorkspaceRows.length : 0
  const productTotalPages = Math.max(1, Math.ceil(productTotalCount / productPageSize))
  if (view === 'products' && productPage > productTotalPages) {
    const normalizedQuery = new URLSearchParams({ view: 'products', page: String(productTotalPages), page_size: String(productPageSize) })
    if (search) normalizedQuery.set('q', search)
    if (bulkSearchActive) normalizedQuery.set('bulk', '1')
    if (status) normalizedQuery.set('status', status)
    if (dateFrom || dateTo) normalizedQuery.set('date_by', dateField)
    if (dateFrom) normalizedQuery.set('date_from', dateFrom)
    if (dateTo) normalizedQuery.set('date_to', dateTo)
    if (brandId) normalizedQuery.set('brand_id', brandId)
    if (categoryId) normalizedQuery.set('category_id', categoryId)
    if (tagIds.length) normalizedQuery.set('tag_ids', tagIds.join(','))
    if (sort) normalizedQuery.set('sort', sort)
    if (priceMin) normalizedQuery.set('price_min', priceMin)
    if (priceMax) normalizedQuery.set('price_max', priceMax)
    if (canReadInventory && stockMin) normalizedQuery.set('stock_min', stockMin)
    if (canReadInventory && stockMax) normalizedQuery.set('stock_max', stockMax)
    redirect(`/organizations/${organizationId}/products?${normalizedQuery}`)
  }
  return <ApplicationShell
    email={user.email ?? ''}
    isPlatformAdmin={isPlatformAdmin}
    section="workspace"
    organizationId={organizationId}
    organizationName={organization.name}
    headerBreadcrumb={<ProductHeaderBreadcrumb organizationId={organizationId} />}
  >
    <section className="content product-workspace-page">
      <ProductSkuWorkspace
        organizationId={organizationId}
        organizationName={organization.name}
        skuCount={view === 'products' ? productWorkspaceRows.reduce((total, row) => total + row.skuCount, 0) : skus.length}
        view={view}
        search={search}
        bulkSearchActive={bulkSearchActive}
        status={status}
        dateField={dateField}
        dateFrom={dateFrom}
        dateTo={dateTo}
        brandId={brandId}
        brandOptions={(brandOptionsResult.data ?? []).map((option) => ({ id: String(option.id), name: String(option.name), status: option.status === 'archived' ? 'archived' as const : 'active' as const, version: Number(option.version) }))}
        categoryId={categoryId}
        categoryOptions={(categoryOptionsResult.data ?? []).map((option) => ({ id: String(option.id), name: String(option.name), status: option.status === 'archived' ? 'archived' as const : 'active' as const, version: Number(option.version) }))}
        tagIds={tagIds}
        tagOptions={(tagOptionsResult.data ?? []).map((option) => ({ id: String(option.id), name: String(option.name), status: option.status === 'archived' ? 'archived' as const : 'active' as const, version: Number(option.version) }))}
        sort={sort}
        priceMin={priceMin}
        priceMax={priceMax}
        stockMin={canReadInventory ? stockMin : ''}
        stockMax={canReadInventory ? stockMax : ''}
        canReadInventory={canReadInventory}
        productWorkspaceRows={productWorkspaceRows}
        productPage={productPage}
        productPageSize={productPageSize}
        productTotalCount={productTotalCount}
        skus={skus}
        productOptions={productOptionsResult.items}
        selectedProduct={selectedProduct}
        productAction={productAction}
        selectedSku={selectedSku}
        nextCursor={listResult.nextCursor}
        canManage={canManage}
        canAdjustInventory={canAdjustInventory}
        inventoryLocationOptions={inventoryLocationOptions}
        canReadCost={canReadCost}
      />
    </section>
  </ApplicationShell>
}

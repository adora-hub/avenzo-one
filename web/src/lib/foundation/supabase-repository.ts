import 'server-only'

import type { SupabaseClient } from '@supabase/supabase-js'
import type {
  FoundationApplicationCommand,
  FoundationCommandOutcome,
} from './contracts'
import {
  productCreationCommandTypes,
  productVariantCreationCommandTypes,
  productDomainCommandTypes,
  productImageCommandTypes,
} from './contracts'
import { decodeFoundationCursor, encodeFoundationCursor } from './cursor'
import { mapFoundationError } from './errors'
import {
  parseInitialStockBatchResult,
  type InitialStockBatchRequest,
  type InitialStockBatchResult,
} from './initial-stock-workflow'
import {
  buildProductWorkspaceRows,
  PRODUCT_WORKSPACE_BALANCE_AGGREGATE_LIMIT,
  PRODUCT_WORKSPACE_SKU_AGGREGATE_LIMIT,
} from './product-workspace-read-model'
import {
  buildProductWorkspaceDetail,
  PRODUCT_DETAIL_SKU_LIMIT,
} from './product-detail-read-model'
import type {
  FoundationCommandRepository,
  FoundationReadRepository,
  PageResult,
  InventoryBalanceReadModel,
  LocationReadModel,
  ProductReadModel,
  ProductImageReadModel,
  ProductWorkspaceDetail,
  ProductWorkspaceRow,
  ProductWorkspaceSkuCost,
  ProductWorkspaceSkuProfile,
  ProductWorkspaceStockSummary,
  SkuReadModel,
  StockMovementReadModel,
  WarehouseReadModel,
} from './repositories'

const PRODUCT_WORKSPACE_TAG_AGGREGATE_LIMIT = 4_000

function nullableNumber(value: unknown) {
  return value === null || value === undefined || value === '' ? null : Number(value)
}

function mapSkuProfile(row: Record<string, unknown> | undefined): ProductWorkspaceSkuProfile | null {
  if (!row) return null
  return {
    version: Number(row.version),
    quantityBehavior: String(row.quantity_behavior),
    salePrice: nullableNumber(row.sale_price),
    currencyCode: String(row.currency_code),
    taxCategory: String(row.tax_category),
    taxRate: Number(row.tax_rate),
    productWeightKg: nullableNumber(row.product_weight_kg),
    productLengthCm: nullableNumber(row.product_length_cm),
    productWidthCm: nullableNumber(row.product_width_cm),
    productHeightCm: nullableNumber(row.product_height_cm),
    packageWeightKg: nullableNumber(row.package_weight_kg),
    packageLengthCm: nullableNumber(row.package_length_cm),
    packageWidthCm: nullableNumber(row.package_width_cm),
    packageHeightCm: nullableNumber(row.package_height_cm),
    safetyStock: nullableNumber(row.safety_stock),
    reorderMin: nullableNumber(row.reorder_min),
    reorderMax: nullableNumber(row.reorder_max),
  }
}

function mapSkuCost(row: Record<string, unknown> | undefined, includeCost: boolean): ProductWorkspaceSkuCost {
  if (!includeCost) return { mode: 'not-authorized', costPrice: null, currencyCode: null, version: null }
  return {
    mode: 'authorized',
    costPrice: nullableNumber(row?.cost_price),
    currencyCode: row?.currency_code ? String(row.currency_code) : null,
    version: row?.version === undefined ? null : Number(row.version),
  }
}

function boundedPageSize(value?: number) {
  return Math.min(Math.max(Math.trunc(value ?? 25), 1), 100)
}

const PRODUCT_WORKSPACE_PAGE_SIZES = new Set([10, 25, 50, 100, 300, 400])

function boundedProductWorkspacePageSize(value?: number) {
  const normalized = Math.trunc(value ?? 25)
  return PRODUCT_WORKSPACE_PAGE_SIZES.has(normalized) ? normalized : 25
}

function safeSearch(value?: string) {
  return value?.trim().slice(0, 160).replace(/[,%()]/g, '') ?? ''
}

function workspaceIdentifierTerms(value?: string) {
  return Array.from(new Set((value ?? '')
    .slice(0, 400)
    .split(/[\s,\n\r]+/)
    .map((term) => term.trim().replace(/[^\p{L}\p{N}._\/-]/gu, ''))
    .filter(Boolean)))
    .slice(0, 50)
}

function isProductImageReadModelUnavailable(error: unknown) {
  const candidate = error as { code?: string; message?: string; details?: string }
  const code = String(candidate?.code ?? '').toUpperCase()
  const message = `${candidate?.message ?? ''} ${candidate?.details ?? ''}`.toLowerCase()
  return code === 'PGRST205'
    || code === '42P01'
    || (message.includes('product_images') && message.includes('schema cache'))
}

function productImageRowsOrFallback<T>(data: T[] | null, error: unknown): T[] {
  if (!error) return data ?? []
  if (!isProductImageReadModelUnavailable(error)) throw mapFoundationError(error)

  const candidate = error as { code?: string }
  console.warn('[foundation:products] Product images are not available in this environment; using placeholders.', {
    code: String(candidate?.code ?? 'unknown'),
  })
  return []
}

async function signProductImages(
  client: SupabaseClient,
  rows: Array<{
    id: string
    product_id: string
    storage_path: string
    alt_text: string | null
    mime_type: string
    file_size_bytes: number | string
    sort_order: number
    is_cover: boolean
  }>,
): Promise<ProductImageReadModel[]> {
  if (rows.length === 0) return []
  const { data, error } = await client.storage
    .from('product-images')
    .createSignedUrls(rows.map((row) => row.storage_path), 600)
  if (error || !data) return []
  const signedUrlByPath = new Map(data
    .filter((item) => item.path && item.signedUrl && !item.error)
    .map((item) => [String(item.path), String(item.signedUrl)]))
  return rows.flatMap((row) => {
    const signedUrl = signedUrlByPath.get(row.storage_path)
    if (!signedUrl) return []
    return [{
      id: row.id,
      productId: row.product_id,
      signedUrl,
      altText: row.alt_text,
      mimeType: row.mime_type as ProductImageReadModel['mimeType'],
      fileSizeBytes: Number(row.file_size_bytes),
      sortOrder: Number(row.sort_order),
      isCover: Boolean(row.is_cover),
    }]
  })
}

function nextCursor<T extends { id: string; updatedAt?: string; occurredAt?: string }>(
  rows: T[],
  pageSize: number,
) {
  if (rows.length <= pageSize) return null
  const last = rows[pageSize - 1]
  return encodeFoundationCursor({
    timestamp: last.updatedAt ?? last.occurredAt ?? '',
    id: last.id,
  })
}

export class SupabaseFoundationReadRepository implements FoundationReadRepository {
  constructor(private readonly client: SupabaseClient) {}

  async listProductWorkspaceRows(input: {
    organizationId: string
    status?: string
    search?: string
    dateField?: 'created' | 'updated'
    dateFrom?: string
    dateTo?: string
    brandId?: string
    tagIds?: string[]
    priceMin?: number
    priceMax?: number
    stockMin?: number
    stockMax?: number
    categoryId?: string
    cursor?: string | null
    page?: number
    pageSize?: number
    includeInventory?: boolean
    includeCost?: boolean
    sort?: 'updated_desc' | 'updated_asc'
  }): Promise<PageResult<ProductWorkspaceRow>> {
    const pageSize = boundedProductWorkspacePageSize(input.pageSize)
    const useOffsetPagination = input.page !== undefined
    const page = Math.max(1, Math.trunc(input.page ?? 1))
    const cursor = useOffsetPagination ? null : decodeFoundationCursor(input.cursor)
    const search = safeSearch(input.search)
    const identifierTerms = workspaceIdentifierTerms(input.search)
    let matchingProductIds: string[] = []

    if (identifierTerms.length > 0) {
      const identifierFilters = identifierTerms.flatMap((term) => [
        `sku_code.ilike.${term}`,
        `sales_code.ilike.${term}`,
        `barcode.eq.${term}`,
      ])
      const { data, error } = await this.client.from('skus')
        .select('product_id')
        .eq('organization_id', input.organizationId)
        .or(identifierFilters.join(','))
        .limit(PRODUCT_WORKSPACE_SKU_AGGREGATE_LIMIT)
      if (error) throw mapFoundationError(error)
      matchingProductIds = Array.from(new Set((data ?? []).map((row) => String(row.product_id))))
    }

    const sortAscending = input.sort === 'updated_asc'
    let matchingTagProductIds: string[] | null = null
    if (input.tagIds?.length) {
      const { data, error } = await this.client.from('product_tag_assignments')
        .select('product_id')
        .eq('organization_id', input.organizationId)
        .in('tag_id', input.tagIds)
        .limit(PRODUCT_WORKSPACE_TAG_AGGREGATE_LIMIT)
      if (error) throw mapFoundationError(error)
      matchingTagProductIds = Array.from(new Set((data ?? []).map((row) => String(row.product_id))))
      if (matchingTagProductIds.length === 0) {
        return {
          items: [],
          nextCursor: null,
          totalCount: useOffsetPagination ? 0 : undefined,
        }
      }
    }
    let matchingPriceProductIds: string[] | null = null
    if (input.priceMin !== undefined || input.priceMax !== undefined) {
      let profileQuery = this.client.from('sku_product_profiles')
        .select('sku_id')
        .eq('organization_id', input.organizationId)
        .not('sale_price', 'is', null)
        .limit(PRODUCT_WORKSPACE_SKU_AGGREGATE_LIMIT)
      if (input.priceMin !== undefined) profileQuery = profileQuery.gte('sale_price', input.priceMin)
      if (input.priceMax !== undefined) profileQuery = profileQuery.lte('sale_price', input.priceMax)
      const { data: profileData, error: profileError } = await profileQuery
      if (profileError) throw mapFoundationError(profileError)
      const priceSkuIds = Array.from(new Set((profileData ?? []).map((row) => String(row.sku_id))))
      if (priceSkuIds.length === 0) {
        return {
          items: [],
          nextCursor: null,
          totalCount: useOffsetPagination ? 0 : undefined,
        }
      }
      const { data: skuData, error: skuError } = await this.client.from('skus')
        .select('product_id')
        .eq('organization_id', input.organizationId)
        .in('id', priceSkuIds)
        .limit(PRODUCT_WORKSPACE_SKU_AGGREGATE_LIMIT)
      if (skuError) throw mapFoundationError(skuError)
      matchingPriceProductIds = Array.from(new Set((skuData ?? []).map((row) => String(row.product_id))))
      if (matchingPriceProductIds.length === 0) {
        return {
          items: [],
          nextCursor: null,
          totalCount: useOffsetPagination ? 0 : undefined,
        }
      }
    }
    let matchingStockProductIds: string[] | null = null
    if (input.stockMin !== undefined || input.stockMax !== undefined) {
      const [skuResult, balanceResult] = await Promise.all([
        this.client.from('skus')
          .select('id, product_id')
          .eq('organization_id', input.organizationId)
          .limit(PRODUCT_WORKSPACE_SKU_AGGREGATE_LIMIT),
        this.client.from('inventory_balances')
          .select('sku_id, available')
          .eq('organization_id', input.organizationId)
          .limit(PRODUCT_WORKSPACE_BALANCE_AGGREGATE_LIMIT),
      ])
      for (const result of [skuResult, balanceResult]) {
        if (result.error) throw mapFoundationError(result.error)
      }
      const availableBySku = new Map<string, number>()
      for (const row of balanceResult.data ?? []) {
        const skuId = String(row.sku_id)
        availableBySku.set(skuId, (availableBySku.get(skuId) ?? 0) + Number(row.available ?? 0))
      }
      const matchingProducts = (skuResult.data ?? [])
        .filter((row) => {
          const available = availableBySku.get(String(row.id)) ?? 0
          return (input.stockMin === undefined || available >= input.stockMin)
            && (input.stockMax === undefined || available <= input.stockMax)
        })
        .map((row) => String(row.product_id))
      matchingStockProductIds = Array.from(new Set(matchingProducts))
      if (matchingStockProductIds.length === 0) {
        return {
          items: [],
          nextCursor: null,
          totalCount: useOffsetPagination ? 0 : undefined,
        }
      }
    }


    let productQuery = this.client.from('products')
      .select('id, organization_id, name, description, category_id, brand_id, structure_type, internal_note, status, version, created_at, created_by, updated_at', useOffsetPagination ? { count: 'exact' } : undefined)
      .eq('organization_id', input.organizationId)
      .order('updated_at', { ascending: sortAscending })
      .order('id', { ascending: sortAscending })
    if (input.status) productQuery = productQuery.eq('status', input.status)
    if (input.brandId) productQuery = productQuery.eq('brand_id', input.brandId)
    if (input.categoryId) productQuery = productQuery.eq('category_id', input.categoryId)
    if (matchingTagProductIds) productQuery = productQuery.in('id', matchingTagProductIds)
    if (matchingPriceProductIds) productQuery = productQuery.in('id', matchingPriceProductIds)
    const dateColumn = input.dateField === 'created' ? 'created_at' : 'updated_at'
    if (matchingStockProductIds) productQuery = productQuery.in('id', matchingStockProductIds)
    if (input.dateFrom) {
      productQuery = productQuery.gte(dateColumn, `${input.dateFrom}T00:00:00+07:00`)
    }
    if (input.dateTo) {
      productQuery = productQuery.lte(dateColumn, `${input.dateTo}T23:59:59.999+07:00`)
    }
    if (search) {
      productQuery = matchingProductIds.length > 0
        ? productQuery.or(`name.ilike.%${search}%,id.in.(${matchingProductIds.join(',')})`)
        : productQuery.ilike('name', `%${search}%`)
    }
    if (cursor) {
      const comparison = sortAscending ? 'gt' : 'lt'
      productQuery = productQuery.or(`updated_at.${comparison}.${cursor.timestamp},and(updated_at.eq.${cursor.timestamp},id.${comparison}.${cursor.id})`)
    }
    productQuery = useOffsetPagination
      ? productQuery.range((page - 1) * pageSize, page * pageSize - 1)
      : productQuery.limit(pageSize + 1)

    const { data: productData, error: productError, count: productCount } = await productQuery
    if (productError) throw mapFoundationError(productError)
    const productRows = (productData ?? []).slice(0, pageSize)
    const productIds = productRows.map((row) => String(row.id))
    if (productIds.length === 0) return {
      items: [],
      nextCursor: null,
      totalCount: useOffsetPagination ? productCount ?? 0 : undefined,
    }

    const { data: skuData, error: skuError } = await this.client.from('skus')
      .select('id, product_id, sku_code, name, barcode, sales_code, base_unit_code, status')
      .eq('organization_id', input.organizationId)
      .in('product_id', productIds)
      .order('created_at', { ascending: true })
      .order('id', { ascending: true })
      .limit(PRODUCT_WORKSPACE_SKU_AGGREGATE_LIMIT + 1)
    if (skuError) throw mapFoundationError(skuError)
    const skuAggregateCapped = (skuData?.length ?? 0) > PRODUCT_WORKSPACE_SKU_AGGREGATE_LIMIT
    const skuRows = (skuData ?? []).slice(0, PRODUCT_WORKSPACE_SKU_AGGREGATE_LIMIT)
    const skuIds = skuRows.map((row) => String(row.id))

    const categoryIds = Array.from(new Set(productRows.map((row) => row.category_id).filter(Boolean))) as string[]
    const brandIds = Array.from(new Set(productRows.map((row) => row.brand_id).filter(Boolean))) as string[]
    const creatorIds = Array.from(new Set(productRows.map((row) => row.created_by).filter(Boolean))) as string[]
    const [categoryResult, brandResult, assignmentResult, profileResult, costResult, creatorResult, imageResult, variantImageAssignmentResult, balanceResult] = await Promise.all([
      categoryIds.length > 0
        ? this.client.from('product_categories').select('id, name').eq('organization_id', input.organizationId).in('id', categoryIds)
        : Promise.resolve({ data: [], error: null }),
      brandIds.length > 0
        ? this.client.from('product_brands').select('id, name').eq('organization_id', input.organizationId).in('id', brandIds)
        : Promise.resolve({ data: [], error: null }),
      this.client.from('product_tag_assignments').select('product_id, tag_id')
        .eq('organization_id', input.organizationId).in('product_id', productIds)
        .limit(PRODUCT_WORKSPACE_TAG_AGGREGATE_LIMIT),
      skuIds.length > 0
        ? this.client.from('sku_product_profiles').select('sku_id, version, quantity_behavior, sale_price, currency_code, tax_category, tax_rate, product_weight_kg, product_length_cm, product_width_cm, product_height_cm, package_weight_kg, package_length_cm, package_width_cm, package_height_cm, safety_stock, reorder_min, reorder_max')
          .eq('organization_id', input.organizationId).in('sku_id', skuIds)
        : Promise.resolve({ data: [], error: null }),
      input.includeCost && skuIds.length > 0
        ? this.client.from('sku_cost_profiles').select('sku_id, version, cost_price, currency_code')
          .eq('organization_id', input.organizationId).in('sku_id', skuIds)
        : Promise.resolve({ data: [], error: null }),
      creatorIds.length > 0
        ? this.client.from('organization_members').select('user_id, display_name')
          .eq('organization_id', input.organizationId).in('user_id', creatorIds)
        : Promise.resolve({ data: [], error: null }),
      this.client.from('product_images')
        .select('id, product_id, storage_path, alt_text, mime_type, file_size_bytes, sort_order, is_cover')
        .eq('organization_id', input.organizationId).in('product_id', productIds)
        .eq('status', 'ready').eq('is_cover', true)
        .order('sort_order', { ascending: true }).limit(productIds.length),
      skuIds.length > 0
        ? this.client.from('sku_variant_images')
          .select('sku_id, product_image_id, is_primary, sort_order')
          .eq('organization_id', input.organizationId).in('sku_id', skuIds)
          .order('is_primary', { ascending: false }).order('sort_order', { ascending: true })
          .limit(skuIds.length * 9)
        : Promise.resolve({ data: [], error: null }),
      input.includeInventory && skuIds.length > 0
        ? this.client.from('inventory_balances')
          .select('sku_id, branch_id, on_hand, allocated, available')
          .eq('organization_id', input.organizationId).in('sku_id', skuIds)
          .limit(PRODUCT_WORKSPACE_BALANCE_AGGREGATE_LIMIT + 1)
        : Promise.resolve({ data: [], error: null }),
    ])
    for (const result of [categoryResult, brandResult, assignmentResult, profileResult, costResult, creatorResult, variantImageAssignmentResult, balanceResult]) {
      if (result.error) throw mapFoundationError(result.error)
    }
    const { data: imageData, error: imageError } = imageResult
    const coverImageRows = productImageRowsOrFallback(imageData, imageError)
    const variantImageAssignments = (variantImageAssignmentResult.data ?? []).map((row) => ({
      skuId: String(row.sku_id),
      productImageId: String(row.product_image_id),
      isPrimary: Boolean(row.is_primary),
      sortOrder: Number(row.sort_order),
    }))
    const assignedImageIds = Array.from(new Set(variantImageAssignments.map((assignment) => assignment.productImageId)))
    let assignedImageRows: Parameters<typeof signProductImages>[1] = []
    if (assignedImageIds.length > 0) {
      const assignedImageResult = await this.client.from('product_images')
        .select('id, product_id, storage_path, alt_text, mime_type, file_size_bytes, sort_order, is_cover')
        .eq('organization_id', input.organizationId).in('id', assignedImageIds).eq('status', 'ready')
      assignedImageRows = productImageRowsOrFallback(assignedImageResult.data, assignedImageResult.error)
    }
    const imageRows = Array.from(new Map([...coverImageRows, ...assignedImageRows].map((image) => [String(image.id), image])).values())
    const images = await signProductImages(this.client, imageRows)

    const tagIds = Array.from(new Set((assignmentResult.data ?? []).map((row) => String(row.tag_id))))
    const tagResult = tagIds.length > 0
      ? await this.client.from('product_tags').select('id, name').eq('organization_id', input.organizationId).in('id', tagIds)
      : { data: [], error: null }
    if (tagResult.error) throw mapFoundationError(tagResult.error)
    const categoryById = new Map((categoryResult.data ?? []).map((row) => [String(row.id), { id: String(row.id), name: String(row.name) }]))
    const brandById = new Map((brandResult.data ?? []).map((row) => [String(row.id), { id: String(row.id), name: String(row.name) }]))
    const tagById = new Map((tagResult.data ?? []).map((row) => [String(row.id), { id: String(row.id), name: String(row.name) }]))
    const tagIdsByProduct = new Map<string, string[]>()
    for (const row of assignmentResult.data ?? []) {
      const ids = tagIdsByProduct.get(String(row.product_id)) ?? []
      ids.push(String(row.tag_id))
      tagIdsByProduct.set(String(row.product_id), ids)
    }
    const profileBySku = new Map((profileResult.data ?? []).map((row) => [String(row.sku_id), row as Record<string, unknown>]))
    const costBySku = new Map((costResult.data ?? []).map((row) => [String(row.sku_id), row as Record<string, unknown>]))
    const creatorById = new Map((creatorResult.data ?? []).map((row) => [String(row.user_id), row.display_name ? String(row.display_name) : null]))

    let balanceRows: Array<{
      sku_id: string
      branch_id: string
      on_hand: number | string
      allocated: number | string
      available: number | string
    }> = []
    let branchCodeById = new Map<string, string>()
    let balanceAggregateCapped = false
    if (input.includeInventory && skuIds.length > 0) {
      balanceAggregateCapped = (balanceResult.data?.length ?? 0) > PRODUCT_WORKSPACE_BALANCE_AGGREGATE_LIMIT
      balanceRows = (balanceResult.data ?? []).slice(0, PRODUCT_WORKSPACE_BALANCE_AGGREGATE_LIMIT) as typeof balanceRows
      const branchIds = Array.from(new Set(balanceRows.map((row) => row.branch_id)))
      if (branchIds.length > 0) {
        const { data: branchData, error: branchError } = await this.client.from('branches')
          .select('id, code')
          .eq('organization_id', input.organizationId)
          .in('id', branchIds)
        if (branchError) throw mapFoundationError(branchError)
        branchCodeById = new Map((branchData ?? []).map((row) => [String(row.id), String(row.code)]))
      }
    }

    const items = buildProductWorkspaceRows({
      products: productRows.map((row) => ({
        id: row.id,
        organizationId: row.organization_id,
        name: row.name,
        description: row.description,
        category: row.category_id ? categoryById.get(String(row.category_id)) ?? null : null,
        brand: row.brand_id ? brandById.get(String(row.brand_id)) ?? null : null,
        structureType: row.structure_type,
        internalNote: row.internal_note,
        tags: (tagIdsByProduct.get(String(row.id)) ?? []).flatMap((tagId) => {
          const tag = tagById.get(tagId)
          return tag ? [tag] : []
        }),
        status: row.status,
        version: Number(row.version),
        createdAt: row.created_at,
        createdByUserId: row.created_by,
        createdByDisplayName: row.created_by ? creatorById.get(String(row.created_by)) ?? null : null,
        updatedAt: row.updated_at,
      })),
      skus: skuRows.map((row) => ({
        id: row.id,
        productId: row.product_id,
        skuCode: row.sku_code,
        name: row.name,
        barcode: row.barcode,
        salesCode: row.sales_code,
        baseUnitCode: row.base_unit_code,
        status: row.status,
        profile: mapSkuProfile(profileBySku.get(String(row.id))),
        cost: mapSkuCost(costBySku.get(String(row.id)), Boolean(input.includeCost)),
      })),
      balances: balanceRows.map((row) => ({
        skuId: row.sku_id,
        onHand: Number(row.on_hand),
        allocated: Number(row.allocated),
        available: Number(row.available),
        branchCode: branchCodeById.get(row.branch_id) ?? null,
      })),
      images,
      variantImageAssignments,
      includeInventory: Boolean(input.includeInventory),
      aggregateCapped: skuAggregateCapped || balanceAggregateCapped,
    })

    const cursorRows = (productData ?? []).map((row) => ({
      id: String(row.id),
      updatedAt: String(row.updated_at),
    }))
    return {
      items,
      nextCursor: useOffsetPagination ? null : nextCursor(cursorRows, pageSize),
      totalCount: useOffsetPagination ? productCount ?? 0 : undefined,
    }
  }

  async getProductWorkspaceDetail(input: {
    organizationId: string
    productId: string
    includeInventory?: boolean
    includeCost?: boolean
    quickMode?: boolean
  }): Promise<ProductWorkspaceDetail | null> {
    const { data: product, error: productError } = await this.client.from('products')
      .select('id, organization_id, name, description, category_id, brand_id, structure_type, internal_note, status, version, created_at, created_by, updated_at')
      .eq('organization_id', input.organizationId)
      .eq('id', input.productId)
      .maybeSingle()
    if (productError) throw mapFoundationError(productError)
    if (!product) return null

    const { data: skuData, error: skuError } = await this.client.from('skus')
      .select('id, product_id, sku_code, name, barcode, sales_code, base_unit_code, status, version, updated_at')
      .eq('organization_id', input.organizationId)
      .eq('product_id', input.productId)
      .order('created_at', { ascending: true })
      .order('id', { ascending: true })
      .limit(PRODUCT_DETAIL_SKU_LIMIT + 1)
    if (skuError) throw mapFoundationError(skuError)
    const skuListCapped = (skuData?.length ?? 0) > PRODUCT_DETAIL_SKU_LIMIT
    const skuRows = (skuData ?? []).slice(0, PRODUCT_DETAIL_SKU_LIMIT)
    const skuIds = skuRows.map((row) => String(row.id))
    const quickMode = Boolean(input.quickMode)
    const loadSkuExtras = !quickMode

    const [categoryResult, brandResult, assignmentResult, profileResult, costResult, creatorResult, sellUnitResult, bundleResult, imageResult, balanceResult] = await Promise.all([
      product.category_id
        ? this.client.from('product_categories').select('id, name').eq('organization_id', input.organizationId).eq('id', product.category_id).maybeSingle()
        : Promise.resolve({ data: null, error: null }),
      product.brand_id
        ? this.client.from('product_brands').select('id, name').eq('organization_id', input.organizationId).eq('id', product.brand_id).maybeSingle()
        : Promise.resolve({ data: null, error: null }),
      this.client.from('product_tag_assignments').select('tag_id')
        .eq('organization_id', input.organizationId).eq('product_id', input.productId)
        .limit(40),
      skuIds.length > 0
        ? this.client.from('sku_product_profiles').select('sku_id, version, quantity_behavior, sale_price, currency_code, tax_category, tax_rate, product_weight_kg, product_length_cm, product_width_cm, product_height_cm, package_weight_kg, package_length_cm, package_width_cm, package_height_cm, safety_stock, reorder_min, reorder_max')
          .eq('organization_id', input.organizationId).in('sku_id', skuIds)
        : Promise.resolve({ data: [], error: null }),
      input.includeCost && skuIds.length > 0
        ? this.client.from('sku_cost_profiles').select('sku_id, version, cost_price, currency_code')
          .eq('organization_id', input.organizationId).in('sku_id', skuIds)
        : Promise.resolve({ data: [], error: null }),
      product.created_by
        ? this.client.from('organization_members').select('display_name')
          .eq('organization_id', input.organizationId).eq('user_id', product.created_by).maybeSingle()
        : Promise.resolve({ data: null, error: null }),
      loadSkuExtras && skuIds.length > 0
        ? this.client.from('sku_sell_units').select('id, sku_id, unit_code, name, base_quantity, barcode, status')
          .eq('organization_id', input.organizationId).in('sku_id', skuIds)
          .order('created_at', { ascending: true }).limit(PRODUCT_DETAIL_SKU_LIMIT * 20)
        : Promise.resolve({ data: [], error: null }),
      loadSkuExtras && skuIds.length > 0
        ? this.client.from('sku_bundle_components').select('bundle_sku_id, component_sku_id, component_quantity')
          .eq('organization_id', input.organizationId).in('bundle_sku_id', skuIds)
          .limit(PRODUCT_DETAIL_SKU_LIMIT * 100)
        : Promise.resolve({ data: [], error: null }),
      this.client.from('product_images')
        .select('id, product_id, storage_path, alt_text, mime_type, file_size_bytes, sort_order, is_cover')
        .eq('organization_id', input.organizationId).eq('product_id', input.productId)
        .eq('status', 'ready').order('sort_order', { ascending: true }).limit(9),
      input.includeInventory && skuIds.length > 0
        ? this.client.from('inventory_balances')
          .select('sku_id, branch_id, on_hand, allocated, available')
          .eq('organization_id', input.organizationId).in('sku_id', skuIds)
          .limit(PRODUCT_WORKSPACE_BALANCE_AGGREGATE_LIMIT + 1)
        : Promise.resolve({ data: [], error: null }),
    ])
    for (const result of [categoryResult, brandResult, assignmentResult, profileResult, costResult, creatorResult, sellUnitResult, bundleResult, balanceResult]) {
      if (result.error) throw mapFoundationError(result.error)
    }
    const { data: imageData, error: imageError } = imageResult
    const imageRows = productImageRowsOrFallback(imageData, imageError)
    const images = await signProductImages(this.client, imageRows)

    const tagIds = Array.from(new Set((assignmentResult.data ?? []).map((row) => String(row.tag_id))))
    const tagResult = tagIds.length > 0
      ? await this.client.from('product_tags').select('id, name').eq('organization_id', input.organizationId).in('id', tagIds)
      : { data: [], error: null }
    if (tagResult.error) throw mapFoundationError(tagResult.error)
    const profileBySku = new Map((profileResult.data ?? []).map((row) => [String(row.sku_id), row as Record<string, unknown>]))
    const costBySku = new Map((costResult.data ?? []).map((row) => [String(row.sku_id), row as Record<string, unknown>]))
    const sellUnitsBySku = new Map<string, typeof sellUnitResult.data>()
    for (const row of sellUnitResult.data ?? []) {
      const rows = sellUnitsBySku.get(String(row.sku_id)) ?? []
      rows.push(row)
      sellUnitsBySku.set(String(row.sku_id), rows)
    }
    const componentSkuIds = Array.from(new Set((bundleResult.data ?? []).map((row) => String(row.component_sku_id))))
    const componentResult = componentSkuIds.length > 0
      ? await this.client.from('skus').select('id, sku_code, name')
        .eq('organization_id', input.organizationId).in('id', componentSkuIds)
      : { data: [], error: null }
    if (componentResult.error) throw mapFoundationError(componentResult.error)
    const componentSkuById = new Map((componentResult.data ?? []).map((row) => [String(row.id), row]))
    const bundleComponentsBySku = new Map<string, typeof bundleResult.data>()
    for (const row of bundleResult.data ?? []) {
      const rows = bundleComponentsBySku.get(String(row.bundle_sku_id)) ?? []
      rows.push(row)
      bundleComponentsBySku.set(String(row.bundle_sku_id), rows)
    }

    let balanceRows: Array<{
      sku_id: string
      branch_id: string
      on_hand: number | string
      allocated: number | string
      available: number | string
    }> = []
    let branchCodeById = new Map<string, string>()
    let balanceAggregateCapped = false
    if (input.includeInventory && skuIds.length > 0) {
      balanceAggregateCapped = (balanceResult.data?.length ?? 0) > PRODUCT_WORKSPACE_BALANCE_AGGREGATE_LIMIT
      balanceRows = (balanceResult.data ?? []).slice(0, PRODUCT_WORKSPACE_BALANCE_AGGREGATE_LIMIT) as typeof balanceRows
      const branchIds = Array.from(new Set(balanceRows.map((row) => row.branch_id)))
      if (branchIds.length > 0) {
        const { data: branchData, error: branchError } = await this.client.from('branches')
          .select('id, code')
          .eq('organization_id', input.organizationId)
          .in('id', branchIds)
        if (branchError) throw mapFoundationError(branchError)
        branchCodeById = new Map((branchData ?? []).map((row) => [String(row.id), String(row.code)]))
      }
    }

    return buildProductWorkspaceDetail({
      product: {
        id: product.id,
        organizationId: product.organization_id,
        name: product.name,
        description: product.description,
        category: categoryResult.data ? { id: String(categoryResult.data.id), name: String(categoryResult.data.name) } : null,
        brand: brandResult.data ? { id: String(brandResult.data.id), name: String(brandResult.data.name) } : null,
        structureType: product.structure_type,
        internalNote: product.internal_note,
        tags: (tagResult.data ?? []).map((row) => ({ id: String(row.id), name: String(row.name) })),
        status: product.status,
        version: Number(product.version),
        createdAt: product.created_at,
        createdByUserId: product.created_by,
        createdByDisplayName: creatorResult.data?.display_name ? String(creatorResult.data.display_name) : null,
        updatedAt: product.updated_at,
      },
      skus: skuRows.map((row) => ({
        id: row.id,
        productId: row.product_id,
        skuCode: row.sku_code,
        name: row.name,
        barcode: row.barcode,
        salesCode: row.sales_code,
        baseUnitCode: row.base_unit_code,
        status: row.status,
        version: Number(row.version),
        updatedAt: row.updated_at,
        profile: mapSkuProfile(profileBySku.get(String(row.id))),
        cost: mapSkuCost(costBySku.get(String(row.id)), Boolean(input.includeCost)),
        sellUnits: (sellUnitsBySku.get(String(row.id)) ?? []).map((unit) => ({
          id: String(unit.id),
          unitCode: String(unit.unit_code),
          name: String(unit.name),
          baseQuantity: Number(unit.base_quantity),
          barcode: unit.barcode ? String(unit.barcode) : null,
          status: String(unit.status),
        })),
        bundleComponents: (bundleComponentsBySku.get(String(row.id)) ?? []).flatMap((component) => {
          const componentSku = componentSkuById.get(String(component.component_sku_id))
          return componentSku ? [{
            componentSkuId: String(component.component_sku_id),
            componentSkuCode: String(componentSku.sku_code),
            componentSkuName: String(componentSku.name),
            componentQuantity: Number(component.component_quantity),
          }] : []
        }),
      })),
      balances: balanceRows.map((row) => ({
        skuId: row.sku_id,
        onHand: Number(row.on_hand),
        allocated: Number(row.allocated),
        available: Number(row.available),
        branchCode: branchCodeById.get(row.branch_id) ?? null,
      })),
      images,
      includeInventory: Boolean(input.includeInventory),
      aggregateCapped: skuListCapped || balanceAggregateCapped,
      skuListCapped,
    })
  }

  async listProducts(input: {
    organizationId: string
    status?: string
    search?: string
    cursor?: string | null
    pageSize?: number
  }): Promise<PageResult<ProductReadModel>> {
    const pageSize = boundedPageSize(input.pageSize)
    const cursor = decodeFoundationCursor(input.cursor)
    const search = safeSearch(input.search)
    let query = this.client.from('products')
      .select('id, organization_id, name, description, status, version, updated_at')
      .eq('organization_id', input.organizationId)
      .order('updated_at', { ascending: false })
      .order('id', { ascending: false })
      .limit(pageSize + 1)

    if (input.status) query = query.eq('status', input.status)
    if (search) query = query.ilike('name', `%${search}%`)
    if (cursor) {
      query = query.or(`updated_at.lt.${cursor.timestamp},and(updated_at.eq.${cursor.timestamp},id.lt.${cursor.id})`)
    }

    const { data, error } = await query
    if (error) throw mapFoundationError(error)
    const rows = (data ?? []).map((row) => ({
      id: row.id,
      organizationId: row.organization_id,
      name: row.name,
      description: row.description,
      status: row.status,
      version: Number(row.version),
      updatedAt: row.updated_at,
    } satisfies ProductReadModel))
    return { items: rows.slice(0, pageSize), nextCursor: nextCursor(rows, pageSize) }
  }

  async getProduct(input: { organizationId: string; productId: string }) {
    const { data, error } = await this.client.from('products')
      .select('id, organization_id, name, description, status, version, updated_at')
      .eq('organization_id', input.organizationId).eq('id', input.productId).maybeSingle()
    if (error) throw mapFoundationError(error)
    if (!data) return null
    return {
      id: data.id,
      organizationId: data.organization_id,
      name: data.name,
      description: data.description,
      status: data.status,
      version: Number(data.version),
      updatedAt: data.updated_at,
    } satisfies ProductReadModel
  }

  async listSkus(input: {
    organizationId: string
    productId?: string
    status?: string
    search?: string
    cursor?: string | null
    pageSize?: number
  }): Promise<PageResult<SkuReadModel>> {
    const pageSize = boundedPageSize(input.pageSize)
    const cursor = decodeFoundationCursor(input.cursor)
    const search = safeSearch(input.search)
    let query = this.client.from('skus').select(`
      id, organization_id, product_id, sku_code, name, barcode, sales_code,
      base_unit_code, status, version, updated_at, products!inner(id, name)
    `).eq('organization_id', input.organizationId)
      .order('updated_at', { ascending: false })
      .order('id', { ascending: false })
      .limit(pageSize + 1)

    if (input.productId) query = query.eq('product_id', input.productId)
    if (input.status) query = query.eq('status', input.status)
    if (search) {
      query = query.or(`sku_code.ilike.%${search}%,name.ilike.%${search}%,barcode.eq.${search},sales_code.eq.${search}`)
    }
    if (cursor) {
      query = query.or(`updated_at.lt.${cursor.timestamp},and(updated_at.eq.${cursor.timestamp},id.lt.${cursor.id})`)
    }

    const { data, error } = await query
    if (error) throw mapFoundationError(error)
    const rows = (data ?? []).map((row) => {
      const product = Array.isArray(row.products) ? row.products[0] : row.products
      return {
        id: row.id,
        organizationId: row.organization_id,
        productId: row.product_id,
        productName: product?.name ?? '',
        skuCode: row.sku_code,
        name: row.name,
        barcode: row.barcode,
        salesCode: row.sales_code,
        baseUnitCode: row.base_unit_code,
        status: row.status,
        version: Number(row.version),
        updatedAt: row.updated_at,
      } satisfies SkuReadModel
    })
    return { items: rows.slice(0, pageSize), nextCursor: nextCursor(rows, pageSize) }
  }

  async getSku(input: { organizationId: string; skuId: string }) {
    const { data, error } = await this.client.from('skus').select(`
      id, organization_id, product_id, sku_code, name, barcode, sales_code,
      base_unit_code, status, version, updated_at, products!inner(id, name)
    `).eq('organization_id', input.organizationId).eq('id', input.skuId).maybeSingle()
    if (error) throw mapFoundationError(error)
    if (!data) return null
    const product = Array.isArray(data.products) ? data.products[0] : data.products
    return {
      id: data.id,
      organizationId: data.organization_id,
      productId: data.product_id,
      productName: product?.name ?? '',
      skuCode: data.sku_code,
      name: data.name,
      barcode: data.barcode,
      salesCode: data.sales_code,
      baseUnitCode: data.base_unit_code,
      status: data.status,
      version: Number(data.version),
      updatedAt: data.updated_at,
    } satisfies SkuReadModel
  }

  async getSkuWorkspaceDetail(input: {
    organizationId: string
    skuId: string
    includeInventory?: boolean
  }) {
    const sku = await this.getSku({ organizationId: input.organizationId, skuId: input.skuId })
    if (!sku) return null
    const { data: profileRow, error: profileError } = await this.client.from('sku_product_profiles')
      .select('sku_id, version, quantity_behavior, sale_price, currency_code, tax_category, tax_rate, product_weight_kg, product_length_cm, product_width_cm, product_height_cm, package_weight_kg, package_length_cm, package_width_cm, package_height_cm, safety_stock, reorder_min, reorder_max')
      .eq('organization_id', input.organizationId)
      .eq('sku_id', input.skuId)
      .maybeSingle()
    if (profileError) throw mapFoundationError(profileError)
    let stock: ProductWorkspaceStockSummary = {
      mode: input.includeInventory ? 'no-balance' : 'not-authorized',
      baseUnitCode: sku.baseUnitCode,
      onHand: null,
      allocated: null,
      available: null,
      branchCodes: [],
    }
    if (input.includeInventory) {
      const { data: balances, error } = await this.client.from('inventory_balances')
        .select('branch_id, on_hand, allocated, available')
        .eq('organization_id', input.organizationId)
        .eq('sku_id', input.skuId)
        .limit(PRODUCT_WORKSPACE_BALANCE_AGGREGATE_LIMIT + 1)
      if (error) throw mapFoundationError(error)
      const rows = (balances ?? []).slice(0, PRODUCT_WORKSPACE_BALANCE_AGGREGATE_LIMIT)
      let branchCodes: string[] = []
      const branchIds = Array.from(new Set(rows.map((row) => String(row.branch_id))))
      if (branchIds.length > 0) {
        const { data: branches, error: branchError } = await this.client.from('branches')
          .select('id, code')
          .eq('organization_id', input.organizationId)
          .in('id', branchIds)
        if (branchError) throw mapFoundationError(branchError)
        branchCodes = (branches ?? []).map((row) => String(row.code)).sort((left, right) => left.localeCompare(right))
      }
      if (rows.length > 0) {
        stock = {
          mode: 'single-unit', baseUnitCode: sku.baseUnitCode,
          onHand: rows.reduce((sum, row) => sum + Number(row.on_hand), 0),
          allocated: rows.reduce((sum, row) => sum + Number(row.allocated), 0),
          available: rows.reduce((sum, row) => sum + Number(row.available), 0),
          branchCodes,
        }
      }
    }
    return {
      id: sku.id,
      productId: sku.productId,
      productName: sku.productName,
      skuCode: sku.skuCode,
      name: sku.name,
      barcode: sku.barcode,
      salesCode: sku.salesCode,
      baseUnitCode: sku.baseUnitCode,
      status: sku.status,
      version: sku.version,
      updatedAt: sku.updatedAt,
      profile: mapSkuProfile(profileRow as Record<string, unknown> | undefined),
      cost: { mode: 'not-authorized' as const, costPrice: null, currencyCode: null },
      sellUnits: [],
      bundleComponents: [],
      stock,
    }
  }

  async listWarehouses(input: {
    organizationId: string
    branchId?: string
    status?: string
    search?: string
    cursor?: string | null
    pageSize?: number
  }): Promise<PageResult<WarehouseReadModel>> {
    const pageSize = boundedPageSize(input.pageSize)
    const cursor = decodeFoundationCursor(input.cursor)
    const search = safeSearch(input.search)
    let query = this.client.from('warehouses')
      .select('id, organization_id, branch_id, code, name, status, version, updated_at, branches!inner(id, name)')
      .eq('organization_id', input.organizationId)
      .order('updated_at', { ascending: false })
      .order('id', { ascending: false })
      .limit(pageSize + 1)

    if (input.branchId) query = query.eq('branch_id', input.branchId)
    if (input.status) query = query.eq('status', input.status)
    if (search) query = query.or(`code.ilike.%${search}%,name.ilike.%${search}%`)
    if (cursor) {
      query = query.or(`updated_at.lt.${cursor.timestamp},and(updated_at.eq.${cursor.timestamp},id.lt.${cursor.id})`)
    }

    const { data, error } = await query
    if (error) throw mapFoundationError(error)
    const rows = (data ?? []).map((row) => ({
      id: row.id,
      organizationId: row.organization_id,
      branchId: row.branch_id,
      branchName: (Array.isArray(row.branches) ? row.branches[0] : row.branches)?.name ?? '',
      code: row.code,
      name: row.name,
      status: row.status,
      version: Number(row.version),
      updatedAt: row.updated_at,
    } satisfies WarehouseReadModel))
    return { items: rows.slice(0, pageSize), nextCursor: nextCursor(rows, pageSize) }
  }

  async getWarehouse(input: { organizationId: string; warehouseId: string }) {
    const { data, error } = await this.client.from('warehouses')
      .select('id, organization_id, branch_id, code, name, status, version, updated_at, branches!inner(id, name)')
      .eq('organization_id', input.organizationId).eq('id', input.warehouseId).maybeSingle()
    if (error) throw mapFoundationError(error)
    if (!data) return null
    return {
      id: data.id, organizationId: data.organization_id, branchId: data.branch_id,
      branchName: (Array.isArray(data.branches) ? data.branches[0] : data.branches)?.name ?? '',
      code: data.code, name: data.name, status: data.status,
      version: Number(data.version), updatedAt: data.updated_at,
    } satisfies WarehouseReadModel
  }

  async listLocations(input: {
    organizationId: string; branchId?: string; warehouseId?: string; status?: string; pageSize?: number
  }): Promise<LocationReadModel[]> {
    let query = this.client.from('locations').select(`
      id, organization_id, branch_id, warehouse_id, code, name, is_default,
      status, version, updated_at, warehouses!inner(id, name)
    `).eq('organization_id', input.organizationId)
      .order('is_default', { ascending: false }).order('code').limit(boundedPageSize(input.pageSize ?? 100))
    if (input.branchId) query = query.eq('branch_id', input.branchId)
    if (input.warehouseId) query = query.eq('warehouse_id', input.warehouseId)
    if (input.status) query = query.eq('status', input.status)
    const { data, error } = await query
    if (error) throw mapFoundationError(error)
    return (data ?? []).map((row) => ({
      id: row.id, organizationId: row.organization_id, branchId: row.branch_id,
      warehouseId: row.warehouse_id,
      warehouseName: (Array.isArray(row.warehouses) ? row.warehouses[0] : row.warehouses)?.name ?? '',
      code: row.code, name: row.name, isDefault: row.is_default, status: row.status,
      version: Number(row.version), updatedAt: row.updated_at,
    } satisfies LocationReadModel))
  }

  async listInventoryBalances(input: {
    organizationId: string; branchId?: string; warehouseId?: string; locationId?: string;
    skuId?: string; cursor?: string | null; pageSize?: number
  }): Promise<PageResult<InventoryBalanceReadModel>> {
    const pageSize = boundedPageSize(input.pageSize)
    const cursor = decodeFoundationCursor(input.cursor)
    let query = this.client.from('inventory_balances').select(`
      organization_id, branch_id, warehouse_id, location_id, sku_id, on_hand,
      allocated, available, version, last_movement_id, updated_at,
      locations!inner(id, name, warehouses!inner(id, name)),
      skus!inner(id, sku_code, name, base_unit_code)
    `).eq('organization_id', input.organizationId)
      .order('updated_at', { ascending: false }).order('last_movement_id', { ascending: false })
      .limit(pageSize + 1)
    if (input.branchId) query = query.eq('branch_id', input.branchId)
    if (input.warehouseId) query = query.eq('warehouse_id', input.warehouseId)
    if (input.locationId) query = query.eq('location_id', input.locationId)
    if (input.skuId) query = query.eq('sku_id', input.skuId)
    if (cursor) query = query.or(`updated_at.lt.${cursor.timestamp},and(updated_at.eq.${cursor.timestamp},last_movement_id.lt.${cursor.id})`)
    const { data, error } = await query
    if (error) throw mapFoundationError(error)
    const rows = (data ?? []).map((row) => {
      const location = Array.isArray(row.locations) ? row.locations[0] : row.locations
      const warehouseRelation = location?.warehouses
      const warehouse = Array.isArray(warehouseRelation) ? warehouseRelation[0] : warehouseRelation
      const sku = Array.isArray(row.skus) ? row.skus[0] : row.skus
      return {
        id: row.last_movement_id ?? row.location_id, organizationId: row.organization_id, branchId: row.branch_id,
        warehouseId: row.warehouse_id, warehouseName: warehouse?.name ?? '',
        locationId: row.location_id, locationName: location?.name ?? '',
        skuId: row.sku_id, skuCode: sku?.sku_code ?? '', skuName: sku?.name ?? '',
        baseUnitCode: sku?.base_unit_code ?? '', onHand: Number(row.on_hand),
        allocated: Number(row.allocated), available: Number(row.available),
        version: Number(row.version), updatedAt: row.updated_at,
      } satisfies InventoryBalanceReadModel
    })
    return { items: rows.slice(0, pageSize), nextCursor: nextCursor(rows, pageSize) }
  }

  async listStockMovements(input: {
    organizationId: string
    branchId?: string
    warehouseId?: string
    locationId?: string
    skuId?: string
    movementType?: string
    cursor?: string | null
    pageSize?: number
  }): Promise<PageResult<StockMovementReadModel>> {
    const pageSize = boundedPageSize(input.pageSize)
    const cursor = decodeFoundationCursor(input.cursor)
    let query = this.client.from('stock_movements').select(`
      id, organization_id, branch_id, warehouse_id, location_id, sku_id,
      movement_type, quantity_delta, base_unit_code, reason_code, reason_note,
      actor_user_id, occurred_at
    `).eq('organization_id', input.organizationId)
      .order('occurred_at', { ascending: false })
      .order('id', { ascending: false })
      .limit(pageSize + 1)

    if (input.branchId) query = query.eq('branch_id', input.branchId)
    if (input.warehouseId) query = query.eq('warehouse_id', input.warehouseId)
    if (input.locationId) query = query.eq('location_id', input.locationId)
    if (input.skuId) query = query.eq('sku_id', input.skuId)
    if (input.movementType) query = query.eq('movement_type', input.movementType)
    if (cursor) {
      query = query.or(`occurred_at.lt.${cursor.timestamp},and(occurred_at.eq.${cursor.timestamp},id.lt.${cursor.id})`)
    }

    const { data, error } = await query
    if (error) throw mapFoundationError(error)
    const rows = (data ?? []).map((row) => ({
      id: row.id,
      organizationId: row.organization_id,
      branchId: row.branch_id,
      warehouseId: row.warehouse_id,
      locationId: row.location_id,
      skuId: row.sku_id,
      movementType: row.movement_type,
      quantityDelta: Number(row.quantity_delta),
      baseUnitCode: row.base_unit_code,
      reasonCode: row.reason_code,
      reasonNote: row.reason_note,
      actorUserId: row.actor_user_id,
      occurredAt: row.occurred_at,
    } satisfies StockMovementReadModel))
    return { items: rows.slice(0, pageSize), nextCursor: nextCursor(rows, pageSize) }
  }
}

export class SupabaseFoundationCommandRepository implements FoundationCommandRepository {
  constructor(private readonly admin: SupabaseClient) {}

  async execute(
    command: FoundationApplicationCommand,
    actorUserId: string,
    requestHash: string,
  ): Promise<FoundationCommandOutcome> {
    if (command.kind === 'entity') {
      const rpcName = command.commandType === 'product.create_with_variants'
        ? 'server_execute_variant_sku_sequence_command'
        : productVariantCreationCommandTypes.includes(
          command.commandType as typeof productVariantCreationCommandTypes[number],
        )
        ? 'server_execute_variant_creation_command'
        : productCreationCommandTypes.includes(
        command.commandType as typeof productCreationCommandTypes[number],
      )
        ? 'server_execute_product_creation_command'
        : productImageCommandTypes.includes(
          command.commandType as typeof productImageCommandTypes[number],
        )
          ? 'server_execute_product_image_command'
          : productDomainCommandTypes.includes(
            command.commandType as typeof productDomainCommandTypes[number],
          )
            ? 'server_execute_product_domain_command'
            : 'server_execute_foundation_command'
      let { data, error } = await this.admin.rpc(rpcName, {
        p_command_id: command.commandId,
        p_organization_id: command.organizationId,
        p_command_type: command.commandType,
        p_payload: command.payload,
        p_request_hash: requestHash,
        p_actor_user_id: actorUserId,
      })
      // Rolling-deploy compatibility: Preview can continue using the existing
      // atomic Variant command until the SKU-04 RPC migration is applied.
      // Never fall back for conflicts, permission errors, or other failures.
      if (command.commandType === 'product.create_with_variants'
        && error && (error.code === 'PGRST202' || error.code === '42883')) {
        const fallback = await this.admin.rpc('server_execute_variant_creation_command', {
          p_command_id: command.commandId,
          p_organization_id: command.organizationId,
          p_command_type: command.commandType,
          p_payload: command.payload,
          p_request_hash: requestHash,
          p_actor_user_id: actorUserId,
        })
        data = fallback.data
        error = fallback.error
      }
      if (error) throw error
      return (data ?? {}) as FoundationCommandOutcome
    }

    const { data, error } = await this.admin.rpc('server_post_inventory_command', {
      p_command_id: command.commandId,
      p_organization_id: command.organizationId,
      p_command_type: command.commandType,
      p_sku_id: command.skuId,
      p_source_location_id: command.sourceLocationId,
      p_destination_location_id: command.destinationLocationId,
      p_quantity: command.quantity,
      p_reason_code: command.reasonCode,
      p_reason_note: command.reasonNote,
      p_request_hash: requestHash,
      p_actor_user_id: actorUserId,
      p_occurred_at: command.occurredAt,
    })
    if (error) throw error
    return (data ?? {}) as FoundationCommandOutcome
  }

  async receiveInitialStockBatch(
    request: InitialStockBatchRequest,
    actorUserId: string,
  ): Promise<InitialStockBatchResult> {
    const { data, error } = await this.admin.rpc('server_receive_inventory_batch', {
      p_request: request,
      p_actor_user_id: actorUserId,
    })
    if (error) throw error
    return parseInitialStockBatchResult(data)
  }

  async resolveBranchIds(command: FoundationApplicationCommand): Promise<string[]> {
    const resolve = async (entityType: 'warehouse' | 'location', entityIds: string[]) => {
      const { data, error } = await this.admin.rpc('server_resolve_foundation_branch_ids', {
        p_organization_id: command.organizationId,
        p_entity_type: entityType,
        p_entity_ids: entityIds,
      })
      if (error) throw mapFoundationError(error)
      const branchIds = (data ?? []).map((row: { branch_id: string }) => String(row.branch_id))
      return Array.from(new Set<string>(branchIds))
    }
    if (command.kind === 'entity') {
      if (command.commandType === 'warehouse.create') return [String(command.payload.branch_id)]
      if (command.commandType === 'location.create') {
        return resolve('warehouse', [String(command.payload.warehouse_id)])
      }
      if (command.commandType.startsWith('warehouse.')) {
        return resolve('warehouse', [String(command.payload.warehouse_id)])
      }
      if (command.commandType.startsWith('location.')) {
        return resolve('location', [String(command.payload.location_id)])
      }
      return []
    }

    const locationIds = [command.sourceLocationId, command.destinationLocationId]
      .filter((id): id is string => Boolean(id))
    if (locationIds.length === 0) return []
    return resolve('location', locationIds)
  }
}

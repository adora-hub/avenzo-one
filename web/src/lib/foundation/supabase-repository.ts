import 'server-only'

import type { SupabaseClient } from '@supabase/supabase-js'
import type {
  FoundationApplicationCommand,
  FoundationCommandOutcome,
} from './contracts'
import {
  productCreationCommandTypes,
  productDomainCommandTypes,
  productImageCommandTypes,
} from './contracts'
import { decodeFoundationCursor, encodeFoundationCursor } from './cursor'
import { mapFoundationError } from './errors'
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
  ProductWorkspaceStockSummary,
  SkuReadModel,
  StockMovementReadModel,
  WarehouseReadModel,
} from './repositories'

function boundedPageSize(value?: number) {
  return Math.min(Math.max(Math.trunc(value ?? 25), 1), 100)
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
    cursor?: string | null
    pageSize?: number
    includeInventory?: boolean
    sort?: 'updated_desc' | 'updated_asc'
  }): Promise<PageResult<ProductWorkspaceRow>> {
    const pageSize = boundedPageSize(input.pageSize)
    const cursor = decodeFoundationCursor(input.cursor)
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
    let productQuery = this.client.from('products')
      .select('id, organization_id, name, description, status, version, created_at, created_by, updated_at')
      .eq('organization_id', input.organizationId)
      .order('updated_at', { ascending: sortAscending })
      .order('id', { ascending: sortAscending })
      .limit(pageSize + 1)
    if (input.status) productQuery = productQuery.eq('status', input.status)
    if (search) {
      productQuery = matchingProductIds.length > 0
        ? productQuery.or(`name.ilike.%${search}%,id.in.(${matchingProductIds.join(',')})`)
        : productQuery.ilike('name', `%${search}%`)
    }
    if (cursor) {
      const comparison = sortAscending ? 'gt' : 'lt'
      productQuery = productQuery.or(`updated_at.${comparison}.${cursor.timestamp},and(updated_at.eq.${cursor.timestamp},id.${comparison}.${cursor.id})`)
    }

    const { data: productData, error: productError } = await productQuery
    if (productError) throw mapFoundationError(productError)
    const productRows = (productData ?? []).slice(0, pageSize)
    const productIds = productRows.map((row) => String(row.id))
    if (productIds.length === 0) return { items: [], nextCursor: null }

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

    const { data: imageData, error: imageError } = await this.client.from('product_images')
      .select('id, product_id, storage_path, alt_text, mime_type, file_size_bytes, sort_order, is_cover')
      .eq('organization_id', input.organizationId)
      .in('product_id', productIds)
      .eq('status', 'ready')
      .eq('is_cover', true)
      .order('sort_order', { ascending: true })
      .limit(productIds.length)
    const imageRows = productImageRowsOrFallback(imageData, imageError)
    const images = await signProductImages(this.client, imageRows)

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
      const { data, error } = await this.client.from('inventory_balances')
        .select('sku_id, branch_id, on_hand, allocated, available')
        .eq('organization_id', input.organizationId)
        .in('sku_id', skuIds)
        .limit(PRODUCT_WORKSPACE_BALANCE_AGGREGATE_LIMIT + 1)
      if (error) throw mapFoundationError(error)
      balanceAggregateCapped = (data?.length ?? 0) > PRODUCT_WORKSPACE_BALANCE_AGGREGATE_LIMIT
      balanceRows = (data ?? []).slice(0, PRODUCT_WORKSPACE_BALANCE_AGGREGATE_LIMIT) as typeof balanceRows
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
        status: row.status,
        version: Number(row.version),
        createdAt: row.created_at,
        createdByUserId: row.created_by,
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
      aggregateCapped: skuAggregateCapped || balanceAggregateCapped,
    })

    const cursorRows = (productData ?? []).map((row) => ({
      id: String(row.id),
      updatedAt: String(row.updated_at),
    }))
    return { items, nextCursor: nextCursor(cursorRows, pageSize) }
  }

  async getProductWorkspaceDetail(input: {
    organizationId: string
    productId: string
    includeInventory?: boolean
  }): Promise<ProductWorkspaceDetail | null> {
    const { data: product, error: productError } = await this.client.from('products')
      .select('id, organization_id, name, description, status, version, created_at, created_by, updated_at')
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

    const { data: imageData, error: imageError } = await this.client.from('product_images')
      .select('id, product_id, storage_path, alt_text, mime_type, file_size_bytes, sort_order, is_cover')
      .eq('organization_id', input.organizationId)
      .eq('product_id', input.productId)
      .eq('status', 'ready')
      .order('sort_order', { ascending: true })
      .limit(9)
    const imageRows = productImageRowsOrFallback(imageData, imageError)
    const images = await signProductImages(this.client, imageRows)

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
      const { data, error } = await this.client.from('inventory_balances')
        .select('sku_id, branch_id, on_hand, allocated, available')
        .eq('organization_id', input.organizationId)
        .in('sku_id', skuIds)
        .limit(PRODUCT_WORKSPACE_BALANCE_AGGREGATE_LIMIT + 1)
      if (error) throw mapFoundationError(error)
      balanceAggregateCapped = (data?.length ?? 0) > PRODUCT_WORKSPACE_BALANCE_AGGREGATE_LIMIT
      balanceRows = (data ?? []).slice(0, PRODUCT_WORKSPACE_BALANCE_AGGREGATE_LIMIT) as typeof balanceRows
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
        status: product.status,
        version: Number(product.version),
        createdAt: product.created_at,
        createdByUserId: product.created_by,
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
      const rpcName = productCreationCommandTypes.includes(
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
      const { data, error } = await this.admin.rpc(rpcName, {
        p_command_id: command.commandId,
        p_organization_id: command.organizationId,
        p_command_type: command.commandType,
        p_payload: command.payload,
        p_request_hash: requestHash,
        p_actor_user_id: actorUserId,
      })
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

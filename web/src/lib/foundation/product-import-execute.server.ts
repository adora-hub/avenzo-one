import 'server-only'

import { requireFoundationPermission } from './authorization'
import { FoundationError } from './errors'
import { executeGlobalSalesCodeCreation } from './global-sales-code-creation.server'
import { formatGlobalSalesCode, validateGlobalSalesCode } from './global-sales-code'
import { previewGlobalSalesCodeRangeServer } from './global-sales-code-preview.server'
import { getFoundationActor } from './server-context'
import { createClient } from '@/lib/supabase/server'

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i
const CODE_PATTERN = /^[A-Z0-9][A-Z0-9._-]*$/
const BASE_UNIT_PATTERN = /^[a-z][a-z0-9_]{0,31}$/

export type ProductImportExecutionRow = {
  commandId: string
  sourceRow: number
  productName: string
  categoryName: string
  brandName: string | null
  skuCode: string
  salesCode: string | null
  barcode: string | null
  baseUnitCode: string
  quantityBehavior: 'discrete' | 'weight' | 'volume'
  salePrice: number
  taxCategory: 'standard' | 'zero' | 'exempt' | 'out_of_scope'
  taxRate: number
  tags: string[]
  branches: string[]
  status: 'draft' | 'active' | 'archived'
}

export type ProductImportExecutionResult = {
  sourceRow: number
  commandId: string
  status: 'created' | 'failed'
  productId?: string
  skuId?: string
  salesCode?: string
  error?: string
  warnings: string[]
}

type ParsedInput = {
  organizationId: string
  batchCommandId: string
  rows: ProductImportExecutionRow[]
}

export async function executeProductImportRows(input: unknown): Promise<ProductImportExecutionResult[]> {
  const parsed = parseInput(input)
  const actor = await getFoundationActor(parsed.organizationId)
  requireFoundationPermission(actor, 'product.create')
  requireFoundationPermission(actor, 'sku.create')
  const supabase = await createClient()

  const [categoriesResult, brandsResult, tagsResult, branchesResult] = await Promise.all([
    supabase.from('product_categories').select('id, name').eq('organization_id', parsed.organizationId).eq('status', 'active').limit(10_000),
    supabase.from('product_brands').select('id, name').eq('organization_id', parsed.organizationId).eq('status', 'active').limit(10_000),
    supabase.from('product_tags').select('id, name').eq('organization_id', parsed.organizationId).eq('status', 'active').limit(10_000),
    supabase.from('branches').select('id, code').eq('organization_id', parsed.organizationId).eq('status', 'active').limit(1_000),
  ])
  const queryError = categoriesResult.error ?? brandsResult.error ?? tagsResult.error ?? branchesResult.error
  if (queryError) throw queryError

  const categoryByName = nameMap(categoriesResult.data ?? [])
  const brandByName = nameMap(brandsResult.data ?? [])
  const tagByName = nameMap(tagsResult.data ?? [])
  const activeBranches = new Set((branchesResult.data ?? []).map((row) => normalizeCode(String(row.code))))
  const resolvedRows = parsed.rows.map((row) => {
    const categoryId = categoryByName.get(normalizeName(row.categoryName))
    const brandId = row.brandName ? brandByName.get(normalizeName(row.brandName)) : null
    const tagIds = row.tags.map((tag) => tagByName.get(normalizeName(tag)))
    const missingBranches = row.branches.filter((branch) => !activeBranches.has(normalizeCode(branch)))
    if (!categoryId || (row.brandName && !brandId) || tagIds.some((id) => !id) || missingBranches.length) {
      throw new FoundationError('validation_failed', 400, parsed.batchCommandId)
    }
    return { row, categoryId, brandId, tagIds: tagIds as string[] }
  })

  const blankRows = resolvedRows.filter(({ row }) => !row.salesCode)
  const automaticCodes = new Map<number, string>()
  if (blankRows.length) {
    const range = await previewGlobalSalesCodeRangeServer({
      organizationId: parsed.organizationId,
      prefix: 'A',
      quantity: blankRows.length,
    })
    blankRows.forEach(({ row }, index) => automaticCodes.set(
      row.sourceRow,
      formatGlobalSalesCode(range.prefix, range.startNumber + index),
    ))
  }

  const creationItems = resolvedRows.map(({ row, categoryId, brandId, tagIds }) => {
    const salesCode = row.salesCode ?? automaticCodes.get(row.sourceRow)
    if (!salesCode || !validateGlobalSalesCode(salesCode).ok) throw new FoundationError('validation_failed', 400, parsed.batchCommandId)
    return {
      command_id: row.commandId,
      command_type: 'product.create_with_initial_sku',
      payload: {
        name: row.productName,
        description: null,
        category_id: categoryId,
        brand_id: brandId,
        structure_type: 'standard',
        internal_note: null,
        tag_ids: tagIds,
        sku_name: row.productName,
        sku_code: row.skuCode,
        barcode: row.barcode,
        sales_code: salesCode,
        base_unit_code: row.baseUnitCode,
        quantity_behavior: row.quantityBehavior,
        sale_price: row.salePrice,
        currency_code: 'THB',
        tax_category: row.taxCategory,
        tax_rate: row.taxRate,
        sell_units: [],
        bundle_components: [],
      },
    }
  })

  // GSC-05's Rapid shape is the existing 1-50 all-or-nothing Product/SKU
  // boundary. Import reuses it internally; there is no separate allocator or
  // per-row fallback. All supplied and auto-proposed codes are claimed as one
  // manual set inside the trusted PostgreSQL transaction.
  const outcome = await executeGlobalSalesCodeCreation({
    commandId: parsed.batchCommandId,
    organizationId: parsed.organizationId,
    flow: 'rapid',
    payload: { sales_code_mode: 'manual', creation_items: creationItems },
  })
  if (outcome.created_count !== parsed.rows.length || outcome.results.length !== parsed.rows.length) {
    throw new FoundationError('foundation_command_failed', 500, parsed.batchCommandId)
  }

  return parsed.rows.map((row, index) => {
    const created = outcome.results[index] ?? {}
    return {
      sourceRow: row.sourceRow,
      commandId: row.commandId,
      status: 'created',
      productId: String(created.product_id ?? created.entity_id ?? ''),
      skuId: String(created.sku_id ?? ''),
      salesCode: row.salesCode ?? automaticCodes.get(row.sourceRow),
      warnings: row.status === 'draft' ? [] : ['นำเข้าเป็นฉบับร่างเพื่อให้ตรวจสอบก่อนเปิดใช้งาน'],
    }
  })
}

function parseInput(input: unknown): ParsedInput {
  if (!input || typeof input !== 'object' || Array.isArray(input)) throw new FoundationError('validation_failed', 400)
  const value = input as Record<string, unknown>
  const organizationId = typeof value.organizationId === 'string' ? value.organizationId.trim() : ''
  const batchCommandId = typeof value.batchCommandId === 'string' ? value.batchCommandId.trim() : ''
  if (!UUID_PATTERN.test(organizationId) || !UUID_PATTERN.test(batchCommandId)
    || !Array.isArray(value.rows) || value.rows.length < 1 || value.rows.length > 50) {
    throw new FoundationError('validation_failed', 400)
  }
  const rows = value.rows.map((entry) => parseRow(entry))
  if (new Set(rows.map((row) => row.commandId)).size !== rows.length || new Set(rows.map((row) => row.sourceRow)).size !== rows.length) {
    throw new FoundationError('validation_failed', 400)
  }
  return { organizationId, batchCommandId, rows }
}

function parseRow(input: unknown): ProductImportExecutionRow {
  if (!input || typeof input !== 'object' || Array.isArray(input)) throw new FoundationError('validation_failed', 400)
  const row = input as Record<string, unknown>
  const text = (key: string, max: number) => {
    if (typeof row[key] !== 'string') throw new FoundationError('validation_failed', 400)
    const value = String(row[key]).normalize('NFKC').trim()
    if (!value || value.length > max) throw new FoundationError('validation_failed', 400)
    return value
  }
  const optional = (key: string, max: number) => row[key] === null || row[key] === undefined || row[key] === '' ? null : text(key, max)
  const commandId = text('commandId', 36)
  const sourceRow = Number(row.sourceRow)
  const skuCode = text('skuCode', 80).toUpperCase()
  const salesCode = optional('salesCode', 80)?.toUpperCase() ?? null
  const barcode = optional('barcode', 128)
  const baseUnitCode = text('baseUnitCode', 32).toLowerCase()
  const salePrice = Number(row.salePrice)
  const taxRate = Number(row.taxRate)
  const quantityBehavior = row.quantityBehavior
  const taxCategory = row.taxCategory
  const status = row.status
  if (!UUID_PATTERN.test(commandId) || !Number.isSafeInteger(sourceRow) || sourceRow < 2
    || !CODE_PATTERN.test(skuCode) || (salesCode && !validateGlobalSalesCode(salesCode).ok)
    || !BASE_UNIT_PATTERN.test(baseUnitCode) || !Number.isFinite(salePrice) || salePrice < 0
    || !Number.isFinite(taxRate) || taxRate < 0 || taxRate > 100
    || !['discrete', 'weight', 'volume'].includes(String(quantityBehavior))
    || !['standard', 'zero', 'exempt', 'out_of_scope'].includes(String(taxCategory))
    || !['draft', 'active', 'archived'].includes(String(status))) {
    throw new FoundationError('validation_failed', 400)
  }
  const stringList = (key: string, maximum: number) => {
    if (!Array.isArray(row[key]) || row[key].length > maximum || row[key].some((item) => typeof item !== 'string')) {
      throw new FoundationError('validation_failed', 400)
    }
    return [...new Set((row[key] as string[]).map((item) => item.normalize('NFKC').trim()).filter(Boolean))]
  }
  const tags = stringList('tags', 12)
  const branches = stringList('branches', 100)
  if (!branches.length) throw new FoundationError('validation_failed', 400)
  return {
    commandId, sourceRow, productName: text('productName', 160), categoryName: text('categoryName', 120),
    brandName: optional('brandName', 120), skuCode, salesCode, barcode, baseUnitCode,
    quantityBehavior: quantityBehavior as ProductImportExecutionRow['quantityBehavior'], salePrice,
    taxCategory: taxCategory as ProductImportExecutionRow['taxCategory'], taxRate, tags, branches,
    status: status as ProductImportExecutionRow['status'],
  }
}

function normalizeName(value: string) { return value.normalize('NFKC').trim().toLocaleLowerCase('th-TH') }
function normalizeCode(value: string) { return value.normalize('NFKC').trim().toUpperCase() }
function nameMap(rows: Array<{ id: unknown; name: unknown }>) {
  return new Map(rows.map((row) => [normalizeName(String(row.name)), String(row.id)]))
}

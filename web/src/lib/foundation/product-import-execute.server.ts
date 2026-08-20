import 'server-only'

import { requireFoundationPermission } from './authorization'
import { parseFoundationCommand, type FoundationCommandOutcome } from './contracts'
import { FoundationError, mapFoundationError } from './errors'
import { getFoundationActor } from './server-context'
import { executeFoundationServerCommand } from './server-service'
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
  status: 'created' | 'skipped' | 'failed'
  productId?: string
  skuId?: string
  error?: string
  warnings: string[]
}

type ParsedInput = {
  organizationId: string
  rows: ProductImportExecutionRow[]
}

export async function executeProductImportRows(input: unknown): Promise<ProductImportExecutionResult[]> {
  const parsed = parseInput(input)
  const actor = await getFoundationActor(parsed.organizationId)
  requireFoundationPermission(actor, 'product.manage')
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
  const identifiers = [...new Set(parsed.rows.flatMap(rowIdentifiers))]
  const existing = new Set<string>()
  for (let index = 0; index < identifiers.length; index += 100) {
    const result = await supabase.from('sku_identifier_registry')
      .select('normalized_identifier')
      .eq('organization_id', parsed.organizationId)
      .in('normalized_identifier', identifiers.slice(index, index + 100))
    if (result.error) throw result.error
    result.data?.forEach((row) => existing.add(normalizeCode(String(row.normalized_identifier))))
  }

  const results: ProductImportExecutionResult[] = []
  for (const row of parsed.rows) {
    const warnings = row.status === 'draft' ? [] : ['นำเข้าเป็นฉบับร่างเพื่อให้ตรวจสอบก่อนเปิดใช้งาน']
    if (rowIdentifiers(row).some((identifier) => existing.has(identifier))) {
      results.push({ sourceRow: row.sourceRow, commandId: row.commandId, status: 'skipped', error: 'identifier_already_exists', warnings })
      continue
    }
    const categoryId = categoryByName.get(normalizeName(row.categoryName))
    const brandId = row.brandName ? brandByName.get(normalizeName(row.brandName)) : null
    const tagIds = row.tags.map((tag) => tagByName.get(normalizeName(tag)))
    const missingBranches = row.branches.filter((branch) => !activeBranches.has(normalizeCode(branch)))
    if (!categoryId || (row.brandName && !brandId) || tagIds.some((id) => !id) || missingBranches.length) {
      const missing = [
        ...(!categoryId ? [`หมวดหมู่: ${row.categoryName}`] : []),
        ...(row.brandName && !brandId ? [`แบรนด์: ${row.brandName}`] : []),
        ...row.tags.filter((_, index) => !tagIds[index]).map((tag) => `ป้ายกำกับ: ${tag}`),
        ...missingBranches.map((branch) => `สาขา: ${branch}`),
      ]
      results.push({ sourceRow: row.sourceRow, commandId: row.commandId, status: 'failed', error: `master_missing:${missing.join(', ')}`, warnings })
      continue
    }

    try {
      const command = parseFoundationCommand({
        kind: 'entity',
        commandId: row.commandId,
        organizationId: parsed.organizationId,
        commandType: 'product.create_with_initial_sku',
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
          sales_code: row.salesCode,
          base_unit_code: row.baseUnitCode,
          quantity_behavior: row.quantityBehavior,
          sale_price: row.salePrice,
          currency_code: 'THB',
          tax_category: row.taxCategory,
          tax_rate: row.taxRate,
          sell_units: [],
          bundle_components: [],
        },
      })
      const outcome: FoundationCommandOutcome = await executeFoundationServerCommand(command)
      rowIdentifiers(row).forEach((identifier) => existing.add(identifier))
      results.push({
        sourceRow: row.sourceRow,
        commandId: row.commandId,
        status: 'created',
        productId: String(outcome.product_id ?? outcome.entity_id ?? ''),
        skuId: String(outcome.sku_id ?? ''),
        warnings,
      })
    } catch (error) {
      const safeError = mapFoundationError(error, row.commandId)
      results.push({ sourceRow: row.sourceRow, commandId: row.commandId, status: 'failed', error: safeError.code, warnings })
    }
  }
  return results
}

function parseInput(input: unknown): ParsedInput {
  if (!input || typeof input !== 'object' || Array.isArray(input)) throw new FoundationError('validation_failed', 400)
  const value = input as Record<string, unknown>
  const organizationId = typeof value.organizationId === 'string' ? value.organizationId.trim() : ''
  if (!UUID_PATTERN.test(organizationId) || !Array.isArray(value.rows) || value.rows.length < 1 || value.rows.length > 25) {
    throw new FoundationError('validation_failed', 400)
  }
  const rows = value.rows.map((entry) => parseRow(entry))
  if (new Set(rows.map((row) => row.commandId)).size !== rows.length || new Set(rows.map((row) => row.sourceRow)).size !== rows.length) {
    throw new FoundationError('validation_failed', 400)
  }
  return { organizationId, rows }
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
    || !CODE_PATTERN.test(skuCode) || (salesCode && !CODE_PATTERN.test(salesCode))
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
function rowIdentifiers(row: Pick<ProductImportExecutionRow, 'skuCode' | 'salesCode' | 'barcode'>) {
  return [...new Set([row.skuCode, row.salesCode, row.barcode].filter((value): value is string => Boolean(value)).map(normalizeCode))]
}

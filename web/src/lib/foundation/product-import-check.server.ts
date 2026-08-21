import 'server-only'

import { requireFoundationPermission } from './authorization'
import { FoundationError } from './errors'
import { validateGlobalSalesCode } from './global-sales-code'
import { getFoundationActor } from './server-context'
import { createAdminClient } from '@/lib/supabase/admin'

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i
const CONTROL_CHARACTER_PATTERN = /[\u0000-\u001f\u007f]/

export type ProductImportSalesCodeRange = {
  prefix: string
  startCode: string
  endCode: string
  quantity: number
}

export type ProductImportIdentifierCheckResult = {
  checked: number
  existing: string[]
  conflictingSalesCodes: string[]
  grandfatheredSalesCodes: string[]
  blankSalesCodeCount: number
  proposedSalesCodeRange: ProductImportSalesCodeRange | null
}

export async function checkProductImportIdentifiers(input: unknown): Promise<ProductImportIdentifierCheckResult> {
  if (!input || typeof input !== 'object' || Array.isArray(input)) {
    throw new FoundationError('validation_failed', 400)
  }
  const values = input as Record<string, unknown>
  const organizationId = typeof values.organizationId === 'string' ? values.organizationId.trim() : ''
  const blankSalesCodeCount = Number(values.blankSalesCodeCount ?? 0)
  if (!UUID_PATTERN.test(organizationId) || !Array.isArray(values.identifiers) || values.identifiers.length > 60_000
    || !Number.isSafeInteger(blankSalesCodeCount) || blankSalesCodeCount < 0) {
    throw new FoundationError('validation_failed', 400)
  }

  const identifiers = normalizeList(values.identifiers, 128)
  const submittedSalesCodes = normalizeList(Array.isArray(values.salesCodes) ? values.salesCodes : [], 80)
  const actor = await getFoundationActor(organizationId)
  requireFoundationPermission(actor, 'product.create')
  requireFoundationPermission(actor, 'sku.create')

  // Use privileged reads only after tenant and granular permission checks. The
  // response echoes submitted identifiers without exposing their owning SKU.
  const admin = createAdminClient()
  const existing = new Set<string>()
  for (let index = 0; index < identifiers.length; index += 100) {
    const result = await admin
      .from('sku_identifier_registry')
      .select('normalized_identifier')
      .eq('organization_id', organizationId)
      .in('normalized_identifier', identifiers.slice(index, index + 100))
    if (result.error) throw result.error
    result.data?.forEach((row) => existing.add(String(row.normalized_identifier).toUpperCase()))
  }

  const existingSalesCodes = submittedSalesCodes.filter((code) => existing.has(code))
  const conflictingSalesCodes = existingSalesCodes.filter((code) => validateGlobalSalesCode(code).ok)
  const grandfatheredSalesCodes = existingSalesCodes.filter((code) => !validateGlobalSalesCode(code).ok)
  let proposedSalesCodeRange: ProductImportSalesCodeRange | null = null
  if (blankSalesCodeCount > 0) {
    const quantity = Math.min(blankSalesCodeCount, 50)
    const { data, error } = await admin.rpc('server_preview_global_sales_code_range', {
      p_organization_id: organizationId,
      p_requested_prefix: 'A',
      p_quantity: quantity,
      p_actor_user_id: actor.userId,
    })
    if (error) throw error
    if (!data || typeof data !== 'object' || Array.isArray(data)) throw new FoundationError('foundation_command_failed', 500)
    const result = data as Record<string, unknown>
    proposedSalesCodeRange = {
      prefix: String(result.prefix ?? ''),
      startCode: String(result.first_code ?? ''),
      endCode: String(result.last_code ?? ''),
      quantity: Number(result.quantity ?? quantity),
    }
  }

  return {
    checked: identifiers.length,
    existing: [...existing].sort(),
    conflictingSalesCodes: [...new Set(conflictingSalesCodes)].sort(),
    grandfatheredSalesCodes: [...new Set(grandfatheredSalesCodes)].sort(),
    blankSalesCodeCount,
    proposedSalesCodeRange,
  }
}

function normalizeList(input: unknown[], maxLength: number) {
  return [...new Set(input.map((entry) => {
    if (typeof entry !== 'string') throw new FoundationError('validation_failed', 400)
    const normalized = entry.normalize('NFKC').trim().toUpperCase()
    if (!normalized || normalized.length > maxLength || CONTROL_CHARACTER_PATTERN.test(normalized)) {
      throw new FoundationError('validation_failed', 400)
    }
    return normalized
  }))]
}

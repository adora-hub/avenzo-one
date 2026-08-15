import 'server-only'

import { requireFoundationPermission } from './authorization'
import { FoundationError } from './errors'
import { getFoundationActor } from './server-context'
import { createClient } from '@/lib/supabase/server'

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i
const CODE_PATTERN = /^[A-Z0-9][A-Z0-9._-]*$/
const CONTROL_CHARACTER_PATTERN = /[\u0000-\u001f\u007f]/

export type ProductIdentifierField = 'sku_code' | 'sales_code' | 'barcode'

export type ProductIdentifierCollision = {
  field: ProductIdentifierField
  value: string
}

export type ProductIdentifierCheckResult = {
  checked: number
  collisions: ProductIdentifierCollision[]
}

type ParsedIdentifierCheck = {
  organizationId: string
  identifiers: ProductIdentifierCollision[]
}

function normalizedOptionalString(value: unknown, maxLength: number, uppercase = false) {
  if (value === undefined || value === null) return ''
  if (typeof value !== 'string') throw new FoundationError('validation_failed', 400)
  const normalized = value.trim()
  if (CONTROL_CHARACTER_PATTERN.test(normalized) || normalized.length > maxLength) {
    throw new FoundationError('validation_failed', 400)
  }
  return uppercase ? normalized.toUpperCase() : normalized
}

export function parseProductIdentifierCheck(input: unknown): ParsedIdentifierCheck {
  if (!input || typeof input !== 'object' || Array.isArray(input)) {
    throw new FoundationError('validation_failed', 400)
  }
  const value = input as Record<string, unknown>
  const organizationId = typeof value.organizationId === 'string' ? value.organizationId.trim() : ''
  if (!UUID_PATTERN.test(organizationId)) throw new FoundationError('validation_failed', 400)

  const skuCode = normalizedOptionalString(value.skuCode, 80, true)
  const salesCode = normalizedOptionalString(value.salesCode, 80, true)
  const barcode = normalizedOptionalString(value.barcode, 128)
  if (!skuCode || !CODE_PATTERN.test(skuCode) || (salesCode && !CODE_PATTERN.test(salesCode))) {
    throw new FoundationError('validation_failed', 400)
  }

  return {
    organizationId,
    identifiers: [
      { field: 'sku_code', value: skuCode },
      ...(salesCode ? [{ field: 'sales_code' as const, value: salesCode }] : []),
      ...(barcode ? [{ field: 'barcode' as const, value: barcode }] : []),
    ],
  }
}

export async function checkProductIdentifiers(
  input: unknown,
): Promise<ProductIdentifierCheckResult> {
  const parsed = parseProductIdentifierCheck(input)
  const actor = await getFoundationActor(parsed.organizationId)
  requireFoundationPermission(actor, 'product.manage')

  const supabase = await createClient()
  const results = await Promise.all(parsed.identifiers.map(async (identifier) => {
    const result = await supabase
      .from('skus')
      .select('id')
      .eq('organization_id', parsed.organizationId)
      .eq(identifier.field, identifier.value)
      .limit(1)
    if (result.error) throw result.error
    return result.data?.length ? identifier : null
  }))

  return {
    checked: parsed.identifiers.length,
    collisions: results.filter((result): result is ProductIdentifierCollision => Boolean(result)),
  }
}

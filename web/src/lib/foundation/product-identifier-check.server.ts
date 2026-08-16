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

export type VariantProductIdentifierCollision = ProductIdentifierCollision & {
  key: string
  reason: 'duplicate_in_form' | 'already_exists'
}

export type VariantProductIdentifierCheckResult = {
  checked: number
  collisions: VariantProductIdentifierCollision[]
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
export async function checkVariantProductIdentifiers(
  input: unknown,
): Promise<VariantProductIdentifierCheckResult> {
  if (!input || typeof input !== 'object' || Array.isArray(input)) {
    throw new FoundationError('validation_failed', 400)
  }
  const value = input as Record<string, unknown>
  const organizationId = typeof value.organizationId === 'string' ? value.organizationId.trim() : ''
  if (!UUID_PATTERN.test(organizationId) || !Array.isArray(value.variants)
    || value.variants.length < 1 || value.variants.length > 100) {
    throw new FoundationError('validation_failed', 400)
  }

  const identifiers = value.variants.flatMap((entry) => {
    if (!entry || typeof entry !== 'object' || Array.isArray(entry)) {
      throw new FoundationError('validation_failed', 400)
    }
    const variant = entry as Record<string, unknown>
    const key = normalizedOptionalString(variant.key, 500)
    const skuCode = normalizedOptionalString(variant.skuCode, 80, true)
    const salesCode = normalizedOptionalString(variant.salesCode, 80, true)
    const barcode = normalizedOptionalString(variant.barcode, 128, true)
    if (!key || !skuCode || !CODE_PATTERN.test(skuCode)
      || (salesCode && !CODE_PATTERN.test(salesCode))
      || (barcode && !CODE_PATTERN.test(barcode))) {
      throw new FoundationError('validation_failed', 400)
    }
    return [
      { key, field: 'sku_code' as const, value: skuCode },
      ...(salesCode ? [{ key, field: 'sales_code' as const, value: salesCode }] : []),
      ...(barcode ? [{ key, field: 'barcode' as const, value: barcode }] : []),
    ]
  })

  const actor = await getFoundationActor(organizationId)
  requireFoundationPermission(actor, 'product.manage')

  const grouped = new Map<string, typeof identifiers>()
  identifiers.forEach((identifier) => {
    const normalized = identifier.value.toUpperCase()
    grouped.set(normalized, [...(grouped.get(normalized) ?? []), identifier])
  })
  const collisions: VariantProductIdentifierCollision[] = []
  grouped.forEach((entries) => {
    // One SKU may intentionally reuse the same value for multiple identifier
    // kinds (for example SKU Code = Barcode). The permanent registry resolves
    // that value to one sku_id, so it is only a form collision when the value
    // would resolve to more than one Variant/SKU.
    const variantKeys = new Set(entries.map((entry) => entry.key))
    if (variantKeys.size > 1) {
      entries.forEach((entry) => collisions.push({ ...entry, reason: 'duplicate_in_form' }))
    }
  })

  const supabase = await createClient()
  const normalizedValues = [...grouped.keys()]
  const existing = new Set<string>()
  for (let index = 0; index < normalizedValues.length; index += 100) {
    const result = await supabase
      .from('sku_identifier_registry')
      .select('normalized_identifier')
      .eq('organization_id', organizationId)
      .in('normalized_identifier', normalizedValues.slice(index, index + 100))
    if (result.error) throw result.error
    result.data?.forEach((row) => existing.add(String(row.normalized_identifier)))
  }
  identifiers.forEach((identifier) => {
    if (existing.has(identifier.value.toUpperCase())) {
      collisions.push({ ...identifier, reason: 'already_exists' })
    }
  })

  const uniqueCollisions = [...new Map(collisions.map((collision) => [
    `${collision.key}:${collision.field}:${collision.reason}`,
    collision,
  ])).values()]
  return { checked: identifiers.length, collisions: uniqueCollisions }
}

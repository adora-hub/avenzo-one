import 'server-only'

import { requireFoundationPermission } from './authorization'
import { FoundationError } from './errors'
import { getFoundationActor } from './server-context'
import { createClient } from '@/lib/supabase/server'

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i
const CONTROL_CHARACTER_PATTERN = /[\u0000-\u001f\u007f]/

export type ProductImportIdentifierCheckResult = {
  checked: number
  existing: string[]
}

export async function checkProductImportIdentifiers(input: unknown): Promise<ProductImportIdentifierCheckResult> {
  if (!input || typeof input !== 'object' || Array.isArray(input)) {
    throw new FoundationError('validation_failed', 400)
  }
  const values = input as Record<string, unknown>
  const organizationId = typeof values.organizationId === 'string' ? values.organizationId.trim() : ''
  if (!UUID_PATTERN.test(organizationId) || !Array.isArray(values.identifiers) || values.identifiers.length > 60_000) {
    throw new FoundationError('validation_failed', 400)
  }

  const identifiers = [...new Set(values.identifiers.map((entry) => {
    if (typeof entry !== 'string') throw new FoundationError('validation_failed', 400)
    const normalized = entry.normalize('NFKC').trim().toUpperCase()
    if (!normalized || normalized.length > 128 || CONTROL_CHARACTER_PATTERN.test(normalized)) {
      throw new FoundationError('validation_failed', 400)
    }
    return normalized
  }))]

  const actor = await getFoundationActor(organizationId)
  requireFoundationPermission(actor, 'product.manage')

  const supabase = await createClient()
  const existing = new Set<string>()
  for (let index = 0; index < identifiers.length; index += 100) {
    const result = await supabase
      .from('sku_identifier_registry')
      .select('normalized_identifier')
      .eq('organization_id', organizationId)
      .in('normalized_identifier', identifiers.slice(index, index + 100))
    if (result.error) throw result.error
    result.data?.forEach((row) => existing.add(String(row.normalized_identifier).toUpperCase()))
  }
  return { checked: identifiers.length, existing: [...existing].sort() }
}

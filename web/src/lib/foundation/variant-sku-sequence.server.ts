import 'server-only'

import { requireFoundationPermission } from './authorization'
import { FoundationError } from './errors'
import { getFoundationActor } from './server-context'
import { createAdminClient } from '@/lib/supabase/admin'

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i
const PREFIX_PATTERN = /^[A-Z0-9]{2,12}$/

export type VariantSkuSequencePreview = {
  prefix: string
  nextSequence: number
  formattedSequence: string
  digitCount: number
  previewOnly: true
  reserved: false
}

export async function previewVariantSkuSequence(input: unknown): Promise<VariantSkuSequencePreview> {
  if (!input || typeof input !== 'object' || Array.isArray(input)) {
    throw new FoundationError('validation_failed', 400)
  }
  const value = input as Record<string, unknown>
  const organizationId = String(value.organizationId ?? '').trim()
  const prefix = String(value.prefix ?? '').trim().toUpperCase()
  const digitCount = Math.trunc(Number(value.digitCount ?? 3))
  if (!UUID_PATTERN.test(organizationId) || !PREFIX_PATTERN.test(prefix)
    || digitCount < 3 || digitCount > 8) {
    throw new FoundationError('validation_failed', 400)
  }

  const actor = await getFoundationActor(organizationId)
  requireFoundationPermission(actor, 'product.manage')
  const admin = createAdminClient()
  const { data, error } = await admin.rpc('server_preview_variant_sku_sequence', {
    p_organization_id: organizationId,
    p_prefix: prefix,
    p_actor_user_id: actor.userId,
    p_digit_count: digitCount,
  })
  if (error) throw error
  if (!data || typeof data !== 'object' || Array.isArray(data)) {
    throw new FoundationError('foundation_command_failed', 500)
  }
  const result = data as Record<string, unknown>
  const nextSequence = Number(result.next_sequence)
  if (!Number.isInteger(nextSequence) || nextSequence < 1 || nextSequence > 99_999_999) {
    throw new FoundationError('foundation_command_failed', 500)
  }
  return {
    prefix: String(result.prefix),
    nextSequence,
    formattedSequence: String(result.formatted_sequence),
    digitCount: Number(result.digit_count),
    previewOnly: true,
    reserved: false,
  }
}

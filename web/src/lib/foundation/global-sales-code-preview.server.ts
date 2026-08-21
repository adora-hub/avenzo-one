import 'server-only'

import { requireFoundationPermission } from './authorization'
import { FoundationError } from './errors'
import { getFoundationActor } from './server-context'
import { createAdminClient } from '@/lib/supabase/admin'
import {
  GLOBAL_SALES_CODE_MAX_RANGE_SIZE,
  normalizeGlobalSalesCodePrefix,
} from './global-sales-code'

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i
const PREFIX_PATTERN = /^[A-Z]{1,3}$/

export type GlobalSalesCodeAuthoritativePreview = {
  state: 'preview'
  authoritative: true
  reserved: false
  requestedPrefix: string
  prefix: string
  startNumber: number
  endNumber: number
  firstCode: string
  lastCode: string
  quantity: number
  movedToNextPrefix: boolean
}

export async function previewGlobalSalesCodeRangeServer(input: unknown): Promise<GlobalSalesCodeAuthoritativePreview> {
  if (!input || typeof input !== 'object' || Array.isArray(input)) {
    throw new FoundationError('validation_failed', 400)
  }
  const value = input as Record<string, unknown>
  const organizationId = String(value.organizationId ?? '').trim()
  const requestedPrefix = normalizeGlobalSalesCodePrefix(String(value.prefix ?? ''))
  const quantity = Math.trunc(Number(value.quantity))
  if (!UUID_PATTERN.test(organizationId) || !PREFIX_PATTERN.test(requestedPrefix)
    || quantity < 1 || quantity > GLOBAL_SALES_CODE_MAX_RANGE_SIZE) {
    throw new FoundationError('validation_failed', 400)
  }

  const actor = await getFoundationActor(organizationId)
  requireFoundationPermission(actor, 'product.create')
  const admin = createAdminClient()
  const { data, error } = await admin.rpc('server_preview_global_sales_code_range', {
    p_organization_id: organizationId,
    p_requested_prefix: requestedPrefix,
    p_quantity: quantity,
    p_actor_user_id: actor.userId,
  })
  if (error) throw error
  if (!data || typeof data !== 'object' || Array.isArray(data)) {
    throw new FoundationError('foundation_command_failed', 500)
  }
  const result = data as Record<string, unknown>
  const startNumber = Number(result.start_number)
  const endNumber = Number(result.end_number)
  const prefix = String(result.prefix ?? '')
  const firstCode = String(result.first_code ?? '')
  const lastCode = String(result.last_code ?? '')
  if (!PREFIX_PATTERN.test(prefix) || !Number.isInteger(startNumber) || !Number.isInteger(endNumber)
    || endNumber < startNumber || endNumber - startNumber + 1 !== quantity
    || !firstCode || !lastCode) {
    throw new FoundationError('foundation_command_failed', 500)
  }
  return {
    state: 'preview', authoritative: true, reserved: false,
    requestedPrefix: String(result.requested_prefix ?? requestedPrefix), prefix,
    startNumber, endNumber, firstCode, lastCode, quantity,
    movedToNextPrefix: Boolean(result.moved_to_next_prefix),
  }
}

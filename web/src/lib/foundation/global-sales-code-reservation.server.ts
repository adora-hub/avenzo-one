import 'server-only'

import { createHash } from 'node:crypto'
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

export type GlobalSalesCodeReservationResult = {
  state: 'reserved'
  authoritative: true
  reserved: true
  requestedPrefix: string
  prefix: string
  startNumber: number
  endNumber: number
  firstCode: string
  lastCode: string
  quantity: number
  movedToNextPrefix: boolean
  batchId: string
  sequenceId: string
  expiresAt: string
}

function reservationRequestHash(prefix: string, quantity: number) {
  // Must match jsonb_build_object(... )::text in server_reserve_global_sales_code_range.
  const postgresJsonbText = `{"prefix": "${prefix}", "quantity": ${quantity}, "ttl_hours": 3}`
  return createHash('sha256').update(postgresJsonbText).digest('hex')
}

export async function reserveGlobalSalesCodeRangeServer(input: unknown): Promise<GlobalSalesCodeReservationResult> {
  if (!input || typeof input !== 'object' || Array.isArray(input)) {
    throw new FoundationError('validation_failed', 400)
  }
  const value = input as Record<string, unknown>
  const commandId = String(value.commandId ?? '').trim()
  const organizationId = String(value.organizationId ?? '').trim()
  const requestedPrefix = normalizeGlobalSalesCodePrefix(String(value.prefix ?? ''))
  const quantity = Math.trunc(Number(value.quantity))
  if (!UUID_PATTERN.test(commandId) || !UUID_PATTERN.test(organizationId)
    || !PREFIX_PATTERN.test(requestedPrefix)
    || quantity < 1 || quantity > GLOBAL_SALES_CODE_MAX_RANGE_SIZE) {
    throw new FoundationError('validation_failed', 400, commandId)
  }

  const actor = await getFoundationActor(organizationId)
  requireFoundationPermission(actor, 'product.create')
  const { data, error } = await createAdminClient().rpc('server_reserve_global_sales_code_range', {
    p_command_id: commandId,
    p_organization_id: organizationId,
    p_requested_prefix: requestedPrefix,
    p_quantity: quantity,
    p_request_hash: reservationRequestHash(requestedPrefix, quantity),
    p_actor_user_id: actor.userId,
    p_occurred_at: new Date().toISOString(),
  })
  if (error) throw error
  if (!data || typeof data !== 'object' || Array.isArray(data)) {
    throw new FoundationError('foundation_command_failed', 500, commandId)
  }

  const result = data as Record<string, unknown>
  const prefix = String(result.prefix ?? '')
  const startNumber = Number(result.start_number)
  const endNumber = Number(result.end_number)
  const batchId = String(result.batch_id ?? '')
  const sequenceId = String(result.sequence_id ?? '')
  const expiresAt = String(result.expires_at ?? '')
  if (result.state !== 'reserved' || result.reserved !== true || result.authoritative !== true
    || !PREFIX_PATTERN.test(prefix) || !Number.isInteger(startNumber) || !Number.isInteger(endNumber)
    || endNumber - startNumber + 1 !== quantity || !UUID_PATTERN.test(batchId) || !UUID_PATTERN.test(sequenceId)
    || Number.isNaN(Date.parse(expiresAt))) {
    throw new FoundationError('foundation_command_failed', 500, commandId)
  }

  return {
    state: 'reserved', authoritative: true, reserved: true,
    requestedPrefix: String(result.requested_prefix ?? requestedPrefix), prefix,
    startNumber, endNumber,
    firstCode: String(result.first_code ?? ''), lastCode: String(result.last_code ?? ''), quantity,
    movedToNextPrefix: Boolean(result.moved_to_next_prefix), batchId, sequenceId, expiresAt,
  }
}

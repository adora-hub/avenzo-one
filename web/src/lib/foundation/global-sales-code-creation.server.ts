import 'server-only'

import { createHash } from 'node:crypto'
import { requireFoundationPermission } from './authorization'
import { FoundationError } from './errors'
import { getFoundationActor } from './server-context'
import { createAdminClient } from '@/lib/supabase/admin'

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i
const FLOW_VALUES = new Set(['normal', 'variant', 'rapid'])
const MODE_VALUES = new Set(['sequence', 'manual', 'same_as_sku', 'deferred', 'reserved_batch'])

function canonicalJson(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(',')}]`
  if (value && typeof value === 'object') {
    const record = value as Record<string, unknown>
    return `{${Object.keys(record).sort().map((key) => `${JSON.stringify(key)}:${canonicalJson(record[key])}`).join(',')}}`
  }
  return JSON.stringify(value)
}

export type GlobalSalesCodeCreationResult = {
  command_id: string
  flow: 'normal' | 'variant' | 'rapid'
  sales_code_mode: 'sequence' | 'manual' | 'same_as_sku' | 'deferred' | 'reserved_batch'
  created_count: number
  sku_count: number
  results: Array<Record<string, unknown>>
  sales_code_batch_id: string | null
  sales_codes: string[]
  inventory_posted: false
  initial_stock_boundary: 't5-pending' | 'rapid-be-05-pending'
}

export async function executeGlobalSalesCodeCreation(input: unknown): Promise<GlobalSalesCodeCreationResult> {
  if (!input || typeof input !== 'object' || Array.isArray(input)) {
    throw new FoundationError('validation_failed', 400)
  }
  const value = input as Record<string, unknown>
  const commandId = String(value.commandId ?? '')
  const organizationId = String(value.organizationId ?? '')
  const flow = String(value.flow ?? '')
  const payload = value.payload
  if (!UUID_PATTERN.test(commandId) || !UUID_PATTERN.test(organizationId)
    || !FLOW_VALUES.has(flow) || !payload || typeof payload !== 'object' || Array.isArray(payload)) {
    throw new FoundationError('validation_failed', 400)
  }
  const payloadRecord = payload as Record<string, unknown>
  const mode = String(payloadRecord.sales_code_mode ?? 'sequence')
  const items = Array.isArray(payloadRecord.creation_items) ? payloadRecord.creation_items : []
  if (!MODE_VALUES.has(mode) || items.length < 1 || items.length > 50
    || ((flow === 'normal' || flow === 'variant') && items.length !== 1)
    || (flow === 'rapid' && mode === 'deferred')) {
    throw new FoundationError('validation_failed', 400)
  }

  const actor = await getFoundationActor(organizationId)
  requireFoundationPermission(actor, 'product.create')
  const requestHash = createHash('sha256').update(canonicalJson(payload)).digest('hex')
  const { data, error } = await createAdminClient().rpc('server_execute_global_sales_code_creation', {
    p_command_id: commandId,
    p_organization_id: organizationId,
    p_flow: flow,
    p_payload: payload,
    p_request_hash: requestHash,
    p_actor_user_id: actor.userId,
  })
  if (error) throw error
  if (!data || typeof data !== 'object' || Array.isArray(data)) {
    throw new FoundationError('foundation_command_failed', 500, commandId)
  }
  return data as GlobalSalesCodeCreationResult
}

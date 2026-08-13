import { FoundationError } from './errors'

export const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i

export const foundationCommandTypes = [
  'product.create', 'product.update', 'product.activate', 'product.archive',
  'sku.create', 'sku.update', 'sku.activate', 'sku.archive',
  'warehouse.create', 'warehouse.update', 'warehouse.inactivate', 'warehouse.archive',
  'location.create', 'location.update', 'location.inactivate', 'location.archive',
] as const

export type FoundationCommandType = typeof foundationCommandTypes[number]
export type InventoryCommandType = 'receive' | 'adjustment_in' | 'adjustment_out' | 'transfer'

export type FoundationEntityCommand = {
  kind: 'entity'
  commandId: string
  organizationId: string
  commandType: FoundationCommandType
  payload: Record<string, unknown>
}

export type InventoryCommand = {
  kind: 'inventory'
  commandId: string
  organizationId: string
  commandType: InventoryCommandType
  skuId: string
  sourceLocationId: string | null
  destinationLocationId: string | null
  quantity: number
  reasonCode: string
  reasonNote: string | null
  occurredAt?: string
}

export type FoundationApplicationCommand = FoundationEntityCommand | InventoryCommand

export type FoundationCommandOutcome = {
  entity_id?: string
  entity_type?: 'product' | 'sku' | 'warehouse' | 'location'
  status?: string
  version?: number
  command_id?: string
  movement_ids?: string[]
  correlation_id?: string
  source_location_id?: string
  destination_location_id?: string
  [key: string]: unknown
}

function requireRecord(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new FoundationError('validation_failed', 400)
  }
  return value as Record<string, unknown>
}

function requireUuid(value: unknown) {
  if (typeof value !== 'string' || !uuidPattern.test(value)) {
    throw new FoundationError('validation_failed', 400)
  }
  return value
}

function optionalString(value: unknown, maxLength: number) {
  if (value === undefined || value === null) return null
  if (typeof value !== 'string' || value.trim().length > maxLength) {
    throw new FoundationError('validation_failed', 400)
  }
  return value.trim()
}

function validateEntityPayload(commandType: FoundationCommandType, payload: Record<string, unknown>) {
  const allowedKeys: Record<FoundationCommandType, string[]> = {
    'product.create': ['name', 'description'],
    'product.update': ['product_id', 'expected_version', 'name', 'description'],
    'product.activate': ['product_id', 'expected_version'],
    'product.archive': ['product_id', 'expected_version'],
    'sku.create': ['product_id', 'sku_code', 'name', 'barcode', 'sales_code', 'base_unit_code', 'status'],
    'sku.update': ['sku_id', 'expected_version', 'name', 'barcode', 'sales_code'],
    'sku.activate': ['sku_id', 'expected_version'],
    'sku.archive': ['sku_id', 'expected_version'],
    'warehouse.create': ['branch_id', 'code', 'name'],
    'warehouse.update': ['warehouse_id', 'expected_version', 'name'],
    'warehouse.inactivate': ['warehouse_id', 'expected_version'],
    'warehouse.archive': ['warehouse_id', 'expected_version'],
    'location.create': ['warehouse_id', 'code', 'name'],
    'location.update': ['location_id', 'expected_version', 'name'],
    'location.inactivate': ['location_id', 'expected_version'],
    'location.archive': ['location_id', 'expected_version'],
  }
  if (Object.keys(payload).some((key) => !allowedKeys[commandType].includes(key))) {
    throw new FoundationError('validation_failed', 400)
  }

  const createNameCommands = new Set<FoundationCommandType>([
    'product.create', 'sku.create', 'warehouse.create', 'location.create',
  ])
  if (createNameCommands.has(commandType)) {
    const name = optionalString(payload.name, 160)
    if (!name) throw new FoundationError('validation_failed', 400)
  }

  if (commandType !== 'product.create' && !commandType.endsWith('.create')) {
    const entityKey = `${commandType.split('.')[0]}_id`
    requireUuid(payload[entityKey])
    const expectedVersion = payload.expected_version
    if (!Number.isSafeInteger(expectedVersion) || Number(expectedVersion) < 1) {
      throw new FoundationError('validation_failed', 400)
    }
  }

  if (commandType === 'sku.create') {
    requireUuid(payload.product_id)
    if (!optionalString(payload.sku_code, 80) || !optionalString(payload.base_unit_code, 32)) {
      throw new FoundationError('validation_failed', 400)
    }
    if (payload.status !== undefined && payload.status !== 'draft' && payload.status !== 'active') {
      throw new FoundationError('validation_failed', 400)
    }
  }
  if (commandType === 'warehouse.create') {
    requireUuid(payload.branch_id)
    if (!optionalString(payload.code, 40)) throw new FoundationError('validation_failed', 400)
  }
  if (commandType === 'location.create') {
    requireUuid(payload.warehouse_id)
    if (!optionalString(payload.code, 40)) throw new FoundationError('validation_failed', 400)
  }
  if (commandType.endsWith('.update')) optionalString(payload.name, 160)
  optionalString(payload.description, 2000)
  optionalString(payload.barcode, 128)
  optionalString(payload.sales_code, 80)
}

export function parseFoundationCommand(value: unknown): FoundationApplicationCommand {
  const input = requireRecord(value)
  const kind = input.kind
  const commandId = requireUuid(input.commandId)
  const organizationId = requireUuid(input.organizationId)

  if (kind === 'entity') {
    if (typeof input.commandType !== 'string'
      || !foundationCommandTypes.includes(input.commandType as FoundationCommandType)) {
      throw new FoundationError('validation_failed', 400, commandId)
    }
    const commandType = input.commandType as FoundationCommandType
    const payload = requireRecord(input.payload)
    validateEntityPayload(commandType, payload)
    return { kind, commandId, organizationId, commandType, payload }
  }

  if (kind === 'inventory') {
    if (!['receive', 'adjustment_in', 'adjustment_out', 'transfer'].includes(String(input.commandType))) {
      throw new FoundationError('validation_failed', 400, commandId)
    }
    const quantity = Number(input.quantity)
    if (!Number.isFinite(quantity) || quantity <= 0
      || quantity > 99_999_999_999_999.999999
      || !Number.isInteger(quantity * 1_000_000)) {
      throw new FoundationError('validation_failed', 400, commandId)
    }
    const reasonCode = optionalString(input.reasonCode, 64)
    if (!reasonCode || !/^[a-z][a-z0-9_]{0,63}$/.test(reasonCode)) {
      throw new FoundationError('validation_failed', 400, commandId)
    }
    const commandType = input.commandType as InventoryCommandType
    const sourceLocationId = input.sourceLocationId === null || input.sourceLocationId === undefined
      ? null : requireUuid(input.sourceLocationId)
    const destinationLocationId = input.destinationLocationId === null || input.destinationLocationId === undefined
      ? null : requireUuid(input.destinationLocationId)

    if ((commandType === 'receive' || commandType === 'adjustment_in') && !destinationLocationId) {
      throw new FoundationError('validation_failed', 400, commandId)
    }
    if (commandType === 'adjustment_out' && !sourceLocationId) {
      throw new FoundationError('validation_failed', 400, commandId)
    }
    if (commandType === 'transfer' && (!sourceLocationId || !destinationLocationId || sourceLocationId === destinationLocationId)) {
      throw new FoundationError('validation_failed', 400, commandId)
    }
    const reasonNote = optionalString(input.reasonNote, 500)
    if (commandType.startsWith('adjustment') && (!reasonNote || reasonNote.length < 3)) {
      throw new FoundationError('validation_failed', 400, commandId)
    }
    const occurredAt = optionalString(input.occurredAt, 40) ?? undefined
    if (occurredAt && Number.isNaN(Date.parse(occurredAt))) {
      throw new FoundationError('validation_failed', 400, commandId)
    }
    return {
      kind, commandId, organizationId, commandType,
      skuId: requireUuid(input.skuId), sourceLocationId, destinationLocationId,
      quantity, reasonCode, reasonNote,
      occurredAt,
    }
  }

  throw new FoundationError('validation_failed', 400, commandId)
}

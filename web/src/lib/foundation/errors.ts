export const foundationErrorCodes = [
  'authentication_required',
  'tenant_access_denied',
  'branch_scope_denied',
  'permission_denied',
  'validation_failed',
  'entity_not_found',
  'entity_inactive',
  'duplicate_sku_code',
  'duplicate_sales_code',
  'duplicate_barcode',
  'duplicate_product_master',
  'duplicate_sell_unit',
  'duplicate_warehouse_code',
  'duplicate_location_code',
  'unit_mismatch',
  'insufficient_stock',
  'command_payload_conflict',
  'command_in_progress',
  'version_conflict',
  'invalid_state_transition',
  'immutable_identifier',
  'foundation_command_failed',
] as const

export type FoundationErrorCode = typeof foundationErrorCodes[number]

export class FoundationError extends Error {
  constructor(
    public readonly code: FoundationErrorCode,
    public readonly status: number,
    public readonly commandId?: string,
  ) {
    super(code)
    this.name = 'FoundationError'
  }
}

const knownDatabaseMessages: Array<[string, FoundationErrorCode, number]> = [
  ['authentication_required', 'authentication_required', 401],
  ['branch_scope_denied', 'branch_scope_denied', 403],
  ['permission_denied', 'permission_denied', 403],
  ['entity_not_found', 'entity_not_found', 404],
  ['entity_inactive', 'entity_inactive', 409],
  ['inventory_negative_stock_forbidden', 'insufficient_stock', 409],
  ['command_payload_conflict', 'command_payload_conflict', 409],
  ['inventory_command_payload_conflict', 'command_payload_conflict', 409],
  ['version_conflict', 'version_conflict', 409],
  ['invalid_product_status_transition', 'invalid_state_transition', 409],
  ['invalid_sku_status_transition', 'invalid_state_transition', 409],
  ['sku_sales_code_is_permanent', 'immutable_identifier', 409],
  ['sku_base_unit_is_immutable', 'immutable_identifier', 409],
  ['archived_product_is_immutable', 'invalid_state_transition', 409],
  ['archived_sku_is_immutable', 'invalid_state_transition', 409],
  ['archived_warehouse_is_immutable', 'invalid_state_transition', 409],
  ['archived_location_is_immutable', 'invalid_state_transition', 409],
  ['nonzero_inventory_prevents_archive', 'invalid_state_transition', 409],
  ['active_sku_required', 'entity_inactive', 409],
  ['active_source_location_required', 'entity_inactive', 409],
  ['active_destination_location_required', 'entity_inactive', 409],
]

export function mapFoundationError(error: unknown, commandId?: string) {
  if (error instanceof FoundationError) return error

  const candidate = error as { code?: string; message?: string; details?: string }
  const message = `${candidate?.message ?? ''} ${candidate?.details ?? ''}`.toLowerCase()

  if (candidate?.code === '23505') {
    if (message.includes('skus_organization_sku_code_unique')) {
      return new FoundationError('duplicate_sku_code', 409, commandId)
    }
    if (message.includes('skus_organization_sales_code_unique')) {
      return new FoundationError('duplicate_sales_code', 409, commandId)
    }
    if (message.includes('skus_organization_barcode_unique')) {
      return new FoundationError('duplicate_barcode', 409, commandId)
    }
    if (message.includes('product_categories_org_name_unique')
      || message.includes('product_brands_org_name_unique')
      || message.includes('product_tags_org_name_unique')) {
      return new FoundationError('duplicate_product_master', 409, commandId)
    }
    if (message.includes('sku_sell_units_org_sku_code_unique')
      || message.includes('sku_sell_units_org_barcode_unique')) {
      return new FoundationError('duplicate_sell_unit', 409, commandId)
    }
    if (message.includes('warehouses_organization_code_unique')) {
      return new FoundationError('duplicate_warehouse_code', 409, commandId)
    }
    if (message.includes('locations_warehouse_code_unique')) {
      return new FoundationError('duplicate_location_code', 409, commandId)
    }
  }

  for (const [databaseMessage, code, status] of knownDatabaseMessages) {
    if (message.includes(databaseMessage)) {
      return new FoundationError(code, status, commandId)
    }
  }

  if (candidate?.code === '22P02' || candidate?.code === '22023' || candidate?.code === '23514') {
    return new FoundationError('validation_failed', 400, commandId)
  }
  return new FoundationError('foundation_command_failed', 500, commandId)
}

export type FoundationActionResult<T> =
  | { ok: true; data: T; commandId: string }
  | { ok: false; error: FoundationErrorCode; status: number; commandId?: string }

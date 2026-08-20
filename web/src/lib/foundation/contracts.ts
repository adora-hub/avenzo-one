import { FoundationError } from './errors'

export const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i

export const foundationCommandTypes = [
  'product.create', 'product.create_with_initial_sku', 'product.create_with_variants',
  'product.variant_images.assign',
  'product.update', 'product.activate', 'product.archive',
  'sku.create', 'sku.update', 'sku.activate', 'sku.archive',
  'product.master.upsert', 'product.metadata.update',
  'sku.profile.upsert', 'sku.cost.upsert',
  'sku.sell_units.replace', 'sku.bundle.replace',
  'product.image.prepare', 'product.image.finalize', 'product.image.fail',
  'product.image.archive', 'product.images.reorder',
  'warehouse.create', 'warehouse.update', 'warehouse.inactivate', 'warehouse.archive',
  'location.create', 'location.update', 'location.inactivate', 'location.archive',
] as const

export const productCreationCommandTypes = [
  'product.create_with_initial_sku',
] as const

export const productVariantCreationCommandTypes = [
  'product.create_with_variants', 'product.variant_images.assign',
] as const

export const productDomainCommandTypes = [
  'product.master.upsert', 'product.metadata.update',
  'sku.profile.upsert', 'sku.cost.upsert',
  'sku.sell_units.replace', 'sku.bundle.replace',
] as const

export const productImageCommandTypes = [
  'product.image.prepare', 'product.image.finalize', 'product.image.fail',
  'product.image.archive', 'product.images.reorder',
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
  entity_type?: 'product' | 'product_image' | 'sku' | 'warehouse' | 'location' | 'category' | 'brand' | 'tag'
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

function optionalUuid(value: unknown) {
  if (value === undefined || value === null || value === '') return null
  return requireUuid(value)
}

function requireVersion(value: unknown, allowZero = false) {
  const minimum = allowZero ? 0 : 1
  if (!Number.isSafeInteger(value) || Number(value) < minimum) {
    throw new FoundationError('validation_failed', 400)
  }
  return Number(value)
}

function optionalNumber(value: unknown, maximum = 99_999_999_999_999.999999) {
  if (value === undefined || value === null || value === '') return null
  if (typeof value !== 'number' || !Number.isFinite(value) || value < 0 || value > maximum) {
    throw new FoundationError('validation_failed', 400)
  }
  return value
}

function validateEntityPayload(commandType: FoundationCommandType, payload: Record<string, unknown>) {
  const allowedKeys: Record<FoundationCommandType, string[]> = {
    'product.create': ['name', 'description'],
    'product.create_with_initial_sku': [
      'name', 'description', 'category_id', 'brand_id', 'structure_type',
      'internal_note', 'tag_ids', 'sku_name', 'sku_code', 'barcode', 'sales_code',
      'base_unit_code', 'quantity_behavior', 'sale_price', 'cost_price',
      'currency_code', 'tax_category', 'tax_rate', 'product_weight_kg',
      'product_length_cm', 'product_width_cm', 'product_height_cm',
      'package_weight_kg', 'package_length_cm', 'package_width_cm',
      'package_height_cm', 'safety_stock', 'reorder_min', 'reorder_max',
      'sell_units', 'bundle_components',
    ],
    'product.create_with_variants': [
      'name', 'description', 'category_id', 'brand_id', 'structure_type',
      'internal_note', 'tag_ids', 'base_unit_code', 'quantity_behavior',
      'sale_price', 'cost_price', 'currency_code', 'tax_category', 'tax_rate',
      'product_weight_kg', 'product_length_cm', 'product_width_cm',
      'product_height_cm', 'package_weight_kg', 'package_length_cm',
      'package_width_cm', 'package_height_cm', 'safety_stock', 'reorder_min',
      'reorder_max', 'sell_units', 'sku_prefix', 'sku_product_sequence',
      'sku_sequence_digits', 'option_groups', 'variants',
    ],
    'product.variant_images.assign': ['product_id', 'assignments'],
    'product.update': ['product_id', 'expected_version', 'name', 'description'],
    'product.activate': ['product_id', 'expected_version'],
    'product.archive': ['product_id', 'expected_version'],
    'sku.create': ['product_id', 'sku_code', 'name', 'barcode', 'sales_code', 'base_unit_code', 'status'],
    'sku.update': ['sku_id', 'expected_version', 'name', 'barcode', 'sales_code'],
    'sku.activate': ['sku_id', 'expected_version'],
    'sku.archive': ['sku_id', 'expected_version'],
    'product.master.upsert': ['master_kind', 'master_id', 'expected_version', 'name', 'status'],
    'product.metadata.update': [
      'product_id', 'expected_version', 'category_id', 'brand_id',
      'structure_type', 'internal_note', 'tag_ids',
    ],
    'sku.profile.upsert': [
      'sku_id', 'expected_version', 'quantity_behavior', 'sale_price', 'currency_code',
      'tax_category', 'tax_rate', 'product_weight_kg', 'product_length_cm',
      'product_width_cm', 'product_height_cm', 'package_weight_kg', 'package_length_cm',
      'package_width_cm', 'package_height_cm', 'safety_stock', 'reorder_min', 'reorder_max',
    ],
    'sku.cost.upsert': ['sku_id', 'expected_version', 'cost_price', 'currency_code'],
    'sku.sell_units.replace': ['sku_id', 'units'],
    'sku.bundle.replace': ['sku_id', 'components'],
    'product.image.prepare': [
      'product_id', 'original_file_name', 'mime_type', 'file_size_bytes', 'alt_text',
    ],
    'product.image.finalize': ['image_id', 'expected_version'],
    'product.image.fail': ['image_id', 'expected_version', 'failure_reason'],
    'product.image.archive': ['image_id', 'expected_version'],
    'product.images.reorder': ['product_id', 'image_ids', 'cover_image_id'],
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

  if (commandType === 'product.variant_images.assign') {
    requireUuid(payload.product_id)
    if (!Array.isArray(payload.assignments) || payload.assignments.length > 100) {
      throw new FoundationError('validation_failed', 400)
    }
    payload.assignments.forEach((value) => {
      const assignment = requireRecord(value)
      if (Object.keys(assignment).some((key) => !['sku_id', 'product_image_id'].includes(key))) {
        throw new FoundationError('validation_failed', 400)
      }
      requireUuid(assignment.sku_id)
      requireUuid(assignment.product_image_id)
    })
    return
  }

  if (commandType === 'product.create_with_variants') {
    if (!optionalString(payload.name, 160)
      || payload.structure_type !== 'variant'
      || !/^[a-z][a-z0-9_]{0,31}$/.test(String(payload.base_unit_code))) {
      throw new FoundationError('validation_failed', 400)
    }
    if (!/^[A-Z0-9]{2,12}$/.test(String(payload.sku_prefix ?? ''))
      || !Number.isInteger(payload.sku_product_sequence)
      || Number(payload.sku_product_sequence) < 1
      || Number(payload.sku_product_sequence) > 99999999
      || !Number.isInteger(payload.sku_sequence_digits)
      || Number(payload.sku_sequence_digits) < 3
      || Number(payload.sku_sequence_digits) > 8) {
      throw new FoundationError('validation_failed', 400)
    }
    optionalString(payload.description, 2000)
    optionalString(payload.internal_note, 4000)
    requireUuid(payload.category_id)
    optionalUuid(payload.brand_id)
    if (payload.currency_code !== undefined && !/^[A-Z]{3}$/.test(String(payload.currency_code))) {
      throw new FoundationError('validation_failed', 400)
    }
    if (payload.quantity_behavior !== undefined
      && !['discrete', 'weight', 'volume'].includes(String(payload.quantity_behavior))) {
      throw new FoundationError('validation_failed', 400)
    }
    if (payload.tax_category !== undefined
      && !['standard', 'zero', 'exempt', 'out_of_scope'].includes(String(payload.tax_category))) {
      throw new FoundationError('validation_failed', 400)
    }
    const numericKeys = [
      'sale_price', 'cost_price', 'tax_rate', 'product_weight_kg',
      'product_length_cm', 'product_width_cm', 'product_height_cm',
      'package_weight_kg', 'package_length_cm', 'package_width_cm',
      'package_height_cm', 'safety_stock', 'reorder_min', 'reorder_max',
    ] as const
    numericKeys.forEach((key) => optionalNumber(payload[key]))
    if (payload.tax_rate !== undefined && Number(payload.tax_rate) > 100) {
      throw new FoundationError('validation_failed', 400)
    }
    if (payload.tax_category !== undefined && payload.tax_category !== 'standard'
      && payload.tax_rate !== undefined && Number(payload.tax_rate) !== 0) {
      throw new FoundationError('validation_failed', 400)
    }
    if (payload.reorder_min !== undefined && payload.reorder_max !== undefined
      && Number(payload.reorder_max) < Number(payload.reorder_min)) {
      throw new FoundationError('validation_failed', 400)
    }
    if (payload.tag_ids !== undefined) {
      if (!Array.isArray(payload.tag_ids) || payload.tag_ids.length > 12
        || new Set(payload.tag_ids).size !== payload.tag_ids.length) {
        throw new FoundationError('validation_failed', 400)
      }
      payload.tag_ids.forEach(requireUuid)
    }
    if (payload.sell_units !== undefined) {
      if (!Array.isArray(payload.sell_units) || payload.sell_units.length > 50) {
        throw new FoundationError('validation_failed', 400)
      }
      payload.sell_units.forEach((value) => {
        const unit = requireRecord(value)
        if (Object.keys(unit).some((key) => !['unit_code', 'name', 'base_quantity', 'barcode'].includes(key))
          || !/^[a-z][a-z0-9_]{0,31}$/.test(String(unit.unit_code))
          || !optionalString(unit.name, 80)
          || optionalNumber(unit.base_quantity) === null
          || Number(unit.base_quantity) <= 0) {
          throw new FoundationError('validation_failed', 400)
        }
        optionalString(unit.barcode, 128)
      })
    }
    if (!Array.isArray(payload.option_groups)
      || payload.option_groups.length < 1 || payload.option_groups.length > 3) {
      throw new FoundationError('validation_failed', 400)
    }
    const optionGroups = payload.option_groups
    optionGroups.forEach((value) => {
      const group = requireRecord(value)
      if (Object.keys(group).some((key) => !['name', 'kind', 'values'].includes(key))
        || !optionalString(group.name, 40)
        || !['color', 'size', 'custom'].includes(String(group.kind ?? 'custom'))
        || !Array.isArray(group.values)
        || group.values.length < 1 || group.values.length > 12) {
        throw new FoundationError('validation_failed', 400)
      }
      group.values.forEach((entry) => {
        const option = requireRecord(entry)
        if (Object.keys(option).some((key) => !['name', 'code', 'color_hex', 'aliases'].includes(key))
          || !optionalString(option.name, 40)
          || !/^[A-Z0-9][A-Z0-9_-]{0,11}$/.test(String(option.code))) {
          throw new FoundationError('validation_failed', 400)
        }
        if (option.color_hex !== undefined && !/^#[0-9A-Fa-f]{6}$/.test(String(option.color_hex))) {
          throw new FoundationError('validation_failed', 400)
        }
        if (option.aliases !== undefined) {
          if (!Array.isArray(option.aliases) || option.aliases.length > 12) {
            throw new FoundationError('validation_failed', 400)
          }
          option.aliases.forEach((alias) => optionalString(alias, 40))
        }
      })
    })
    if (!Array.isArray(payload.variants)
      || payload.variants.length < 1 || payload.variants.length > 100) {
      throw new FoundationError('validation_failed', 400)
    }
    payload.variants.forEach((value) => {
      const variant = requireRecord(value)
      if (Object.keys(variant).some((key) => ![
        'key', 'name', 'sku_code', 'sales_code', 'barcode', 'base_unit_code',
        'status', 'sale_price', 'cost_price', 'option_codes', 'image_client_id',
      ].includes(key))
        || !optionalString(variant.key, 500)
        || !optionalString(variant.name, 160)
        || !optionalString(variant.sku_code, 80)
        || !Array.isArray(variant.option_codes)
        || variant.option_codes.length !== optionGroups.length
        || !['draft', 'active'].includes(String(variant.status ?? 'draft'))
        || optionalNumber(variant.sale_price ?? payload.sale_price) === null) {
        throw new FoundationError('validation_failed', 400)
      }
      optionalString(variant.sales_code, 80)
      optionalString(variant.barcode, 128)
      optionalString(variant.image_client_id, 80)
      if (variant.base_unit_code !== undefined
        && !/^[a-z][a-z0-9_]{0,31}$/.test(String(variant.base_unit_code))) {
        throw new FoundationError('validation_failed', 400)
      }
      optionalNumber(variant.cost_price)
      variant.option_codes.forEach((code) => {
        if (!/^[A-Z0-9][A-Z0-9_-]{0,11}$/.test(String(code))) {
          throw new FoundationError('validation_failed', 400)
        }
      })
    })
    return
  }

  if (productCreationCommandTypes.includes(
    commandType as typeof productCreationCommandTypes[number],
  )) {
    if (!optionalString(payload.name, 160)
      || !optionalString(payload.sku_name, 160)
      || !optionalString(payload.sku_code, 80)
      || !/^[a-z][a-z0-9_]{0,31}$/.test(String(payload.base_unit_code))) {
      throw new FoundationError('validation_failed', 400)
    }
    optionalString(payload.description, 2000)
    optionalString(payload.internal_note, 4000)
    optionalString(payload.barcode, 128)
    optionalString(payload.sales_code, 80)
    requireUuid(payload.category_id)
    optionalUuid(payload.brand_id)

    const structureType = payload.structure_type ?? 'standard'
    if (!['standard', 'variant', 'bundle'].includes(String(structureType))) {
      throw new FoundationError('validation_failed', 400)
    }
    const quantityBehavior = payload.quantity_behavior ?? 'discrete'
    if (!['discrete', 'weight', 'volume'].includes(String(quantityBehavior))) {
      throw new FoundationError('validation_failed', 400)
    }
    if (payload.currency_code !== undefined
      && !/^[A-Z]{3}$/.test(String(payload.currency_code))) {
      throw new FoundationError('validation_failed', 400)
    }
    if (payload.tax_category !== undefined
      && !['standard', 'zero', 'exempt', 'out_of_scope'].includes(String(payload.tax_category))) {
      throw new FoundationError('validation_failed', 400)
    }

    const numericKeys = [
      'sale_price', 'cost_price', 'tax_rate', 'product_weight_kg',
      'product_length_cm', 'product_width_cm', 'product_height_cm',
      'package_weight_kg', 'package_length_cm', 'package_width_cm',
      'package_height_cm', 'safety_stock', 'reorder_min', 'reorder_max',
    ] as const
    numericKeys.forEach((key) => optionalNumber(payload[key]))
    if (payload.tax_rate !== undefined && Number(payload.tax_rate) > 100) {
      throw new FoundationError('validation_failed', 400)
    }
    if (payload.tax_category !== undefined && payload.tax_category !== 'standard'
      && payload.tax_rate !== undefined && Number(payload.tax_rate) !== 0) {
      throw new FoundationError('validation_failed', 400)
    }
    if (payload.reorder_min !== undefined && payload.reorder_max !== undefined
      && Number(payload.reorder_max) < Number(payload.reorder_min)) {
      throw new FoundationError('validation_failed', 400)
    }

    if (payload.tag_ids !== undefined) {
      if (!Array.isArray(payload.tag_ids) || payload.tag_ids.length > 12) {
        throw new FoundationError('validation_failed', 400)
      }
      payload.tag_ids.forEach(requireUuid)
      if (new Set(payload.tag_ids).size !== payload.tag_ids.length) {
        throw new FoundationError('validation_failed', 400)
      }
    }

    if (payload.sell_units !== undefined) {
      if (!Array.isArray(payload.sell_units) || payload.sell_units.length > 50) {
        throw new FoundationError('validation_failed', 400)
      }
      payload.sell_units.forEach((value) => {
        const unit = requireRecord(value)
        if (Object.keys(unit).some((key) => ![
          'unit_code', 'name', 'base_quantity', 'barcode',
        ].includes(key))
          || !/^[a-z][a-z0-9_]{0,31}$/.test(String(unit.unit_code))
          || !optionalString(unit.name, 80)
          || optionalNumber(unit.base_quantity) === null
          || Number(unit.base_quantity) <= 0) {
          throw new FoundationError('validation_failed', 400)
        }
        optionalString(unit.barcode, 128)
      })
    }

    if (payload.bundle_components !== undefined) {
      if (!Array.isArray(payload.bundle_components)
        || payload.bundle_components.length > 100
        || (structureType !== 'bundle' && payload.bundle_components.length > 0)) {
        throw new FoundationError('validation_failed', 400)
      }
      payload.bundle_components.forEach((value) => {
        const component = requireRecord(value)
        if (Object.keys(component).some((key) => !['sku_id', 'quantity'].includes(key))) {
          throw new FoundationError('validation_failed', 400)
        }
        requireUuid(component.sku_id)
        if (optionalNumber(component.quantity) === null || Number(component.quantity) <= 0) {
          throw new FoundationError('validation_failed', 400)
        }
      })
    }
    return
  }

  if (productDomainCommandTypes.includes(commandType as typeof productDomainCommandTypes[number])) {
    if (commandType === 'product.master.upsert') {
      if (!['category', 'brand', 'tag'].includes(String(payload.master_kind))) {
        throw new FoundationError('validation_failed', 400)
      }
      const masterId = optionalUuid(payload.master_id)
      if (masterId) requireVersion(payload.expected_version)
      if (!optionalString(payload.name, payload.master_kind === 'tag' ? 80 : 120)) {
        throw new FoundationError('validation_failed', 400)
      }
      if (payload.status !== undefined && !['active', 'archived'].includes(String(payload.status))) {
        throw new FoundationError('validation_failed', 400)
      }
      return
    }

    if (commandType === 'product.metadata.update') {
      requireUuid(payload.product_id)
      requireVersion(payload.expected_version)
      optionalUuid(payload.category_id)
      optionalUuid(payload.brand_id)
      optionalString(payload.internal_note, 4000)
      if (payload.structure_type !== undefined
        && !['standard', 'variant', 'bundle'].includes(String(payload.structure_type))) {
        throw new FoundationError('validation_failed', 400)
      }
      if (payload.tag_ids !== undefined) {
        if (!Array.isArray(payload.tag_ids) || payload.tag_ids.length > 40) {
          throw new FoundationError('validation_failed', 400)
        }
        payload.tag_ids.forEach(requireUuid)
      }
      return
    }

    requireUuid(payload.sku_id)
    if (commandType === 'sku.profile.upsert') {
      requireVersion(payload.expected_version, true)
      if (payload.quantity_behavior !== undefined
        && !['discrete', 'weight', 'volume'].includes(String(payload.quantity_behavior))) {
        throw new FoundationError('validation_failed', 400)
      }
      if (payload.currency_code !== undefined
        && !/^[A-Z]{3}$/.test(String(payload.currency_code))) {
        throw new FoundationError('validation_failed', 400)
      }
      if (payload.tax_category !== undefined
        && !['standard', 'zero', 'exempt', 'out_of_scope'].includes(String(payload.tax_category))) {
        throw new FoundationError('validation_failed', 400)
      }
      for (const key of allowedKeys[commandType].filter((key) => ![
        'sku_id', 'expected_version', 'quantity_behavior', 'currency_code', 'tax_category',
      ].includes(key))) {
        optionalNumber(payload[key])
      }
      if (payload.tax_rate !== undefined && Number(payload.tax_rate) > 100) {
        throw new FoundationError('validation_failed', 400)
      }
      if (payload.reorder_min !== undefined && payload.reorder_max !== undefined
        && Number(payload.reorder_max) < Number(payload.reorder_min)) {
        throw new FoundationError('validation_failed', 400)
      }
      return
    }
    if (commandType === 'sku.cost.upsert') {
      requireVersion(payload.expected_version, true)
      optionalNumber(payload.cost_price)
      if (payload.currency_code !== undefined
        && !/^[A-Z]{3}$/.test(String(payload.currency_code))) {
        throw new FoundationError('validation_failed', 400)
      }
      return
    }
    if (commandType === 'sku.sell_units.replace') {
      if (!Array.isArray(payload.units) || payload.units.length > 50) {
        throw new FoundationError('validation_failed', 400)
      }
      payload.units.forEach((value) => {
        const unit = requireRecord(value)
        if (Object.keys(unit).some((key) => !['unit_code', 'name', 'base_quantity', 'barcode'].includes(key))
          || !/^[a-z][a-z0-9_]{0,31}$/.test(String(unit.unit_code))
          || !optionalString(unit.name, 80)
          || optionalNumber(unit.base_quantity) === null
          || Number(unit.base_quantity) <= 0) {
          throw new FoundationError('validation_failed', 400)
        }
        optionalString(unit.barcode, 128)
      })
      return
    }
    if (!Array.isArray(payload.components) || payload.components.length > 100) {
      throw new FoundationError('validation_failed', 400)
    }
    payload.components.forEach((value) => {
      const component = requireRecord(value)
      if (Object.keys(component).some((key) => !['sku_id', 'quantity'].includes(key))) {
        throw new FoundationError('validation_failed', 400)
      }
      requireUuid(component.sku_id)
      if (optionalNumber(component.quantity) === null || Number(component.quantity) <= 0) {
        throw new FoundationError('validation_failed', 400)
      }
    })
    return
  }

  if (productImageCommandTypes.includes(commandType as typeof productImageCommandTypes[number])) {
    if (commandType === 'product.image.prepare') {
      requireUuid(payload.product_id)
      if (!optionalString(payload.original_file_name, 180)
        || !['image/jpeg', 'image/png', 'image/webp'].includes(String(payload.mime_type))
        || !Number.isSafeInteger(payload.file_size_bytes)
        || Number(payload.file_size_bytes) < 1
        || Number(payload.file_size_bytes) > 5_242_880) {
        throw new FoundationError('validation_failed', 400)
      }
      optionalString(payload.alt_text, 160)
      return
    }
    if (commandType === 'product.images.reorder') {
      requireUuid(payload.product_id)
      requireUuid(payload.cover_image_id)
      if (!Array.isArray(payload.image_ids)
        || payload.image_ids.length < 1
        || payload.image_ids.length > 9) {
        throw new FoundationError('validation_failed', 400)
      }
      payload.image_ids.forEach(requireUuid)
      if (new Set(payload.image_ids).size !== payload.image_ids.length
        || !payload.image_ids.includes(payload.cover_image_id)) {
        throw new FoundationError('validation_failed', 400)
      }
      return
    }
    requireUuid(payload.image_id)
    requireVersion(payload.expected_version)
    if (commandType === 'product.image.fail'
      && !optionalString(payload.failure_reason, 500)) {
      throw new FoundationError('validation_failed', 400)
    }
    return
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

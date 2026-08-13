import 'server-only'

import type { SupabaseClient } from '@supabase/supabase-js'
import type {
  FoundationApplicationCommand,
  FoundationCommandOutcome,
} from './contracts'
import { decodeFoundationCursor, encodeFoundationCursor } from './cursor'
import { mapFoundationError } from './errors'
import type {
  FoundationCommandRepository,
  FoundationReadRepository,
  PageResult,
  InventoryBalanceReadModel,
  LocationReadModel,
  ProductReadModel,
  SkuReadModel,
  StockMovementReadModel,
  WarehouseReadModel,
} from './repositories'

function boundedPageSize(value?: number) {
  return Math.min(Math.max(Math.trunc(value ?? 25), 1), 100)
}

function safeSearch(value?: string) {
  return value?.trim().slice(0, 160).replace(/[,%()]/g, '') ?? ''
}

function nextCursor<T extends { id: string; updatedAt?: string; occurredAt?: string }>(
  rows: T[],
  pageSize: number,
) {
  if (rows.length <= pageSize) return null
  const last = rows[pageSize - 1]
  return encodeFoundationCursor({
    timestamp: last.updatedAt ?? last.occurredAt ?? '',
    id: last.id,
  })
}

export class SupabaseFoundationReadRepository implements FoundationReadRepository {
  constructor(private readonly client: SupabaseClient) {}

  async listProducts(input: {
    organizationId: string
    status?: string
    search?: string
    cursor?: string | null
    pageSize?: number
  }): Promise<PageResult<ProductReadModel>> {
    const pageSize = boundedPageSize(input.pageSize)
    const cursor = decodeFoundationCursor(input.cursor)
    const search = safeSearch(input.search)
    let query = this.client.from('products')
      .select('id, organization_id, name, description, status, version, updated_at')
      .eq('organization_id', input.organizationId)
      .order('updated_at', { ascending: false })
      .order('id', { ascending: false })
      .limit(pageSize + 1)

    if (input.status) query = query.eq('status', input.status)
    if (search) query = query.ilike('name', `%${search}%`)
    if (cursor) {
      query = query.or(`updated_at.lt.${cursor.timestamp},and(updated_at.eq.${cursor.timestamp},id.lt.${cursor.id})`)
    }

    const { data, error } = await query
    if (error) throw mapFoundationError(error)
    const rows = (data ?? []).map((row) => ({
      id: row.id,
      organizationId: row.organization_id,
      name: row.name,
      description: row.description,
      status: row.status,
      version: Number(row.version),
      updatedAt: row.updated_at,
    } satisfies ProductReadModel))
    return { items: rows.slice(0, pageSize), nextCursor: nextCursor(rows, pageSize) }
  }

  async getProduct(input: { organizationId: string; productId: string }) {
    const { data, error } = await this.client.from('products')
      .select('id, organization_id, name, description, status, version, updated_at')
      .eq('organization_id', input.organizationId).eq('id', input.productId).maybeSingle()
    if (error) throw mapFoundationError(error)
    if (!data) return null
    return {
      id: data.id,
      organizationId: data.organization_id,
      name: data.name,
      description: data.description,
      status: data.status,
      version: Number(data.version),
      updatedAt: data.updated_at,
    } satisfies ProductReadModel
  }

  async listSkus(input: {
    organizationId: string
    productId?: string
    status?: string
    search?: string
    cursor?: string | null
    pageSize?: number
  }): Promise<PageResult<SkuReadModel>> {
    const pageSize = boundedPageSize(input.pageSize)
    const cursor = decodeFoundationCursor(input.cursor)
    const search = safeSearch(input.search)
    let query = this.client.from('skus').select(`
      id, organization_id, product_id, sku_code, name, barcode, sales_code,
      base_unit_code, status, version, updated_at, products!inner(id, name)
    `).eq('organization_id', input.organizationId)
      .order('updated_at', { ascending: false })
      .order('id', { ascending: false })
      .limit(pageSize + 1)

    if (input.productId) query = query.eq('product_id', input.productId)
    if (input.status) query = query.eq('status', input.status)
    if (search) {
      query = query.or(`sku_code.ilike.%${search}%,name.ilike.%${search}%,barcode.eq.${search},sales_code.eq.${search}`)
    }
    if (cursor) {
      query = query.or(`updated_at.lt.${cursor.timestamp},and(updated_at.eq.${cursor.timestamp},id.lt.${cursor.id})`)
    }

    const { data, error } = await query
    if (error) throw mapFoundationError(error)
    const rows = (data ?? []).map((row) => {
      const product = Array.isArray(row.products) ? row.products[0] : row.products
      return {
        id: row.id,
        organizationId: row.organization_id,
        productId: row.product_id,
        productName: product?.name ?? '',
        skuCode: row.sku_code,
        name: row.name,
        barcode: row.barcode,
        salesCode: row.sales_code,
        baseUnitCode: row.base_unit_code,
        status: row.status,
        version: Number(row.version),
        updatedAt: row.updated_at,
      } satisfies SkuReadModel
    })
    return { items: rows.slice(0, pageSize), nextCursor: nextCursor(rows, pageSize) }
  }

  async getSku(input: { organizationId: string; skuId: string }) {
    const { data, error } = await this.client.from('skus').select(`
      id, organization_id, product_id, sku_code, name, barcode, sales_code,
      base_unit_code, status, version, updated_at, products!inner(id, name)
    `).eq('organization_id', input.organizationId).eq('id', input.skuId).maybeSingle()
    if (error) throw mapFoundationError(error)
    if (!data) return null
    const product = Array.isArray(data.products) ? data.products[0] : data.products
    return {
      id: data.id,
      organizationId: data.organization_id,
      productId: data.product_id,
      productName: product?.name ?? '',
      skuCode: data.sku_code,
      name: data.name,
      barcode: data.barcode,
      salesCode: data.sales_code,
      baseUnitCode: data.base_unit_code,
      status: data.status,
      version: Number(data.version),
      updatedAt: data.updated_at,
    } satisfies SkuReadModel
  }

  async listWarehouses(input: {
    organizationId: string
    branchId?: string
    status?: string
    search?: string
    cursor?: string | null
    pageSize?: number
  }): Promise<PageResult<WarehouseReadModel>> {
    const pageSize = boundedPageSize(input.pageSize)
    const cursor = decodeFoundationCursor(input.cursor)
    const search = safeSearch(input.search)
    let query = this.client.from('warehouses')
      .select('id, organization_id, branch_id, code, name, status, version, updated_at, branches!inner(id, name)')
      .eq('organization_id', input.organizationId)
      .order('updated_at', { ascending: false })
      .order('id', { ascending: false })
      .limit(pageSize + 1)

    if (input.branchId) query = query.eq('branch_id', input.branchId)
    if (input.status) query = query.eq('status', input.status)
    if (search) query = query.or(`code.ilike.%${search}%,name.ilike.%${search}%`)
    if (cursor) {
      query = query.or(`updated_at.lt.${cursor.timestamp},and(updated_at.eq.${cursor.timestamp},id.lt.${cursor.id})`)
    }

    const { data, error } = await query
    if (error) throw mapFoundationError(error)
    const rows = (data ?? []).map((row) => ({
      id: row.id,
      organizationId: row.organization_id,
      branchId: row.branch_id,
      branchName: (Array.isArray(row.branches) ? row.branches[0] : row.branches)?.name ?? '',
      code: row.code,
      name: row.name,
      status: row.status,
      version: Number(row.version),
      updatedAt: row.updated_at,
    } satisfies WarehouseReadModel))
    return { items: rows.slice(0, pageSize), nextCursor: nextCursor(rows, pageSize) }
  }

  async getWarehouse(input: { organizationId: string; warehouseId: string }) {
    const { data, error } = await this.client.from('warehouses')
      .select('id, organization_id, branch_id, code, name, status, version, updated_at, branches!inner(id, name)')
      .eq('organization_id', input.organizationId).eq('id', input.warehouseId).maybeSingle()
    if (error) throw mapFoundationError(error)
    if (!data) return null
    return {
      id: data.id, organizationId: data.organization_id, branchId: data.branch_id,
      branchName: (Array.isArray(data.branches) ? data.branches[0] : data.branches)?.name ?? '',
      code: data.code, name: data.name, status: data.status,
      version: Number(data.version), updatedAt: data.updated_at,
    } satisfies WarehouseReadModel
  }

  async listLocations(input: {
    organizationId: string; branchId?: string; warehouseId?: string; status?: string; pageSize?: number
  }): Promise<LocationReadModel[]> {
    let query = this.client.from('locations').select(`
      id, organization_id, branch_id, warehouse_id, code, name, is_default,
      status, version, updated_at, warehouses!inner(id, name)
    `).eq('organization_id', input.organizationId)
      .order('is_default', { ascending: false }).order('code').limit(boundedPageSize(input.pageSize ?? 100))
    if (input.branchId) query = query.eq('branch_id', input.branchId)
    if (input.warehouseId) query = query.eq('warehouse_id', input.warehouseId)
    if (input.status) query = query.eq('status', input.status)
    const { data, error } = await query
    if (error) throw mapFoundationError(error)
    return (data ?? []).map((row) => ({
      id: row.id, organizationId: row.organization_id, branchId: row.branch_id,
      warehouseId: row.warehouse_id,
      warehouseName: (Array.isArray(row.warehouses) ? row.warehouses[0] : row.warehouses)?.name ?? '',
      code: row.code, name: row.name, isDefault: row.is_default, status: row.status,
      version: Number(row.version), updatedAt: row.updated_at,
    } satisfies LocationReadModel))
  }

  async listInventoryBalances(input: {
    organizationId: string; branchId?: string; warehouseId?: string; locationId?: string;
    skuId?: string; cursor?: string | null; pageSize?: number
  }): Promise<PageResult<InventoryBalanceReadModel>> {
    const pageSize = boundedPageSize(input.pageSize)
    const cursor = decodeFoundationCursor(input.cursor)
    let query = this.client.from('inventory_balances').select(`
      organization_id, branch_id, warehouse_id, location_id, sku_id, on_hand,
      allocated, available, version, last_movement_id, updated_at,
      locations!inner(id, name, warehouses!inner(id, name)),
      skus!inner(id, sku_code, name, base_unit_code)
    `).eq('organization_id', input.organizationId)
      .order('updated_at', { ascending: false }).order('last_movement_id', { ascending: false })
      .limit(pageSize + 1)
    if (input.branchId) query = query.eq('branch_id', input.branchId)
    if (input.warehouseId) query = query.eq('warehouse_id', input.warehouseId)
    if (input.locationId) query = query.eq('location_id', input.locationId)
    if (input.skuId) query = query.eq('sku_id', input.skuId)
    if (cursor) query = query.or(`updated_at.lt.${cursor.timestamp},and(updated_at.eq.${cursor.timestamp},last_movement_id.lt.${cursor.id})`)
    const { data, error } = await query
    if (error) throw mapFoundationError(error)
    const rows = (data ?? []).map((row) => {
      const location = Array.isArray(row.locations) ? row.locations[0] : row.locations
      const warehouseRelation = location?.warehouses
      const warehouse = Array.isArray(warehouseRelation) ? warehouseRelation[0] : warehouseRelation
      const sku = Array.isArray(row.skus) ? row.skus[0] : row.skus
      return {
        id: row.last_movement_id ?? row.location_id, organizationId: row.organization_id, branchId: row.branch_id,
        warehouseId: row.warehouse_id, warehouseName: warehouse?.name ?? '',
        locationId: row.location_id, locationName: location?.name ?? '',
        skuId: row.sku_id, skuCode: sku?.sku_code ?? '', skuName: sku?.name ?? '',
        baseUnitCode: sku?.base_unit_code ?? '', onHand: Number(row.on_hand),
        allocated: Number(row.allocated), available: Number(row.available),
        version: Number(row.version), updatedAt: row.updated_at,
      } satisfies InventoryBalanceReadModel
    })
    return { items: rows.slice(0, pageSize), nextCursor: nextCursor(rows, pageSize) }
  }

  async listStockMovements(input: {
    organizationId: string
    branchId?: string
    warehouseId?: string
    locationId?: string
    skuId?: string
    movementType?: string
    cursor?: string | null
    pageSize?: number
  }): Promise<PageResult<StockMovementReadModel>> {
    const pageSize = boundedPageSize(input.pageSize)
    const cursor = decodeFoundationCursor(input.cursor)
    let query = this.client.from('stock_movements').select(`
      id, organization_id, branch_id, warehouse_id, location_id, sku_id,
      movement_type, quantity_delta, base_unit_code, reason_code, reason_note,
      actor_user_id, occurred_at
    `).eq('organization_id', input.organizationId)
      .order('occurred_at', { ascending: false })
      .order('id', { ascending: false })
      .limit(pageSize + 1)

    if (input.branchId) query = query.eq('branch_id', input.branchId)
    if (input.warehouseId) query = query.eq('warehouse_id', input.warehouseId)
    if (input.locationId) query = query.eq('location_id', input.locationId)
    if (input.skuId) query = query.eq('sku_id', input.skuId)
    if (input.movementType) query = query.eq('movement_type', input.movementType)
    if (cursor) {
      query = query.or(`occurred_at.lt.${cursor.timestamp},and(occurred_at.eq.${cursor.timestamp},id.lt.${cursor.id})`)
    }

    const { data, error } = await query
    if (error) throw mapFoundationError(error)
    const rows = (data ?? []).map((row) => ({
      id: row.id,
      organizationId: row.organization_id,
      branchId: row.branch_id,
      warehouseId: row.warehouse_id,
      locationId: row.location_id,
      skuId: row.sku_id,
      movementType: row.movement_type,
      quantityDelta: Number(row.quantity_delta),
      baseUnitCode: row.base_unit_code,
      reasonCode: row.reason_code,
      reasonNote: row.reason_note,
      actorUserId: row.actor_user_id,
      occurredAt: row.occurred_at,
    } satisfies StockMovementReadModel))
    return { items: rows.slice(0, pageSize), nextCursor: nextCursor(rows, pageSize) }
  }
}

export class SupabaseFoundationCommandRepository implements FoundationCommandRepository {
  constructor(private readonly admin: SupabaseClient) {}

  async execute(
    command: FoundationApplicationCommand,
    actorUserId: string,
    requestHash: string,
  ): Promise<FoundationCommandOutcome> {
    if (command.kind === 'entity') {
      const { data, error } = await this.admin.rpc('server_execute_foundation_command', {
        p_command_id: command.commandId,
        p_organization_id: command.organizationId,
        p_command_type: command.commandType,
        p_payload: command.payload,
        p_request_hash: requestHash,
        p_actor_user_id: actorUserId,
      })
      if (error) throw error
      return (data ?? {}) as FoundationCommandOutcome
    }

    const { data, error } = await this.admin.rpc('server_post_inventory_command', {
      p_command_id: command.commandId,
      p_organization_id: command.organizationId,
      p_command_type: command.commandType,
      p_sku_id: command.skuId,
      p_source_location_id: command.sourceLocationId,
      p_destination_location_id: command.destinationLocationId,
      p_quantity: command.quantity,
      p_reason_code: command.reasonCode,
      p_reason_note: command.reasonNote,
      p_request_hash: requestHash,
      p_actor_user_id: actorUserId,
      p_occurred_at: command.occurredAt,
    })
    if (error) throw error
    return (data ?? {}) as FoundationCommandOutcome
  }

  async resolveBranchIds(command: FoundationApplicationCommand): Promise<string[]> {
    const resolve = async (entityType: 'warehouse' | 'location', entityIds: string[]) => {
      const { data, error } = await this.admin.rpc('server_resolve_foundation_branch_ids', {
        p_organization_id: command.organizationId,
        p_entity_type: entityType,
        p_entity_ids: entityIds,
      })
      if (error) throw mapFoundationError(error)
      const branchIds = (data ?? []).map((row: { branch_id: string }) => String(row.branch_id))
      return Array.from(new Set<string>(branchIds))
    }
    if (command.kind === 'entity') {
      if (command.commandType === 'warehouse.create') return [String(command.payload.branch_id)]
      if (command.commandType === 'location.create') {
        return resolve('warehouse', [String(command.payload.warehouse_id)])
      }
      if (command.commandType.startsWith('warehouse.')) {
        return resolve('warehouse', [String(command.payload.warehouse_id)])
      }
      if (command.commandType.startsWith('location.')) {
        return resolve('location', [String(command.payload.location_id)])
      }
      return []
    }

    const locationIds = [command.sourceLocationId, command.destinationLocationId]
      .filter((id): id is string => Boolean(id))
    if (locationIds.length === 0) return []
    return resolve('location', locationIds)
  }
}

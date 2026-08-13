import type { FoundationApplicationCommand, FoundationCommandOutcome } from './contracts'

export type PageResult<T> = { items: T[]; nextCursor: string | null }

export type ProductReadModel = {
  id: string
  organizationId: string
  name: string
  description: string | null
  status: string
  version: number
  updatedAt: string
}

export type SkuReadModel = {
  id: string
  organizationId: string
  productId: string
  productName: string
  skuCode: string
  name: string
  barcode: string | null
  salesCode: string | null
  baseUnitCode: string
  status: string
  version: number
  updatedAt: string
}

export type WarehouseReadModel = {
  id: string
  organizationId: string
  branchId: string
  branchName: string
  code: string
  name: string
  status: string
  version: number
  updatedAt: string
}

export type LocationReadModel = {
  id: string
  organizationId: string
  branchId: string
  warehouseId: string
  warehouseName: string
  code: string
  name: string
  isDefault: boolean
  status: string
  version: number
  updatedAt: string
}

export type InventoryBalanceReadModel = {
  id: string
  organizationId: string
  branchId: string
  warehouseId: string
  warehouseName: string
  locationId: string
  locationName: string
  skuId: string
  skuCode: string
  skuName: string
  baseUnitCode: string
  onHand: number
  allocated: number
  available: number
  version: number
  updatedAt: string
}

export type StockMovementReadModel = {
  id: string
  organizationId: string
  branchId: string
  warehouseId: string
  locationId: string
  skuId: string
  movementType: string
  quantityDelta: number
  baseUnitCode: string
  reasonCode: string
  reasonNote: string | null
  actorUserId: string
  occurredAt: string
}

export interface FoundationReadRepository {
  listProducts(input: {
    organizationId: string
    status?: string
    search?: string
    cursor?: string | null
    pageSize?: number
  }): Promise<PageResult<ProductReadModel>>
  getProduct(input: {
    organizationId: string
    productId: string
  }): Promise<ProductReadModel | null>
  listSkus(input: {
    organizationId: string
    productId?: string
    status?: string
    search?: string
    cursor?: string | null
    pageSize?: number
  }): Promise<PageResult<SkuReadModel>>
  getSku(input: {
    organizationId: string
    skuId: string
  }): Promise<SkuReadModel | null>
  listWarehouses(input: {
    organizationId: string
    branchId?: string
    status?: string
    search?: string
    cursor?: string | null
    pageSize?: number
  }): Promise<PageResult<WarehouseReadModel>>
  getWarehouse(input: { organizationId: string; warehouseId: string }): Promise<WarehouseReadModel | null>
  listLocations(input: {
    organizationId: string
    branchId?: string
    warehouseId?: string
    status?: string
    pageSize?: number
  }): Promise<LocationReadModel[]>
  listInventoryBalances(input: {
    organizationId: string
    branchId?: string
    warehouseId?: string
    locationId?: string
    skuId?: string
    cursor?: string | null
    pageSize?: number
  }): Promise<PageResult<InventoryBalanceReadModel>>
  listStockMovements(input: {
    organizationId: string
    branchId?: string
    warehouseId?: string
    locationId?: string
    skuId?: string
    movementType?: string
    cursor?: string | null
    pageSize?: number
  }): Promise<PageResult<StockMovementReadModel>>
}

export interface FoundationCommandRepository {
  execute(
    command: FoundationApplicationCommand,
    actorUserId: string,
    requestHash: string,
  ): Promise<FoundationCommandOutcome>
}

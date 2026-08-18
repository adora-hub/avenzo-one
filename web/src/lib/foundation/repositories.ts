import type { FoundationApplicationCommand, FoundationCommandOutcome } from './contracts'

export type PageResult<T> = { items: T[]; nextCursor: string | null; totalCount?: number }

export type ProductReadModel = {
  id: string
  organizationId: string
  name: string
  description: string | null
  status: string
  version: number
  updatedAt: string
}

export type ProductWorkspaceSkuPreview = {
  id: string
  skuCode: string
  name: string
  barcode: string | null
  salesCode: string | null
  baseUnitCode: string
  status: string
  profile: ProductWorkspaceSkuProfile | null
  stock?: ProductWorkspaceStockSummary
  cost?: ProductWorkspaceSkuCost
  image?: ProductImageReadModel | null
}

export type ProductWorkspaceNamedReference = {
  id: string
  name: string
}

export type ProductWorkspaceTag = ProductWorkspaceNamedReference

export type ProductWorkspacePriceSummary = {
  mode: 'single' | 'range' | 'mixed-currency' | 'not-set'
  currencyCode: string | null
  minimum: number | null
  maximum: number | null
}

export type ProductWorkspaceValueSummary = {
  mode: 'single' | 'mixed' | 'not-set'
  value: string | number | null
}

export type ProductWorkspaceSkuProfile = {
  version: number
  quantityBehavior: string
  salePrice: number | null
  currencyCode: string
  taxCategory: string
  taxRate: number
  productWeightKg: number | null
  productLengthCm: number | null
  productWidthCm: number | null
  productHeightCm: number | null
  packageWeightKg: number | null
  packageLengthCm: number | null
  packageWidthCm: number | null
  packageHeightCm: number | null
  safetyStock: number | null
  reorderMin: number | null
  reorderMax: number | null
}

export type ProductWorkspaceSkuCost = {
  mode: 'authorized' | 'not-authorized'
  costPrice: number | null
  currencyCode: string | null
  version?: number | null
}

export type ProductWorkspaceSellUnit = {
  id: string
  unitCode: string
  name: string
  baseQuantity: number
  barcode: string | null
  status: string
}

export type ProductWorkspaceBundleComponent = {
  componentSkuId: string
  componentSkuCode: string
  componentSkuName: string
  componentQuantity: number
}

export type ProductWorkspaceStockSummary = {
  mode: 'single-unit' | 'mixed-units' | 'no-balance' | 'not-authorized'
  baseUnitCode: string | null
  onHand: number | null
  allocated: number | null
  available: number | null
  branchCodes: string[]
}

export type ProductImageReadModel = {
  id: string
  productId: string
  signedUrl: string
  altText: string | null
  mimeType: 'image/jpeg' | 'image/png' | 'image/webp'
  fileSizeBytes: number
  sortOrder: number
  isCover: boolean
}

export type ProductWorkspaceRow = ProductReadModel & {
  createdAt: string
  createdByUserId: string | null
  createdByDisplayName: string | null
  category: ProductWorkspaceNamedReference | null
  brand: ProductWorkspaceNamedReference | null
  structureType: string
  tags: ProductWorkspaceTag[]
  skuCount: number
  skuPreview: ProductWorkspaceSkuPreview[]
  price: ProductWorkspacePriceSummary
  quantityBehavior: ProductWorkspaceValueSummary
  taxCategory: ProductWorkspaceValueSummary
  taxRate: ProductWorkspaceValueSummary
  safetyStock: ProductWorkspaceValueSummary
  reorderMin: ProductWorkspaceValueSummary
  reorderMax: ProductWorkspaceValueSummary
  cost: ProductWorkspacePriceSummary | null
  aggregateCapped: boolean
  stock: ProductWorkspaceStockSummary
  coverImage: ProductImageReadModel | null
}

export type ProductWorkspaceSkuDetail = ProductWorkspaceSkuPreview & {
  productId: string
  version: number
  updatedAt: string
  stock: ProductWorkspaceStockSummary
  profile: ProductWorkspaceSkuProfile | null
  cost: ProductWorkspaceSkuCost
  sellUnits: ProductWorkspaceSellUnit[]
  bundleComponents: ProductWorkspaceBundleComponent[]
}

export type ProductWorkspaceDetail = ProductWorkspaceRow & {
  internalNote: string | null
  skus: ProductWorkspaceSkuDetail[]
  skuListCapped: boolean
  images: ProductImageReadModel[]
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
  listProductWorkspaceRows(input: {
    organizationId: string
    status?: string
    search?: string
    dateField?: 'created' | 'updated'
    dateFrom?: string
    dateTo?: string
    brandId?: string
    categoryId?: string
    tagIds?: string[]
    priceMin?: number
    priceMax?: number
    stockMin?: number
    stockMax?: number
    cursor?: string | null
    page?: number
    pageSize?: number
    includeInventory?: boolean
    includeCost?: boolean
    sort?: 'updated_desc' | 'updated_asc'
  }): Promise<PageResult<ProductWorkspaceRow>>
  getProductWorkspaceDetail(input: {
    organizationId: string
    productId: string
    includeInventory?: boolean
    includeCost?: boolean
    quickMode?: boolean
  }): Promise<ProductWorkspaceDetail | null>
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
  getSkuWorkspaceDetail(input: {
    organizationId: string
    skuId: string
    includeInventory?: boolean
  }): Promise<ProductWorkspaceSkuDetail & { productName: string } | null>
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

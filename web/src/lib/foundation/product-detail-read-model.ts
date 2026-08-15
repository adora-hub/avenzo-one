import type {
  ProductWorkspaceDetail,
  ProductWorkspaceSkuDetail,
  ProductWorkspaceStockSummary,
} from './repositories'
import type {
  ProductWorkspaceBalanceSource,
  ProductWorkspaceProductSource,
  ProductWorkspaceSkuSource,
} from './product-workspace-read-model'

export const PRODUCT_DETAIL_SKU_LIMIT = 200
const PRODUCT_DETAIL_SKU_PREVIEW_LIMIT = 5

export type ProductWorkspaceSkuDetailSource = ProductWorkspaceSkuSource & {
  version: number
  updatedAt: string
}

function buildSkuStock(input: {
  sku: ProductWorkspaceSkuDetailSource
  balances: ProductWorkspaceBalanceSource[]
  includeInventory: boolean
}): ProductWorkspaceStockSummary {
  if (!input.includeInventory) {
    return {
      mode: 'not-authorized', baseUnitCode: input.sku.baseUnitCode,
      onHand: null, allocated: null, available: null, branchCodes: [],
    }
  }
  if (input.balances.length === 0) {
    return {
      mode: 'no-balance', baseUnitCode: input.sku.baseUnitCode,
      onHand: null, allocated: null, available: null, branchCodes: [],
    }
  }
  return {
    mode: 'single-unit',
    baseUnitCode: input.sku.baseUnitCode,
    onHand: input.balances.reduce((sum, row) => sum + row.onHand, 0),
    allocated: input.balances.reduce((sum, row) => sum + row.allocated, 0),
    available: input.balances.reduce((sum, row) => sum + row.available, 0),
    branchCodes: Array.from(new Set(input.balances
      .map((row) => row.branchCode)
      .filter((code): code is string => Boolean(code))))
      .sort((left, right) => left.localeCompare(right)),
  }
}

export function buildProductWorkspaceDetail(input: {
  product: ProductWorkspaceProductSource
  skus: ProductWorkspaceSkuDetailSource[]
  balances: ProductWorkspaceBalanceSource[]
  includeInventory: boolean
  aggregateCapped?: boolean
  skuListCapped?: boolean
  images?: ProductWorkspaceDetail['images']
}): ProductWorkspaceDetail {
  const balancesBySku = new Map<string, ProductWorkspaceBalanceSource[]>()
  for (const balance of input.balances) {
    const rows = balancesBySku.get(balance.skuId) ?? []
    rows.push(balance)
    balancesBySku.set(balance.skuId, rows)
  }
  const skus: ProductWorkspaceSkuDetail[] = input.skus.map((sku) => ({
    id: sku.id,
    productId: sku.productId,
    skuCode: sku.skuCode,
    name: sku.name,
    barcode: sku.barcode,
    salesCode: sku.salesCode,
    baseUnitCode: sku.baseUnitCode,
    status: sku.status,
    version: sku.version,
    updatedAt: sku.updatedAt,
    stock: buildSkuStock({
      sku,
      balances: balancesBySku.get(sku.id) ?? [],
      includeInventory: input.includeInventory,
    }),
  }))
  const distinctUnits = Array.from(new Set(input.skus.map((sku) => sku.baseUnitCode).filter(Boolean)))
  const productBalances = input.balances
  let stock: ProductWorkspaceStockSummary
  if (!input.includeInventory) {
    stock = {
      mode: 'not-authorized', baseUnitCode: distinctUnits.length === 1 ? distinctUnits[0] : null,
      onHand: null, allocated: null, available: null, branchCodes: [],
    }
  } else if (productBalances.length === 0) {
    stock = {
      mode: 'no-balance', baseUnitCode: distinctUnits.length === 1 ? distinctUnits[0] : null,
      onHand: null, allocated: null, available: null, branchCodes: [],
    }
  } else if (distinctUnits.length > 1) {
    stock = {
      mode: 'mixed-units', baseUnitCode: null, onHand: null, allocated: null, available: null,
      branchCodes: Array.from(new Set(productBalances.map((row) => row.branchCode).filter((code): code is string => Boolean(code)))).sort(),
    }
  } else {
    stock = {
      mode: 'single-unit', baseUnitCode: distinctUnits[0] ?? null,
      onHand: productBalances.reduce((sum, row) => sum + row.onHand, 0),
      allocated: productBalances.reduce((sum, row) => sum + row.allocated, 0),
      available: productBalances.reduce((sum, row) => sum + row.available, 0),
      branchCodes: Array.from(new Set(productBalances.map((row) => row.branchCode).filter((code): code is string => Boolean(code)))).sort(),
    }
  }
  return {
    ...input.product,
    skuCount: input.skus.length,
    skuPreview: input.skus.slice(0, PRODUCT_DETAIL_SKU_PREVIEW_LIMIT).map((sku) => ({
      id: sku.id, skuCode: sku.skuCode, name: sku.name, barcode: sku.barcode,
      salesCode: sku.salesCode, baseUnitCode: sku.baseUnitCode, status: sku.status,
    })),
    aggregateCapped: Boolean(input.aggregateCapped),
    stock,
    skus,
    skuListCapped: Boolean(input.skuListCapped),
    images: [...(input.images ?? [])].sort((left, right) => left.sortOrder - right.sortOrder),
    coverImage: (input.images ?? []).find((image) => image.isCover) ?? null,
  }
}

export function skuCanArchive(stock: ProductWorkspaceStockSummary) {
  if (stock.mode === 'not-authorized') return false
  return stock.mode !== 'single-unit' || stock.onHand === 0
}

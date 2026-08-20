import type {
  ProductWorkspaceDetail,
  ProductWorkspaceBundleComponent,
  ProductWorkspacePriceSummary,
  ProductWorkspaceSellUnit,
  ProductWorkspaceSkuDetail,
  ProductWorkspaceStockSummary,
  ProductWorkspaceValueSummary,
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
  sellUnits?: ProductWorkspaceSellUnit[]
  bundleComponents?: ProductWorkspaceBundleComponent[]
}

function summarizeValues(values: Array<string | number | null | undefined>): ProductWorkspaceValueSummary {
  const present = values.filter((value): value is string | number => value !== null && value !== undefined && value !== '')
  if (present.length === 0) return { mode: 'not-set', value: null }
  const distinct = Array.from(new Set(present.map((value) => `${typeof value}:${value}`)))
  return distinct.length === 1 ? { mode: 'single', value: present[0] } : { mode: 'mixed', value: null }
}

function summarizePrices(prices: Array<{ amount: number | null; currencyCode: string | null }>): ProductWorkspacePriceSummary {
  const present = prices.filter((price): price is { amount: number; currencyCode: string } => price.amount !== null && Boolean(price.currencyCode))
  if (present.length === 0) return { mode: 'not-set', currencyCode: null, minimum: null, maximum: null }
  const currencies = Array.from(new Set(present.map((price) => price.currencyCode)))
  if (currencies.length !== 1) return { mode: 'mixed-currency', currencyCode: null, minimum: null, maximum: null }
  const amounts = present.map((price) => price.amount)
  const minimum = Math.min(...amounts)
  const maximum = Math.max(...amounts)
  return { mode: minimum === maximum ? 'single' : 'range', currencyCode: currencies[0], minimum, maximum }
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
    profile: sku.profile ?? null,
    cost: sku.cost ?? { mode: 'not-authorized', costPrice: null, currencyCode: null },
    sellUnits: [...(sku.sellUnits ?? [])].sort((left, right) => left.name.localeCompare(right.name)),
    bundleComponents: [...(sku.bundleComponents ?? [])].sort((left, right) => left.componentSkuCode.localeCompare(right.componentSkuCode)),
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
    createdByDisplayName: input.product.createdByDisplayName ?? null,
    category: input.product.category ?? null,
    brand: input.product.brand ?? null,
    structureType: input.product.structureType ?? 'standard',
    tags: [...(input.product.tags ?? [])].sort((left, right) => left.name.localeCompare(right.name)),
    internalNote: input.product.internalNote ?? null,
    skuCount: input.skus.length,
    skuPreview: input.skus.slice(0, PRODUCT_DETAIL_SKU_PREVIEW_LIMIT).map((sku) => ({
      id: sku.id, skuCode: sku.skuCode, name: sku.name, barcode: sku.barcode,
      salesCode: sku.salesCode, baseUnitCode: sku.baseUnitCode, status: sku.status, profile: sku.profile ?? null,
    })),
    price: summarizePrices(input.skus.map((sku) => ({ amount: sku.profile?.salePrice ?? null, currencyCode: sku.profile?.currencyCode ?? null }))),
    quantityBehavior: summarizeValues(input.skus.map((sku) => sku.profile?.quantityBehavior)),
    taxCategory: summarizeValues(input.skus.map((sku) => sku.profile?.taxCategory)),
    taxRate: summarizeValues(input.skus.map((sku) => sku.profile?.taxRate)),
    safetyStock: summarizeValues(input.skus.map((sku) => sku.profile?.safetyStock)),
    reorderMin: summarizeValues(input.skus.map((sku) => sku.profile?.reorderMin)),
    reorderMax: summarizeValues(input.skus.map((sku) => sku.profile?.reorderMax)),
    cost: input.skus.some((sku) => sku.cost?.mode === 'authorized')
      ? summarizePrices(input.skus.map((sku) => ({
        amount: sku.cost?.mode === 'authorized' ? sku.cost.costPrice : null,
        currencyCode: sku.cost?.mode === 'authorized' ? sku.cost.currencyCode : null,
      })))
      : null,
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

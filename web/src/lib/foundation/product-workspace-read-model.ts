import type {
  ProductWorkspaceRow,
  ProductImageReadModel,
  ProductWorkspacePriceSummary,
  ProductWorkspaceSkuPreview,
  ProductWorkspaceSkuCost,
  ProductWorkspaceSkuProfile,
  ProductWorkspaceTag,
  ProductWorkspaceValueSummary,
  ProductWorkspaceStockSummary,
} from './repositories'

export const PRODUCT_WORKSPACE_SKU_AGGREGATE_LIMIT = 5_000
export const PRODUCT_WORKSPACE_BALANCE_AGGREGATE_LIMIT = 10_000
export const PRODUCT_WORKSPACE_SKU_PREVIEW_LIMIT = 5
export const PRODUCT_WORKSPACE_RECENT_RECEIPT_DAYS = 7

export type ProductWorkspaceProductSource = {
  id: string
  organizationId: string
  name: string
  description: string | null
  status: string
  version: number
  createdAt: string
  createdByUserId: string | null
  createdByDisplayName?: string | null
  category?: { id: string; name: string } | null
  brand?: { id: string; name: string } | null
  structureType?: string
  internalNote?: string | null
  tags?: ProductWorkspaceTag[]
  updatedAt: string
}

export type ProductWorkspaceSkuSource = ProductWorkspaceSkuPreview & {
  productId: string
  profile?: ProductWorkspaceSkuProfile | null
  cost?: ProductWorkspaceSkuCost
}

export type ProductWorkspaceBalanceSource = {
  skuId: string
  onHand: number
  allocated: number
  available: number
  branchCode: string | null
}

export type ProductWorkspaceReceiptSource = {
  skuId: string
  occurredAt: string
}

export type ProductWorkspaceImageSource = ProductImageReadModel

function summarizeValues(values: Array<string | number | null | undefined>): ProductWorkspaceValueSummary {
  const present = values.filter((value): value is string | number => value !== null && value !== undefined && value !== '')
  if (present.length === 0) return { mode: 'not-set', value: null }
  const distinct = Array.from(new Set(present.map((value) => `${typeof value}:${value}`)))
  return distinct.length === 1
    ? { mode: 'single', value: present[0] }
    : { mode: 'mixed', value: null }
}

function summarizePrices(
  prices: Array<{ amount: number | null; currencyCode: string | null }>,
): ProductWorkspacePriceSummary {
  const present = prices.filter((price): price is { amount: number; currencyCode: string } => (
    price.amount !== null && Boolean(price.currencyCode)
  ))
  if (present.length === 0) {
    return { mode: 'not-set', currencyCode: null, minimum: null, maximum: null }
  }
  const currencies = Array.from(new Set(present.map((price) => price.currencyCode)))
  if (currencies.length !== 1) {
    return { mode: 'mixed-currency', currencyCode: null, minimum: null, maximum: null }
  }
  const amounts = present.map((price) => price.amount)
  const minimum = Math.min(...amounts)
  const maximum = Math.max(...amounts)
  return {
    mode: minimum === maximum ? 'single' : 'range',
    currencyCode: currencies[0],
    minimum,
    maximum,
  }
}

function summarizeSkuStock(input: {
  baseUnitCode: string
  balances: ProductWorkspaceBalanceSource[]
  lastReceivedAt: string | null
  includeInventory: boolean
}): ProductWorkspaceStockSummary {
  if (!input.includeInventory) {
    return {
      mode: 'not-authorized', baseUnitCode: input.baseUnitCode, onHand: null,
      allocated: null, available: null, branchCodes: [], lastReceivedAt: null,
    }
  }
  const branchCodes = Array.from(new Set(input.balances
    .map((balance) => balance.branchCode)
    .filter((code): code is string => Boolean(code))))
    .sort((left, right) => left.localeCompare(right))
  if (!input.balances.length) {
    return {
      mode: 'no-balance', baseUnitCode: input.baseUnitCode, onHand: null,
      allocated: null, available: null, branchCodes, lastReceivedAt: input.lastReceivedAt,
    }
  }
  return {
    mode: 'single-unit',
    baseUnitCode: input.baseUnitCode,
    onHand: input.balances.reduce((sum, balance) => sum + balance.onHand, 0),
    allocated: input.balances.reduce((sum, balance) => sum + balance.allocated, 0),
    available: input.balances.reduce((sum, balance) => sum + balance.available, 0),
    branchCodes,
    lastReceivedAt: input.lastReceivedAt,
  }
}
export function buildProductWorkspaceRows(input: {
  products: ProductWorkspaceProductSource[]
  skus: ProductWorkspaceSkuSource[]
  balances: ProductWorkspaceBalanceSource[]
  receipts?: ProductWorkspaceReceiptSource[]
  images?: ProductWorkspaceImageSource[]
  variantImageAssignments?: Array<{ skuId: string; productImageId: string; isPrimary: boolean; sortOrder: number }>
  includeInventory: boolean
  aggregateCapped?: boolean
}): ProductWorkspaceRow[] {
  const skusByProduct = new Map<string, ProductWorkspaceSkuSource[]>()
  for (const sku of input.skus) {
    const rows = skusByProduct.get(sku.productId) ?? []
    rows.push(sku)
    skusByProduct.set(sku.productId, rows)
  }

  const balancesBySku = new Map<string, ProductWorkspaceBalanceSource[]>()
  for (const balance of input.balances) {
    const rows = balancesBySku.get(balance.skuId) ?? []
    rows.push(balance)
    balancesBySku.set(balance.skuId, rows)
  }

  const lastReceivedAtBySku = new Map<string, string>()
  for (const receipt of input.receipts ?? []) {
    const current = lastReceivedAtBySku.get(receipt.skuId)
    if (!current || Date.parse(receipt.occurredAt) > Date.parse(current)) {
      lastReceivedAtBySku.set(receipt.skuId, receipt.occurredAt)
    }
  }

  const imageById = new Map((input.images ?? []).map((image) => [image.id, image]))
  const coverImageByProduct = new Map<string, ProductWorkspaceImageSource>()
  for (const image of input.images ?? []) {
    if (!image.isCover || coverImageByProduct.has(image.productId)) continue
    coverImageByProduct.set(image.productId, image)
  }
  const variantImageAssignmentBySku = new Map<string, { image: ProductWorkspaceImageSource; isPrimary: boolean; sortOrder: number }>()
  for (const assignment of input.variantImageAssignments ?? []) {
    const image = imageById.get(assignment.productImageId)
    if (!image) continue
    const current = variantImageAssignmentBySku.get(assignment.skuId)
    if (!current || (assignment.isPrimary && !current.isPrimary) || (assignment.isPrimary === current.isPrimary && assignment.sortOrder < current.sortOrder)) {
      variantImageAssignmentBySku.set(assignment.skuId, { image, isPrimary: assignment.isPrimary, sortOrder: assignment.sortOrder })
    }
  }

  return input.products.map((product) => {
    const productSkus = skusByProduct.get(product.id) ?? []
    const distinctUnits = Array.from(new Set(productSkus.map((sku) => sku.baseUnitCode).filter(Boolean)))
    const baseUnitCode = distinctUnits.length === 1 ? distinctUnits[0] : null
    let stock: ProductWorkspaceStockSummary

    if (!input.includeInventory) {
      stock = {
        mode: 'not-authorized', baseUnitCode, onHand: null, allocated: null,
        available: null, branchCodes: [], lastReceivedAt: null,
      }
    } else {
      const productBalances = productSkus.flatMap((sku) => balancesBySku.get(sku.id) ?? [])
      const branchCodes = Array.from(new Set(productBalances
        .map((balance) => balance.branchCode)
        .filter((code): code is string => Boolean(code))))
        .sort((left, right) => left.localeCompare(right))

      if (productBalances.length === 0) {
        stock = {
          mode: 'no-balance', baseUnitCode, onHand: null, allocated: null,
          available: null, branchCodes, lastReceivedAt: productSkus
            .map((sku) => lastReceivedAtBySku.get(sku.id) ?? null)
            .filter((value): value is string => Boolean(value))
            .sort((left, right) => Date.parse(right) - Date.parse(left))[0] ?? null,
        }
      } else if (distinctUnits.length > 1) {
        stock = {
          mode: 'mixed-units', baseUnitCode: null, onHand: null, allocated: null,
          available: null, branchCodes, lastReceivedAt: productSkus
            .map((sku) => lastReceivedAtBySku.get(sku.id) ?? null)
            .filter((value): value is string => Boolean(value))
            .sort((left, right) => Date.parse(right) - Date.parse(left))[0] ?? null,
        }
      } else {
        stock = {
          mode: 'single-unit',
          baseUnitCode,
          onHand: productBalances.reduce((sum, row) => sum + row.onHand, 0),
          allocated: productBalances.reduce((sum, row) => sum + row.allocated, 0),
          available: productBalances.reduce((sum, row) => sum + row.available, 0),
          branchCodes,
          lastReceivedAt: productSkus
            .map((sku) => lastReceivedAtBySku.get(sku.id) ?? null)
            .filter((value): value is string => Boolean(value))
            .sort((left, right) => Date.parse(right) - Date.parse(left))[0] ?? null,
        }
      }
    }

    return {
      ...product,
      createdByDisplayName: product.createdByDisplayName ?? null,
      category: product.category ?? null,
      brand: product.brand ?? null,
      structureType: product.structureType ?? 'standard',
      tags: [...(product.tags ?? [])].sort((left, right) => left.name.localeCompare(right.name)),
      skuCount: productSkus.length,
      skuPreview: productSkus.slice(0, PRODUCT_WORKSPACE_SKU_PREVIEW_LIMIT).map((sku) => ({
        id: sku.id,
        skuCode: sku.skuCode,
        name: sku.name,
        barcode: sku.barcode,
        salesCode: sku.salesCode,
        baseUnitCode: sku.baseUnitCode,
        status: sku.status,
        profile: sku.profile ?? null,
        stock: summarizeSkuStock({
          baseUnitCode: sku.baseUnitCode,
          balances: balancesBySku.get(sku.id) ?? [],
          lastReceivedAt: lastReceivedAtBySku.get(sku.id) ?? null,
          includeInventory: input.includeInventory,
        }),
        cost: sku.cost,
        image: variantImageAssignmentBySku.get(sku.id)?.image ?? coverImageByProduct.get(product.id) ?? null,
      })),
      price: summarizePrices(productSkus.map((sku) => ({
        amount: sku.profile?.salePrice ?? null,
        currencyCode: sku.profile?.currencyCode ?? null,
      }))),
      quantityBehavior: summarizeValues(productSkus.map((sku) => sku.profile?.quantityBehavior)),
      taxCategory: summarizeValues(productSkus.map((sku) => sku.profile?.taxCategory)),
      taxRate: summarizeValues(productSkus.map((sku) => sku.profile?.taxRate)),
      safetyStock: summarizeValues(productSkus.map((sku) => sku.profile?.safetyStock)),
      reorderMin: summarizeValues(productSkus.map((sku) => sku.profile?.reorderMin)),
      reorderMax: summarizeValues(productSkus.map((sku) => sku.profile?.reorderMax)),
      cost: productSkus.some((sku) => sku.cost?.mode === 'authorized')
        ? summarizePrices(productSkus.map((sku) => ({
          amount: sku.cost?.mode === 'authorized' ? sku.cost.costPrice : null,
          currencyCode: sku.cost?.mode === 'authorized' ? sku.cost.currencyCode : null,
        })))
        : null,
      aggregateCapped: Boolean(input.aggregateCapped),
      stock,
      stockStatusSkus: productSkus.map((sku) => ({
        skuCode: sku.skuCode,
        available: (balancesBySku.get(sku.id) ?? []).reduce((sum, balance) => sum + balance.available, 0),
        reorderMin: sku.profile?.reorderMin ?? null,
        safetyStock: sku.profile?.safetyStock ?? null,
        lastReceivedAt: lastReceivedAtBySku.get(sku.id) ?? null,
      })),
      coverImage: coverImageByProduct.get(product.id) ?? null,
    }
  })
}

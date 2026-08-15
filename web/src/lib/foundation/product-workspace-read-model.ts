import type {
  ProductWorkspaceRow,
  ProductImageReadModel,
  ProductWorkspaceSkuPreview,
  ProductWorkspaceStockSummary,
} from './repositories'

export const PRODUCT_WORKSPACE_SKU_AGGREGATE_LIMIT = 5_000
export const PRODUCT_WORKSPACE_BALANCE_AGGREGATE_LIMIT = 10_000
export const PRODUCT_WORKSPACE_SKU_PREVIEW_LIMIT = 5

export type ProductWorkspaceProductSource = {
  id: string
  organizationId: string
  name: string
  description: string | null
  status: string
  version: number
  createdAt: string
  createdByUserId: string | null
  updatedAt: string
}

export type ProductWorkspaceSkuSource = ProductWorkspaceSkuPreview & {
  productId: string
}

export type ProductWorkspaceBalanceSource = {
  skuId: string
  onHand: number
  allocated: number
  available: number
  branchCode: string | null
}

export type ProductWorkspaceImageSource = ProductImageReadModel

export function buildProductWorkspaceRows(input: {
  products: ProductWorkspaceProductSource[]
  skus: ProductWorkspaceSkuSource[]
  balances: ProductWorkspaceBalanceSource[]
  images?: ProductWorkspaceImageSource[]
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

  const coverImageByProduct = new Map<string, ProductWorkspaceImageSource>()
  for (const image of input.images ?? []) {
    if (!image.isCover || coverImageByProduct.has(image.productId)) continue
    coverImageByProduct.set(image.productId, image)
  }

  return input.products.map((product) => {
    const productSkus = skusByProduct.get(product.id) ?? []
    const distinctUnits = Array.from(new Set(productSkus.map((sku) => sku.baseUnitCode).filter(Boolean)))
    const baseUnitCode = distinctUnits.length === 1 ? distinctUnits[0] : null
    let stock: ProductWorkspaceStockSummary

    if (!input.includeInventory) {
      stock = {
        mode: 'not-authorized', baseUnitCode, onHand: null, allocated: null,
        available: null, branchCodes: [],
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
          available: null, branchCodes,
        }
      } else if (distinctUnits.length > 1) {
        stock = {
          mode: 'mixed-units', baseUnitCode: null, onHand: null, allocated: null,
          available: null, branchCodes,
        }
      } else {
        stock = {
          mode: 'single-unit',
          baseUnitCode,
          onHand: productBalances.reduce((sum, row) => sum + row.onHand, 0),
          allocated: productBalances.reduce((sum, row) => sum + row.allocated, 0),
          available: productBalances.reduce((sum, row) => sum + row.available, 0),
          branchCodes,
        }
      }
    }

    return {
      ...product,
      skuCount: productSkus.length,
      skuPreview: productSkus.slice(0, PRODUCT_WORKSPACE_SKU_PREVIEW_LIMIT).map((sku) => ({
        id: sku.id,
        skuCode: sku.skuCode,
        name: sku.name,
        barcode: sku.barcode,
        salesCode: sku.salesCode,
        baseUnitCode: sku.baseUnitCode,
        status: sku.status,
      })),
      aggregateCapped: Boolean(input.aggregateCapped),
      stock,
      coverImage: coverImageByProduct.get(product.id) ?? null,
    }
  })
}

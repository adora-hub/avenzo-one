import type { ProductWorkspaceSkuPreview } from '@/lib/foundation/repositories'

export function formatSkuCost(sku: ProductWorkspaceSkuPreview) {
  const amount = sku.cost?.mode === 'authorized' ? sku.cost.costPrice : null
  const currencyCode = sku.cost?.mode === 'authorized' ? sku.cost.currencyCode : null
  if (amount === null || amount === undefined || !currencyCode) return null
  return new Intl.NumberFormat('th-TH', {
    style: 'currency',
    currency: currencyCode,
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(amount)
}
export type ProductGridColumnKey =
  | 'product' | 'salesCode' | 'sku' | 'stock' | 'stockStatus' | 'baseUnit' | 'price' | 'status' | 'updatedAt'
  | 'category' | 'brand' | 'tags' | 'barcode' | 'quantityBehavior' | 'tax'
  | 'safetyStock' | 'reorder' | 'branches' | 'createdAt' | 'createdBy' | 'cost'

export type ProductGridColumnPreference = {
  key: ProductGridColumnKey
  visible: boolean
  width: number
  pinned: boolean
}

export const PRODUCT_GRID_DEFAULT_COLUMNS: ProductGridColumnPreference[] = [
  { key: 'product', visible: true, width: 260, pinned: true },
  { key: 'salesCode', visible: true, width: 150, pinned: false },
  { key: 'sku', visible: true, width: 230, pinned: false },
  { key: 'stock', visible: true, width: 150, pinned: false },
  { key: 'stockStatus', visible: true, width: 150, pinned: false },
  { key: 'baseUnit', visible: true, width: 130, pinned: false },
  { key: 'price', visible: true, width: 140, pinned: false },
  { key: 'status', visible: true, width: 140, pinned: false },
  { key: 'updatedAt', visible: true, width: 190, pinned: false },
  { key: 'category', visible: false, width: 170, pinned: false },
  { key: 'brand', visible: false, width: 160, pinned: false },
  { key: 'tags', visible: false, width: 220, pinned: false },
  { key: 'barcode', visible: false, width: 180, pinned: false },
  { key: 'quantityBehavior', visible: false, width: 170, pinned: false },
  { key: 'tax', visible: false, width: 160, pinned: false },
  { key: 'safetyStock', visible: false, width: 150, pinned: false },
  { key: 'reorder', visible: false, width: 180, pinned: false },
  { key: 'branches', visible: false, width: 190, pinned: false },
  { key: 'createdAt', visible: false, width: 190, pinned: false },
  { key: 'createdBy', visible: false, width: 180, pinned: false },
  { key: 'cost', visible: false, width: 150, pinned: false },
]

const allowedKeys = new Set(PRODUCT_GRID_DEFAULT_COLUMNS.map((column) => column.key))

export function normalizeProductGridColumns(value: unknown): ProductGridColumnPreference[] {
  if (!Array.isArray(value)) return PRODUCT_GRID_DEFAULT_COLUMNS.map((column) => ({ ...column }))
  const byKey = new Map(PRODUCT_GRID_DEFAULT_COLUMNS.map((column) => [column.key, column]))
  const normalized: ProductGridColumnPreference[] = []
  let pinnedCount = 0

  for (const candidate of value) {
    if (!candidate || typeof candidate !== 'object') continue
    const key = (candidate as { key?: unknown }).key
    if (typeof key !== 'string' || !allowedKeys.has(key as ProductGridColumnKey)) continue
    if (normalized.some((column) => column.key === key)) continue
    const defaults = byKey.get(key as ProductGridColumnKey)!
    const rawWidth = Number((candidate as { width?: unknown }).width)
    const pinned = Boolean((candidate as { pinned?: unknown }).pinned) && pinnedCount < 3
    if (pinned) pinnedCount += 1
    normalized.push({
      key: key as ProductGridColumnKey,
      visible: (candidate as { visible?: unknown }).visible !== false,
      width: Number.isFinite(rawWidth) ? Math.min(Math.max(Math.round(rawWidth), 96), 520) : defaults.width,
      pinned,
    })
  }

  for (let defaultIndex = 0; defaultIndex < PRODUCT_GRID_DEFAULT_COLUMNS.length; defaultIndex += 1) {
    const defaults = PRODUCT_GRID_DEFAULT_COLUMNS[defaultIndex]
    if (normalized.some((column) => column.key === defaults.key)) continue
    const previousKeys = PRODUCT_GRID_DEFAULT_COLUMNS.slice(0, defaultIndex).map((column) => column.key).reverse()
    const previousIndex = previousKeys.reduce((found, key) => found >= 0
      ? found
      : normalized.findIndex((column) => column.key === key), -1)
    normalized.splice(previousIndex >= 0 ? previousIndex + 1 : 0, 0, { ...defaults, pinned: false })
  }
  if (!normalized.some((column) => column.visible)) normalized[0].visible = true
  return normalized
}

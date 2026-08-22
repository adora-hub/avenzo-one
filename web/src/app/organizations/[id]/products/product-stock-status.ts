import type { ProductWorkspaceRow } from '@/lib/foundation/repositories'

export type ProductStockStatusKey = 'out' | 'low' | 'normal' | 'new'

export type ProductStockStatus = {
  key: ProductStockStatusKey
  label: 'หมดสต็อก' | 'ใกล้หมด' | 'ปกติ' | 'เข้าใหม่'
  tone: 'danger' | 'warning' | 'info' | 'success'
  rank: number
  description: string
}

const RECENT_RECEIPT_DAYS = 7
const FALLBACK_LOW_STOCK_QUANTITY = 5

type StockStatusSku = ProductWorkspaceRow['stockStatusSkus'][number]

function lowStockThreshold(sku: StockStatusSku) {
  const reorderMin = sku.reorderMin
  if (typeof reorderMin === 'number' && reorderMin > 0) return { value: reorderMin, source: 'Reorder Min' }
  const safetyStock = sku.safetyStock
  if (typeof safetyStock === 'number' && safetyStock > 0) return { value: safetyStock, source: 'Safety Stock' }
  return { value: FALLBACK_LOW_STOCK_QUANTITY, source: 'ค่าเริ่มต้นของระบบ' }
}

function isRecentReceipt(value: string | null | undefined, now: Date) {
  if (!value) return false
  const occurredAt = Date.parse(value)
  if (!Number.isFinite(occurredAt)) return false
  const elapsed = now.getTime() - occurredAt
  return elapsed >= 0 && elapsed <= RECENT_RECEIPT_DAYS * 24 * 60 * 60 * 1_000
}

export function resolveSkuStockStatus(sku: StockStatusSku, now = new Date()): ProductStockStatus {
  const threshold = lowStockThreshold(sku)
  if (sku.available <= 0) {
    return { key: 'out', label: 'หมดสต็อก', tone: 'danger', rank: 0, description: `${sku.skuCode} ไม่มียอดพร้อมขาย` }
  }
  if (sku.available <= threshold.value) {
    return {
      key: 'low', label: 'ใกล้หมด', tone: 'warning', rank: 1,
      description: `${sku.skuCode} เหลือ ${sku.available} ถึงเกณฑ์ ${threshold.source} ${threshold.value}`,
    }
  }
  if (isRecentReceipt(sku.lastReceivedAt, now)) {
    return { key: 'new', label: 'เข้าใหม่', tone: 'success', rank: 2, description: `รับสต็อกเข้าล่าสุดภายใน ${RECENT_RECEIPT_DAYS} วัน` }
  }
  return { key: 'normal', label: 'ปกติ', tone: 'info', rank: 3, description: 'ยอดพร้อมขายสูงกว่าเกณฑ์แจ้งเตือน' }
}

export function resolveProductStockStatus(row: ProductWorkspaceRow, now = new Date()): ProductStockStatus {
  const readableSkus = row.stock.mode === 'not-authorized' ? [] : row.stockStatusSkus
  const skuStates = readableSkus.map((sku) => ({ sku, status: resolveSkuStockStatus(sku, now) }))

  if (skuStates.length === 0 || skuStates.every((state) => state.status.key === 'out')) {
    return { key: 'out', label: 'หมดสต็อก', tone: 'danger', rank: 0, description: 'ทุก SKU ไม่มียอดพร้อมขาย' }
  }

  const riskStates = skuStates.filter((state) => state.status.key === 'out' || state.status.key === 'low')
  if (riskStates.length > 0) {
    const first = riskStates[0]
    const detail = first.status.description
    return {
      key: 'low', label: 'ใกล้หมด', tone: 'warning', rank: 1,
      description: riskStates.length > 1 ? `${detail} และอีก ${riskStates.length - 1} SKU ต้องติดตาม` : detail,
    }
  }

  const latestReceipt = skuStates
    .map((state) => state.sku.lastReceivedAt)
    .filter((value): value is string => Boolean(value))
    .sort((left, right) => Date.parse(right) - Date.parse(left))[0] ?? null
  if (isRecentReceipt(latestReceipt, now)) {
    return {
      key: 'new', label: 'เข้าใหม่', tone: 'success', rank: 2,
      description: `รับสต็อกเข้าล่าสุดภายใน ${RECENT_RECEIPT_DAYS} วัน`,
    }
  }

  return { key: 'normal', label: 'ปกติ', tone: 'info', rank: 3, description: 'ยอดพร้อมขายสูงกว่าเกณฑ์แจ้งเตือน' }
}

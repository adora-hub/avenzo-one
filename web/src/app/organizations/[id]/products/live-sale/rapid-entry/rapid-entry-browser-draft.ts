import type { RapidRangeSelection } from './rapid-prefix-assistant'

export const RAPID_BROWSER_DRAFT_VERSION = 1
export const RAPID_BROWSER_DRAFT_MAX_BYTES = 256 * 1024

export type RapidBrowserDraftRow = {
  index: number
  salesCode: string
  productName: string
  category: string
  price: string
  stock: string
  unit: string
  branch: string
  selected: boolean
  nameOverridden: boolean
  imageFileName: string
}

export type RapidBrowserDraft = {
  version: typeof RAPID_BROWSER_DRAFT_VERSION
  organizationId: string
  actorUserId: string
  reservationKey: string
  savedAt: string
  range: RapidRangeSelection
  namingTemplate: string
  rows: RapidBrowserDraftRow[]
  categoryOptions: string[]
  columnWidths: Record<string, number>
}

export function rapidReservationKey(range: RapidRangeSelection) {
  return `${range.prefix}:${range.start}:${range.end}`
}

export function rapidBrowserDraftStorageKey(organizationId: string, actorUserId: string) {
  return `avenzo:rapid-entry:draft:v${RAPID_BROWSER_DRAFT_VERSION}:${organizationId}:${actorUserId}`
}

function isSafeRange(value: unknown): value is RapidRangeSelection {
  if (!value || typeof value !== 'object') return false
  const range = value as Partial<RapidRangeSelection>
  return typeof range.prefix === 'string' && /^[A-Z0-9-]{1,8}$/.test(range.prefix)
    && Number.isInteger(range.start) && Number.isInteger(range.end) && Number.isInteger(range.occupiedUntil)
    && Number(range.start) > 0 && Number(range.end) - Number(range.start) === 49
}

function isSafeRow(value: unknown, index: number, range: RapidRangeSelection): value is RapidBrowserDraftRow {
  if (!value || typeof value !== 'object') return false
  const row = value as Partial<RapidBrowserDraftRow>
  const expectedCode = `${range.prefix}${String(range.start + index).padStart(3, '0')}`
  return row.index === index && row.salesCode === expectedCode
    && typeof row.productName === 'string' && row.productName.length <= 120
    && typeof row.category === 'string' && row.category.length <= 60
    && typeof row.price === 'string' && row.price.length <= 12
    && typeof row.stock === 'string' && row.stock.length <= 6
    && typeof row.unit === 'string' && row.unit.length <= 24
    && typeof row.branch === 'string' && row.branch.length <= 40
    && typeof row.selected === 'boolean' && typeof row.nameOverridden === 'boolean'
    && typeof row.imageFileName === 'string' && row.imageFileName.length <= 160
}

export function parseRapidBrowserDraft(raw: string, organizationId: string, actorUserId: string): RapidBrowserDraft | null {
  if (!raw || new TextEncoder().encode(raw).byteLength > RAPID_BROWSER_DRAFT_MAX_BYTES) return null
  try {
    const draft = JSON.parse(raw) as Partial<RapidBrowserDraft>
    if (draft.version !== RAPID_BROWSER_DRAFT_VERSION || draft.organizationId !== organizationId || draft.actorUserId !== actorUserId) return null
    if (!isSafeRange(draft.range) || draft.reservationKey !== rapidReservationKey(draft.range)) return null
    if (typeof draft.savedAt !== 'string' || Number.isNaN(Date.parse(draft.savedAt))) return null
    if (typeof draft.namingTemplate !== 'string' || draft.namingTemplate.length > 160 || !draft.namingTemplate.includes('{code}')) return null
    if (!Array.isArray(draft.rows) || draft.rows.length !== 50 || !draft.rows.every((row, index) => isSafeRow(row, index, draft.range!))) return null
    if (!Array.isArray(draft.categoryOptions) || draft.categoryOptions.length > 50 || !draft.categoryOptions.every((item) => typeof item === 'string' && item.length > 0 && item.length <= 60)) return null
    if (!draft.columnWidths || typeof draft.columnWidths !== 'object') return null
    return draft as RapidBrowserDraft
  } catch {
    return null
  }
}

export function serializeRapidBrowserDraft(draft: RapidBrowserDraft) {
  const value = JSON.stringify(draft)
  const bytes = new TextEncoder().encode(value).byteLength
  return bytes <= RAPID_BROWSER_DRAFT_MAX_BYTES ? { ok: true as const, value, bytes } : { ok: false as const, bytes }
}

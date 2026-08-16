'use client'

import Image from 'next/image'
import Link from 'next/link'
import { useEffect, useId, useLayoutEffect, useRef, useState, useTransition, type FormEvent, type KeyboardEvent } from 'react'
import { useRouter } from 'next/navigation'
import {
  checkProductIdentifiersAction,
  executeFoundationCommandAction,
  executeProductImageCleanupAction,
} from '@/app/actions/foundation'
import { createClient } from '@/lib/supabase/browser'
import {
  PRODUCT_IMAGE_ALLOWED_MIME_TYPES,
  PRODUCT_IMAGE_MAX_BYTES,
  PRODUCT_IMAGE_MAX_FILES,
  uploadPreparedProductImage,
  validateProductImageFile,
  type PreparedProductImage,
} from '@/lib/foundation/product-image-upload'
import {
  DEFAULT_VARIANT_GROUPS,
  VariantCreationBuilder,
  sanitizeVariantCombinations,
  sanitizeVariantGroups,
  synchronizeVariantCombinations,
  type VariantCombinationDraft,
  type VariantOptionGroupDraft,
} from './variant-creation-builder'
type ProductMasterOption = { id: string; name: string; status?: 'active' | 'archived'; version?: number }
type ProductBranchOption = Pick<ProductMasterOption, 'id' | 'name'> & { code: string }
type ProductBundleSkuOption = Pick<ProductMasterOption, 'id' | 'name'> & { skuCode: string }

type Props = {
  organizationId: string
  organizationName: string
  productsHref: string
  canManage: boolean
  actorEmail: string
  categories: ProductMasterOption[]
  brands: ProductMasterOption[]
  tags: ProductMasterOption[]
  branches: ProductBranchOption[]
  bundleSkus: ProductBundleSkuOption[]
}

type StructureType = 'standard' | 'variant' | 'bundle'
type SalesCodeMode = 'manual' | 'same-sku' | 'sequence'
type BarcodeMode = 'manufacturer' | 'internal-sku' | 'internal-sales' | 'none'
type TaxCategory = 'standard' | 'zero' | 'exempt'
type PhysicalTab = 'product' | 'box'
type BundleStockMode = 'virtual' | 'assembled'
type SellUnitDraft = { id: string; name: string; unitCode: string; baseQuantity: number; barcode: string }
type BundleComponentDraft = { id: string; skuId: string; quantity: number }
type SkuDraft = {
  id: string
  name: string
  skuCode: string
  salesCode: string
  barcode: string
  baseUnitCode: string
  status: 'draft'
}
type UploadStage = 'selected' | 'preparing' | 'uploading' | 'finalizing' | 'ready' | 'failed'
type SelectedImage = { id: string; file: File; previewUrl: string; stage: UploadStage }
type VariantSkuMapping = { key: string; skuId: string; imageId: string }
type PendingDraft = { productId: string; skuId?: string; variantSkus?: VariantSkuMapping[]; readyImageIdsByClientId?: Record<string, string>; productName: string; savedAt: string }
type CreationSuccess = { productId: string; productName: string; skuCount: number }
type Feedback = { tone: 'info' | 'success' | 'danger'; text: string }
type IdentifierStatusKey = 'skuCode' | 'salesCode' | 'barcode'
type IdentifierStatusMap = Record<IdentifierStatusKey, Feedback>
type IdentifierCollision = { field: 'sku_code' | 'sales_code' | 'barcode'; value: string }
type ValidationSectionId = 'general' | 'images' | 'sku' | 'pricing' | 'physical' | 'packaging' | 'inventory' | 'metadata'
type ValidationIssue = {
  id: string
  sectionId: ValidationSectionId
  fieldName?: string
  label: string
  message: string
}
type ProductSummaryFields = {
  name: string
  skuName: string
  skuCode: string
  salesCode: string
  barcode: string
  salePrice: string
  baseUnitCode: string
  productWeightKg: string
  productLengthCm: string
  productWidthCm: string
  productHeightCm: string
  sellUnitName: string
}

const DRAFT_SCHEMA_VERSION = 2
const DRAFT_MAX_BYTES = 256 * 1024
const PENDING_DRAFT_MAX_AGE_MS = 24 * 60 * 60 * 1000
const SKU_DRAFT_MAX_ITEMS = 100
const IDENTIFIER_CODE_PATTERN = /^[A-Z0-9][A-Z0-9._-]*$/
const IDENTIFIER_AUTO_CHECK_DEBOUNCE_MS = 650
const IDENTIFIER_AUTO_CHECK_MIN_INTERVAL_MS = 900
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i
const FORBIDDEN_CONTROL_CHARACTERS = /[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/
const BASE_UNIT_CODES = new Set(['piece', 'pair', 'pack', 'box', 'set', 'case', 'kg', 'g', 'litre', 'ml'])
const identifierFieldLabels = {
  sku_code: 'SKU Code',
  sales_code: 'Sales Code',
  barcode: 'Barcode',
} as const
const errorLabels: Record<string, string> = {
  authentication_required: 'Session หมดอายุ กรุณาเข้าสู่ระบบใหม่',
  tenant_access_denied: 'บัญชีนี้ไม่มีสิทธิ์เข้าถึง Organization',
  permission_denied: 'ไม่มีสิทธิ์สร้างสินค้า',
  validation_failed: 'ข้อมูลไม่ครบหรือรูปแบบไม่ถูกต้อง กรุณาตรวจช่องที่มีเครื่องหมาย *',
  duplicate_sku_code: 'SKU Code นี้ถูกใช้แล้วใน Organization',
  duplicate_sales_code: 'Sales Code นี้ถูกใช้แล้วใน Organization',
  duplicate_barcode: 'Barcode นี้ถูกใช้แล้วใน Organization',
  command_payload_conflict: 'คำสั่งเดิมถูกใช้กับข้อมูลคนละชุด กรุณาลองใหม่',
  version_conflict: 'ข้อมูลอ้างอิงมีการเปลี่ยนแปลง กรุณาปิดหน้าต่างแล้วเปิดใหม่ก่อนลองอีกครั้ง',
  foundation_command_failed: 'ระบบบันทึกไม่สำเร็จ กรุณาลองใหม่หรือติดต่อผู้ดูแลระบบ',
}

function optionalNumber(value: FormDataEntryValue | null) {
  const normalized = String(value ?? '').trim()
  if (!normalized) return undefined
  const number = Number(normalized)
  return Number.isFinite(number) ? number : undefined
}

function formString(data: FormData, key: string) {
  return String(data.get(key) ?? '').trim()
}

function sanitizeTagName(value: string) {
  return value.normalize('NFC')
    .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, '')
    .replace(/^#/, '')
    .trim()
    .slice(0, 40)
}

function suggestedTagNamesFromProductName(productName: string, selectedNames: string[], savedNames: string[]) {
  const normalizedName = productName.normalize('NFC').trim()
  if (!normalizedName) return []
  const lowerName = normalizedName.toLocaleLowerCase('th-TH')
  const stopWords = new Set([
    'และ', 'หรือ', 'สำหรับ', 'รุ่น', 'แบบ', 'สินค้า', 'ขนาด',
    'the', 'and', 'for', 'with', 'size', 'cm', 'mm', 'm', 'kg', 'g', 'ml', 'l', 'litre',
  ])
  const selected = new Set(selectedNames.map((name) => name.toLocaleLowerCase('th-TH')))
  const tokens = normalizedName.match(/[\p{L}\p{M}\p{N}]+(?:[-'][\p{L}\p{M}\p{N}]+)*/gu) ?? []
  const savedMatches = savedNames.filter((name) => lowerName.includes(name.toLocaleLowerCase('th-TH')))
  const suggestions = [...tokens, ...savedMatches]
    .map(sanitizeTagName)
    .filter((name) => {
      const lower = name.toLocaleLowerCase('th-TH')
      return name.length >= 2
        && !/^\d+(?:[.,-]\d+)*$/.test(name)
        && !stopWords.has(lower)
        && !selected.has(lower)
    })
  return [...new Map(suggestions.map((name) => [name.toLocaleLowerCase('th-TH'), name])).values()].slice(0, 8)
}

function generateCode(name: string, prefix: string) {
  const latin = name.normalize('NFKD').toUpperCase()
    .replace(/[^A-Z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 18)
  return `${prefix}-${latin || crypto.randomUUID().slice(0, 6).toUpperCase()}-001`
}

function generatedCodeCandidate(baseCode: string, offset: number) {
  const match = baseCode.match(/^(.*?)-(\d+)$/)
  if (!match) return `${baseCode}-${String(offset + 1).padStart(3, '0')}`
  const digits = Math.max(3, match[2].length)
  return `${match[1]}-${String(Number(match[2]) + offset).padStart(digits, '0')}`
}

function nextIdentifierCode(value: string) {
  const normalized = value.trim().toUpperCase()
  const match = normalized.match(/^(.*?)(\d+)$/)
  if (!match) return `${normalized}-002`
  return `${match[1]}${String(Number(match[2]) + 1).padStart(match[2].length, '0')}`
}

function formatSalesSequence(prefix: string, start: number, digits: number, offset = 0) {
  const safePrefix = prefix.toUpperCase().replace(/[^A-Z0-9_-]/g, '').slice(0, 10) || 'A'
  const safeStart = Math.max(0, Math.trunc(start || 0))
  const safeDigits = Math.min(8, Math.max(2, Math.trunc(digits || 3)))
  return `${safePrefix}${String(safeStart + offset).padStart(safeDigits, '0')}`
}

function readProductSummaryFields(form: HTMLFormElement): ProductSummaryFields {
  const data = new FormData(form)
  return {
    name: formString(data, 'name'),
    skuName: formString(data, 'skuName'),
    skuCode: formString(data, 'skuCode').toUpperCase(),
    salesCode: formString(data, 'salesCode').toUpperCase(),
    barcode: formString(data, 'barcode'),
    salePrice: formString(data, 'salePrice'),
    baseUnitCode: formString(data, 'baseUnitCode'),
    productWeightKg: formString(data, 'productWeightKg'),
    productLengthCm: formString(data, 'productLengthCm'),
    productWidthCm: formString(data, 'productWidthCm'),
    productHeightCm: formString(data, 'productHeightCm'),
    sellUnitName: formString(data, 'sellUnitName'),
  }
}

function physicalValidationErrors(data: FormData) {
  const value = (name: string) => optionalNumber(data.get(name))
  const errors: string[] = []
  const productWeight = value('productWeightKg')
  const packageWeight = value('packageWeightKg')
  if (productWeight !== undefined && packageWeight !== undefined && packageWeight < productWeight) errors.push('Gross Weight ต้องไม่น้อยกว่า Net Weight')
  const dimensions = [
    ['productLengthCm', 'packageLengthCm', 'กล่องต้องไม่สั้นกว่าสินค้า'],
    ['productWidthCm', 'packageWidthCm', 'กล่องต้องไม่แคบกว่าสินค้า'],
    ['productHeightCm', 'packageHeightCm', 'กล่องต้องไม่เตี้ยกว่าสินค้า'],
  ] as const
  for (const [productField, packageField, message] of dimensions) {
    const productValue = value(productField)
    const packageValue = value(packageField)
    if (productValue !== undefined && packageValue !== undefined && packageValue < productValue) errors.push(message)
  }
  return errors
}

function inventoryPolicyValidationErrors(data: FormData) {
  const safetyStock = optionalNumber(data.get('safetyStock')) ?? 0
  const reorderMin = optionalNumber(data.get('reorderMin'))
  const reorderMax = optionalNumber(data.get('reorderMax'))
  const errors: string[] = []
  if (reorderMin !== undefined && reorderMin < safetyStock) errors.push('Min ต้องไม่น้อยกว่า Safety Stock')
  if (reorderMax !== undefined && reorderMax < (reorderMin ?? 0)) errors.push('Max ต้องไม่น้อยกว่า Min')
  return errors
}

function sanitizeSellUnitDrafts(value: unknown): SellUnitDraft[] {
  if (!Array.isArray(value)) return []
  return value.slice(0, 50).flatMap((item) => {
    if (!item || typeof item !== 'object') return []
    const record = item as Record<string, unknown>
    const name = String(record.name ?? '').trim().slice(0, 80)
    const unitCode = String(record.unitCode ?? '').trim().toLowerCase().slice(0, 32)
    const baseQuantity = Number(record.baseQuantity)
    const barcode = String(record.barcode ?? '').trim().slice(0, 128)
    if (!name || !/^[a-z][a-z0-9_]{0,31}$/.test(unitCode) || !Number.isFinite(baseQuantity) || baseQuantity <= 1) return []
    return [{ id: String(record.id ?? crypto.randomUUID()), name, unitCode, baseQuantity, barcode }]
  })
}

function sanitizeBundleComponentDrafts(value: unknown, bundleSkus: ProductBundleSkuOption[]): BundleComponentDraft[] {
  if (!Array.isArray(value)) return []
  const allowed = new Set(bundleSkus.map((sku) => sku.id))
  return value.slice(0, 100).flatMap((item) => {
    if (!item || typeof item !== 'object') return []
    const record = item as Record<string, unknown>
    const skuId = String(record.skuId ?? '')
    const quantity = Number(record.quantity)
    if (!allowed.has(skuId) || !Number.isFinite(quantity) || quantity <= 0) return []
    return [{ id: String(record.id ?? crypto.randomUUID()), skuId, quantity }]
  })
}

function sanitizeSkuDrafts(value: unknown): SkuDraft[] {
  if (!Array.isArray(value)) return []
  const seenIdentifiers = new Set<string>()
  return value.slice(0, SKU_DRAFT_MAX_ITEMS).flatMap((item) => {
    if (!item || typeof item !== 'object') return []
    const record = item as Record<string, unknown>
    const name = String(record.name ?? '').normalize('NFKC').trim().slice(0, 160)
    const skuCode = String(record.skuCode ?? '').normalize('NFKC').trim().toUpperCase().slice(0, 80)
    const salesCode = String(record.salesCode ?? '').normalize('NFKC').trim().toUpperCase().slice(0, 80)
    const barcode = String(record.barcode ?? '').normalize('NFKC').trim().slice(0, 128)
    const baseUnitCode = String(record.baseUnitCode ?? '')
    const identifiers = [skuCode, salesCode, barcode].filter(Boolean)
    if (!name || FORBIDDEN_CONTROL_CHARACTERS.test(name) || !skuCode || !IDENTIFIER_CODE_PATTERN.test(skuCode)) return []
    if (salesCode && !IDENTIFIER_CODE_PATTERN.test(salesCode)) return []
    if (barcode && FORBIDDEN_CONTROL_CHARACTERS.test(barcode)) return []
    if (!BASE_UNIT_CODES.has(baseUnitCode) || identifiers.some((identifier) => seenIdentifiers.has(identifier))) return []
    identifiers.forEach((identifier) => seenIdentifiers.add(identifier))
    return [{
      id: String(record.id ?? crypto.randomUUID()).slice(0, 120),
      name,
      skuCode,
      salesCode,
      barcode,
      baseUnitCode,
      status: 'draft' as const,
    }]
  })
}

function sanitizePendingDraft(value: unknown): PendingDraft | null {
  if (!value || typeof value !== 'object') return null
  const record = value as Record<string, unknown>
  const productId = String(record.productId ?? '')
  const skuId = String(record.skuId ?? '')
  const variantSkus = Array.isArray(record.variantSkus) ? record.variantSkus.slice(0, 100).flatMap((entry) => {
    if (!entry || typeof entry !== 'object') return []
    const mapping = entry as Record<string, unknown>
    const key = String(mapping.key ?? '').slice(0, 500)
    const mappedSkuId = String(mapping.skuId ?? '')
    const imageId = String(mapping.imageId ?? '').slice(0, 80)
    return key && UUID_PATTERN.test(mappedSkuId) ? [{ key, skuId: mappedSkuId, imageId }] : []
  }) : []
  const productName = String(record.productName ?? '').normalize('NFKC').trim().slice(0, 160)
  const readyImageIdsByClientId = record.readyImageIdsByClientId && typeof record.readyImageIdsByClientId === 'object'
    ? Object.fromEntries(Object.entries(record.readyImageIdsByClientId as Record<string, unknown>).flatMap(([clientId, imageId]) => clientId.slice(0, 80) && UUID_PATTERN.test(String(imageId)) ? [[clientId.slice(0, 80), String(imageId)]] : []))
    : {}
  const savedAt = String(record.savedAt ?? '')
  const savedAtTimestamp = Date.parse(savedAt)
  if (!UUID_PATTERN.test(productId) || (!UUID_PATTERN.test(skuId) && variantSkus.length === 0) || !productName || FORBIDDEN_CONTROL_CHARACTERS.test(productName) || !Number.isFinite(savedAtTimestamp)) return null
  if (savedAtTimestamp > Date.now() + 60_000 || Date.now() - savedAtTimestamp > PENDING_DRAFT_MAX_AGE_MS) return null
  return { productId, skuId: UUID_PATTERN.test(skuId) ? skuId : undefined, variantSkus: variantSkus.length ? variantSkus : undefined, readyImageIdsByClientId, productName, savedAt }
}

const PRODUCT_INFO_GUIDE_OPEN_EVENT = 'avenzo:product-info-guide-open'
let activeProductInfoGuide: { id: string; pinned: boolean } | null = null

function ProductInfoGuide({
  label,
  description,
  example,
}: {
  label: string
  description: string
  example: string
}) {
  const popoverId = useId()
  const rootRef = useRef<HTMLSpanElement>(null)
  const buttonRef = useRef<HTMLButtonElement>(null)
  const popoverRef = useRef<HTMLElement>(null)
  const [open, setOpen] = useState(false)
  const [pinned, setPinned] = useState(false)
  const [positioned, setPositioned] = useState(false)
  const [position, setPosition] = useState({ left: 12, top: 12 })

  function closeGuide() {
    if (activeProductInfoGuide?.id === popoverId) activeProductInfoGuide = null
    setOpen(false)
    setPinned(false)
  }

  function openGuide(pin = false) {
    if (!pin && activeProductInfoGuide?.pinned && activeProductInfoGuide.id !== popoverId) return
    activeProductInfoGuide = { id: popoverId, pinned: pin }
    window.dispatchEvent(new CustomEvent(PRODUCT_INFO_GUIDE_OPEN_EVENT, { detail: { id: popoverId } }))
    setPinned(pin)
    setPositioned(false)
    setOpen(true)
  }

  useEffect(() => {
    function closeWhenAnotherGuideOpens(event: Event) {
      const detail = (event as CustomEvent<{ id?: string }>).detail
      if (detail?.id !== popoverId) {
        setOpen(false)
        setPinned(false)
      }
    }
    window.addEventListener(PRODUCT_INFO_GUIDE_OPEN_EVENT, closeWhenAnotherGuideOpens)
    return () => {
      window.removeEventListener(PRODUCT_INFO_GUIDE_OPEN_EVENT, closeWhenAnotherGuideOpens)
      if (activeProductInfoGuide?.id === popoverId) activeProductInfoGuide = null
    }
  }, [popoverId])

  useLayoutEffect(() => {
    if (!open) return
    function updatePosition() {
      const button = buttonRef.current
      const popover = popoverRef.current
      if (!button || !popover) return
      if (window.matchMedia('(max-width: 760px)').matches) {
        setPositioned(true)
        return
      }
      const rect = button.getBoundingClientRect()
      const width = Math.min(320, window.innerWidth - 24)
      const left = Math.min(window.innerWidth - width - 12, Math.max(12, rect.left))
      const below = rect.bottom + 8
      const top = below + popover.offsetHeight > window.innerHeight - 12
        ? Math.max(12, rect.top - popover.offsetHeight - 8)
        : below
      setPosition({ left, top })
      setPositioned(true)
    }
    updatePosition()
    window.addEventListener('resize', updatePosition)
    window.addEventListener('scroll', updatePosition, true)
    return () => {
      window.removeEventListener('resize', updatePosition)
      window.removeEventListener('scroll', updatePosition, true)
    }
  }, [open])

  useEffect(() => {
    if (!open) return
    function handlePointerDown(event: PointerEvent) {
      const target = event.target as Node
      if (rootRef.current?.contains(target) || popoverRef.current?.contains(target)) return
      closeGuide()
    }
    function handleEscape(event: globalThis.KeyboardEvent) {
      if (event.key !== 'Escape') return
      event.stopPropagation()
      closeGuide()
    }
    document.addEventListener('pointerdown', handlePointerDown)
    document.addEventListener('keydown', handleEscape)
    return () => {
      document.removeEventListener('pointerdown', handlePointerDown)
      document.removeEventListener('keydown', handleEscape)
    }
  }, [open])

  return (
    <span
      className="product-info-guide-root"
      ref={rootRef}
    >
      <button
        className="product-info-guide"
        ref={buttonRef}
        type="button"
        aria-label={`ดูคำแนะนำ${label}`}
        aria-expanded={open}
        aria-controls={popoverId}
        aria-describedby={open ? popoverId : undefined}
        onClick={(event) => {
          event.preventDefault()
          event.stopPropagation()
          if (open && pinned) closeGuide()
          else openGuide(true)
        }}
      >i</button>
      <aside
        className="product-info-popover"
        id={popoverId}
        ref={popoverRef}
        role="tooltip"
        hidden={!open}
        style={{ left: position.left, top: position.top, visibility: positioned ? 'visible' : 'hidden' }}
      >
        <h3>{label}</h3>
        <p>{description}</p>
        <div className="product-info-example">{example}</div>
      </aside>
    </span>
  )
}

type ManagedMasterKind = 'category' | 'brand' | 'tag'
type MasterWorkingItem = {
  id: string
  name: string
  status: 'active' | 'archived'
  version: number
  isNew?: boolean
}

function MasterDataManager({
  organizationId,
  kind,
  items,
  canManage,
  onSaved,
  triggerLabel,
}: {
  organizationId: string
  kind: ManagedMasterKind
  items: ProductMasterOption[]
  canManage: boolean
  onSaved: (items: ProductMasterOption[]) => void
  triggerLabel?: string
}) {
  const titleId = useId()
  const descriptionId = useId()
  const triggerRef = useRef<HTMLButtonElement>(null)
  const dialogRef = useRef<HTMLElement>(null)
  const searchRef = useRef<HTMLInputElement>(null)
  const [open, setOpen] = useState(false)
  const [search, setSearch] = useState('')
  const [bulkInput, setBulkInput] = useState('')
  const [workingItems, setWorkingItems] = useState<MasterWorkingItem[]>([])
  const [error, setError] = useState('')
  const [isPending, startTransition] = useTransition()
  const label = kind === 'category' ? 'หมวดหมู่สินค้า' : kind === 'brand' ? 'แบรนด์' : 'Tags ที่ใช้บ่อย'
  const itemMaxLength = kind === 'tag' ? 80 : 120

  function normalizedItems(source: ProductMasterOption[]) {
    return source.map((item) => ({
      id: item.id,
      name: item.name,
      status: item.status === 'archived' ? 'archived' as const : 'active' as const,
      version: Number.isSafeInteger(item.version) && Number(item.version) > 0 ? Number(item.version) : 1,
    }))
  }

  function openManager() {
    if (!canManage) return
    setWorkingItems(normalizedItems(items))
    setSearch('')
    setBulkInput('')
    setError('')
    setOpen(true)
  }

  function closeManager() {
    if (isPending) return
    setOpen(false)
    window.requestAnimationFrame(() => triggerRef.current?.focus())
  }

  useEffect(() => {
    if (!open) return
    const previousOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    window.requestAnimationFrame(() => searchRef.current?.focus())
    return () => { document.body.style.overflow = previousOverflow }
  }, [open])

  function handleDialogKeyDown(event: KeyboardEvent<HTMLElement>) {
    if (event.key === 'Escape') {
      event.preventDefault()
      closeManager()
      return
    }
    if (event.key !== 'Tab') return
    const focusable = Array.from(dialogRef.current?.querySelectorAll<HTMLElement>('button:not([disabled]), input:not([disabled]), textarea:not([disabled]), [href], [tabindex]:not([tabindex="-1"])') ?? [])
    if (!focusable.length) return
    const first = focusable[0]
    const last = focusable[focusable.length - 1]
    if (event.shiftKey && document.activeElement === first) {
      event.preventDefault()
      last.focus()
    } else if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault()
      first.focus()
    }
  }

  function updateWorkingItem(id: string, patch: Partial<MasterWorkingItem>) {
    setWorkingItems((current) => current.map((item) => item.id === id ? { ...item, ...patch } : item))
  }

  function mergeBulkItems(sourceItems: MasterWorkingItem[]) {
    const maxLength = itemMaxLength
    const values = bulkInput.split(/[,\n]/)
      .map((value) => value.replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, '').trim().slice(0, maxLength))
      .filter(Boolean)
      .slice(0, 20)
    const next = [...sourceItems]
    let added = 0
    for (const name of values) {
      if (next.some((item) => item.name.localeCompare(name, 'th', { sensitivity: 'base' }) === 0)) continue
      next.push({ id: `new-${crypto.randomUUID()}`, name, status: 'active', version: 1, isNew: true })
      added += 1
    }
    return { next, added }
  }

  function addBulkItems() {
    const { next, added } = mergeBulkItems(workingItems)
    setWorkingItems(next)
    setBulkInput('')
    setError(added ? '' : 'ไม่มีรายการใหม่ให้เพิ่ม')
  }

  function saveChanges() {
    const itemsToSave = bulkInput.trim() ? mergeBulkItems(workingItems).next : workingItems
    const invalid = itemsToSave.find((item) => !item.name.trim() || /[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/.test(item.name))
    if (invalid) {
      setError('ชื่อข้อมูลอ้างอิงว่างหรือมีอักขระที่ไม่อนุญาต')
      return
    }
    const duplicateNames = itemsToSave.filter((item) => item.status === 'active').map((item) => item.name.trim().toLocaleLowerCase('th-TH'))
    if (new Set(duplicateNames).size !== duplicateNames.length) {
      setError(`ชื่อ${label}ที่เปิดใช้งานต้องไม่ซ้ำกัน`)
      return
    }

    setError('')
    startTransition(async () => {
      let savedItems = normalizedItems(items)
      const originalById = new Map(items.map((item) => [item.id, item]))
      const changes = itemsToSave.filter((item) => {
        if (item.isNew) return item.status === 'active'
        const original = originalById.get(item.id)
        return original && (original.name !== item.name.trim() || (original.status ?? 'active') !== item.status)
      })

      for (const item of changes) {
        const payload = item.isNew
          ? { master_kind: kind, name: item.name.trim(), status: 'active' }
          : { master_kind: kind, master_id: item.id, expected_version: item.version, name: item.name.trim(), status: item.status }
        const result = await executeFoundationCommandAction({
          kind: 'entity', commandId: crypto.randomUUID(), organizationId,
          commandType: 'product.master.upsert', payload,
        })
        if (!result.ok || typeof result.data.entity_id !== 'string' || typeof result.data.version !== 'number') {
          onSaved(savedItems)
          setWorkingItems(normalizedItems(savedItems))
          setError(errorLabels[result.ok ? '' : result.error] ?? `บันทึก${label}ไม่สำเร็จ`)
          return
        }
        const savedItem: MasterWorkingItem = {
          id: result.data.entity_id,
          name: item.name.trim(),
          status: item.status,
          version: result.data.version,
        }
        savedItems = item.isNew
          ? [...savedItems, savedItem]
          : savedItems.map((current) => current.id === item.id ? savedItem : current)
        onSaved(savedItems)
      }

      onSaved(savedItems)
      setBulkInput('')
      setOpen(false)
      window.requestAnimationFrame(() => triggerRef.current?.focus())
    })
  }

  const query = search.trim().toLocaleLowerCase('th-TH')
  const visibleItems = workingItems.filter((item) => item.name.toLocaleLowerCase('th-TH').includes(query))

  return <div className="product-master-manager">
    <button ref={triggerRef} className={triggerLabel ? 'button compact secondary' : 'product-inline-icon'} type="button" title={`เพิ่มหรือจัดการ${label}`} aria-label={`เพิ่มหรือจัดการ${label}`} aria-haspopup="dialog" aria-expanded={open} disabled={!canManage} onClick={openManager}>
      {triggerLabel ?? <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 3H5a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.1 2.1 0 0 1 3 3L12 15l-4 1 1-4Z"/></svg>}
    </button>
    {open ? <div className="product-modal-backdrop product-master-modal-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) closeManager() }}>
      <section ref={dialogRef} className="product-master-dialog" role="dialog" aria-modal="true" aria-labelledby={titleId} aria-describedby={descriptionId} onKeyDown={handleDialogKeyDown}>
        <header><div><h2 id={titleId}>จัดการ{label}</h2><p id={descriptionId}>เพิ่ม แก้ชื่อ หรือเก็บ{label}ที่ไม่ใช้แล้ว</p></div><button className="product-master-modal-close" type="button" aria-label="ปิดหน้าต่าง" onClick={closeManager} disabled={isPending}>×</button></header>
        <div className="product-master-dialog-content">
          <div className="product-master-toolbar"><input ref={searchRef} type="search" value={search} onChange={(event) => setSearch(event.target.value)} placeholder={`ค้นหา${label}...`} aria-label={`ค้นหา${label}`} /><span>{visibleItems.length} รายการ</span></div>
          <div className="product-master-list" role="list">{visibleItems.length ? visibleItems.map((item) => {
            const originallyArchived = !item.isNew && items.find((source) => source.id === item.id)?.status === 'archived'
            return <div className={`product-master-row${item.status === 'archived' ? ' inactive' : ''}`} role="listitem" key={item.id}>
              <input value={item.name} maxLength={itemMaxLength} aria-label={`ชื่อรายการ ${item.name}`} disabled={originallyArchived || isPending} onChange={(event) => updateWorkingItem(item.id, { name: event.target.value })} />
              {item.isNew ? <button className="button compact secondary" type="button" disabled={isPending} onClick={() => setWorkingItems((current) => current.filter((source) => source.id !== item.id))}>นำออก</button>
                : originallyArchived ? <button className="button compact secondary" type="button" disabled>เก็บถาวรแล้ว</button>
                  : <button className="button compact secondary" type="button" aria-pressed={item.status === 'archived'} disabled={isPending} onClick={() => updateWorkingItem(item.id, { status: item.status === 'active' ? 'archived' : 'active' })}>{item.status === 'active' ? 'เก็บถาวร' : 'ยกเลิกเก็บถาวร'}</button>}
            </div>
          }) : <div className="product-master-empty">ไม่พบรายการที่ค้นหา</div>}</div>
          <div className="product-master-bulk"><label htmlFor={`${titleId}-bulk`}>เพิ่ม{label}</label><textarea id={`${titleId}-bulk`} value={bulkInput} onChange={(event) => setBulkInput(event.target.value)} maxLength={600} placeholder="แยกหลายรายการด้วย comma หรือขึ้นบรรทัดใหม่" disabled={isPending} /><button className="button compact secondary" type="button" onClick={addBulkItems} disabled={isPending || !bulkInput.trim()}>＋ เพิ่มรายการ</button></div>
          <div className="product-master-permission-note"><span aria-hidden="true">ⓘ</span><span>แสดงเฉพาะผู้มีสิทธิ์ product.manage · แต่ละรายการบันทึกผ่าน trusted command พร้อม Audit Log · รายการที่เก็บถาวรแล้วเปิดกลับไม่ได้</span></div>
          {error ? <div className="product-master-dialog-error" role="alert">{error}</div> : null}
        </div>
        <footer><button className="button secondary" type="button" onClick={closeManager} disabled={isPending}>ยกเลิก</button><button className="button product-primary-action" type="button" onClick={saveChanges} disabled={isPending}>{isPending ? `กำลังบันทึก${label}…` : `บันทึก${label}`}</button></footer>
      </section>
    </div> : null}
  </div>
}

function SavedTagsInteraction({
  organizationId,
  tags,
  selectedIds,
  canManage,
  onChange,
  onCreated,
}: {
  organizationId: string
  tags: ProductMasterOption[]
  selectedIds: string[]
  canManage: boolean
  onChange: (ids: string[]) => void
  onCreated: (tag: ProductMasterOption) => void
}) {
  const titleId = useId()
  const descriptionId = useId()
  const triggerRef = useRef<HTMLButtonElement>(null)
  const navigationRef = useRef<HTMLDivElement>(null)
  const dialogRef = useRef<HTMLElement>(null)
  const searchRef = useRef<HTMLInputElement>(null)
  const [quickOpen, setQuickOpen] = useState(false)
  const [quickLocked, setQuickLocked] = useState(false)
  const [pickerOpen, setPickerOpen] = useState(false)
  const [search, setSearch] = useState('')
  const [recentIds, setRecentIds] = useState<string[]>([])
  const [error, setError] = useState('')
  const [isPending, startTransition] = useTransition()
  const activeTags = tags.filter((tag) => tag.status !== 'archived')
  const selectedSet = new Set(selectedIds)
  const preferenceKey = `avenzo.products.tags.recent.${organizationId}`

  useEffect(() => {
    try {
      const stored = JSON.parse(localStorage.getItem(preferenceKey) ?? '[]')
      if (Array.isArray(stored)) setRecentIds(stored.filter((id): id is string => typeof id === 'string').slice(0, 5))
    } catch {
      setRecentIds([])
    }
  }, [preferenceKey])

  useEffect(() => {
    if (!quickOpen) return
    function closeOnOutsidePointer(event: MouseEvent) {
      if (!navigationRef.current?.contains(event.target as Node)) {
        setQuickOpen(false)
        setQuickLocked(false)
      }
    }
    document.addEventListener('mousedown', closeOnOutsidePointer)
    return () => document.removeEventListener('mousedown', closeOnOutsidePointer)
  }, [quickOpen])

  useEffect(() => {
    if (!pickerOpen) return
    const previousOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    window.requestAnimationFrame(() => searchRef.current?.focus())
    return () => { document.body.style.overflow = previousOverflow }
  }, [pickerOpen])

  function rememberRecent(id: string) {
    setRecentIds((current) => {
      const next = [id, ...current.filter((item) => item !== id)].slice(0, 5)
      try { localStorage.setItem(preferenceKey, JSON.stringify(next)) } catch { /* UI preference remains in memory */ }
      return next
    })
  }

  function toggleTag(id: string) {
    setError('')
    if (selectedSet.has(id)) {
      onChange(selectedIds.filter((item) => item !== id))
      return
    }
    if (selectedIds.length >= 12) {
      setError('เลือก Tags ได้สูงสุด 12 รายการ')
      return
    }
    onChange([...selectedIds, id])
    rememberRecent(id)
  }

  function openPicker() {
    setQuickOpen(false)
    setQuickLocked(false)
    setSearch('')
    setError('')
    setPickerOpen(true)
  }

  function closePicker() {
    if (isPending) return
    setPickerOpen(false)
    window.requestAnimationFrame(() => triggerRef.current?.focus())
  }

  function handlePickerKeyDown(event: KeyboardEvent<HTMLElement>) {
    if (event.key === 'Escape') {
      event.preventDefault()
      closePicker()
      return
    }
    if (event.key !== 'Tab') return
    const focusable = Array.from(dialogRef.current?.querySelectorAll<HTMLElement>('button:not([disabled]), input:not([disabled]), [href], [tabindex]:not([tabindex="-1"])') ?? [])
    if (!focusable.length) return
    const first = focusable[0]
    const last = focusable[focusable.length - 1]
    if (event.shiftKey && document.activeElement === first) {
      event.preventDefault()
      last.focus()
    } else if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault()
      first.focus()
    }
  }

  function createAndSelectTag() {
    const name = search.replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, '').trim().slice(0, 40)
    if (!name || !canManage || isPending) return
    if (selectedIds.length >= 12) {
      setError('เลือก Tags ได้สูงสุด 12 รายการ')
      return
    }
    setError('')
    startTransition(async () => {
      const result = await executeFoundationCommandAction({
        kind: 'entity', commandId: crypto.randomUUID(), organizationId,
        commandType: 'product.master.upsert',
        payload: { master_kind: 'tag', name, status: 'active' },
      })
      if (!result.ok || typeof result.data.entity_id !== 'string' || typeof result.data.version !== 'number') {
        setError(errorLabels[result.ok ? '' : result.error] ?? 'สร้าง Tag ไม่สำเร็จ')
        return
      }
      const created = { id: result.data.entity_id, name, status: 'active' as const, version: result.data.version }
      onCreated(created)
      onChange([...selectedIds, created.id].slice(0, 12))
      rememberRecent(created.id)
      setSearch('')
    })
  }

  const pinnedNames = new Set(['งานใหม่', 'โปรโมชั่น', 'live วันนี้'])
  const pinned = activeTags.filter((tag) => pinnedNames.has(tag.name.toLocaleLowerCase('th-TH')))
  const pinnedIds = new Set(pinned.map((tag) => tag.id))
  const recent = recentIds.map((id) => activeTags.find((tag) => tag.id === id)).filter((tag): tag is ProductMasterOption => tag !== undefined).filter((tag) => !pinnedIds.has(tag.id))
  const recentSet = new Set(recent.map((tag) => tag.id))
  const frequent = activeTags.filter((tag) => !pinnedIds.has(tag.id) && !recentSet.has(tag.id))
  const query = search.trim().toLocaleLowerCase('th-TH')
  const searchResults = activeTags.filter((tag) => tag.name.toLocaleLowerCase('th-TH').includes(query))
  const exactMatch = query && activeTags.some((tag) => tag.name.toLocaleLowerCase('th-TH') === query)

  function renderQuickGroup(label: string, items: ProductMasterOption[]) {
    if (!items.length) return null
    return <><div className="product-saved-tags-menu-label">{label}</div>{items.slice(0, 5).map((tag) => <button key={tag.id} role="menuitemcheckbox" aria-checked={selectedSet.has(tag.id)} type="button" onClick={() => toggleTag(tag.id)}><span>{selectedSet.has(tag.id) ? '✓' : '+'}</span><span>{tag.name}</span></button>)}</>
  }

  function renderPickerGroup(label: string, items: ProductMasterOption[]) {
    if (!items.length) return null
    return <section className="product-saved-tag-group"><h3>{label}</h3><div>{items.map((tag) => <button key={tag.id} type="button" aria-pressed={selectedSet.has(tag.id)} onClick={() => toggleTag(tag.id)}><span>{selectedSet.has(tag.id) ? '✓' : '+'}</span>{tag.name}</button>)}</div></section>
  }

  return <>
    <div ref={navigationRef} className={`product-saved-tags-navigation${quickOpen ? ' open' : ''}`} onPointerEnter={() => setQuickOpen(true)} onPointerLeave={() => { if (!quickLocked) setQuickOpen(false) }} onFocus={() => setQuickOpen(true)} onBlur={(event) => { if (!event.currentTarget.contains(event.relatedTarget)) { setQuickOpen(false); setQuickLocked(false) } }} onKeyDown={(event) => { if (event.key === 'Escape') { event.preventDefault(); setQuickOpen(false); setQuickLocked(false); triggerRef.current?.focus() } }}>
      <button ref={triggerRef} className="button compact secondary product-saved-tags-trigger" type="button" aria-haspopup="menu" aria-expanded={quickOpen} onClick={() => { const next = !quickOpen || !quickLocked; setQuickOpen(next); setQuickLocked(next) }}><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M20 13 13 20 4 11V4h7Z"/><path d="M8.5 8.5h.01"/></svg><span>เลือก Tags ที่บันทึกไว้</span><span className="product-saved-tags-caret" aria-hidden="true" /></button>
      {quickOpen ? <div className="product-saved-tags-menu" role="menu" aria-label="Tags ที่บันทึกไว้">
        {renderQuickGroup('ปักหมุด', pinned)}
        {renderQuickGroup('ใช้ล่าสุด', recent)}
        {renderQuickGroup('ใช้บ่อย', frequent)}
        {!activeTags.length ? <span>ยังไม่มี Tags ที่บันทึกไว้</span> : null}
        <div className="product-saved-tags-menu-divider" />
        <button className="product-saved-tags-menu-all" role="menuitem" type="button" onClick={openPicker}><span aria-hidden="true">⌕</span><span>ค้นหาและดู Tags ทั้งหมด...</span></button>
      </div> : null}
    </div>
    {pickerOpen ? <div className="product-modal-backdrop product-saved-tags-modal-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) closePicker() }}>
      <section ref={dialogRef} className="product-saved-tags-dialog" role="dialog" aria-modal="true" aria-labelledby={titleId} aria-describedby={descriptionId} onKeyDown={handlePickerKeyDown}>
        <header><div><h2 id={titleId}>เลือก Tags ที่บันทึกไว้</h2><p id={descriptionId}>เลือกหลายรายการได้ โดยไม่ต้องพิมพ์ Tags เดิมซ้ำ</p></div><button type="button" aria-label="ปิดหน้าต่างเลือก Tags" onClick={closePicker} disabled={isPending}>×</button></header>
        <div className="product-saved-tags-dialog-content">
          <div className="product-saved-tags-picker-toolbar"><input ref={searchRef} type="search" maxLength={40} value={search} onChange={(event) => { setSearch(event.target.value); setError('') }} placeholder="ค้นหา เช่น งานใหม่ หรือ โปรโมชั่น" aria-label="ค้นหา Tags ที่บันทึกไว้" /><span>{query ? searchResults.length : activeTags.length} รายการ</span></div>
          <div className="product-saved-tag-groups">
            {query ? renderPickerGroup('ผลการค้นหา', searchResults) : <>{renderPickerGroup('ปักหมุด', pinned)}{renderPickerGroup('ใช้ล่าสุด', recent)}{renderPickerGroup('ใช้บ่อย', frequent)}</>}
            {!query && !activeTags.length ? <div className="product-master-empty">ยังไม่มี Tags ที่บันทึกไว้</div> : null}
            {query && !searchResults.length ? <div className="product-master-empty">ไม่พบ Tag ที่ค้นหา</div> : null}
            {query && !exactMatch && canManage ? <button className="button secondary product-saved-tag-create" type="button" onClick={createAndSelectTag} disabled={isPending}>＋ {isPending ? 'กำลังสร้าง Tag…' : `สร้างและเลือก Tag “${search.trim().slice(0, 40)}”`}</button> : null}
          </div>
          <div className="product-master-permission-note"><span aria-hidden="true">ⓘ</span><span>Tags เป็นข้อมูลระดับ Organization · ไอคอนดินสอใช้เพิ่ม เปลี่ยนชื่อ หรือเก็บ Tags ที่ไม่ใช้แล้ว · ใช้ล่าสุดเป็น UI preference ใน Browser นี้</span></div>
          {error ? <div className="product-master-dialog-error" role="alert">{error}</div> : null}
        </div>
        <footer><span><strong>{selectedIds.length} / 12</strong> Tags ที่เลือก</span><button className="button product-primary-action" type="button" onClick={closePicker} disabled={isPending}>เสร็จสิ้น</button></footer>
      </section>
    </div> : null}
  </>
}

export function UnifiedProductCreationForm({
  organizationId,
  organizationName,
  productsHref,
  canManage,
  actorEmail,
  categories: initialCategories,
  brands: initialBrands,
  tags: initialTags,
  branches,
  bundleSkus,
}: Props) {
  const router = useRouter()
  const formRef = useRef<HTMLFormElement>(null)
  const validationSummaryRef = useRef<HTMLDivElement>(null)
  const successDialogRef = useRef<HTMLElement>(null)
  const successReturnFocusRef = useRef<HTMLElement | null>(null)
  const imageUrlsRef = useRef<string[]>([])
  const identifierCheckRequestRef = useRef(0)
  const identifierAutoCheckTimerRef = useRef<number | null>(null)
  const identifierAutoCheckLastSignatureRef = useRef('')
  const identifierAutoCheckLastStartedAtRef = useRef(0)
  const skuDraftCheckRequestRef = useRef(0)
  const [isPending, startTransition] = useTransition()
  const [isIdentifierChecking, startIdentifierCheck] = useTransition()
  const [isSkuDraftChecking, startSkuDraftCheck] = useTransition()
  const [isTagPending, startTagTransition] = useTransition()
  const [categories, setCategories] = useState(initialCategories)
  const [brands, setBrands] = useState(initialBrands)
  const [tags, setTags] = useState(initialTags)
  const [categoryId, setCategoryId] = useState('')
  const [brandId, setBrandId] = useState('')
  const [tagIds, setTagIds] = useState<string[]>([])
  const [structure, setStructure] = useState<StructureType>('standard')
  const [images, setImages] = useState<SelectedImage[]>([])
  const [imageFeedback, setImageFeedback] = useState<Feedback | null>(null)
  const [feedback, setFeedback] = useState<Feedback | null>(null)
  const [draftSaveNotice, setDraftSaveNotice] = useState('')
  const [draftSaveSeconds, setDraftSaveSeconds] = useState(0)
  const [draftSaveRevision, setDraftSaveRevision] = useState(0)
  const [validationIssues, setValidationIssues] = useState<ValidationIssue[]>([])
  const [validationAttempted, setValidationAttempted] = useState(false)
  const [validationNoticeVisible, setValidationNoticeVisible] = useState(false)
  const [pendingDraft, setPendingDraft] = useState<PendingDraft | null>(null)
  const [completedProductId, setCompletedProductId] = useState('')
  const [creationSuccess, setCreationSuccess] = useState<CreationSuccess | null>(null)
  const [progress, setProgress] = useState('')
  const [tagInput, setTagInput] = useState('')
  const [useProductNameForSku, setUseProductNameForSku] = useState(true)
  const [variantOptionOne, setVariantOptionOne] = useState('')
  const [variantOptionTwo, setVariantOptionTwo] = useState('')
  const [variantGroups, setVariantGroups] = useState<VariantOptionGroupDraft[]>(() => sanitizeVariantGroups(structuredClone(DEFAULT_VARIANT_GROUPS)))
  const [variantCombinations, setVariantCombinations] = useState<VariantCombinationDraft[]>(() => synchronizeVariantCombinations(structuredClone(DEFAULT_VARIANT_GROUPS), [], 'TS'))
  const [variantIdentifiersReady, setVariantIdentifiersReady] = useState(false)
  const [salesCodeMode, setSalesCodeMode] = useState<SalesCodeMode>('manual')
  const [barcodeMode, setBarcodeMode] = useState<BarcodeMode>('manufacturer')
  const [salesSequencePrefix, setSalesSequencePrefix] = useState('A')
  const [salesSequenceStart, setSalesSequenceStart] = useState(1)
  const [salesSequenceDigits, setSalesSequenceDigits] = useState(3)
  const [salesSequenceOffset, setSalesSequenceOffset] = useState(0)
  const [skuDrafts, setSkuDrafts] = useState<SkuDraft[]>([])
  const [editingSkuDraftId, setEditingSkuDraftId] = useState<string | null>(null)
  const [taxCategory, setTaxCategory] = useState<TaxCategory>('standard')
  const [physicalTab, setPhysicalTab] = useState<PhysicalTab>('product')
  const [physicalFeedback, setPhysicalFeedback] = useState<string[]>([])
  const [packagingEnabled, setPackagingEnabled] = useState(false)
  const [sellUnits, setSellUnits] = useState<SellUnitDraft[]>([])
  const [bundleStockMode, setBundleStockMode] = useState<BundleStockMode>('virtual')
  const [bundleComponents, setBundleComponents] = useState<BundleComponentDraft[]>([])
  const [selectedBranchIds, setSelectedBranchIds] = useState<string[]>(() => branches.map((branch) => branch.id))
  const [inventoryFeedback, setInventoryFeedback] = useState<string[]>([])
  const [identifierFeedback, setIdentifierFeedback] = useState<Feedback>({ tone: 'info', text: 'ยังไม่ได้ตรวจ SKU Code, Sales Code และ Barcode' })
  const [identifierStatuses, setIdentifierStatuses] = useState<IdentifierStatusMap>({
    skuCode: { tone: 'info', text: 'ยังไม่ได้กรอกรหัสสินค้า' },
    salesCode: { tone: 'info', text: 'ยังไม่ได้กรอกรหัสขาย / รหัส CF' },
    barcode: { tone: 'info', text: 'ยังไม่ได้กำหนด Barcode' },
  })
  const [identifierSuggestions, setIdentifierSuggestions] = useState<Partial<Record<IdentifierStatusKey, string>>>({})
  const [draftHydrated, setDraftHydrated] = useState(false)
  const [summaryFields, setSummaryFields] = useState<ProductSummaryFields>({
    name: '', skuName: '', skuCode: '', salesCode: '', barcode: '', salePrice: '', baseUnitCode: 'piece',
    productWeightKg: '', productLengthCm: '', productWidthCm: '', productHeightCm: '', sellUnitName: '',
  })

  const localDraftKey = `avenzo:product-create:v${DRAFT_SCHEMA_VERSION}:${organizationId}`
  const pendingDraftKey = `${localDraftKey}:pending`

  useEffect(() => {
    if (!validationNoticeVisible) return
    const timeoutId = window.setTimeout(() => setValidationNoticeVisible(false), 6000)
    return () => window.clearTimeout(timeoutId)
  }, [validationNoticeVisible, validationIssues])

  useEffect(() => {
    const form = formRef.current
    if (!form) return
    try {
      const raw = window.localStorage.getItem(localDraftKey)
      if (raw) {
        const saved = JSON.parse(raw) as { fields?: Record<string, string>; categoryId?: string; brandId?: string; tagIds?: string[]; structure?: StructureType; useProductNameForSku?: boolean; packagingEnabled?: boolean; sellUnits?: unknown; bundleStockMode?: BundleStockMode; bundleComponents?: unknown; selectedBranchIds?: unknown; skuDrafts?: unknown; salesSequenceOffset?: unknown; variantGroups?: unknown; variantCombinations?: unknown }
        for (const [name, value] of Object.entries(saved.fields ?? {})) {
          const field = form.elements.namedItem(name)
          if (field instanceof HTMLInputElement || field instanceof HTMLTextAreaElement || field instanceof HTMLSelectElement) field.value = value
        }
        if (saved.categoryId) setCategoryId(saved.categoryId)
        if (saved.brandId) setBrandId(saved.brandId)
        if (Array.isArray(saved.tagIds)) setTagIds(saved.tagIds.slice(0, 12))
        if (saved.structure) setStructure(saved.structure)
        if (typeof saved.useProductNameForSku === 'boolean') setUseProductNameForSku(saved.useProductNameForSku)
        if (saved.fields?.variantOptionOne) setVariantOptionOne(saved.fields.variantOptionOne.slice(0, 60))
        if (saved.fields?.variantOptionTwo) setVariantOptionTwo(saved.fields.variantOptionTwo.slice(0, 60))
        const restoredVariantGroups = sanitizeVariantGroups(saved.variantGroups)
        setVariantGroups(restoredVariantGroups)
        setVariantCombinations(synchronizeVariantCombinations(restoredVariantGroups, sanitizeVariantCombinations(saved.variantCombinations), 'TS'))
        if (['manual', 'same-sku', 'sequence'].includes(saved.fields?.salesCodeMode ?? '')) setSalesCodeMode(saved.fields?.salesCodeMode as SalesCodeMode)
        if (['manufacturer', 'internal-sku', 'internal-sales', 'none'].includes(saved.fields?.barcodeMode ?? '')) setBarcodeMode(saved.fields?.barcodeMode as BarcodeMode)
        if (saved.fields?.salesSequencePrefix) setSalesSequencePrefix(saved.fields.salesSequencePrefix.slice(0, 10))
        if (saved.fields?.salesSequenceStart) setSalesSequenceStart(Number(saved.fields.salesSequenceStart) || 0)
        if (saved.fields?.salesSequenceDigits) setSalesSequenceDigits(Number(saved.fields.salesSequenceDigits) || 3)
        if (Number.isInteger(saved.salesSequenceOffset) && Number(saved.salesSequenceOffset) >= 0) setSalesSequenceOffset(Number(saved.salesSequenceOffset))
        setSkuDrafts(sanitizeSkuDrafts(saved.skuDrafts))
        if (['standard', 'zero', 'exempt'].includes(saved.fields?.taxCategory ?? '')) setTaxCategory(saved.fields?.taxCategory as TaxCategory)
        setPackagingEnabled(saved.packagingEnabled === true)
        setSellUnits(sanitizeSellUnitDrafts(saved.sellUnits))
        if (saved.bundleStockMode === 'virtual' || saved.bundleStockMode === 'assembled') setBundleStockMode(saved.bundleStockMode)
        setBundleComponents(sanitizeBundleComponentDrafts(saved.bundleComponents, bundleSkus))
        if (Array.isArray(saved.selectedBranchIds)) {
          const allowedBranchIds = new Set(branches.map((branch) => branch.id))
          setSelectedBranchIds(saved.selectedBranchIds.flatMap((value) => typeof value === 'string' && allowedBranchIds.has(value) ? [value] : []))
        }
        setSummaryFields(readProductSummaryFields(form))
      }
      const pendingRaw = window.localStorage.getItem(pendingDraftKey)
      if (pendingRaw) {
        const restored = sanitizePendingDraft(JSON.parse(pendingRaw))
        if (restored) setPendingDraft(restored)
        else window.localStorage.removeItem(pendingDraftKey)
      }
    } catch {
      window.localStorage.removeItem(localDraftKey)
      window.localStorage.removeItem(pendingDraftKey)
    } finally {
      setDraftHydrated(true)
    }
  }, [localDraftKey, pendingDraftKey])

  useEffect(() => {
    if (!draftHydrated) return
    saveBrowserDraft(false)
  }, [
    barcodeMode, brandId, bundleComponents, bundleStockMode, categoryId, draftHydrated,
    packagingEnabled, salesCodeMode, salesSequenceDigits, salesSequenceOffset,
    salesSequencePrefix, salesSequenceStart, selectedBranchIds, sellUnits, skuDrafts,
    structure, summaryFields, tagIds, taxCategory, useProductNameForSku,
    variantCombinations, variantGroups, variantOptionOne, variantOptionTwo,
  ])

  useEffect(() => {
    if (!draftSaveNotice) return
    setDraftSaveSeconds(10)
    const intervalId = window.setInterval(() => setDraftSaveSeconds((current) => Math.max(0, current - 1)), 1000)
    const timeoutId = window.setTimeout(() => {
      setDraftSaveNotice('')
      setDraftSaveSeconds(0)
    }, 10000)
    return () => {
      window.clearInterval(intervalId)
      window.clearTimeout(timeoutId)
    }
  }, [draftSaveNotice, draftSaveRevision])

  useEffect(() => () => {
    if (identifierAutoCheckTimerRef.current !== null) window.clearTimeout(identifierAutoCheckTimerRef.current)
    for (const url of imageUrlsRef.current) URL.revokeObjectURL(url)
  }, [])

  useEffect(() => {
    if (!creationSuccess) return
    const previousOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    requestAnimationFrame(() => successDialogRef.current?.querySelector<HTMLElement>('.product-primary-action, a, button')?.focus())
    return () => {
      document.body.style.overflow = previousOverflow
      requestAnimationFrame(() => successReturnFocusRef.current?.focus())
    }
  }, [creationSuccess])

  useEffect(() => {
    if (salesCodeMode !== 'sequence') return
    const value = formatSalesSequence(salesSequencePrefix, salesSequenceStart, salesSequenceDigits, salesSequenceOffset)
    setFormFieldValue('salesCode', value)
    if (barcodeMode === 'internal-sales') setFormFieldValue('barcode', value)
  }, [barcodeMode, salesCodeMode, salesSequenceDigits, salesSequenceOffset, salesSequencePrefix, salesSequenceStart])

  function saveBrowserDraft(message = true, branchIds = selectedBranchIds, stagedSkus = skuDrafts, sequenceOffset = salesSequenceOffset, skuNameAuto = useProductNameForSku) {
    const form = formRef.current
    if (!form) return
    const fields: Record<string, string> = {}
    for (const [key, value] of new FormData(form)) {
      if (typeof value === 'string') fields[key] = value
    }
    const serializedDraft = JSON.stringify({
      fields, categoryId, brandId, tagIds, structure, useProductNameForSku: skuNameAuto,
      packagingEnabled, sellUnits, bundleStockMode, bundleComponents, selectedBranchIds: branchIds,
      skuDrafts: stagedSkus, salesSequenceOffset: sequenceOffset,
      variantGroups, variantCombinations, savedAt: new Date().toISOString(),
    })
    if (new TextEncoder().encode(serializedDraft).byteLength > DRAFT_MAX_BYTES) {
      setFeedback({ tone: 'danger', text: 'Browser Draft มีขนาดเกิน 256 KB กรุณาลดข้อมูลก่อนบันทึกร่าง' })
      return
    }
    window.localStorage.setItem(localDraftKey, serializedDraft)
    if (message) {
      const notice = 'บันทึกข้อมูลชั่วคราวในเครื่องนี้แล้ว · รูปภาพจะไม่ถูกเก็บและต้องเลือกใหม่หลัง F5'
      setFeedback(null)
      setDraftSaveNotice(notice)
      setDraftSaveRevision((current) => current + 1)
    }
  }

  function setFormFieldValue(name: string, value: string) {
    const form = formRef.current
    const field = form?.elements.namedItem(name)
    if (field instanceof HTMLInputElement || field instanceof HTMLTextAreaElement || field instanceof HTMLSelectElement) field.value = value
    if (form) setSummaryFields(readProductSummaryFields(form))
  }

  function currentIdentifierValues() {
    const form = formRef.current
    if (!form) return { skuCode: '', salesCode: '', barcode: '' }
    const data = new FormData(form)
    return {
      skuCode: formString(data, 'skuCode').toUpperCase(),
      salesCode: formString(data, 'salesCode').toUpperCase(),
      barcode: formString(data, 'barcode'),
    }
  }

  function identifierStatusForValue(value: string, emptyText: string, activeText: string, tone: Feedback['tone'] = 'info'): Feedback {
    return value ? { tone, text: activeText } : { tone: 'info', text: emptyText }
  }

  function markIdentifierStatusesPending(text = 'รอตรวจสอบรหัส') {
    const values = currentIdentifierValues()
    setIdentifierStatuses({
      skuCode: identifierStatusForValue(values.skuCode, 'ยังไม่ได้กรอกรหัสสินค้า', text),
      salesCode: identifierStatusForValue(values.salesCode, 'ไม่ได้ใช้รหัสขาย / รหัส CF', text),
      barcode: identifierStatusForValue(values.barcode, 'ไม่ได้ใช้ Barcode', text),
    })
  }

  function markIdentifierStatusesChecking(values = currentIdentifierValues()) {
    setIdentifierStatuses({
      skuCode: identifierStatusForValue(values.skuCode, 'ยังไม่ได้กรอกรหัสสินค้า', 'กำลังตรวจสอบ…'),
      salesCode: identifierStatusForValue(values.salesCode, 'ไม่ได้ใช้รหัสขาย / รหัส CF', 'กำลังตรวจสอบ…'),
      barcode: identifierStatusForValue(values.barcode, 'ไม่ได้ใช้ Barcode', 'กำลังตรวจสอบ…'),
    })
  }

  function applyIdentifierStatuses(values: ReturnType<typeof currentIdentifierValues>, collisions: IdentifierCollision[]) {
    const collisionFields = new Set(collisions.map((collision) => collision.field))
    setIdentifierStatuses({
      skuCode: values.skuCode
        ? { tone: collisionFields.has('sku_code') ? 'danger' : 'success', text: collisionFields.has('sku_code') ? `รหัส ${values.skuCode} ถูกใช้แล้ว` : `รหัส ${values.skuCode} สามารถใช้ได้` }
        : { tone: 'danger', text: 'กรุณากรอกรหัสสินค้า' },
      salesCode: identifierStatusForValue(values.salesCode, 'ไม่ได้ใช้รหัสขาย / รหัส CF', collisionFields.has('sales_code') ? `รหัส ${values.salesCode} ถูกใช้แล้ว` : `รหัส ${values.salesCode} สามารถใช้ขายและรับ CF ได้`, collisionFields.has('sales_code') ? 'danger' : 'success'),
      barcode: identifierStatusForValue(values.barcode, 'ไม่ได้ใช้ Barcode', collisionFields.has('barcode') ? `Barcode ${values.barcode} ถูกใช้แล้ว` : `Barcode ${values.barcode} สามารถใช้ได้`, collisionFields.has('barcode') ? 'danger' : 'success'),
    })
    const suggestions: Partial<Record<IdentifierStatusKey, string>> = {}
    for (const collision of collisions) {
      const suggestionKey: IdentifierStatusKey = collision.field === 'sku_code'
        ? 'skuCode'
        : collision.field === 'sales_code'
          ? salesCodeMode === 'same-sku' ? 'skuCode' : 'salesCode'
          : barcodeMode === 'internal-sku'
            ? 'skuCode'
            : barcodeMode === 'internal-sales'
              ? salesCodeMode === 'same-sku' ? 'skuCode' : 'salesCode'
              : 'barcode'
      suggestions[suggestionKey] = nextIdentifierCode(values[suggestionKey])
    }
    setIdentifierSuggestions(suggestions)
  }

  function useIdentifierSuggestion(field: IdentifierStatusKey) {
    const suggestion = identifierSuggestions[field]
    if (!suggestion) return
    if (field === 'skuCode') applySkuCodeValue(suggestion)
    else {
      setFormFieldValue(field, suggestion)
      if (field === 'salesCode' && salesCodeMode === 'sequence') setSalesSequenceOffset((current) => current + 1)
      if (field === 'salesCode' && barcodeMode === 'internal-sales') setFormFieldValue('barcode', suggestion)
      markIdentifierCheckStale()
    }
    scheduleIdentifierAutoCheck(0)
  }

  function markIdentifierStatusesFailed(message: string) {
    const values = currentIdentifierValues()
    setIdentifierStatuses({
      skuCode: identifierStatusForValue(values.skuCode, 'ยังไม่ได้กรอกรหัสสินค้า', message, 'danger'),
      salesCode: identifierStatusForValue(values.salesCode, 'ไม่ได้ใช้รหัสขาย / รหัส CF', message, 'danger'),
      barcode: identifierStatusForValue(values.barcode, 'ไม่ได้ใช้ Barcode', message, 'danger'),
    })
  }

  function identifierSignature(values = currentIdentifierValues()) {
    return `${values.skuCode}\u0000${values.salesCode}\u0000${values.barcode}`
  }

  function canAutoCheckIdentifiers(values = currentIdentifierValues()) {
    return Boolean(values.skuCode)
      && IDENTIFIER_CODE_PATTERN.test(values.skuCode)
      && (!values.salesCode || IDENTIFIER_CODE_PATTERN.test(values.salesCode))
      && values.skuCode.length <= 80
      && values.salesCode.length <= 80
      && values.barcode.length <= 128
      && ![values.skuCode, values.salesCode, values.barcode].filter(Boolean).some((value) => /[\u0000-\u001f\u007f]/.test(value))
  }

  function scheduleIdentifierAutoCheck(delay = IDENTIFIER_AUTO_CHECK_DEBOUNCE_MS) {
    if (!canManage) return
    if (identifierAutoCheckTimerRef.current !== null) window.clearTimeout(identifierAutoCheckTimerRef.current)
    const values = currentIdentifierValues()
    const signature = identifierSignature(values)
    if (!canAutoCheckIdentifiers(values) || signature === identifierAutoCheckLastSignatureRef.current) return
    const elapsed = Date.now() - identifierAutoCheckLastStartedAtRef.current
    const boundedDelay = Math.max(delay, IDENTIFIER_AUTO_CHECK_MIN_INTERVAL_MS - elapsed, 0)
    identifierAutoCheckTimerRef.current = window.setTimeout(() => {
      identifierAutoCheckTimerRef.current = null
      const latest = currentIdentifierValues()
      const latestSignature = identifierSignature(latest)
      if (!canAutoCheckIdentifiers(latest) || latestSignature === identifierAutoCheckLastSignatureRef.current) return
      identifierAutoCheckLastSignatureRef.current = latestSignature
      identifierAutoCheckLastStartedAtRef.current = Date.now()
      checkIdentifiers('auto')
    }, boundedDelay)
  }

  function markIdentifierCheckStale() {
    identifierCheckRequestRef.current += 1
    setIdentifierFeedback({ tone: 'info', text: 'ข้อมูลรหัสเปลี่ยนแล้ว กรุณาตรวจสอบอีกครั้งก่อนบันทึก' })
    setIdentifierSuggestions({})
    markIdentifierStatusesPending()
    scheduleIdentifierAutoCheck()
  }

  function clearIdentifierValidationIssue() {
    const skuCodeField = formRef.current?.elements.namedItem('skuCode')
    if (skuCodeField instanceof HTMLElement) {
      skuCodeField.removeAttribute('data-validation-invalid')
      skuCodeField.removeAttribute('aria-invalid')
    }
    setValidationIssues((current) => current.filter((issue) => !(issue.sectionId === 'sku' && issue.label === 'ตรวจสอบรหัส')))
  }

  function syncProductNameToSku() {
    const productName = formRef.current?.elements.namedItem('name')
    if (productName instanceof HTMLInputElement) setFormFieldValue('skuName', productName.value)
  }

  function applySkuCodeValue(rawValue: string) {
    const value = rawValue.trim().toUpperCase()
    setFormFieldValue('skuCode', value)
    if (salesCodeMode === 'same-sku') setFormFieldValue('salesCode', value)
    if (barcodeMode === 'internal-sku') setFormFieldValue('barcode', value)
    if (barcodeMode === 'internal-sales' && salesCodeMode === 'same-sku') setFormFieldValue('barcode', value)
    markIdentifierCheckStale()
  }

  function generateAndCheckIdentifierGroup() {
    if (!canManage || isIdentifierChecking) return
    const generatedBase = generateCode(summaryFields.name, 'SKU')
    const current = currentIdentifierValues()
    const requestId = identifierCheckRequestRef.current + 1
    identifierCheckRequestRef.current = requestId
    setIdentifierFeedback({ tone: 'info', text: 'กำลังสร้างและตรวจสอบรหัสสินค้าที่ใช้ได้…' })

    startIdentifierCheck(async () => {
      for (let offset = 0; offset < 25; offset += 1) {
        const skuCode = generatedCodeCandidate(generatedBase, offset)
        const salesCode = salesCodeMode === 'same-sku'
          ? skuCode
          : salesCodeMode === 'sequence'
            ? formatSalesSequence(salesSequencePrefix, salesSequenceStart, salesSequenceDigits, salesSequenceOffset)
            : current.salesCode
        const barcode = barcodeMode === 'internal-sku'
          ? skuCode
          : barcodeMode === 'internal-sales'
            ? salesCode
            : current.barcode
        markIdentifierStatusesChecking({ skuCode, salesCode, barcode })
        const result = await checkProductIdentifiersAction({ organizationId, skuCode, salesCode, barcode })
        if (identifierCheckRequestRef.current !== requestId) return

        if (!result.ok) {
          markIdentifierStatusesFailed('ตรวจสอบรหัสไม่สำเร็จ กรุณาลองอีกครั้ง')
          setIdentifierFeedback({
            tone: 'danger',
            text: result.error === 'authentication_required'
              ? 'Session หมดอายุ กรุณาเข้าสู่ระบบใหม่แล้วลองสร้างรหัสอีกครั้ง'
              : result.error === 'permission_denied' || result.error === 'tenant_access_denied'
                ? 'บัญชีนี้ไม่มีสิทธิ์ตรวจรหัสของ Organization'
                : result.error === 'validation_failed'
                  ? 'ระบบสร้างรหัสที่มีรูปแบบไม่ถูกต้อง กรุณากรอกรหัสเองหรือลองใหม่'
                  : 'สร้างและตรวจสอบรหัสไม่สำเร็จ กรุณาลองใหม่อีกครั้ง',
          })
          return
        }

        const derivedFields = new Set(['sku_code'])
        if (salesCodeMode === 'same-sku') derivedFields.add('sales_code')
        if (barcodeMode === 'internal-sku' || (barcodeMode === 'internal-sales' && salesCodeMode === 'same-sku')) derivedFields.add('barcode')
        const independentCollisions = result.data.collisions.filter((collision) => !derivedFields.has(collision.field))
        if (independentCollisions.length) {
          applyIdentifierStatuses({ skuCode, salesCode, barcode }, result.data.collisions)
          const collisions = independentCollisions.map((collision) => `${identifierFieldLabels[collision.field]} ${collision.value}`).join(', ')
          setIdentifierFeedback({ tone: 'danger', text: `รหัสสินค้าสร้างได้ แต่พบรหัสที่กรอกแยกไว้ซ้ำ: ${collisions} กรุณาแก้รหัสดังกล่าวแล้วลองอีกครั้ง` })
          return
        }
        if (result.data.collisions.length) continue

        setFormFieldValue('skuCode', skuCode)
        if (salesCodeMode === 'same-sku' || salesCodeMode === 'sequence') setFormFieldValue('salesCode', salesCode)
        if (barcodeMode === 'internal-sku' || barcodeMode === 'internal-sales') setFormFieldValue('barcode', barcode)
        applyIdentifierStatuses({ skuCode, salesCode, barcode }, [])
        clearIdentifierValidationIssue()
        setIdentifierFeedback({ tone: 'success', text: `สร้างและตรวจสอบรหัสทั้งหมดแล้ว · SKU ${skuCode}${salesCode ? ` · รหัสขาย/CF ${salesCode}` : ''}${barcode ? ` · Barcode ${barcode}` : ''} · ระบบจะตรวจซ้ำตอนบันทึกจริง` })
        return
      }
      markIdentifierStatusesFailed('ระบบยังหารหัสที่ว่างไม่ได้ กรุณากรอกรหัสเอง')
      setIdentifierFeedback({ tone: 'danger', text: 'รหัสที่ระบบลองสร้าง 25 รายการถูกใช้แล้ว กรุณากรอกรหัสสินค้าเองแล้วกดตรวจสอบรหัส' })
    })
  }

  function applySkuNameSuggestion() {
    const suggestion = [summaryFields.name, variantOptionOne.trim(), variantOptionTwo.trim()].filter(Boolean).join(' · ')
    if (suggestion) setFormFieldValue('skuName', suggestion)
  }

  function applySalesCodeMode(mode: SalesCodeMode) {
    setSalesCodeMode(mode)
    if (mode === 'same-sku') {
      const skuCode = formRef.current?.elements.namedItem('skuCode')
      if (skuCode instanceof HTMLInputElement) {
        const value = skuCode.value.toUpperCase()
        setFormFieldValue('salesCode', value)
        if (barcodeMode === 'internal-sales') setFormFieldValue('barcode', value)
      }
    } else if (mode === 'sequence') {
      setFormFieldValue('salesCode', formatSalesSequence(salesSequencePrefix, salesSequenceStart, salesSequenceDigits, salesSequenceOffset))
    }
    markIdentifierCheckStale()
  }

  function applyBarcodeMode(mode: BarcodeMode) {
    setBarcodeMode(mode)
    const form = formRef.current
    const skuCode = form?.elements.namedItem('skuCode')
    const salesCode = form?.elements.namedItem('salesCode')
    if (mode === 'internal-sku' && skuCode instanceof HTMLInputElement) setFormFieldValue('barcode', skuCode.value.toUpperCase())
    if (mode === 'internal-sales' && salesCode instanceof HTMLInputElement) setFormFieldValue('barcode', salesCode.value.toUpperCase())
    if (mode === 'none') setFormFieldValue('barcode', '')
    markIdentifierCheckStale()
  }

  function checkIdentifiers(source: 'manual' | 'auto' = 'manual') {
    if (source === 'manual' && identifierAutoCheckTimerRef.current !== null) {
      window.clearTimeout(identifierAutoCheckTimerRef.current)
      identifierAutoCheckTimerRef.current = null
    }
    const { skuCode, salesCode, barcode } = currentIdentifierValues()
    const invalid = [skuCode, salesCode, barcode].filter(Boolean).some((value) => /[\u0000-\u001f\u007f]/.test(value))
    if (!skuCode) {
      setIdentifierStatuses((current) => ({ ...current, skuCode: { tone: 'danger', text: 'กรุณากรอกรหัสสินค้า' } }))
      setIdentifierFeedback({ tone: 'danger', text: 'กรุณากรอก SKU Code ก่อนตรวจสอบรหัส' })
    } else if (invalid || !IDENTIFIER_CODE_PATTERN.test(skuCode) || (salesCode && !IDENTIFIER_CODE_PATTERN.test(salesCode)) || skuCode.length > 80 || salesCode.length > 80 || barcode.length > 128) {
      markIdentifierStatusesFailed('รูปแบบหรือความยาวรหัสไม่ถูกต้อง')
      setIdentifierFeedback({ tone: 'danger', text: 'พบรูปแบบหรือความยาวรหัสที่ไม่อนุญาต กรุณาแก้ไขก่อนบันทึก' })
    } else {
      identifierAutoCheckLastSignatureRef.current = identifierSignature({ skuCode, salesCode, barcode })
      identifierAutoCheckLastStartedAtRef.current = Date.now()
      const requestId = identifierCheckRequestRef.current + 1
      identifierCheckRequestRef.current = requestId
      setIdentifierFeedback({ tone: 'info', text: 'กำลังตรวจรหัสกับข้อมูลของ Organization…' })
      markIdentifierStatusesChecking({ skuCode, salesCode, barcode })
      startIdentifierCheck(async () => {
        const result = await checkProductIdentifiersAction({ organizationId, skuCode, salesCode, barcode })
        if (identifierCheckRequestRef.current !== requestId) return
        const latest = currentIdentifierValues()
        if (latest.skuCode !== skuCode || latest.salesCode !== salesCode || latest.barcode !== barcode) {
          markIdentifierCheckStale()
          return
        }
        if (!result.ok) {
          markIdentifierStatusesFailed('ตรวจสอบรหัสไม่สำเร็จ กรุณาลองอีกครั้ง')
          setIdentifierFeedback({
            tone: 'danger',
            text: result.error === 'authentication_required'
              ? 'Session หมดอายุ กรุณาเข้าสู่ระบบใหม่แล้วตรวจอีกครั้ง'
              : result.error === 'permission_denied' || result.error === 'tenant_access_denied'
                ? 'บัญชีนี้ไม่มีสิทธิ์ตรวจรหัสของ Organization'
                : result.error === 'validation_failed'
                  ? 'รูปแบบรหัสไม่ถูกต้อง กรุณาตรวจ SKU Code, Sales Code และ Barcode'
                  : 'ตรวจรหัสไม่สำเร็จ กรุณาลองใหม่อีกครั้ง',
          })
          return
        }
        if (result.data.collisions.length) {
          applyIdentifierStatuses({ skuCode, salesCode, barcode }, result.data.collisions)
          const collisions = result.data.collisions
            .map((collision) => `${identifierFieldLabels[collision.field]} ${collision.value}`)
            .join(', ')
          setIdentifierFeedback({ tone: 'danger', text: `พบรหัสที่ถูกใช้แล้ว: ${collisions}` })
          return
        }
        applyIdentifierStatuses({ skuCode, salesCode, barcode }, [])
        clearIdentifierValidationIssue()
        setIdentifierFeedback({ tone: 'success', text: `ไม่พบรหัสซ้ำใน Organization ${result.data.checked} ค่า · Server transaction จะตรวจซ้ำตอนบันทึกจริง` })
      })
    }
  }

  function currentSkuDraft(): SkuDraft {
    const form = formRef.current
    const data = form ? new FormData(form) : new FormData()
    return {
      id: editingSkuDraftId ?? crypto.randomUUID(),
      name: formString(data, 'skuName').normalize('NFKC').slice(0, 160),
      skuCode: formString(data, 'skuCode').normalize('NFKC').toUpperCase().slice(0, 80),
      salesCode: formString(data, 'salesCode').normalize('NFKC').toUpperCase().slice(0, 80),
      barcode: formString(data, 'barcode').normalize('NFKC').slice(0, 128),
      baseUnitCode: formString(data, 'baseUnitCode'),
      status: 'draft',
    }
  }

  function skuDraftValidationErrors(record: SkuDraft) {
    const errors: string[] = []
    if (!record.name) errors.push('ชื่อรุ่น / ตัวเลือกสินค้า')
    if (FORBIDDEN_CONTROL_CHARACTERS.test(record.name)) errors.push('ชื่อ SKU มีอักขระควบคุมที่ไม่อนุญาต')
    if (structure === 'variant' && !editingSkuDraftId && !variantOptionOne.trim() && !variantOptionTwo.trim()) errors.push('Variant ต้องมีตัวเลือกอย่างน้อย 1 ค่า')
    if (!record.skuCode) errors.push('SKU Code')
    else if (!IDENTIFIER_CODE_PATTERN.test(record.skuCode)) errors.push('รูปแบบ SKU Code ไม่ถูกต้อง')
    if (record.salesCode && !IDENTIFIER_CODE_PATTERN.test(record.salesCode)) errors.push('รูปแบบ Sales Code ไม่ถูกต้อง')
    if (record.barcode && FORBIDDEN_CONTROL_CHARACTERS.test(record.barcode)) errors.push('Barcode มีอักขระควบคุมที่ไม่อนุญาต')
    if (!BASE_UNIT_CODES.has(record.baseUnitCode)) errors.push('Base Unit ไม่ถูกต้อง')
    if (!editingSkuDraftId && skuDrafts.length >= SKU_DRAFT_MAX_ITEMS) errors.push(`เก็บ SKU ได้สูงสุด ${SKU_DRAFT_MAX_ITEMS} รายการต่อ Browser Draft`)

    const otherIdentifiers = new Set(
      skuDrafts
        .filter((item) => item.id !== editingSkuDraftId)
        .flatMap((item) => [item.skuCode, item.salesCode, item.barcode])
        .filter(Boolean)
        .map((value) => value.toLocaleUpperCase('en-US')),
    )
    const currentIdentifiers = [
      ['SKU Code', record.skuCode],
      ['Sales Code', record.salesCode],
      ['Barcode', record.barcode],
    ] as const
    for (const [label, value] of currentIdentifiers) {
      if (value && otherIdentifiers.has(value.toLocaleUpperCase('en-US'))) errors.push(`${label} ซ้ำในรายการ: ${value}`)
    }
    return errors
  }

  function resetCurrentSkuEditor({ advanceSequence = false, nextSequenceOffset = salesSequenceOffset } = {}) {
    skuDraftCheckRequestRef.current += 1
    setEditingSkuDraftId(null)
    setVariantOptionOne('')
    setVariantOptionTwo('')
    setUseProductNameForSku(true)
    const productName = formRef.current?.elements.namedItem('name')
    setFormFieldValue('skuName', productName instanceof HTMLInputElement ? productName.value : '')
    setFormFieldValue('skuCode', '')

    const resolvedOffset = advanceSequence ? nextSequenceOffset : salesSequenceOffset
    if (salesCodeMode === 'sequence') setFormFieldValue('salesCode', formatSalesSequence(salesSequencePrefix, salesSequenceStart, salesSequenceDigits, resolvedOffset))
    else setFormFieldValue('salesCode', '')

    if (barcodeMode === 'manufacturer' || barcodeMode === 'none') setFormFieldValue('barcode', '')
    else if (barcodeMode === 'internal-sales' && salesCodeMode === 'sequence') setFormFieldValue('barcode', formatSalesSequence(salesSequencePrefix, salesSequenceStart, salesSequenceDigits, resolvedOffset))
    else setFormFieldValue('barcode', '')
    markIdentifierCheckStale()
  }

  function storeCurrentSkuDraft() {
    if (!canManage || isSkuDraftChecking) return
    const record = currentSkuDraft()
    const errors = skuDraftValidationErrors(record)
    if (errors.length) {
      setIdentifierFeedback({ tone: 'danger', text: `ยังเก็บ SKU ไม่ได้: ${errors.join(' · ')}` })
      return
    }

    const requestId = skuDraftCheckRequestRef.current + 1
    skuDraftCheckRequestRef.current = requestId
    setIdentifierFeedback({ tone: 'info', text: 'กำลังตรวจรหัสก่อนเก็บ SKU ใน Browser Draft…' })
    startSkuDraftCheck(async () => {
      const result = await checkProductIdentifiersAction({
        organizationId,
        skuCode: record.skuCode,
        salesCode: record.salesCode,
        barcode: record.barcode,
      })
      if (skuDraftCheckRequestRef.current !== requestId) return
      const latest = currentSkuDraft()
      if (latest.name !== record.name || latest.skuCode !== record.skuCode || latest.salesCode !== record.salesCode || latest.barcode !== record.barcode || latest.baseUnitCode !== record.baseUnitCode) {
        setIdentifierFeedback({ tone: 'info', text: 'ข้อมูล SKU เปลี่ยนระหว่างตรวจ กรุณากดเก็บ SKU อีกครั้ง' })
        return
      }
      if (!result.ok) {
        setIdentifierFeedback({
          tone: 'danger',
          text: result.error === 'authentication_required'
            ? 'Session หมดอายุ กรุณาเข้าสู่ระบบใหม่ก่อนเก็บ SKU'
            : result.error === 'permission_denied' || result.error === 'tenant_access_denied'
              ? 'บัญชีนี้ไม่มีสิทธิ์ตรวจและเก็บ SKU ของ Organization'
              : result.error === 'validation_failed'
                ? 'รูปแบบรหัสไม่ถูกต้อง กรุณาตรวจ SKU Code, Sales Code และ Barcode'
                : 'ตรวจรหัสก่อนเก็บ SKU ไม่สำเร็จ กรุณาลองใหม่อีกครั้ง',
        })
        return
      }
      if (result.data.collisions.length) {
        const collisions = result.data.collisions.map((collision) => `${identifierFieldLabels[collision.field]} ${collision.value}`).join(', ')
        setIdentifierFeedback({ tone: 'danger', text: `ยังเก็บ SKU ไม่ได้ พบรหัสที่ถูกใช้แล้ว: ${collisions}` })
        return
      }

      const editingIndex = skuDrafts.findIndex((item) => item.id === editingSkuDraftId)
      const nextDrafts = editingIndex >= 0
        ? skuDrafts.map((item, index) => index === editingIndex ? record : item)
        : [...skuDrafts, record]
      const nextOffset = salesCodeMode === 'sequence' && editingIndex < 0 ? salesSequenceOffset + 1 : salesSequenceOffset
      setSkuDrafts(nextDrafts)
      setSalesSequenceOffset(nextOffset)
      resetCurrentSkuEditor({ advanceSequence: salesCodeMode === 'sequence' && editingIndex < 0, nextSequenceOffset: nextOffset })
      requestAnimationFrame(() => saveBrowserDraft(false, selectedBranchIds, nextDrafts, nextOffset, true))
      setIdentifierFeedback({ tone: 'success', text: editingIndex >= 0 ? 'อัปเดต SKU ในรายการแล้ว' : 'เก็บ SKU แล้ว พร้อมกรอกรายการถัดไป' })
    })
  }

  function editSkuDraft(id: string) {
    if (isSkuDraftChecking) return
    const record = skuDrafts.find((item) => item.id === id)
    if (!record) return
    skuDraftCheckRequestRef.current += 1
    setEditingSkuDraftId(id)
    setUseProductNameForSku(false)
    setVariantOptionOne('')
    setVariantOptionTwo('')
    setFormFieldValue('skuName', record.name)
    setFormFieldValue('skuCode', record.skuCode)
    setSalesCodeMode('manual')
    setFormFieldValue('salesCode', record.salesCode)
    setBarcodeMode(record.barcode ? 'manufacturer' : 'none')
    setFormFieldValue('barcode', record.barcode)
    setFormFieldValue('baseUnitCode', record.baseUnitCode)
    markIdentifierCheckStale()
    setIdentifierFeedback({ tone: 'info', text: `กำลังแก้ไข SKU ${record.skuCode} · กด “บันทึกการแก้ไข SKU” เมื่อเสร็จ` })
    requestAnimationFrame(() => {
      const field = formRef.current?.elements.namedItem('skuName')
      if (field instanceof HTMLInputElement) field.focus()
    })
  }

  function removeSkuDraft(id: string) {
    if (isSkuDraftChecking) return
    const removed = skuDrafts.find((item) => item.id === id)
    const nextDrafts = skuDrafts.filter((item) => item.id !== id)
    setSkuDrafts(nextDrafts)
    if (editingSkuDraftId === id) {
      resetCurrentSkuEditor()
      requestAnimationFrame(() => saveBrowserDraft(false, selectedBranchIds, nextDrafts, salesSequenceOffset, true))
    } else saveBrowserDraft(false, selectedBranchIds, nextDrafts, salesSequenceOffset)
    setIdentifierFeedback({ tone: 'info', text: removed ? `ลบ SKU ${removed.skuCode} ออกจาก Browser Draft แล้ว` : 'ลบ SKU ออกจาก Browser Draft แล้ว' })
  }

  function selectImages(files: FileList | null) {
    if (!files) return
    try {
      const nextFiles = Array.from(files)
      if (images.length + nextFiles.length > PRODUCT_IMAGE_MAX_FILES) throw new Error('too_many')
      nextFiles.forEach(validateProductImageFile)
      const next = nextFiles.map((file) => {
        const previewUrl = URL.createObjectURL(file)
        imageUrlsRef.current.push(previewUrl)
        return { id: crypto.randomUUID(), file, previewUrl, stage: 'selected' as const }
      })
      setImages((current) => [...current, ...next])
      setImageFeedback({ tone: 'success', text: `เลือกภาพจากเครื่องแล้ว ${next.length} ภาพ` })
      setFeedback(null)
    } catch {
      const message = 'เลือกได้ 1–9 ภาพ เฉพาะ JPEG, PNG หรือ WebP และไม่เกิน 5 MB ต่อภาพ'
      setImageFeedback({ tone: 'danger', text: message })
      setFeedback({ tone: 'danger', text: message })
    }
  }

  function removeImage(id: string) {
    const remaining = Math.max(0, images.length - 1)
    setImages((current) => {
      const found = current.find((image) => image.id === id)
      if (found) URL.revokeObjectURL(found.previewUrl)
      return current.filter((image) => image.id !== id)
    })
    setVariantCombinations((current) => current.map((item) => item.imageId === id ? { ...item, imageId: '' } : item))
    setImageFeedback({ tone: 'info', text: remaining ? `เหลือรูปสินค้า ${remaining} ภาพ` : 'นำรูปสินค้าออกแล้ว กรุณาเลือกอย่างน้อย 1 ภาพ' })
  }

  function moveImage(index: number, direction: -1 | 1) {
    setImages((current) => {
      const target = index + direction
      if (target < 0 || target >= current.length) return current
      const copy = [...current]
      ;[copy[index], copy[target]] = [copy[target], copy[index]]
      return copy
    })
  }

  function setCoverImage(index: number) {
    if (index === 0) return
    setImages((current) => {
      if (!current[index]) return current
      const copy = [...current]
      const [cover] = copy.splice(index, 1)
      copy.unshift(cover)
      return copy
    })
    setImageFeedback({ tone: 'success', text: 'ตั้งภาพปกใหม่แล้ว ภาพนี้จะอัปโหลดเป็นลำดับแรก' })
  }

  function createAndSelectTagNames(rawNames: string[]) {
    if (isTagPending || !canManage) return
    const availableSlots = Math.max(0, 12 - tagIds.length)
    const names = [...new Map(rawNames.map(sanitizeTagName).filter(Boolean).map((name) => [name.toLocaleLowerCase('th-TH'), name])).values()].slice(0, availableSlots)
    if (!names.length) {
      setFeedback({ tone: 'info', text: availableSlots ? 'ยังไม่มี Tag ใหม่ให้เพิ่ม' : 'เลือก Tags ได้สูงสุด 12 รายการ' })
      return
    }

    startTagTransition(async () => {
      let nextTags = [...tags]
      const nextIds = [...tagIds]
      let createdCount = 0
      for (const name of names) {
        let match = nextTags.find((tag) => tag.status !== 'archived' && tag.name.localeCompare(name, 'th', { sensitivity: 'base' }) === 0)
        if (!match) {
          const result = await executeFoundationCommandAction({
            kind: 'entity', commandId: crypto.randomUUID(), organizationId,
            commandType: 'product.master.upsert',
            payload: { master_kind: 'tag', name, status: 'active' },
          })
          if (!result.ok || typeof result.data.entity_id !== 'string' || typeof result.data.version !== 'number') {
            setTags(nextTags)
            setTagIds(nextIds)
            setFeedback({ tone: 'danger', text: errorLabels[result.ok ? '' : result.error] ?? `สร้าง Tag “${name}” ไม่สำเร็จ` })
            return
          }
          match = { id: result.data.entity_id, name, status: 'active', version: result.data.version }
          nextTags = [...nextTags, match]
          createdCount += 1
        }
        if (!nextIds.includes(match.id) && nextIds.length < 12) nextIds.push(match.id)
      }
      setTags(nextTags)
      setTagIds(nextIds)
      setTagInput('')
      setFeedback({ tone: 'success', text: `เพิ่ม Tags ${names.length} รายการ${createdCount ? ` · สร้างใหม่ ${createdCount} รายการ` : ''}` })
    })
  }

  function suggestTags() {
    if (!suggestedTagNames.length) {
      setFeedback({ tone: 'info', text: 'ยังไม่พบคำสำคัญใหม่จากชื่อสินค้า' })
      return
    }
    createAndSelectTagNames(suggestedTagNames)
  }

  function selectSavedTagFromInput() {
    const normalized = sanitizeTagName(tagInput)
    if (!normalized) return
    createAndSelectTagNames([normalized])
  }

  function setImageStage(id: string, stage: UploadStage) {
    setImages((current) => current.map((image) => image.id === id ? { ...image, stage } : image))
  }

  async function uploadImages(productId: string, productName: string, existingReadyImageIds: Record<string, string> = {}) {
    const supabase = createClient()
    const readyIds: string[] = Object.values(existingReadyImageIds)
    const readyImageIdsByClientId: Record<string, string> = { ...existingReadyImageIds }
    let failedCount = 0

    for (let index = 0; index < images.length; index += 1) {
      const image = images[index]
      if (readyImageIdsByClientId[image.id]) {
        setImageStage(image.id, 'ready')
        continue
      }
      let reservation: PreparedProductImage | null = null
      setProgress(`กำลังอัปโหลดรูป ${index + 1} จาก ${images.length}`)
      setImageStage(image.id, 'preparing')
      try {
        const prepare = await executeFoundationCommandAction({
          kind: 'entity', commandId: crypto.randomUUID(), organizationId,
          commandType: 'product.image.prepare',
          payload: {
            product_id: productId,
            original_file_name: image.file.name,
            mime_type: image.file.type,
            file_size_bytes: image.file.size,
            alt_text: `${productName} รูปที่ ${index + 1}`.slice(0, 160),
          },
        })
        if (!prepare.ok) throw new Error(prepare.error)
        reservation = prepare.data as PreparedProductImage
        setImageStage(image.id, 'uploading')
        await uploadPreparedProductImage(supabase, reservation, image.file)
        setImageStage(image.id, 'finalizing')
        const finalize = await executeFoundationCommandAction({
          kind: 'entity', commandId: crypto.randomUUID(), organizationId,
          commandType: 'product.image.finalize',
          payload: { image_id: reservation.entity_id, expected_version: reservation.version },
        })
        if (!finalize.ok) throw new Error(finalize.error)
        readyIds.push(reservation.entity_id)
        readyImageIdsByClientId[image.id] = reservation.entity_id
        setImageStage(image.id, 'ready')
      } catch (error) {
        failedCount += 1
        setImageStage(image.id, 'failed')
        if (reservation) {
          await executeProductImageCleanupAction({
            kind: 'entity', commandId: crypto.randomUUID(), organizationId,
            commandType: 'product.image.fail',
            payload: {
              image_id: reservation.entity_id,
              expected_version: reservation.version,
              failure_reason: error instanceof Error ? error.message.slice(0, 500) : 'client_upload_failed',
            },
          })
        }
      }
    }

    if (readyIds.length > 0) {
      await executeFoundationCommandAction({
        kind: 'entity', commandId: crypto.randomUUID(), organizationId,
        commandType: 'product.images.reorder',
        payload: { product_id: productId, image_ids: readyIds, cover_image_id: readyIds[0] },
      })
    }
    return { failedCount, readyImageIdsByClientId }
  }

  async function assignVariantImages(recovery: PendingDraft, readyImageIdsByClientId: Record<string, string>) {
    const assignments = (recovery.variantSkus ?? []).flatMap((variant) => {
      const productImageId = readyImageIdsByClientId[variant.imageId]
      return productImageId ? [{ sku_id: variant.skuId, product_image_id: productImageId }] : []
    })
    if (assignments.length === 0) return true
    const commandIdKey = `${localDraftKey}:variant-image-command-id`
    const commandId = window.localStorage.getItem(commandIdKey) ?? crypto.randomUUID()
    window.localStorage.setItem(commandIdKey, commandId)
    const result = await executeFoundationCommandAction({
      kind: 'entity', commandId, organizationId,
      commandType: 'product.variant_images.assign',
      payload: { product_id: recovery.productId, assignments },
    })
    if (result.ok) window.localStorage.removeItem(commandIdKey)
    return result.ok
  }

  function addSellUnitPreset(kind: 'pair' | 'pack' | 'box' | 'case' | 'custom') {
    const presets = {
      pair: { name: 'คู่', unitCode: 'pair', baseQuantity: 2 },
      pack: { name: 'แพ็ค', unitCode: 'pack', baseQuantity: 6 },
      box: { name: 'กล่อง', unitCode: 'box', baseQuantity: 12 },
      case: { name: 'ลัง', unitCode: 'case', baseQuantity: 24 },
      custom: { name: `หน่วยขาย ${sellUnits.length + 1}`, unitCode: `sale_unit_${sellUnits.length + 1}`, baseQuantity: 2 },
    } as const
    const preset = presets[kind]
    if (sellUnits.length >= 50 || sellUnits.some((unit) => unit.unitCode === preset.unitCode)) return
    setSellUnits((current) => [...current, { id: crypto.randomUUID(), ...preset, barcode: '' }])
  }

  function updateSellUnit(id: string, patch: Partial<SellUnitDraft>) {
    setSellUnits((current) => current.map((unit) => unit.id === id ? { ...unit, ...patch } : unit))
  }

  function addBundleComponent() {
    if (bundleComponents.length >= 100) return
    const used = new Set(bundleComponents.map((component) => component.skuId))
    const next = bundleSkus.find((sku) => !used.has(sku.id))
    if (!next) return
    setBundleComponents((current) => [...current, { id: crypto.randomUUID(), skuId: next.id, quantity: 1 }])
  }

  function updateBundleComponent(id: string, patch: Partial<BundleComponentDraft>) {
    setBundleComponents((current) => current.map((component) => component.id === id ? { ...component, ...patch } : component))
  }

  function updateBranchSelection(branchId: string, checked: boolean) {
    const nextBranchIds = checked
      ? Array.from(new Set([...selectedBranchIds, branchId]))
      : selectedBranchIds.filter((id) => id !== branchId)
    setSelectedBranchIds(nextBranchIds)
    saveBrowserDraft(false, nextBranchIds)
  }

  function packagingBundleValidationErrors(quantityBehavior: string) {
    const errors: string[] = []
    if (packagingEnabled) {
      if (sellUnits.length === 0) errors.push('กรุณาเพิ่มหน่วยขายอย่างน้อย 1 รายการ')
      if (sellUnits.some((unit) => !unit.name.trim() || !/^[a-z][a-z0-9_]{0,31}$/.test(unit.unitCode))) errors.push('ชื่อและ Unit Code ของหน่วยขายไม่ถูกต้อง')
      if (sellUnits.some((unit) => !Number.isFinite(unit.baseQuantity) || unit.baseQuantity <= 1)) errors.push('ตัวคูณหน่วยขายต้องมากกว่า 1')
      if (quantityBehavior === 'discrete' && sellUnits.some((unit) => !Number.isInteger(unit.baseQuantity))) errors.push('สินค้าที่นับจำนวนเต็มต้องใช้ตัวคูณเป็นจำนวนเต็ม')
      if (new Set(sellUnits.map((unit) => unit.unitCode)).size !== sellUnits.length) errors.push('Unit Code ของหน่วยขายต้องไม่ซ้ำกัน')
      const barcodes = sellUnits.map((unit) => unit.barcode.trim()).filter(Boolean)
      if (new Set(barcodes).size !== barcodes.length) errors.push('Barcode ของหน่วยขายต้องไม่ซ้ำกัน')
    }
    if (structure === 'bundle') {
      if (bundleStockMode === 'assembled') errors.push('Pre-assembled Bundle ยังต้องใช้ Assembly Command ซึ่งไม่อยู่ใน R7.1')
      if (bundleComponents.length < 2) errors.push('Bundle ต้องมีอย่างน้อย 2 Components')
      if (new Set(bundleComponents.map((component) => component.skuId)).size !== bundleComponents.length) errors.push('Bundle มี Component SKU ซ้ำ')
      if (bundleComponents.some((component) => !Number.isFinite(component.quantity) || component.quantity <= 0)) errors.push('จำนวน Component ต้องมากกว่า 0')
    }
    return errors
  }

  function hasNoSelectedSalesBranch() {
    return branches.length > 0 && selectedBranchIds.length === 0
  }

  function buildPayload(data: FormData) {
    const initialSku = skuDrafts[0]
    const commonPayload = {
      name: formString(data, 'name'),
      description: formString(data, 'description'),
      category_id: categoryId,
      brand_id: brandId || undefined,
      structure_type: structure,
      internal_note: formString(data, 'internalNote'),
      tag_ids: tagIds,
      base_unit_code: structure === 'variant' ? formString(data, 'baseUnitCode') : initialSku?.baseUnitCode ?? formString(data, 'baseUnitCode'),
      quantity_behavior: formString(data, 'quantityBehavior'),
      sale_price: structure === 'variant'
        ? optionalNumber(variantCombinations.find((variant) => variant.enabled)?.price ?? null)
        : optionalNumber(data.get('salePrice')),
      cost_price: optionalNumber(data.get('costPrice')),
      currency_code: 'THB',
      tax_category: formString(data, 'taxCategory'),
      tax_rate: optionalNumber(data.get('taxRate')),
      product_weight_kg: optionalNumber(data.get('productWeightKg')),
      product_length_cm: optionalNumber(data.get('productLengthCm')),
      product_width_cm: optionalNumber(data.get('productWidthCm')),
      product_height_cm: optionalNumber(data.get('productHeightCm')),
      package_weight_kg: optionalNumber(data.get('packageWeightKg')),
      package_length_cm: optionalNumber(data.get('packageLengthCm')),
      package_width_cm: optionalNumber(data.get('packageWidthCm')),
      package_height_cm: optionalNumber(data.get('packageHeightCm')),
      safety_stock: optionalNumber(data.get('safetyStock')),
      reorder_min: optionalNumber(data.get('reorderMin')),
      reorder_max: optionalNumber(data.get('reorderMax')),
      sell_units: packagingEnabled ? sellUnits.map((unit) => ({
        unit_code: unit.unitCode.toLowerCase(), name: unit.name.trim(),
        base_quantity: unit.baseQuantity, barcode: unit.barcode.trim() || undefined,
      })) : [],
    }
    if (structure === 'variant') {
      const valuesById = new Map(variantGroups.flatMap((group) => group.values.map((value) => [value.id, value])))
      return {
        ...commonPayload,
        structure_type: 'variant' as const,
        option_groups: variantGroups.map((group) => ({
          name: group.name.trim(),
          kind: group.kind,
          values: group.values.map((value) => ({ name: value.name.trim(), code: value.code, aliases: [value.name.trim()] })),
        })),
        variants: variantCombinations.filter((variant) => variant.enabled).map((variant) => {
          const selectedValues = variant.optionValueIds.flatMap((id) => valuesById.get(id) ? [valuesById.get(id)!] : [])
          return {
            key: variant.key,
            name: [formString(data, 'name'), ...selectedValues.map((value) => value.name)].filter(Boolean).join(' · ').slice(0, 160),
            sku_code: variant.skuCode.toUpperCase(),
            sales_code: variant.salesCode || undefined,
            barcode: variant.barcode || undefined,
            status: variant.status,
            sale_price: Number(variant.price),
            cost_price: optionalNumber(data.get('costPrice')),
            option_codes: selectedValues.map((value) => value.code),
            image_client_id: variant.imageId || undefined,
          }
        }),
      }
    }
    return {
      ...commonPayload,
      sku_name: initialSku?.name ?? formString(data, 'skuName'),
      sku_code: initialSku?.skuCode ?? formString(data, 'skuCode').toUpperCase(),
      sales_code: initialSku?.salesCode ?? formString(data, 'salesCode').toUpperCase(),
      barcode: initialSku?.barcode ?? formString(data, 'barcode'),
      bundle_components: structure === 'bundle' ? bundleComponents.map((component) => ({
        sku_id: component.skuId, quantity: component.quantity,
      })) : [],
    }
  }

  function validationTarget(issue: ValidationIssue) {
    const form = formRef.current
    if (!form) return null
    if (issue.fieldName) {
      const named = form.elements.namedItem(issue.fieldName)
      if (named instanceof HTMLElement) return named
      if (named && 'length' in named && named.length > 0 && named.item(0) instanceof HTMLElement) return named.item(0) as HTMLElement
    }
    const section = document.getElementById(issue.sectionId)
    if (!section) return null
    return section.querySelector<HTMLElement>('input:not([disabled]), select:not([disabled]), textarea:not([disabled])') ?? section
  }

  function clearValidationMarkers() {
    formRef.current?.querySelectorAll<HTMLElement>('[data-validation-invalid="true"]').forEach((element) => {
      element.removeAttribute('data-validation-invalid')
      element.removeAttribute('aria-invalid')
    })
  }

  function focusValidationIssue(issue: ValidationIssue) {
    const target = validationTarget(issue)
    if (!target) return
    target.setAttribute('data-validation-invalid', 'true')
    if (target.matches('input, select, textarea')) target.setAttribute('aria-invalid', 'true')
    target.scrollIntoView({ behavior: 'smooth', block: 'center' })
    window.setTimeout(() => target.focus({ preventScroll: true }), 180)
  }

  function collectValidationIssues(data: FormData) {
    const issues: ValidationIssue[] = []
    const add = (sectionId: ValidationSectionId, label: string, message: string, fieldName?: string) => {
      issues.push({ id: `${sectionId}-${issues.length + 1}`, sectionId, fieldName, label, message })
    }
    const payload = buildPayload(data)

    if (pendingDraft) {
      if (images.length < 1) add('images', 'รูปสินค้า', 'ข้อมูลหลักถูกสร้างแล้ว กรุณาเลือกภาพใหม่อย่างน้อย 1 ภาพเพื่ออัปโหลดต่อ')
      if (images.some((image) => image.stage === 'failed')) add('images', 'รูปสินค้า', 'มีรูปที่อัปโหลดไม่สำเร็จ กรุณาเลือกไฟล์ใหม่')
      return issues
    }

    if (!payload.name) add('general', 'ชื่อสินค้า', 'กรุณากรอกชื่อสินค้า', 'name')
    if (!payload.category_id) add('general', 'หมวดหมู่', 'กรุณาเลือกหมวดหมู่สินค้า', 'categoryId')
    if (FORBIDDEN_CONTROL_CHARACTERS.test(payload.name) || FORBIDDEN_CONTROL_CHARACTERS.test(payload.description) || FORBIDDEN_CONTROL_CHARACTERS.test(payload.internal_note)) {
      add('general', 'ข้อความสินค้า', 'พบอักขระควบคุมที่ไม่อนุญาต กรุณาแก้ข้อความก่อนสร้าง', 'name')
    }

    if (images.length < 1) add('images', 'รูปสินค้า', 'กรุณาเลือกรูปสินค้าอย่างน้อย 1 ภาพ')
    if (images.some((image) => image.stage === 'failed')) add('images', 'รูปสินค้า', 'มีรูปที่อัปโหลดไม่สำเร็จ กรุณาเลือกไฟล์ใหม่')

    if (structure === 'variant') {
      const enabledVariants = variantCombinations.filter((variant) => variant.enabled)
      const groupNames = variantGroups.map((group) => group.name.trim().toLocaleLowerCase('th-TH'))
      if (variantGroups.length < 1 || variantGroups.length > 3) add('sku', 'กลุ่มตัวเลือก', 'Variant ต้องมีกลุ่มตัวเลือก 1–3 กลุ่ม')
      if (variantGroups.some((group) => !group.name.trim() || group.values.length < 1)) add('sku', 'กลุ่มตัวเลือก', 'ทุกกลุ่มต้องมีชื่อและค่าตัวเลือกอย่างน้อย 1 ค่า')
      if (new Set(groupNames).size !== groupNames.length) add('sku', 'กลุ่มตัวเลือก', 'ชื่อกลุ่มตัวเลือกต้องไม่ซ้ำกัน')
      if (variantGroups.some((group) => new Set(group.values.map((value) => value.code)).size !== group.values.length)) add('sku', 'ค่าตัวเลือก', 'รหัสค่าตัวเลือกภายในกลุ่มเดียวกันต้องไม่ซ้ำกัน')
      if (enabledVariants.length < 1) add('sku', 'SKU Combination', 'ต้องเปิดใช้อย่างน้อย 1 Combination')
      if (enabledVariants.some((variant) => !variant.skuCode || !IDENTIFIER_CODE_PATTERN.test(variant.skuCode))) add('sku', 'SKU Code', 'ทุก Combination ต้องมี SKU Code ที่ใช้ A–Z, 0–9, จุด, ขีดกลาง หรือขีดล่าง')
      if (enabledVariants.some((variant) => !variant.salesCode || !IDENTIFIER_CODE_PATTERN.test(variant.salesCode))) add('sku', 'รหัสขาย / รหัส CF', 'ทุก Combination ต้องมีรหัสขาย / รหัส CF ที่ถูกต้อง')
      if (enabledVariants.some((variant) => variant.price === '' || !Number.isFinite(Number(variant.price)) || Number(variant.price) < 0)) add('pricing', 'ราคาขาย', 'ทุก Combination ต้องมีราคาขายตั้งแต่ 0 ขึ้นไป')
      const skuCodes = enabledVariants.map((variant) => variant.skuCode.toUpperCase())
      const salesCodes = enabledVariants.map((variant) => variant.salesCode.toUpperCase())
      const identifierVariantKeys = new Map<string, Set<string>>()
      enabledVariants.forEach((variant) => {
        for (const value of [variant.skuCode, variant.salesCode, variant.barcode].filter(Boolean)) {
          const normalized = value.toUpperCase()
          const variantKeys = identifierVariantKeys.get(normalized) ?? new Set<string>()
          variantKeys.add(variant.key)
          identifierVariantKeys.set(normalized, variantKeys)
        }
      })
      const barcodes = enabledVariants.map((variant) => variant.barcode.trim().toUpperCase()).filter(Boolean)
      if (new Set(skuCodes).size !== skuCodes.length) add('sku', 'SKU Code', 'พบ SKU Code ซ้ำในตาราง Combination')
      if (new Set(salesCodes).size !== salesCodes.length) add('sku', 'รหัสขาย / รหัส CF', 'พบรหัสขาย / รหัส CF ซ้ำในตาราง Combination')
      if ([...identifierVariantKeys.values()].some((variantKeys) => variantKeys.size > 1)) add('sku', 'รหัสสินค้า', 'รหัสเดียวกันใช้ซ้ำได้ภายใน Variant เดียว แต่ห้ามชี้ไปคนละ Variant')
      if (!variantIdentifiersReady) add('sku', 'ตรวจสอบรหัส', 'กรุณารอให้ระบบตรวจรหัสของทุก Variant ผ่านก่อนสร้าง')
      if (new Set(barcodes).size !== barcodes.length) add('sku', 'Barcode', 'พบ Barcode ซ้ำในตาราง Combination')
      if (enabledVariants.some((variant) => variant.imageId && !images.some((image) => image.id === variant.imageId))) add('images', 'รูปประจำ Variant', 'มี Combination อ้างอิงรูปที่ถูกนำออกแล้ว กรุณาเลือกรูปใหม่')
    } else {
      if (editingSkuDraftId) add('sku', 'รายการ SKU', 'กรุณาบันทึกหรือยกเลิก SKU ที่กำลังแก้ไขก่อนสร้าง', 'skuName')
      if (skuDrafts.length > 1) add('sku', 'รายการ SKU', `เก็บ SKU ไว้ ${skuDrafts.length} รายการแล้ว แต่ Atomic command ปัจจุบันสร้างได้ครั้งละ 1 SKU จึงยังไม่ส่งข้อมูล เพื่อป้องกันรายการสูญหาย`)
      const currentSku = currentSkuDraft()
      if (skuDrafts.length === 1 && currentSku.skuCode) add('sku', 'SKU ที่ยังไม่เก็บ', 'กดเก็บ SKU ที่กำลังกรอกหรือเคลียร์ SKU Code ก่อนสร้าง', 'skuCode')
      if (skuDrafts.length === 0) {
        for (const error of skuDraftValidationErrors(currentSku)) add('sku', 'SKU แรก', error, error.includes('ชื่อ') ? 'skuName' : error.includes('Base Unit') ? 'baseUnitCode' : error.includes('Sales') ? 'salesCode' : error.includes('Barcode') ? 'barcode' : 'skuCode')
      }
      if (identifierFeedback.tone !== 'success') add('sku', 'ตรวจสอบรหัส', identifierFeedback.tone === 'danger' ? identifierFeedback.text : 'กรุณากด “ตรวจสอบรหัส” หรือเก็บ SKU ให้ผ่านก่อนสร้าง', 'skuCode')

      const salePrice = optionalNumber(data.get('salePrice'))
      if (salePrice === undefined || salePrice < 0) add('pricing', 'ราคาขาย', 'กรุณากรอกราคาขายเป็นตัวเลขตั้งแต่ 0 ขึ้นไป', 'salePrice')
    }

    for (const error of physicalValidationErrors(data)) add('physical', 'น้ำหนักและขนาด', error, 'packageWeightKg')
    for (const error of packagingBundleValidationErrors(payload.quantity_behavior)) add('packaging', 'หน่วยบรรจุและ Bundle', error)
    for (const error of inventoryPolicyValidationErrors(data)) add('inventory', 'นโยบายสต๊อก', error, error.startsWith('Min') ? 'reorderMin' : 'reorderMax')
    if (hasNoSelectedSalesBranch()) add('inventory', 'สาขาที่เปิดขาย', 'กรุณาเลือกสาขาอย่างน้อย 1 แห่ง')

    const serializedFields = JSON.stringify(Array.from(data.entries()).flatMap(([key, value]) => typeof value === 'string' ? [[key, value]] : []))
    if (new TextEncoder().encode(serializedFields).byteLength > DRAFT_MAX_BYTES) add('metadata', 'ขนาดข้อมูล', 'ข้อมูลข้อความรวมเกิน 256 KB กรุณาลดรายละเอียดก่อนสร้าง')
    return issues
  }

  function validateBeforeCreate(data: FormData) {
    clearValidationMarkers()
    const issues = collectValidationIssues(data)
    const physicalErrors = physicalValidationErrors(data)
    if (physicalErrors.length > 0) setPhysicalTab('box')
    setValidationAttempted(true)
    setValidationIssues(issues)
    setValidationNoticeVisible(true)
    setFeedback(null)
    setPhysicalFeedback(physicalErrors)
    setInventoryFeedback(inventoryPolicyValidationErrors(data))
    requestAnimationFrame(() => {
      for (const issue of issues) {
        const target = validationTarget(issue)
        target?.setAttribute('data-validation-invalid', 'true')
        if (target?.matches('input, select, textarea')) target.setAttribute('aria-invalid', 'true')
      }
    })
    return issues.length === 0
  }

  function focusRecoveryImages() {
    const section = document.getElementById('images')
    section?.scrollIntoView({ behavior: 'smooth', block: 'start' })
    window.setTimeout(() => section?.querySelector<HTMLElement>('input[type="file"]')?.focus(), 180)
  }

  function closeSuccessDialog() {
    setCreationSuccess(null)
  }

  function createNextProduct() {
    setCreationSuccess(null)
    window.location.assign(`/organizations/${organizationId}/products/new`)
  }

  function handleSuccessDialogKeyDown(event: KeyboardEvent<HTMLElement>) {
    if (event.key === 'Escape') {
      event.preventDefault()
      closeSuccessDialog()
      return
    }
    if (event.key !== 'Tab') return
    const focusable = Array.from(successDialogRef.current?.querySelectorAll<HTMLElement>('a[href], button:not([disabled])') ?? [])
    if (!focusable.length) return
    const first = focusable[0]
    const last = focusable[focusable.length - 1]
    if (event.shiftKey && document.activeElement === first) {
      event.preventDefault()
      last.focus()
    } else if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault()
      first.focus()
    }
  }

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!canManage || isPending) return
    const data = new FormData(event.currentTarget)
    if (!validateBeforeCreate(data)) return
    const payload = buildPayload(data)
    successReturnFocusRef.current = document.activeElement instanceof HTMLElement ? document.activeElement : null

    setFeedback(null)
    saveBrowserDraft(false)
    startTransition(async () => {
      let recovery = pendingDraft
      if (!recovery) {
        const isVariantCreation = structure === 'variant'
        setProgress(isVariantCreation ? 'กำลังสร้าง Product และ SKU Variant ทั้งหมดแบบ Atomic…' : 'กำลังสร้าง Product และ SKU แรกแบบ Atomic…')
        const commandIdKey = `${localDraftKey}:command-id`
        const commandId = window.localStorage.getItem(commandIdKey) ?? crypto.randomUUID()
        window.localStorage.setItem(commandIdKey, commandId)
        const result = await executeFoundationCommandAction({
          kind: 'entity', commandId, organizationId,
          commandType: isVariantCreation ? 'product.create_with_variants' : 'product.create_with_initial_sku', payload,
        })
        if (!result.ok) {
          setProgress('')
          setFeedback({ tone: 'danger', text: errorLabels[result.error] ?? errorLabels.foundation_command_failed })
          return
        }
        const resultVariants = Array.isArray(result.data.variants) ? result.data.variants.flatMap((entry) => {
          if (!entry || typeof entry !== 'object') return []
          const item = entry as Record<string, unknown>
          const key = String(item.key ?? '').slice(0, 500)
          const skuId = String(item.sku_id ?? '')
          const imageId = String(item.image_client_id ?? '').slice(0, 80)
          return key && UUID_PATTERN.test(skuId) ? [{ key, skuId, imageId }] : []
        }) : []
        if (typeof result.data.product_id !== 'string' || (isVariantCreation ? resultVariants.length < 1 : typeof result.data.sku_id !== 'string')) {
          setProgress('')
          setFeedback({ tone: 'danger', text: errorLabels.foundation_command_failed })
          return
        }
        recovery = {
          productId: result.data.product_id,
          skuId: typeof result.data.sku_id === 'string' ? result.data.sku_id : undefined,
          variantSkus: resultVariants.length ? resultVariants : undefined,
          productName: payload.name,
          savedAt: new Date().toISOString(),
        }
        setPendingDraft(recovery)
        window.localStorage.setItem(pendingDraftKey, JSON.stringify(recovery))
      }

      const uploadResult = await uploadImages(recovery.productId, recovery.productName, recovery.readyImageIdsByClientId)
      recovery = { ...recovery, readyImageIdsByClientId: uploadResult.readyImageIdsByClientId }
      setPendingDraft(recovery)
      window.localStorage.setItem(pendingDraftKey, JSON.stringify(recovery))
      setProgress('')
      if (uploadResult.failedCount > 0) {
        setFeedback({ tone: 'danger', text: `ข้อมูลหลักถูกบันทึกเป็น Draft แล้ว แต่อัปโหลดรูปไม่สำเร็จ ${uploadResult.failedCount} ภาพ เลือกไฟล์ใหม่แล้วกด “อัปโหลดต่อ” ได้โดยไม่สร้างสินค้าซ้ำ` })
        return
      }
      if (!(await assignVariantImages(recovery, uploadResult.readyImageIdsByClientId))) {
        setFeedback({ tone: 'danger', text: 'Product และ SKU Variant ถูกสร้างแล้ว แต่เชื่อมรูปประจำ Variant ไม่สำเร็จ กรุณากด “อัปโหลดต่อ” เพื่อทำรายการเดิมต่อโดยไม่สร้าง SKU ซ้ำ' })
        return
      }

      window.localStorage.removeItem(localDraftKey)
      window.localStorage.removeItem(`${localDraftKey}:command-id`)
      window.localStorage.removeItem(pendingDraftKey)
      setCompletedProductId(recovery.productId)
      setPendingDraft(null)
      const createdSkuCount = recovery.variantSkus?.length ?? 1
      setCreationSuccess({ productId: recovery.productId, productName: recovery.productName, skuCount: createdSkuCount })
      setFeedback({ tone: 'success', text: structure === 'variant' ? `สร้าง Product, SKU Variant ${createdSkuCount} รายการ และรูปสินค้าเรียบร้อยแล้ว` : 'สร้าง Product, SKU แรก และรูปสินค้าเรียบร้อยแล้ว โดยยังคงสถานะฉบับร่างเพื่อให้ตรวจสอบก่อนเปิดใช้งาน' })
      router.refresh()
    })
  }

  const activeCategories = categories.filter((option) => option.status !== 'archived')
  const activeBrands = brands.filter((option) => option.status !== 'archived')
  const activeTags = tags.filter((option) => option.status !== 'archived')
  const selectedTagNames = tagIds.flatMap((id) => {
    const tag = activeTags.find((option) => option.id === id)
    return tag ? [tag.name] : []
  })
  const suggestedTagNames = suggestedTagNamesFromProductName(summaryFields.name, selectedTagNames, activeTags.map((tag) => tag.name))
  const requiredMasterMissing = activeCategories.length === 0
  const summaryCategory = activeCategories.find((option) => option.id === categoryId)?.name ?? 'ยังไม่เลือกหมวดหมู่'
  const enabledVariantCombinations = variantCombinations.filter((combination) => combination.enabled)
  const variantPrices = enabledVariantCombinations
    .filter((combination) => combination.price.trim() !== '')
    .map((combination) => Number(combination.price))
    .filter((price) => Number.isFinite(price) && price >= 0)
  const summaryPrice = structure === 'variant' && variantPrices.length
    ? (() => {
        const minimum = Math.min(...variantPrices)
        const maximum = Math.max(...variantPrices)
        const formatter = new Intl.NumberFormat('th-TH', { style: 'currency', currency: 'THB' })
        return minimum === maximum ? formatter.format(minimum) : `${formatter.format(minimum)} – ${formatter.format(maximum)}`
      })()
    : summaryFields.salePrice
      ? new Intl.NumberFormat('th-TH', { style: 'currency', currency: 'THB' }).format(Number(summaryFields.salePrice))
      : '—'
  const summaryBranches = branches.filter((branch) => selectedBranchIds.includes(branch.id)).map((branch) => branch.code).join(', ') || 'ยังไม่เปิดขาย'
  const summaryPackaging = packagingEnabled ? `${sellUnits.length} หน่วยขาย` : 'หน่วยฐาน'
  const summaryBundle = structure === 'bundle' ? `${bundleComponents.length} Components · ${bundleStockMode === 'assembled' ? 'Pre-assembled' : 'Virtual'}` : 'ไม่ใช่ Bundle'
  const sectionCompletion = {
    general: Boolean(summaryFields.name && categoryId),
    images: images.length > 0,
    sku: structure === 'variant'
      ? variantIdentifiersReady && enabledVariantCombinations.length > 0 && enabledVariantCombinations.every((combination) => combination.skuCode.trim() && combination.salesCode.trim())
      : Boolean(skuDrafts.length > 0 || (summaryFields.skuName && summaryFields.skuCode)),
    pricing: structure === 'variant'
      ? enabledVariantCombinations.length > 0 && enabledVariantCombinations.every((combination) => combination.price.trim())
      : Boolean(summaryFields.salePrice),
    physical: Boolean(summaryFields.productWeightKg && summaryFields.productLengthCm && summaryFields.productWidthCm && summaryFields.productHeightCm),
    packaging: !packagingEnabled || sellUnits.length > 0,
    inventory: selectedBranchIds.length > 0,
    metadata: true,
  }
  const completionChecks = [sectionCompletion.general, sectionCompletion.images, sectionCompletion.sku, Boolean(summaryFields.baseUnitCode), sectionCompletion.pricing, images.length > 0]
  const completionPercent = Math.round(completionChecks.filter(Boolean).length / completionChecks.length * 100)
  const summarySections = [
    { id: 'general', label: 'ข้อมูลทั่วไป', optional: false },
    { id: 'images', label: 'รูปสินค้า', optional: false },
    { id: 'sku', label: structure === 'variant' ? 'SKU Variant' : 'SKU แรก', optional: false },
    { id: 'pricing', label: 'ราคาและภาษี', optional: false },
    { id: 'physical', label: 'น้ำหนักและขนาด', optional: true },
    { id: 'packaging', label: 'Packaging / Bundle', optional: true },
    { id: 'inventory', label: 'สาขาและสต๊อก', optional: false },
    { id: 'metadata', label: 'ข้อมูลระบบ', optional: false },
  ] as const
  const currentSectionId = validationAttempted && validationIssues.length
    ? validationIssues[0].sectionId
    : summarySections.find((section) => !sectionCompletion[section.id])?.id ?? 'metadata'
  const validationIssueCountForSection = (sectionId: ValidationSectionId) => validationIssues.filter((issue) => issue.sectionId === sectionId).length
  const failedImageCount = images.filter((image) => image.stage === 'failed').length
  const readyImageCount = images.filter((image) => image.stage === 'ready').length
  const imageUploadStatus = failedImageCount
    ? { tone: 'danger' as const, text: `อัปโหลดไม่สำเร็จ ${failedImageCount} ภาพ กรุณาเลือกไฟล์ใหม่แล้วอัปโหลดต่อ` }
    : progress.startsWith('กำลังอัปโหลดรูป')
      ? { tone: 'info' as const, text: progress }
      : readyImageCount
        ? { tone: 'success' as const, text: `อัปโหลดสำเร็จ ${readyImageCount} จาก ${images.length} ภาพ` }
        : imageFeedback
  const salesSequenceCurrent = formatSalesSequence(salesSequencePrefix, salesSequenceStart, salesSequenceDigits, salesSequenceOffset)
  const salesSequenceNext = formatSalesSequence(salesSequencePrefix, salesSequenceStart, salesSequenceDigits, salesSequenceOffset + 1)
  const skuNameSuggestion = [summaryFields.name, variantOptionOne.trim(), variantOptionTwo.trim()].filter(Boolean).join(' · ') || '—'
  const barcodeSourceHelp = barcodeMode === 'internal-sku'
    ? `ระบบจะใช้ ${summaryFields.skuCode || 'รหัสสินค้า (SKU) ที่กรอก'} เป็น Barcode และตรวจสอบไม่ให้ซ้ำภายใน Organization`
    : barcodeMode === 'internal-sales'
      ? `ระบบจะใช้ ${summaryFields.salesCode || 'รหัสขาย / รหัส CF ที่กรอก'} เป็น Barcode และตรวจสอบไม่ให้ซ้ำภายใน Organization`
      : barcodeMode === 'none'
        ? 'SKU นี้ยังไม่มี Barcode สามารถกลับมากำหนดภายหลังได้'
        : 'กรอก Barcode จากฉลากหรือบรรจุภัณฑ์ของผู้ผลิต ระบบจะตรวจสอบไม่ให้ซ้ำภายใน Organization'

  return <>
    <header className="product-creation-heading">
      <div><div className="product-heading-title-row"><h1>สร้างสินค้า</h1><span className="product-count-badge">ฉบับร่าง</span></div><p>{structure === 'variant' ? 'สร้าง Product, รูปภาพ, SKU Variant และข้อมูลการขายจากหน้าเดียว' : 'สร้าง Product, รูปภาพ, SKU แรก และข้อมูลการขายจากหน้าเดียว'}</p></div>
      <div className="button-row">
        <Link className="button secondary" href={productsHref}>ยกเลิก</Link>
        <button className="button secondary" type="button" onClick={() => saveBrowserDraft()} disabled={isPending}>บันทึกร่าง</button>
        <button className="button product-primary-action" type="submit" form="unified-product-form" disabled={!canManage || isPending}>{isPending ? 'กำลังบันทึก…' : pendingDraft ? 'อัปโหลดต่อ' : 'ตรวจสอบและสร้าง'}</button>
      </div>
    </header>

    <div className="product-production-banner" role="note"><span aria-hidden="true">ⓘ</span><span><strong>เชื่อมระบบจริงแล้ว</strong> — {structure === 'variant' ? 'Product และ SKU Variant สร้างพร้อมกันผ่าน Atomic command' : 'Product และ SKU แรกสร้างผ่าน Atomic command'}, รูปภาพผ่าน Image Gate และยังไม่เขียน Stock ในขั้นตอนนี้</span></div>
    <div className="product-required-guide" role="note"><span aria-hidden="true">＊</span><span><strong>ช่องที่มีเครื่องหมาย * จำเป็นต้องกรอก</strong> · ระบบจะตรวจข้อมูลอีกครั้งก่อนสร้างสินค้า</span></div>
    {validationAttempted ? <div ref={validationSummaryRef} className={`product-validation-summary ${validationIssues.length ? 'danger' : 'success'}`} role={validationIssues.length ? 'alert' : 'status'} aria-live="assertive" tabIndex={-1}>
      <div className="product-validation-summary-heading"><span className="product-validation-summary-icon" aria-hidden="true">{validationIssues.length ? '!' : '✓'}</span><div><strong>{validationIssues.length ? `ตรวจพบ ${validationIssues.length} จุดที่ต้องแก้` : 'ข้อมูลผ่านการตรวจเบื้องต้นแล้ว'}</strong><p>{validationIssues.length ? 'เลือกแต่ละรายการเพื่อไปยังช่องที่ต้องแก้ ระบบจะไม่สร้างข้อมูลจนกว่าจะผ่านครบ' : 'กำลังส่งคำสั่งให้ Server ตรวจสิทธิ์ ความถูกต้อง และ Unique อีกครั้ง'}</p></div></div>
      {validationIssues.length ? <ol>{validationIssues.map((issue) => <li key={issue.id}><button type="button" onClick={() => focusValidationIssue(issue)}><span>{issue.label}</span><small>{issue.message}</small><span aria-hidden="true">ไปแก้ →</span></button></li>)}</ol> : null}
      <div className="product-validation-authority-note">UI Validation ช่วยนำทางเท่านั้น · Server transaction เป็น Authority ขั้นสุดท้ายเสมอ</div>
    </div> : null}
    {validationAttempted && validationNoticeVisible ? <div className={`product-validation-floating-notice ${validationIssues.length ? 'danger' : 'success'}`} role={validationIssues.length ? 'alert' : 'status'} aria-live="assertive">
      <span className="product-validation-summary-icon" aria-hidden="true">{validationIssues.length ? '!' : '✓'}</span>
      <div>
        <strong>{validationIssues.length ? `ตรวจพบ ${validationIssues.length} จุดที่ต้องแก้` : 'ข้อมูลผ่านการตรวจเบื้องต้นแล้ว'}</strong>
        <p>{validationIssues.length ? 'กดข้อความนี้เพื่อไปยังจุดแรกที่ต้องแก้' : 'ระบบกำลังตรวจสิทธิ์ ความถูกต้อง และรหัสซ้ำกับ Server อีกครั้ง'}</p>
      </div>
      {validationIssues.length ? <button className="product-validation-floating-action" type="button" onClick={() => focusValidationIssue(validationIssues[0])} aria-label="ไปยังจุดแรกที่ต้องแก้">ไปแก้ →</button> : null}
      <button className="product-validation-floating-close" type="button" onClick={() => setValidationNoticeVisible(false)} aria-label="ปิดการแจ้งเตือน">×</button>
    </div> : null}
    {!canManage ? <div className="product-feedback danger" role="alert">บัญชีนี้อ่านข้อมูลได้ แต่ไม่มีสิทธิ์ product.manage สำหรับสร้างสินค้า</div> : null}
    {requiredMasterMissing ? <div className="product-feedback danger product-master-state-alert" role="alert"><span><strong>ยังไม่พร้อมสร้างสินค้า</strong><small>ยังไม่มีหมวดหมู่สินค้า ต้องเพิ่มหมวดหมู่อย่างน้อย 1 รายการก่อนสร้างสินค้า</small></span><MasterDataManager organizationId={organizationId} kind="category" items={categories} canManage={canManage} triggerLabel="จัดการหมวดหมู่" onSaved={(options) => { setCategories(options); const firstActive = options.find((option) => option.status !== 'archived'); if (firstActive) setCategoryId(firstActive.id) }} /></div> : null}
    {pendingDraft ? <div className="product-recovery-banner" role="status" aria-live="polite"><div className="product-recovery-heading"><span aria-hidden="true">↻</span><div><strong>กู้คืนงานสร้างสินค้าที่อัปโหลดภาพไม่ครบ</strong><span>{pendingDraft.productName} · บันทึกข้อมูลหลักเมื่อ {new Intl.DateTimeFormat('th-TH', { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(pendingDraft.savedAt))}</span></div></div><p>Product และ SKU แรกถูกสร้างเป็นฉบับร่างแล้ว ระบบจะใช้ Product ID เดิมและไม่สร้างซ้ำ กรุณาเลือกภาพใหม่แล้วกด “อัปโหลดต่อ”</p><div className="product-recovery-actions"><button className="button compact secondary" type="button" onClick={focusRecoveryImages}>เลือกภาพใหม่</button><Link className="button compact secondary" href={`${productsHref}?product=${pendingDraft.productId}`}>เปิด Product Draft</Link></div></div> : null}
    {feedback ? <div className={`product-feedback ${feedback.tone === 'danger' ? 'danger' : 'success'}`} role={feedback.tone === 'danger' ? 'alert' : 'status'}>{feedback.text}</div> : null}
    {draftSaveNotice ? <div className="product-draft-save-toast" role="status" aria-live="polite"><span aria-hidden="true">✓</span><span className="product-draft-save-message">{draftSaveNotice}</span><span className="product-draft-save-countdown">ปิดใน {draftSaveSeconds} วินาที</span><button type="button" onClick={() => setDraftSaveNotice('')} aria-label="ปิดข้อความบันทึกร่าง">×</button></div> : null}
    {progress ? <div className="product-creation-progress" role="status"><span aria-hidden="true" />{progress}</div> : null}

    <form id="unified-product-form" ref={formRef} className="product-creation-layout" noValidate onSubmit={submit} onChange={(event) => {
      const target = event.target
      if (target instanceof HTMLElement) {
        target.removeAttribute('data-validation-invalid')
        target.removeAttribute('aria-invalid')
      }
      if (target instanceof HTMLInputElement) {
        if (target.name === 'name' && useProductNameForSku) setFormFieldValue('skuName', target.value)
        if (target.name === 'skuCode') {
          target.value = target.value.toUpperCase()
          if (salesCodeMode === 'same-sku') setFormFieldValue('salesCode', target.value.toUpperCase())
          if (barcodeMode === 'internal-sku') setFormFieldValue('barcode', target.value.toUpperCase())
        }
        if (target.name === 'salesCode') {
          target.value = target.value.toUpperCase()
          if (barcodeMode === 'internal-sales') setFormFieldValue('barcode', target.value)
        }
        if (['skuCode', 'salesCode', 'barcode'].includes(target.name)) markIdentifierCheckStale()
        if (['productWeightKg', 'productLengthCm', 'productWidthCm', 'productHeightCm', 'packageWeightKg', 'packageLengthCm', 'packageWidthCm', 'packageHeightCm'].includes(target.name)) setPhysicalFeedback(physicalValidationErrors(new FormData(event.currentTarget)))
        if (['safetyStock', 'reorderMin', 'reorderMax'].includes(target.name)) setInventoryFeedback(inventoryPolicyValidationErrors(new FormData(event.currentTarget)))
      }
      setSummaryFields(readProductSummaryFields(event.currentTarget))
    }}>
      <main className="product-creation-sections">
        <section id="general" className="product-creation-card">
          <header><span>1</span><div><h2>ข้อมูลทั่วไป</h2><p>ข้อมูลที่ใช้ร่วมกันทุก SKU ภายใต้ Product นี้</p></div><small>Product</small></header>
          <div className="product-form-grid two">
            <div className="full product-form-field"><span className="product-label-with-info"><label htmlFor="productName">ชื่อสินค้า *</label><ProductInfoGuide label="ชื่อสินค้า" description="ชื่อหลักที่ใช้รวมหลาย SKU ของสินค้าเดียวกัน ควรเป็นชื่อที่พนักงานและลูกค้าเข้าใจ" example="ตัวอย่าง: กระเป๋าหนัง Mini" /></span><input id="productName" name="name" maxLength={160} required placeholder="เช่น กระเป๋าหนัง Mini" /></div>
            <div className="product-form-field"><label htmlFor="productCategoryId">หมวดหมู่ *</label><span className="product-field-with-action"><span className="product-select-control"><select id="productCategoryId" name="categoryId" value={categoryId} onChange={(event) => setCategoryId(event.target.value)} required><option value="">เลือกหมวดหมู่</option>{activeCategories.map((option) => <option key={option.id} value={option.id}>{option.name}</option>)}</select></span><MasterDataManager organizationId={organizationId} kind="category" items={categories} canManage={canManage} onSaved={(options) => { setCategories(options); if (!options.some((option) => option.id === categoryId && option.status !== 'archived')) setCategoryId('') }} /></span></div>
            <div className="product-form-field"><label htmlFor="productBrandId">แบรนด์</label><span className="product-field-with-action"><span className="product-select-control"><select id="productBrandId" name="brandId" value={brandId} onChange={(event) => setBrandId(event.target.value)}><option value="">ไม่มีแบรนด์</option>{activeBrands.map((option) => <option key={option.id} value={option.id}>{option.name}</option>)}</select></span><MasterDataManager organizationId={organizationId} kind="brand" items={brands} canManage={canManage} onSaved={(options) => { setBrands(options); if (!options.some((option) => option.id === brandId && option.status !== 'archived')) setBrandId('') }} /></span><small>อ้างอิง Brand master; ถ้าไม่มีแบรนด์ให้เลือก “ไม่มีแบรนด์”</small></div>
            <fieldset className="full product-segmented-control"><legend><span className="product-label-with-info"><span>รูปแบบสินค้า *</span><ProductInfoGuide label="รูปแบบสินค้า" description="เลือกสินค้าปกติเมื่อมี SKU เดียว, Variant เมื่อแยกสีหรือขนาด และ Bundle เมื่อนำหลาย SKU มารวมขาย" example="ตัวอย่าง: เสื้อรุ่นเดียวหลายสี → มีตัวเลือก / Variant" /></span></legend>{(['standard', 'variant', 'bundle'] as const).map((value) => <label key={value} className={structure === value ? 'active' : ''}><input type="radio" name="structureType" value={value} checked={structure === value} onChange={() => setStructure(value)} /><span>{value === 'standard' ? 'สินค้าปกติ' : value === 'variant' ? 'มีตัวเลือก / Variant' : 'Bundle / Kit'}</span></label>)}</fieldset>
            <div className="product-form-field product-quantity-field"><span className="product-field-heading-line"><span className="product-label-with-info"><label htmlFor="quantityBehavior">Stock ของสินค้านี้นับอย่างไร?</label><ProductInfoGuide label="Stock ของสินค้านี้นับอย่างไร?" description="เลือกจำนวนเต็มเมื่อ Stock ห้ามเป็นเศษ หรือเลือกทศนิยมเมื่อขายตามน้ำหนักหรือปริมาตร ช่องนี้ไม่ใช่ชื่อหน่วย เพราะชื่อหน่วยกำหนดใน Base Unit" example="ตัวอย่าง: ต่างหู 2 คู่ → จำนวนเต็ม / pair · ข้าวสาร 0.50 kg → ทศนิยมแบบน้ำหนัก / kg" /></span></span><span className="product-select-control"><select id="quantityBehavior" name="quantityBehavior" defaultValue="discrete"><option value="discrete">จำนวนเต็ม — ชิ้น / คู่ / แพ็ค / กล่อง</option><option value="weight">ทศนิยม — สินค้าชั่งน้ำหนัก</option><option value="volume">ทศนิยม — สินค้าวัดปริมาตร</option></select></span><small>เลือกว่าจำนวน Stock อนุญาตให้มีจุดทศนิยมหรือไม่ ส่วนหน่วยที่ใช้จริงเลือกใน Base Unit</small><span className="product-quantity-examples" role="note"><span><strong>จำนวนเต็ม:</strong> ต่างหู 1 คู่, เสื้อ 2 ชิ้น, สินค้า 3 แพ็ค</span><span><strong>น้ำหนัก:</strong> ข้าวสาร 0.50 kg</span><span><strong>ปริมาตร:</strong> น้ำหอม 1.25 litre</span></span></div>
            <div className="product-base-unit-field"><span className="product-label-with-info"><label htmlFor="baseUnitCode">หน่วยนับสต๊อก (Base Unit) *</label><ProductInfoGuide label="หน่วยนับสต๊อก (Base Unit)" description="หน่วยเล็กที่สุดที่ Ledger ใช้บันทึก Stock หนึ่ง SKU มีได้หนึ่งค่า ส่วนหน่วยขายกำหนดอัตราแปลงภายหลัง" example="ตัวอย่าง: เก็บต่างหูเป็นคู่ → pair · เก็บทีละชิ้นแต่ขายแพ็ค 6 → piece และเพิ่ม 1 pack = 6 pieces" /></span><div className="product-select-with-policy"><span className="product-select-control"><select id="baseUnitCode" name="baseUnitCode" defaultValue="piece" required><option value="piece">piece — ชิ้น</option><option value="pair">pair — คู่</option><option value="pack">pack — แพ็ค</option><option value="box">box — กล่อง</option><option value="set">set — ชุด</option><option value="case">case — ลัง</option><option value="kg">kg — กิโลกรัม</option><option value="g">g — กรัม</option><option value="litre">litre — ลิตร</option><option value="ml">ml — มิลลิลิตร</option></select></span><details className="product-base-unit-policy"><summary className="product-policy-icon" title="ดูนโยบายหน่วยนับ" aria-label="ดูนโยบาย Base Unit"><svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="9"/><path d="M12 11v5M12 8h.01"/></svg></summary><div><strong>นโยบาย Base Unit</strong><span>หน่วยเล็กที่สุดที่ Ledger ใช้เก็บและตัด Stock ควรล็อกหลังเริ่มมี Stock Movement</span><ul><li>ต่างหูขายเป็นคู่ ใช้ pair</li><li>เก็บทีละชิ้นแต่ขายแพ็ค ใช้ piece แล้วกำหนดหน่วยขายภายหลัง</li><li>ชั่งน้ำหนักใช้ kg/g และปริมาตรใช้ litre/ml</li></ul></div></details></div><small>เลือกคู่กับวิธีนับ Stock ด้านซ้าย และควรล็อกหลังเริ่มมี Stock Movement</small></div>
            <div className="product-tag-field"><div className="product-field-heading-line"><strong>ป้ายกำกับสินค้า (Tags)</strong><SavedTagsInteraction organizationId={organizationId} tags={activeTags} selectedIds={tagIds} canManage={canManage} onChange={setTagIds} onCreated={(option) => setTags((current) => [...current, option])} /></div><div className="product-field-with-action"><div className="product-tag-editor">{tagIds.map((id) => { const tag = activeTags.find((option) => option.id === id); return tag ? <span className="product-tag-chip" key={id}>{tag.name}<button type="button" aria-label={`นำ Tag ${tag.name} ออก`} onClick={() => setTagIds((current) => current.filter((tagId) => tagId !== id))}>×</button></span> : null })}<input value={tagInput} onChange={(event) => setTagInput(event.target.value.slice(0, 40))} onKeyDown={(event) => { if (event.key === 'Enter' || event.key === ',') { event.preventDefault(); selectSavedTagFromInput() } }} maxLength={40} placeholder="พิมพ์ Tag แล้วกด Enter" disabled={isTagPending} /></div><MasterDataManager organizationId={organizationId} kind="tag" items={tags} canManage={canManage} onSaved={(options) => { setTags(options); setTagIds((current) => current.filter((id) => options.some((option) => option.id === id && option.status !== 'archived'))) }} /></div>{suggestedTagNames.length ? <div className="product-tag-suggestions" aria-label="Tags ที่แนะนำจากชื่อสินค้า">{suggestedTagNames.map((name) => <button className="button compact secondary" type="button" key={name} disabled={isTagPending} onClick={() => createAndSelectTagNames([name])}>＋ {name}</button>)}{suggestedTagNames.length > 1 ? <button className="button compact secondary product-tag-add-all" type="button" disabled={isTagPending} onClick={suggestTags}>✦ {isTagPending ? 'กำลังเพิ่ม Tags…' : 'เพิ่มทั้งหมด'}</button> : null}</div> : <div className="product-tag-suggestions"><button className="button compact secondary" type="button" disabled={isTagPending || !summaryFields.name} onClick={suggestTags}>✦ แนะนำจากชื่อสินค้า</button></div>}<small>พิมพ์ Tag ใหม่แล้วกด Enter, เลือกคำแนะนำจากชื่อสินค้า หรือเลือก Tags ที่บันทึกไว้ · สูงสุด 12 Tags</small></div>
            <label className="full"><span>หมายเหตุสินค้า</span><textarea name="internalNote" maxLength={1000} rows={3} placeholder="หมายเหตุภายในสำหรับทีมงาน ไม่แสดงให้ลูกค้า" /></label>
          </div>
        </section>

        <section id="images" className="product-creation-card">
          <header><span>2</span><div><h2>รูปสินค้า</h2><p>เพิ่ม 1–9 ภาพ อัตราส่วน 1:1 จัดลำดับ และกำหนดภาพปก</p></div><small className="product-section-status">{images.length} / {PRODUCT_IMAGE_MAX_FILES} ภาพ</small></header>
          <div className="product-image-toolbar">
            <label className="button compact secondary product-image-picker"><input type="file" accept={PRODUCT_IMAGE_ALLOWED_MIME_TYPES.join(',')} multiple onChange={(event) => { selectImages(event.target.files); event.currentTarget.value = '' }} /><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 5v14M5 12h14" /></svg><span>เลือกภาพจากเครื่อง</span></label>
            <span className="product-image-cover-note">ภาพแรกเป็นภาพปกโดยอัตโนมัติ</span>
          </div>
          <div className="product-image-grid" aria-live="polite">{images.length ? images.map((image, index) => <article className="product-image-card" key={image.id}><div className="product-image-media"><Image src={image.previewUrl} alt={`ตัวอย่าง ${image.file.name}`} width={600} height={600} sizes="(max-width: 760px) 50vw, 180px" unoptimized />{index === 0 ? <span className="product-image-cover-label">ภาพปก</span> : null}</div><div className="product-image-name" title={image.file.name}>{image.file.name}</div><div className="product-image-actions"><button type="button" onClick={() => moveImage(index, -1)} disabled={index === 0 || isPending} aria-label="เลื่อนภาพไปซ้าย"><span aria-hidden="true">←</span></button><button className={index === 0 ? 'active' : ''} type="button" onClick={() => setCoverImage(index)} disabled={isPending} aria-label={index === 0 ? 'ภาพปกปัจจุบัน' : 'ตั้งเป็นภาพปก'} aria-pressed={index === 0}><span aria-hidden="true">★</span></button><button type="button" onClick={() => moveImage(index, 1)} disabled={index === images.length - 1 || isPending} aria-label="เลื่อนภาพไปขวา"><span aria-hidden="true">→</span></button><button type="button" onClick={() => removeImage(image.id)} disabled={isPending} aria-label="ลบภาพ"><span aria-hidden="true">×</span></button></div></article>) : <div className="product-image-empty"><div><strong>ยังไม่มีรูปสินค้า</strong><span>เลือกไฟล์ภาพจริงจากเครื่องเพื่อดูตัวอย่าง</span></div></div>}</div>
          <div className="product-image-policy" role="note"><span aria-hidden="true">ⓘ</span><span>รองรับ JPEG, PNG และ WebP · ไม่เกิน {Math.round(PRODUCT_IMAGE_MAX_BYTES / 1_048_576)} MB ต่อภาพ · แนะนำภาพสี่เหลี่ยม 1200 × 1200 px</span></div>
          <div className={`product-image-upload-status ${imageUploadStatus?.tone ?? ''}`} role="status" aria-live="polite">{imageUploadStatus?.text ?? ''}</div>
        </section>

        <section id="sku" className="product-creation-card">
          <header><span>3</span><div><h2>{structure === 'variant' ? 'SKU Variant และตัวเลือกสินค้า' : 'SKU แรกและรหัสสินค้า'}</h2><p>{structure === 'variant' ? 'แต่ละ Combination คือ SKU ที่ขายและนับ Stock แยกกัน' : 'SKU คือรายการที่ขายและนับ Stock จริง'}</p></div><small>{structure === 'variant' ? `${enabledVariantCombinations.length} SKU` : 'SKU'}</small></header>
          <div className="product-form-grid two">
            {structure === 'variant' ? <div className="full"><VariantCreationBuilder
              organizationId={organizationId}
              groups={variantGroups}
              setGroups={setVariantGroups}
              combinations={variantCombinations}
              setCombinations={setVariantCombinations}
              images={images.map((image) => ({ id: image.id, name: image.file.name }))}
              onIdentifierCheckChange={setVariantIdentifiersReady}
              disabled={isPending}
            /></div> : null}
            {structure !== 'variant' ? <>
            <div className="full product-sku-name-field">
              <div className="product-field-heading-line"><span className="product-label-with-info"><label htmlFor="skuName">ชื่อรุ่น / ตัวเลือกสินค้า *</label><ProductInfoGuide label="ชื่อรุ่น / ตัวเลือกสินค้า" description="ชื่อของรายการที่ขายจริง ให้ใส่เฉพาะสิ่งที่ทำให้ SKU นี้ต่างจากรายการอื่น" example="ตัวอย่าง: กระเป๋าหนัง Mini · สีน้ำตาล" /></span><label className="product-auto-fill-choice"><input name="useProductNameForSku" type="checkbox" value="true" checked={useProductNameForSku} onChange={(event) => { setUseProductNameForSku(event.target.checked); if (event.target.checked) syncProductNameToSku() }} /><span>ใช้ชื่อเดียวกับสินค้า</span></label></div>
              <input id="skuName" name="skuName" maxLength={160} required placeholder="ระบบจะนำชื่อสินค้ามาใส่ให้อัตโนมัติ" onInput={() => { if (useProductNameForSku) setUseProductNameForSku(false) }} />
              <small>สินค้าปกติใช้ชื่อเดียวกับสินค้าได้ เพื่อไม่ต้องกรอกข้อมูลซ้ำ</small>
            </div>

            <fieldset className="full product-identifier-zone"><legend>รหัสประจำสินค้า</legend><div className="product-identifier-zone-head"><span><strong>สร้างรหัสให้ครบในครั้งเดียว</strong><small>ระบบคำนวณรหัสตามโหมดที่เลือกและตรวจทุกค่ากับ Organization</small></span><button className="button compact secondary" type="button" onClick={generateAndCheckIdentifierGroup} disabled={!canManage || isIdentifierChecking} aria-busy={isIdentifierChecking}>✦ {isIdentifierChecking ? 'กำลังสร้างและตรวจสอบ…' : 'สร้างและตรวจสอบรหัสทั้งหมด'}</button></div><div className="product-form-grid two">
            <div className="product-form-field product-identifier-field"><span className="product-label-with-info"><label htmlFor="skuCode">รหัสสินค้า (SKU) *</label><ProductInfoGuide label="รหัสสินค้า (SKU)" description="รหัสประจำสินค้าในระบบ ใช้เชื่อมข้อมูลสินค้า สต๊อก และคำสั่งซื้อ โดยรหัสของแต่ละสินค้าต้องไม่ซ้ำกัน" example="ตัวอย่าง: BAG-MINI-TAN" /></span><input id="skuCode" name="skuCode" maxLength={80} required autoComplete="off" placeholder="BAG-MINI-TAN" aria-describedby="skuCodeStatus skuCodeHelp" onBlur={(event) => { applySkuCodeValue(event.currentTarget.value); scheduleIdentifierAutoCheck(0) }} /><div id="skuCodeStatus" className={`product-identifier-field-status ${identifierStatuses.skuCode.tone}`} role="status" aria-live="polite" aria-atomic="true"><span aria-hidden="true" />{identifierStatuses.skuCode.text}</div>{identifierSuggestions.skuCode ? <button className="product-identifier-suggestion" type="button" onClick={() => useIdentifierSuggestion('skuCode')}>ใช้รหัสแนะนำ {identifierSuggestions.skuCode}</button> : null}<small id="skuCodeHelp">กรอกเองได้ หรือใช้ปุ่มด้านบนเพื่อให้ระบบสร้างและตรวจสอบทั้งกลุ่ม</small></div>

            <div className="product-form-field product-identifier-field"><span className="product-label-with-info"><label htmlFor="salesCode">รหัสขาย / รหัส CF ประจำสินค้า</label><ProductInfoGuide label="รหัสขาย / รหัส CF ประจำสินค้า" description="รหัสสั้นที่ลูกค้าใช้ CF หรือพนักงานใช้ค้นหาสินค้าเพื่อเปิดบิล สามารถกรอกเอง ใช้รหัสเดียวกับ SKU หรือให้ระบบรันเลขต่อเนื่องได้" example="ตัวอย่าง: A001" /></span><span className="product-select-control"><select name="salesCodeMode" value={salesCodeMode} onChange={(event) => applySalesCodeMode(event.target.value as SalesCodeMode)} aria-label="วิธีกำหนดรหัสขายหรือรหัส CF ประจำสินค้า"><option value="manual">กรอกรหัสขาย / รหัส CF เอง</option><option value="same-sku">ใช้รหัสเดียวกับรหัสสินค้า (SKU)</option><option value="sequence">ให้ระบบรันเลขต่อเนื่อง</option></select></span><input id="salesCode" name="salesCode" maxLength={80} autoComplete="off" readOnly={salesCodeMode !== 'manual'} placeholder="A001" aria-describedby="salesCodeStatus salesCodeHelp" onBlur={(event) => { const value = event.currentTarget.value.trim().toUpperCase(); setFormFieldValue('salesCode', value); if (barcodeMode === 'internal-sales') setFormFieldValue('barcode', value); markIdentifierCheckStale(); scheduleIdentifierAutoCheck(0) }} /><div id="salesCodeStatus" className={`product-identifier-field-status ${identifierStatuses.salesCode.tone}`} role="status" aria-live="polite" aria-atomic="true"><span aria-hidden="true" />{identifierStatuses.salesCode.text}</div>{identifierSuggestions.salesCode ? <button className="product-identifier-suggestion" type="button" onClick={() => useIdentifierSuggestion('salesCode')}>ใช้รหัสแนะนำ {identifierSuggestions.salesCode}</button> : null}<small id="salesCodeHelp">ใช้เป็นรหัส CF ประจำสินค้าได้ · รหัส CF ชั่วคราวสำหรับแต่ละรอบไลฟ์กำหนดในเมนู Live Sale</small></div>

            <div className="product-form-field product-identifier-field"><span className="product-label-with-info"><label htmlFor="barcode">Barcode / รหัสสแกน</label><ProductInfoGuide label="Barcode / รหัสสแกน" description="เลือกใช้ Barcode จากผู้ผลิต หรือใช้รหัสสินค้า/รหัสขายเป็นรหัสสแกน โดยหนึ่งรหัสต้องชี้ไปยัง SKU เดียว" example="ตัวอย่าง: 8851234567890 หรือ A003" /></span><span className="product-select-control"><select name="barcodeMode" value={barcodeMode} onChange={(event) => applyBarcodeMode(event.target.value as BarcodeMode)} aria-label="วิธีกำหนด Barcode"><option value="manufacturer">กรอก Barcode จากผู้ผลิต</option><option value="internal-sku" disabled={!summaryFields.skuCode}>ใช้รหัสสินค้า (SKU) เป็น Barcode</option><option value="internal-sales" disabled={!summaryFields.salesCode}>ใช้รหัสขาย / รหัส CF เป็น Barcode</option><option value="none">ยังไม่กำหนด Barcode</option></select></span><input id="barcode" name="barcode" maxLength={128} inputMode="text" autoComplete="off" readOnly={barcodeMode !== 'manufacturer'} placeholder={barcodeMode === 'internal-sku' ? 'กรอกรหัสสินค้า (SKU) ก่อน' : barcodeMode === 'internal-sales' ? 'กรอกรหัสขาย / รหัส CF ก่อน' : '8851234567890'} aria-describedby="barcodeStatus barcodeHelp" onBlur={() => scheduleIdentifierAutoCheck(0)} /><div id="barcodeStatus" className={`product-identifier-field-status ${identifierStatuses.barcode.tone}`} role="status" aria-live="polite" aria-atomic="true"><span aria-hidden="true" />{identifierStatuses.barcode.text}</div>{identifierSuggestions.barcode ? <button className="product-identifier-suggestion" type="button" onClick={() => useIdentifierSuggestion('barcode')}>ใช้รหัสแนะนำ {identifierSuggestions.barcode}</button> : null}<small id="barcodeHelp">{barcodeSourceHelp}</small></div>

            {salesCodeMode === 'sequence' ? <div className="full product-sales-sequence"><label><span>Prefix</span><input name="salesSequencePrefix" value={salesSequencePrefix} onChange={(event) => { setSalesSequencePrefix(event.target.value.toUpperCase().replace(/[^A-Z0-9_-]/g, '').slice(0, 10)); markIdentifierCheckStale() }} maxLength={10} placeholder="A" /></label><label><span>เลขเริ่มต้น</span><input name="salesSequenceStart" type="number" min="0" max="99999999" step="1" value={salesSequenceStart} onChange={(event) => { setSalesSequenceStart(Math.max(0, Math.trunc(Number(event.target.value) || 0))); markIdentifierCheckStale() }} /></label><label><span>จำนวนหลัก</span><input name="salesSequenceDigits" type="number" min="2" max="8" step="1" value={salesSequenceDigits} onChange={(event) => { setSalesSequenceDigits(Math.min(8, Math.max(2, Math.trunc(Number(event.target.value) || 3)))); markIdentifierCheckStale() }} /></label><div className="product-sequence-preview"><span>รหัสปัจจุบัน → รหัสถัดไป</span><strong>{salesSequenceCurrent} → {salesSequenceNext}</strong></div><div className="product-sequence-policy"><span aria-hidden="true">ⓘ</span><span>Preview ยังไม่จองเลข เมื่อบันทึก Server จะตรวจ Unique ใน transaction และไม่สร้างข้อมูลหากรหัสชนกัน</span></div></div> : null}

            <div className="full product-identifier-assistant"><div className="product-identifier-assistant-head"><div><strong>ตรวจรหัสก่อนบันทึก</strong><span>ระบบตรวจให้อัตโนมัติเมื่อหยุดพิมพ์หรือออกจากช่อง · Server transaction เป็นผู้ยืนยัน Unique ขั้นสุดท้าย</span></div><button className="button compact secondary" type="button" onClick={() => checkIdentifiers()} disabled={!canManage || isIdentifierChecking} aria-busy={isIdentifierChecking}>{isIdentifierChecking ? 'กำลังตรวจรหัส…' : 'ตรวจสอบอีกครั้ง'}</button></div><div className={`product-identifier-result ${identifierFeedback.tone}`} role="status" aria-live="polite"><span aria-hidden="true">{identifierFeedback.tone === 'success' ? '✓' : identifierFeedback.tone === 'danger' ? '!' : identifierFeedback.text.startsWith('ข้อมูลรหัสเปลี่ยน') ? '!' : 'ⓘ'}</span><span>{identifierFeedback.text}</span></div></div>
            </div></fieldset>

            <div className="full product-sku-staging">
              <div className="product-sku-staging-head">
                <div><h3>รายการ SKU ที่เตรียมสร้าง <span className="product-count-badge">{skuDrafts.length}</span></h3><p>เก็บ SKU ปัจจุบันแล้วกรอกรุ่นถัดไปได้ โดยยังไม่ส่งข้อมูลเข้าระบบจริง</p></div>
                <div className="product-sku-staging-actions">
                  {editingSkuDraftId ? <button className="button compact secondary" type="button" onClick={() => { resetCurrentSkuEditor(); setIdentifierFeedback({ tone: 'info', text: 'ยกเลิกการแก้ไข SKU แล้ว รายการเดิมยังไม่เปลี่ยนแปลง' }) }} disabled={isSkuDraftChecking}>ยกเลิกแก้ไข</button> : null}
                  <button className="button compact product-primary-action" type="button" onClick={storeCurrentSkuDraft} disabled={!canManage || isSkuDraftChecking || (!editingSkuDraftId && skuDrafts.length >= SKU_DRAFT_MAX_ITEMS)} aria-busy={isSkuDraftChecking}>{isSkuDraftChecking ? 'กำลังตรวจและเก็บ SKU…' : editingSkuDraftId ? 'บันทึกการแก้ไข SKU' : '＋ เก็บ SKU นี้และเพิ่มรายการถัดไป'}</button>
                </div>
              </div>
              <div className="product-sku-staging-scroll">
                {skuDrafts.length === 0 ? <div className="product-sku-staging-empty">ยังไม่มี SKU ในรายการ — SKU ที่กำลังกรอกด้านบนยังไม่ถูกเก็บ</div> : null}
                <table className="product-sku-staging-table" hidden={skuDrafts.length === 0}>
                  <thead><tr><th>ชื่อรุ่น / ตัวเลือก</th><th>SKU Code</th><th>Sales Code</th><th>Barcode</th><th>Base Unit</th><th /></tr></thead>
                  <tbody>{skuDrafts.map((draft) => <tr key={draft.id} data-sku-draft-id={draft.id}><td><strong>{draft.name}</strong><small>ฉบับร่าง</small></td><td>{draft.skuCode}</td><td>{draft.salesCode || '—'}</td><td>{draft.barcode || '—'}</td><td>{draft.baseUnitCode}</td><td><div className="product-sku-staging-row-actions"><button className="button compact secondary" type="button" onClick={() => editSkuDraft(draft.id)} disabled={isSkuDraftChecking}>แก้ไข</button><button className="button compact danger" type="button" onClick={() => removeSkuDraft(draft.id)} disabled={isSkuDraftChecking} aria-label={`ลบ SKU ${draft.skuCode}`}>ลบ</button></div></td></tr>)}</tbody>
                </table>
              </div>
            </div>
            </> : null}
          </div>
        </section>

        <section id="pricing" className="product-creation-card">
          <header><span>4</span><div><h2>{structure === 'variant' ? 'ภาษีและต้นทุนร่วม' : 'ราคาและภาษี'}</h2><p>{structure === 'variant' ? 'ราคาขายกำหนดต่อ SKU ในตาราง Combination ส่วนภาษีและต้นทุนใช้ร่วมกันเป็นค่าเริ่มต้น' : 'ราคานี้เป็น Default price ของ SKU แรก ไม่ใช่ราคาทุกสาขาตลอดไป'}</p></div><small>Pricing</small></header>
          <div className={`product-form-grid ${structure === 'variant' ? 'two product-variant-shared-pricing-grid' : 'three product-pricing-grid'}`}>
                        {structure === 'variant' ? <div className="full product-variant-price-summary" role="status"><span aria-hidden="true">✓</span><span><strong>ราคาขายกำหนดในตาราง SKU Combination แล้ว</strong><small>{enabledVariantCombinations.length} SKU · {summaryPrice} · แก้ราคาแต่ละ SKU ได้จากตารางด้านบน</small></span></div> : <div className="product-form-field">
              <span className="product-label-with-info"><label htmlFor="salePrice">ราคาขาย *</label><ProductInfoGuide label="ราคาขาย" description="ราคาเริ่มต้นของ SKU; ระบบจริงอาจถูกแทนด้วยราคาตามสาขา ช่องทาง หรือช่วงเวลา" example="ตัวอย่าง: 1,290.00 THB" /></span>
              <span className="product-input-with-suffix"><input id="salePrice" name="salePrice" type="number" min="0" max="999999999.99" step="0.01" inputMode="decimal" placeholder="0.00" required /><span>THB</span></span>
            </div>}
            <label>
              <span>{structure === 'variant' ? 'ราคาต้นทุนร่วม (ไม่บังคับ)' : 'ราคาต้นทุน'}</span>
              <span className="product-input-with-suffix"><input name="costPrice" type="number" min="0" max="999999999.99" step="0.01" inputMode="decimal" placeholder="0.00" /><span>THB</span></span>
              <small>{structure === 'variant' ? 'ใช้เป็นต้นทุนเริ่มต้นของทุก Variant; ไม่ใช่ต้นทุนบัญชีจริง' : 'ข้อมูลจำกัดสิทธิ์; ไม่ใช่ต้นทุนบัญชีจริง'}</small>
            </label>
            <label>
              <span>{structure === 'variant' ? 'อัตราภาษีร่วม *' : 'อัตราภาษี *'}</span>
              <span className="product-select-control"><select name="taxCategory" value={taxCategory} onChange={(event) => setTaxCategory(event.target.value as TaxCategory)}><option value="standard">VAT 7%</option><option value="zero">อัตรา 0%</option><option value="exempt">ยกเว้นภาษี</option></select></span>
              <small>{structure === 'variant' ? 'ใช้ Tax Category และ Tax rate เดียวกันกับทุก Variant' : 'ระบบเก็บ Tax Category และ Tax rate ของ SKU'}</small>
            </label>
            <input type="hidden" name="taxRate" value={taxCategory === 'standard' ? '7' : '0'} />
            <label className="product-tax-inclusive"><input name="taxInclusive" type="checkbox" defaultChecked /><span><strong>ราคาขายรวมภาษีแล้ว</strong><small>Invoice จะเก็บ Tax snapshot ณ เวลาขาย</small></span></label>
          </div>
        </section>

        <section id="physical" className="product-creation-card">
          <header><span>5</span><div><h2>น้ำหนักและขนาด</h2><p>ข้อมูลสำหรับขนส่ง คำนวณพื้นที่ และเลือกบรรจุภัณฑ์</p></div><small>SKU / Packaging</small></header>
          <div className="product-physical-tabs" role="tablist" aria-label="ชนิดน้ำหนักและขนาด">
            <button id="productPhysicalTab" className="product-physical-tab" type="button" role="tab" aria-selected={physicalTab === 'product'} aria-controls="productPhysicalPanel" tabIndex={physicalTab === 'product' ? 0 : -1} onClick={() => setPhysicalTab('product')}>น้ำหนักและขนาดสินค้า</button>
            <button id="boxPhysicalTab" className="product-physical-tab" type="button" role="tab" aria-selected={physicalTab === 'box'} aria-controls="boxPhysicalPanel" tabIndex={physicalTab === 'box' ? 0 : -1} onClick={() => setPhysicalTab('box')}>น้ำหนักและขนาดกล่อง</button>
          </div>
          <div id="productPhysicalPanel" className="product-physical-panel" role="tabpanel" aria-labelledby="productPhysicalTab" hidden={physicalTab !== 'product'}>
            <div className="product-form-grid three product-physical-grid">
              <label><span>น้ำหนักสินค้า (Net)</span><span className="product-input-with-suffix"><input name="productWeightKg" type="number" min="0" max="100000" step="0.001" inputMode="decimal" placeholder="0.000" /><span>kg</span></span></label>
              <label><span>ขนาดสินค้า — ยาว</span><span className="product-input-with-suffix"><input name="productLengthCm" type="number" min="0" max="100000" step="0.1" inputMode="decimal" /><span>cm</span></span></label>
              <label><span>ขนาดสินค้า — กว้าง</span><span className="product-input-with-suffix"><input name="productWidthCm" type="number" min="0" max="100000" step="0.1" inputMode="decimal" /><span>cm</span></span></label>
              <label><span>ขนาดสินค้า — สูง</span><span className="product-input-with-suffix"><input name="productHeightCm" type="number" min="0" max="100000" step="0.1" inputMode="decimal" /><span>cm</span></span></label>
            </div>
            <div className="product-inline-note">ขนาดสินค้าใช้วางแผนพื้นที่และเลือกบรรจุภัณฑ์ ไม่รวมวัสดุห่อหรือกล่องจัดส่ง</div>
          </div>
          <div id="boxPhysicalPanel" className="product-physical-panel" role="tabpanel" aria-labelledby="boxPhysicalTab" hidden={physicalTab !== 'box'}>
            <div className="product-form-grid three product-physical-grid">
              <label><span>น้ำหนักรวมกล่อง (Gross)</span><span className="product-input-with-suffix"><input name="packageWeightKg" type="number" min="0" max="100000" step="0.001" inputMode="decimal" placeholder="0.000" /><span>kg</span></span></label>
              <label><span>ขนาดกล่อง — ยาว</span><span className="product-input-with-suffix"><input name="packageLengthCm" type="number" min="0" max="100000" step="0.1" inputMode="decimal" /><span>cm</span></span></label>
              <label><span>ขนาดกล่อง — กว้าง</span><span className="product-input-with-suffix"><input name="packageWidthCm" type="number" min="0" max="100000" step="0.1" inputMode="decimal" /><span>cm</span></span></label>
              <label><span>ขนาดกล่อง — สูง</span><span className="product-input-with-suffix"><input name="packageHeightCm" type="number" min="0" max="100000" step="0.1" inputMode="decimal" /><span>cm</span></span></label>
            </div>
            <div className="product-inline-note warning">ถ้ามีหลายหน่วยบรรจุ ระบบจริงควรเก็บน้ำหนักและขนาดกล่องแยกต่อ Packaging Level</div>
          </div>
          <div className={`product-physical-validation ${physicalFeedback.length ? 'danger' : ''}`} role="status" aria-live="polite">{physicalFeedback.join(' · ')}</div>
        </section>

        <section id="packaging" className="product-creation-card">
          <header><span>6</span><div><h2>หน่วยบรรจุและ Bundle</h2><p>ทดลองขายยกแพ็ก/ลัง หรือรวมหลาย SKU โดย Stock ยัง resolve เป็น Component SKU</p></div><small>Future contract</small></header>
          <div className="product-switch-row"><div><strong>ขายหลายหน่วยบรรจุ</strong><small>เช่น 1 แพ็ก = 6 ชิ้น หรือ 1 ลัง = 24 ชิ้น</small></div><label className="product-switch"><input name="packagingEnabled" type="checkbox" checked={packagingEnabled} onChange={(event) => setPackagingEnabled(event.target.checked)} /><span aria-hidden="true" /></label></div>
          {packagingEnabled ? <div className="product-packaging-editor">
            <div className="product-editor-scroll"><table className="product-editor-table"><thead><tr><th>ชื่อหน่วยขาย</th><th>Unit Code</th><th>ตัวคูณ Base Unit</th><th>การตัด Stock</th><th>Barcode</th><th>Sales Code</th><th>ราคาขาย</th><th /></tr></thead><tbody>
              <tr className="base-row"><td><input value={`หน่วยฐาน (${summaryFields.baseUnitCode || 'piece'})`} readOnly aria-label="ชื่อหน่วยฐาน" /></td><td><input value={summaryFields.baseUnitCode || 'piece'} readOnly aria-label="Unit Code หน่วยฐาน" /></td><td><input value="1" readOnly aria-label="ตัวคูณหน่วยฐาน" /></td><td><span className="product-conversion-preview"><strong>1 หน่วยฐาน</strong>= 1 {summaryFields.baseUnitCode || 'piece'}</span></td><td><input value="—" readOnly aria-label="Barcode หน่วยฐาน" /></td><td><input value="—" readOnly aria-label="Sales Code หน่วยฐาน" /></td><td><input value="—" readOnly aria-label="ราคาหน่วยฐาน" /></td><td /></tr>
              {sellUnits.map((unit) => <tr key={unit.id}><td><input value={unit.name} maxLength={80} onChange={(event) => updateSellUnit(unit.id, { name: event.target.value })} aria-label="ชื่อหน่วยขาย" /></td><td><input value={unit.unitCode} maxLength={32} pattern="[a-z][a-z0-9_]{0,31}" onChange={(event) => updateSellUnit(unit.id, { unitCode: event.target.value.toLowerCase() })} aria-label="Unit Code" /></td><td><input value={unit.baseQuantity} type="number" min="1.000001" max="999999999" step="0.000001" onChange={(event) => updateSellUnit(unit.id, { baseQuantity: Number(event.target.value) })} aria-label="ตัวคูณ Base Unit" /></td><td><span className="product-conversion-preview"><strong>1 {unit.name || 'หน่วยขาย'}</strong>= {unit.baseQuantity || 0} {summaryFields.baseUnitCode || 'piece'}<br />ขาย 2 → ตัด {(unit.baseQuantity || 0) * 2} {summaryFields.baseUnitCode || 'piece'}</span></td><td><input value={unit.barcode} maxLength={128} onChange={(event) => updateSellUnit(unit.id, { barcode: event.target.value })} aria-label="Barcode หน่วยขาย" /></td><td><input value="Future contract" readOnly disabled title="R7.1 ยังไม่รองรับ Sales Code แยกต่อ Sell Unit" aria-label="Sales Code ยังไม่รองรับ" /></td><td><input value="Future contract" readOnly disabled title="R7.1 ยังไม่รองรับราคาแยกต่อ Sell Unit" aria-label="ราคาขายยังไม่รองรับ" /></td><td><button className="product-table-action" type="button" onClick={() => setSellUnits((current) => current.filter((item) => item.id !== unit.id))} aria-label={`ลบหน่วยขาย ${unit.name}`}>×</button></td></tr>)}
            </tbody></table></div>
            <div className="product-packaging-presets" aria-label="เพิ่มหน่วยขายอย่างรวดเร็ว"><span>เพิ่มอย่างรวดเร็ว:</span><button type="button" onClick={() => addSellUnitPreset('pair')}>คู่ ×2</button><button type="button" onClick={() => addSellUnitPreset('pack')}>แพ็ค ×6</button><button type="button" onClick={() => addSellUnitPreset('box')}>กล่อง ×12</button><button type="button" onClick={() => addSellUnitPreset('case')}>ลัง ×24</button><button type="button" onClick={() => addSellUnitPreset('custom')}>＋ กำหนดเอง</button></div>
            <div className="product-inline-note">Base Unit คือหน่วยที่ Stock เก็บจริง ส่วนหน่วยขายเป็นตัวแปลง เช่น Base Unit = ชิ้น, 1 แพ็ค = 6 ชิ้น; ขาย 2 แพ็คต้องตัด 12 ชิ้นจาก SKU เดิม</div>
            <div className="product-inline-note warning">R7.1 บันทึกชื่อ, Unit Code, ตัวคูณและ Barcode ได้แล้ว ส่วน Sales Code/ราคาแยกต่อหน่วยขายยังเป็น Future contract</div>
          </div> : null}
          {structure === 'bundle' ? <div className="product-bundle-editor">
            <div className="product-form-grid two"><label><span>วิธีจัดการ Stock ของ Bundle</span><span className="product-select-control"><select name="bundleStockMode" value={bundleStockMode} onChange={(event) => setBundleStockMode(event.target.value as BundleStockMode)}><option value="virtual">Virtual Bundle — ตัด Component ตอนขาย</option><option value="assembled">Pre-assembled — ประกอบเป็น Stock ชุด</option></select></span></label><label><span>Bundle SKU Code</span><input value={summaryFields.skuCode || 'ใช้ SKU Code ในส่วนที่ 3'} readOnly /></label></div>
            <div className={`product-inline-note ${bundleStockMode === 'assembled' ? 'warning' : ''}`}>{bundleStockMode === 'assembled' ? 'Pre-assembled Bundle ต้องใช้ Assembly Command ลด Component และเพิ่ม Stock ของ Bundle SKU ก่อนนำไปขาย — R7.1 ยังไม่รองรับการบันทึกโหมดนี้' : 'Bundle แบบ Virtual ไม่มี Stock ของชุดเอง เมื่อขายต้องตัด Component SKU ทุกตัวตามจำนวน'}</div>
            <div className="product-editor-scroll"><table className="product-editor-table product-bundle-table"><thead><tr><th>Component SKU</th><th>ชื่อสินค้า</th><th>จำนวน</th><th>Base Unit</th><th /></tr></thead><tbody>{bundleComponents.map((component) => { const selected = bundleSkus.find((sku) => sku.id === component.skuId); return <tr key={component.id}><td><span className="product-select-control"><select value={component.skuId} onChange={(event) => updateBundleComponent(component.id, { skuId: event.target.value })} aria-label="Component SKU">{bundleSkus.map((sku) => <option key={sku.id} value={sku.id}>{sku.skuCode}</option>)}</select></span></td><td>{selected?.name ?? '—'}</td><td><input value={component.quantity} type="number" min="0.000001" max="999999999" step="0.000001" onChange={(event) => updateBundleComponent(component.id, { quantity: Number(event.target.value) })} aria-label="จำนวน Component" /></td><td>อ่านจาก SKU</td><td><button className="product-table-action" type="button" onClick={() => setBundleComponents((current) => current.filter((item) => item.id !== component.id))} aria-label={`ลบ Component ${selected?.skuCode ?? ''}`}>×</button></td></tr> })}</tbody></table></div>
            <button className="button compact secondary product-add-component" type="button" onClick={addBundleComponent} disabled={bundleComponents.length >= bundleSkus.length}>＋ เพิ่ม Component SKU</button>
          </div> : <p className="product-form-note">เลือก “Bundle / Kit” ในข้อมูลทั่วไปเพื่อกำหนดส่วนประกอบ</p>}
        </section>

        <section id="inventory" className="product-creation-card">
          <header><span>7</span><div><h2>สาขาและนโยบายสต๊อก</h2><p>การเปิดขายและค่าควบคุมต่อ SKU + Location ไม่ใช่ข้อมูล Product โดยตรง</p></div><small>Inventory Policy</small></header>
          <div className="product-branch-field">
            <span className="product-field-label">สาขาที่เปิดขาย</span>
            {branches.length ? <div className="product-branch-grid">{branches.map((branch) => {
              const checked = selectedBranchIds.includes(branch.id)
              return <label className={`product-branch-option${checked ? ' selected' : ''}`} key={branch.id}><input type="checkbox" value={branch.id} checked={checked} onChange={(event) => updateBranchSelection(branch.id, event.target.checked)} /><span><strong>{branch.code}</strong><small>{branch.name}</small></span></label>
            })}</div> : <p className="product-form-note">ยังไม่มีสาขาที่ใช้งาน</p>}
          </div>
          <div className="product-inline-note warning">การเลือกสาขารอบนี้บันทึกใน Browser Draft เพื่อทดสอบ UI เท่านั้น; R7.1 ยังไม่มี Branch sales-scope contract จึงยังไม่ส่งค่าชุดนี้ไป Backend</div>
          <div className="product-form-grid three product-inventory-policy-grid">
            <label><span>กันสต๊อกสินค้า (Safety Stock)</span><input name="safetyStock" type="number" min="0" max="999999999" step="0.000001" inputMode="decimal" defaultValue="0" /><small>จำนวน Buffer ที่ไม่ต้องการนำไปเสนอขาย</small></label>
            <label><span>จำนวน Min ในการเติม</span><input name="reorderMin" type="number" min="0" max="999999999" step="0.000001" inputMode="decimal" placeholder="0" />{inventoryFeedback.includes('Min ต้องไม่น้อยกว่า Safety Stock') ? <small className="product-field-error">Min ต้องไม่น้อยกว่า Safety Stock</small> : null}</label>
            <label><span>จำนวน Max ในการเติม</span><input name="reorderMax" type="number" min="0" max="999999999" step="0.000001" inputMode="decimal" placeholder="0" />{inventoryFeedback.includes('Max ต้องไม่น้อยกว่า Min') ? <small className="product-field-error">Max ต้องไม่น้อยกว่า Min</small> : null}</label>
            <label><span>จำนวนที่ใช้ได้</span><input type="text" value="คำนวณหลังสร้าง SKU และรับ Stock" readOnly /><small>Derived value ห้ามกรอกหรือแก้โดยตรง</small></label>
          </div>
          {inventoryFeedback.length ? <div className="product-inventory-validation danger" role="alert">{inventoryFeedback.join(' · ')}</div> : null}
          <div className="product-inline-note warning">Reserved/Allocated จาก Order เป็น Transaction คนละส่วนกับ Safety Stock และยังไม่เปิดใช้ใน Contract ปัจจุบัน</div>
        </section>

        <section id="metadata" className="product-creation-card">
          <header><span>8</span><div><h2>ข้อมูลระบบ</h2><p>ระบบสร้างอัตโนมัติและแสดงแบบอ่านอย่างเดียวหลังบันทึก</p></div><small>Read-only</small></header>
          <dl className="product-system-metadata">
            <div><dt>วันที่สร้าง</dt><dd>กำหนดหลังบันทึก</dd></div>
            <div><dt>แก้ไขล่าสุด</dt><dd>กำหนดหลังบันทึก</dd></div>
            <div><dt>ผู้สร้าง</dt><dd>{actorEmail || 'ผู้ใช้ที่เข้าสู่ระบบปัจจุบัน'}</dd></div>
          </dl>
          <div className="product-security-summary">
            <div className="product-security-summary-head"><span aria-hidden="true">♢</span><div><strong>Validation &amp; Security Guardrails</strong><small>UI ช่วยตรวจเบื้องต้น แต่ Server ยังเป็น Authority เสมอ</small></div></div>
            <ul>
              <li>ข้อความเป็น Plain text, Normalize และจำกัดความยาว</li>
              <li>Code ใช้ A–Z, 0–9, จุด, ขีดกลางหรือขีดล่าง</li>
              <li>ตัวเลขมี Min/Max และตรวจ Cross-field</li>
              <li>Browser Draft ไม่เกิน 256 KB และไม่เก็บไฟล์ภาพ</li>
              <li>Image Gate ตรวจ MIME และขนาด; Magic bytes, Decode/Re-encode และ Strip EXIF ยังเป็น Security hardening ที่ต้องปิดก่อน Production</li>
              <li>Storage path สุ่ม; Organization, Actor และ Permission มาจาก Session ฝั่ง Server ({organizationName})</li>
            </ul>
            <div className="product-security-validation-status warning" role="status" aria-live="polite">Guardrails ปัจจุบันทำงาน · Image content hardening ยังเป็น Known gap</div>
          </div>
        </section>
      </main>

      <aside className="product-creation-summary" aria-label="สรุปก่อนสร้าง">
        <div className="product-summary-head"><h2>สรุปก่อนสร้าง</h2><p>กรอกข้อมูลแล้ว {completionPercent}%</p><div className="product-summary-progress" role="progressbar" aria-label="ความครบถ้วนของข้อมูล" aria-valuemin={0} aria-valuemax={100} aria-valuenow={completionPercent}><span style={{ width: `${completionPercent}%` }} /></div></div>
        <div className="product-summary-content"><div className="product-summary-product"><strong>{summaryFields.name || 'ยังไม่ได้ตั้งชื่อสินค้า'}</strong><span>{summaryCategory}</span></div><dl className="product-summary-list"><div><dt>รูปแบบ</dt><dd>{structure === 'standard' ? 'สินค้าปกติ' : structure === 'variant' ? 'มีตัวเลือก / Variant' : 'Bundle / Kit'}</dd></div><div><dt>SKU</dt><dd>{structure === 'variant' ? `${enabledVariantCombinations.length} Combination` : skuDrafts.length ? `${skuDrafts.length} รายการ · ${skuDrafts[0].skuCode}` : summaryFields.skuCode || '—'}</dd></div><div><dt>ราคา</dt><dd>{summaryPrice}</dd></div><div><dt>รูปภาพ</dt><dd>{images.length} / 9</dd></div><div><dt>สาขา</dt><dd>{summaryBranches}</dd></div><div><dt>หน่วยบรรจุ</dt><dd>{summaryPackaging}</dd></div><div><dt>Bundle</dt><dd>{summaryBundle}</dd></div></dl></div>
        <nav className="product-section-timeline" aria-label="ความคืบหน้าการสร้างสินค้า">{summarySections.map((section, index) => { const issueCount = validationIssueCountForSection(section.id); const complete = issueCount === 0 && sectionCompletion[section.id]; const current = section.id === currentSectionId; const firstIssue = validationIssues.find((issue) => issue.sectionId === section.id); return <a key={section.id} href={`#${section.id}`} data-complete={complete ? 'true' : 'false'} data-invalid={issueCount ? 'true' : 'false'} aria-current={current ? 'step' : undefined} aria-label={issueCount ? `${section.label} มี ${issueCount} จุดที่ต้องแก้` : undefined} onClick={firstIssue ? (event) => { event.preventDefault(); focusValidationIssue(firstIssue) } : undefined}><span className="product-timeline-marker">{issueCount ? '!' : complete ? '✓' : index + 1}</span><span>{section.label}</span><span className="product-timeline-state">{issueCount ? `${issueCount} จุดต้องแก้` : current && !complete ? 'กำลังกรอก' : complete ? 'เสร็จแล้ว' : section.optional ? 'ไม่บังคับ' : 'ยังไม่ครบ'}</span></a> })}</nav>
        <div className="product-initial-status-summary" role="note"><span><strong>สถานะหลังสร้าง</strong><small>ตรวจสอบก่อนเปิดขายและรับ Stock</small></span><span className="product-status-pill draft"><i aria-hidden="true" />ฉบับร่าง</span></div>
        <div className="product-summary-actions">
          <button className="button product-primary-action" type="submit" disabled={!canManage || isPending}>{isPending ? 'กำลังบันทึก…' : pendingDraft ? 'อัปโหลดต่อ' : 'ตรวจสอบและสร้าง'}</button>
          <button className="button secondary" type="button" onClick={() => saveBrowserDraft()} disabled={isPending}>บันทึกร่าง</button>
          <Link className="button secondary" href={productsHref}>ยกเลิก</Link>
          {completedProductId ? <Link className="product-created-link" href={`${productsHref}?product=${completedProductId}`}>ดูรายละเอียดสินค้าที่สร้าง →</Link> : null}
        </div>
      </aside>
    </form>
    {creationSuccess ? <div className="product-success-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) closeSuccessDialog() }}><section ref={successDialogRef} className="product-success-dialog" role="dialog" aria-modal="true" aria-labelledby="productSuccessTitle" aria-describedby="productSuccessMessage" onKeyDown={handleSuccessDialogKeyDown}><div className="product-success-body"><div className="product-success-mark" aria-hidden="true">✓</div><h2 id="productSuccessTitle">สร้างสินค้าเรียบร้อยแล้ว</h2><p id="productSuccessMessage">{creationSuccess.productName} พร้อม {creationSuccess.skuCount} SKU ถูกสร้างเป็นฉบับร่าง และอัปโหลดรูปสินค้าครบแล้ว</p><span>ระบบยังไม่เปิดใช้งานสินค้าและยังไม่เพิ่ม Stock จนกว่าจะผ่านขั้นตอนที่เกี่ยวข้อง</span></div><footer><div className="product-success-actions"><Link className="button secondary" href={productsHref}>กลับหน้ารายการสินค้า</Link><button className="button product-primary-action" type="button" onClick={createNextProduct}>สร้างสินค้ารายการถัดไป</button></div><Link className="product-success-detail-link" href={`${productsHref}?product=${creationSuccess.productId}`}>ดูรายละเอียดสินค้านี้ →</Link></footer></section></div> : null}
    <button className="product-back-to-top" type="button" aria-label="กลับด้านบน" title="กลับด้านบน" onClick={() => window.scrollTo({ top: 0, behavior: 'smooth' })}>↑</button>
  </>
}

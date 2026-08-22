'use client'

import { useEffect, useMemo, useRef, useState, type Dispatch, type KeyboardEvent, type SetStateAction } from 'react'
import { checkVariantProductIdentifiersAction, previewGlobalSalesCodeRangeAction, previewVariantSkuSequenceAction } from '@/app/actions/foundation'
import { variantIdentifierCheckFailureMessage, withVariantIdentifierCheckTimeout } from '@/lib/foundation/variant-identifier-check-ui'
import { withGlobalSalesCodePreviewTimeout } from '@/lib/foundation/global-sales-code-preview-ui'
import { formatGlobalSalesCode, GLOBAL_SALES_CODE_UI_TEXT, nextGlobalSalesCode, validateGlobalSalesCode } from '@/lib/foundation/global-sales-code'
import { ProductCreationCombobox } from './product-creation-combobox'

export type VariantOptionValueDraft = {
  id: string
  name: string
  code: string
}

export type VariantOptionGroupDraft = {
  id: string
  name: string
  kind: 'color' | 'size' | 'custom'
  values: VariantOptionValueDraft[]
}

export type VariantCombinationDraft = {
  key: string
  enabled: boolean
  skuCode: string
  salesCode: string
  price: string
  barcode: string
  imageId: string
  status: 'draft' | 'active'
  optionValueIds: string[]
}

type ProductImageOption = { id: string; name: string }

export type VariantSkuSequenceDraft = {
  prefix: string
  sequence: number
  digits: number
}

type Props = {
  organizationId: string
  groups: VariantOptionGroupDraft[]
  setGroups: Dispatch<SetStateAction<VariantOptionGroupDraft[]>>
  combinations: VariantCombinationDraft[]
  setCombinations: Dispatch<SetStateAction<VariantCombinationDraft[]>>
  images: ProductImageOption[]
  onIdentifierCheckChange?: (ready: boolean) => void
  onSkuSequenceChange?: (value: VariantSkuSequenceDraft) => void
  disabled?: boolean
}

type VariantIdentifierCollision = {
  key: string
  field: 'sku_code' | 'sales_code' | 'barcode'
  value: string
  suggestion?: string
  reason: 'duplicate_in_form' | 'already_exists'
}

const knownVariantCodes: Record<string, string> = {
  สีฟ้า: 'BLU', ฟ้า: 'BLU', สีน้ำเงิน: 'BLU', สีดำ: 'BLK', ดำ: 'BLK',
  สีขาว: 'WHT', ขาว: 'WHT', สีแดง: 'RED', แดง: 'RED', สีเงิน: 'SLV',
  เงิน: 'SLV', สีทอง: 'GLD', ทอง: 'GLD',
}

export const DEFAULT_VARIANT_GROUPS: VariantOptionGroupDraft[] = [
  {
    id: 'option-color', name: 'สี', kind: 'color',
    values: [
      { id: 'color-blue', name: 'สีฟ้า', code: 'BLU' },
      { id: 'color-black', name: 'สีดำ', code: 'BLK' },
    ],
  },
  {
    id: 'option-size', name: 'ไซซ์', kind: 'size',
    values: [
      { id: 'size-s', name: 'S', code: 'S' },
      { id: 'size-m', name: 'M', code: 'M' },
      { id: 'size-l', name: 'L', code: 'L' },
      { id: 'size-xl', name: 'XL', code: 'XL' },
    ],
  },
]

export function variantValueCode(name: string, fallbackIndex = 1) {
  const normalized = name.normalize('NFKC').trim()
  if (knownVariantCodes[normalized]) return knownVariantCodes[normalized]
  const latin = normalized.normalize('NFKD').toUpperCase().match(/[A-Z0-9]+/g)?.join('').slice(0, 6)
  return latin || `V${fallbackIndex}`
}

export function sanitizeVariantGroups(value: unknown): VariantOptionGroupDraft[] {
  if (!Array.isArray(value)) return DEFAULT_VARIANT_GROUPS
  const groups = value.slice(0, 3).flatMap((entry, groupIndex) => {
    if (!entry || typeof entry !== 'object') return []
    const record = entry as Partial<VariantOptionGroupDraft>
    const name = String(record.name ?? '').normalize('NFC').trim().slice(0, 40)
    const kind: VariantOptionGroupDraft['kind'] = record.kind === 'color' || record.kind === 'size' ? record.kind : 'custom'
    const values = Array.isArray(record.values) ? record.values.slice(0, 12).flatMap((option, valueIndex) => {
      if (!option || typeof option !== 'object') return []
      const item = option as Partial<VariantOptionValueDraft>
      const optionName = String(item.name ?? '').normalize('NFC').trim().slice(0, 40)
      if (!optionName) return []
      const code = String(item.code ?? variantValueCode(optionName, valueIndex + 1))
        .toUpperCase().replace(/[^A-Z0-9_-]/g, '').slice(0, 12)
      return [{ id: String(item.id ?? crypto.randomUUID()).slice(0, 80), name: optionName, code }]
    }) : []
    return [{ id: String(record.id ?? `option-${groupIndex + 1}`).slice(0, 80), name, kind, values }]
  })
  return groups.length ? groups : DEFAULT_VARIANT_GROUPS
}

export function sanitizeVariantCombinations(value: unknown): VariantCombinationDraft[] {
  if (!Array.isArray(value)) return []
  return value.slice(0, 100).flatMap((entry) => {
    if (!entry || typeof entry !== 'object') return []
    const item = entry as Partial<VariantCombinationDraft>
    const key = String(item.key ?? '').slice(0, 500)
    if (!key) return []
    return [{
      key,
      enabled: item.enabled !== false,
      skuCode: String(item.skuCode ?? '').toUpperCase().replace(/[^A-Z0-9._-]/g, '').slice(0, 80),
      salesCode: String(item.salesCode ?? '').toUpperCase().replace(/[^A-Z0-9._-]/g, '').slice(0, 80),
      price: Number.isFinite(Number(item.price)) && Number(item.price) >= 0 ? String(item.price) : '',
      barcode: String(item.barcode ?? '').toUpperCase().replace(/[^A-Z0-9._-]/g, '').slice(0, 128),
      imageId: String(item.imageId ?? '').slice(0, 80),
      status: item.status === 'active' ? 'active' : 'draft',
      optionValueIds: Array.isArray(item.optionValueIds) ? item.optionValueIds.map(String).slice(0, 3) : key.split('::'),
    }]
  })
}

function cartesianValues(groups: VariantOptionGroupDraft[]) {
  return groups.reduce<VariantOptionValueDraft[][]>(
    (rows, group) => rows.flatMap((row) => group.values.map((value) => [...row, value])),
    [[]],
  ).slice(0, 100)
}

export function synchronizeVariantCombinations(
  groups: VariantOptionGroupDraft[],
  previous: VariantCombinationDraft[],
  prefix = 'SKU',
) {
  const completeGroups = groups.filter((group) => group.name.trim() && group.values.length > 0)
  if (completeGroups.length !== groups.length) return []
  const previousByKey = new Map(previous.map((item) => [item.key, item]))
  const safePrefix = prefix.toUpperCase().replace(/[^A-Z0-9_-]/g, '').slice(0, 24) || 'SKU'
  return cartesianValues(completeGroups).map((values) => {
    const key = values.map((value) => value.id).join('::')
    return previousByKey.get(key) ?? {
      key,
      enabled: true,
      skuCode: `${safePrefix}-${values.map((value) => value.code).join('-')}`.slice(0, 80),
      salesCode: '',
      price: '',
      barcode: '',
      imageId: '',
      status: 'draft' as const,
      optionValueIds: values.map((value) => value.id),
    }
  })
}

export function formatVariantSkuBase(prefix: string, sequence: number, digits = 3) {
  const safePrefix = prefix.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 12) || 'SKU'
  const safeSequence = Math.max(1, Math.trunc(sequence || 1))
  const safeDigits = Math.max(3, Math.min(8, Math.trunc(digits || 3)))
  return `${safePrefix}-${String(safeSequence).padStart(safeDigits, '0')}`
}

const salesCodeModeOptions = [
  { value: 'sequence', label: 'ให้ระบบรันเลขต่อเนื่อง' },
  { value: 'same-sku', label: 'ใช้รหัสเดียวกับรหัสสินค้า (SKU)' },
  { value: 'manual', label: 'กรอกเองแต่ละ Variant' },
]

const barcodeModeOptions = [
  { value: 'none', label: 'ยังไม่กำหนด Barcode' },
  { value: 'sku', label: 'ใช้รหัสสินค้า (SKU) เป็น Barcode' },
  { value: 'sales', label: 'ใช้รหัสขาย / รหัส CF เป็น Barcode' },
  { value: 'sequence', label: 'สร้าง Barcode ภายในแบบต่อเนื่อง' },
]

const variantStatusOptions = [
  { value: 'draft', label: 'ฉบับร่าง' },
  { value: 'active', label: 'ใช้งานอยู่' },
]

const VARIANT_SALES_CODE_PREVIEW_DEBOUNCE_MS = 120
const VARIANT_SALES_CODE_PREVIEW_CACHE_TTL_MS = 30_000
type VariantSalesCodePreviewCacheEntry = {
  expiresAt: number
  prefix: string
  startNumber: number
  firstCode: string
  lastCode: string
  movedPrefix: boolean
}
const variantSalesCodePreviewCache = new Map<string, VariantSalesCodePreviewCacheEntry>()

export function nextVariantSkuProductSequence(sequence: number) {
  return Math.min(99999999, Math.max(1, Math.trunc(sequence || 1)) + 1)
}

export function findDuplicateVariantIdentifiers(
  variants: Array<{ key: string; skuCode: string; salesCode: string; barcode: string }>,
): VariantIdentifierCollision[] {
  const fields = [
    ['sku_code', 'skuCode'],
    ['sales_code', 'salesCode'],
    ['barcode', 'barcode'],
  ] as const

  return fields.flatMap(([field, property]) => {
    const keysByValue = new Map<string, string[]>()
    variants.forEach((variant) => {
      const value = variant[property].normalize('NFKC').trim().toUpperCase()
      if (!value) return
      keysByValue.set(value, [...(keysByValue.get(value) ?? []), variant.key])
    })
    return [...keysByValue.entries()].flatMap(([value, keys]) => keys.length > 1
      ? keys.map((key) => ({ key, field, value, reason: 'duplicate_in_form' as const }))
      : [])
  })
}

function groupKind(name: string): VariantOptionGroupDraft['kind'] {
  const normalized = name.toLocaleLowerCase('th-TH')
  if (normalized.includes('สี') || normalized === 'color') return 'color'
  if (normalized.includes('ไซซ์') || normalized.includes('ขนาด') || normalized === 'size') return 'size'
  return 'custom'
}

export function VariantCreationBuilder({
  organizationId, groups, setGroups, combinations, setCombinations, images,
  onIdentifierCheckChange, onSkuSequenceChange, disabled = false,
}: Props) {
  const [skuPrefix, setSkuPrefix] = useState('')
  const [skuProductSequence, setSkuProductSequence] = useState(1)
  const [bulkPrice, setBulkPrice] = useState('')
  const [bulkBarcode, setBulkBarcode] = useState<'none' | 'sku' | 'sales' | 'sequence'>('none')
  const [bulkStatus, setBulkStatus] = useState<'draft' | 'active'>('draft')
  const [salesCodeMode, setSalesCodeMode] = useState<'manual' | 'same-sku' | 'sequence'>('sequence')
  const [salesCodePrefix, setSalesCodePrefix] = useState('A')
  const [salesCodeStart, setSalesCodeStart] = useState(1)
  const salesCodeDigits = 3
  const [salesCodePreview, setSalesCodePreview] = useState<{
    status: 'idle' | 'loading' | 'ready' | 'error' | 'timeout' | 'denied'
    firstCode?: string
    lastCode?: string
    movedPrefix?: boolean
    cached?: boolean
  }>({ status: 'idle' })
  const [serverSequencePreview, setServerSequencePreview] = useState<{
    status: 'idle' | 'loading' | 'ready' | 'error'
    nextSequence?: number
  }>({ status: 'idle' })
  const [identifierCheck, setIdentifierCheck] = useState<{
    tone: 'idle' | 'checking' | 'success' | 'danger'
    text: string
    collisionKeys: string[]
    collisions: VariantIdentifierCollision[]
  }>({
    tone: 'idle', text: 'ระบบจะตรวจ SKU, รหัส CF และ Barcode ของทุก Variant อัตโนมัติ',
    collisionKeys: [], collisions: [],
  })
  const [isIdentifierChecking, setIsIdentifierChecking] = useState(false)
  const checkRequestRef = useRef(0)
  const checkInFlightRef = useRef(false)
  const isMountedRef = useRef(true)
  const sequencePreviewRequestRef = useRef(0)
  const salesCodePreviewRequestRef = useRef(0)
  const manuallyEditedSkuKeysRef = useRef(new Set<string>())

  const enabledIdentifiers = useMemo(() => combinations.filter((item) => item.enabled).map((item) => ({
    key: item.key, skuCode: item.skuCode, salesCode: item.salesCode, barcode: item.barcode,
  })), [combinations])
  const enabledIdentifierSignature = JSON.stringify(enabledIdentifiers)
  const skuBaseCode = formatVariantSkuBase(skuPrefix, skuProductSequence)
  const recommendedProductSequence = serverSequencePreview.status === 'ready'
    ? serverSequencePreview.nextSequence ?? nextVariantSkuProductSequence(skuProductSequence)
    : nextVariantSkuProductSequence(skuProductSequence)
  const skuSequenceConflict = serverSequencePreview.status === 'ready'
    && skuProductSequence < recommendedProductSequence
  const formattedSkuProductSequence = String(skuProductSequence).padStart(3, '0')
  const formattedRecommendedProductSequence = String(recommendedProductSequence).padStart(3, '0')
  const nextSalesCodeAfterRange = salesCodePreview.lastCode ? nextGlobalSalesCode(salesCodePreview.lastCode) : null

  useEffect(() => {
    onSkuSequenceChange?.({ prefix: skuPrefix, sequence: skuProductSequence, digits: 3 })
  }, [onSkuSequenceChange, skuPrefix, skuProductSequence])

  useEffect(() => {
    const requestId = ++sequencePreviewRequestRef.current
    if (!/^[A-Z0-9]{2,12}$/.test(skuPrefix)) {
      setServerSequencePreview({ status: 'idle' })
      return
    }
    setServerSequencePreview({ status: 'loading' })
    const timer = window.setTimeout(async () => {
      try {
        const result = await withVariantIdentifierCheckTimeout(
          previewVariantSkuSequenceAction({ organizationId, prefix: skuPrefix, digitCount: 3 }),
        )
        if (!isMountedRef.current || requestId !== sequencePreviewRequestRef.current) return
        setServerSequencePreview(result.ok
          ? { status: 'ready', nextSequence: result.data.nextSequence }
          : { status: 'error' })
      } catch {
        if (isMountedRef.current && requestId === sequencePreviewRequestRef.current) {
          setServerSequencePreview({ status: 'error' })
        }
      }
    }, 450)
    return () => window.clearTimeout(timer)
  }, [organizationId, skuPrefix])

  useEffect(() => {
    if (!skuSequenceConflict) return
    checkRequestRef.current += 1
    checkInFlightRef.current = false
    if (isMountedRef.current) setIsIdentifierChecking(false)
    onIdentifierCheckChange?.(false)
  }, [onIdentifierCheckChange, skuSequenceConflict])

  useEffect(() => {
    const requestId = ++salesCodePreviewRequestRef.current
    if (salesCodeMode !== 'sequence' || !/^[A-Z]{1,3}$/.test(salesCodePrefix) || enabledIdentifiers.length < 1) {
      setSalesCodePreview({ status: 'idle' })
      return
    }
    const requestedPrefix = salesCodePrefix
    const quantity = Math.min(50, enabledIdentifiers.length)
    const cacheKey = `${organizationId}:${requestedPrefix}:${quantity}`
    const cachedPreview = variantSalesCodePreviewCache.get(cacheKey)
    if (cachedPreview && cachedPreview.expiresAt > Date.now()) {
      setSalesCodeStart(cachedPreview.startNumber)
      setSalesCodePreview({
        status: 'ready', firstCode: cachedPreview.firstCode, lastCode: cachedPreview.lastCode,
        movedPrefix: cachedPreview.movedPrefix, cached: true,
      })
      if (cachedPreview.prefix !== requestedPrefix) setSalesCodePrefix(cachedPreview.prefix)
      return
    }
    if (cachedPreview) variantSalesCodePreviewCache.delete(cacheKey)

    const provisionalEnd = Math.min(999, salesCodeStart + quantity - 1)
    setSalesCodePreview({
      status: 'loading',
      firstCode: formatGlobalSalesCode(requestedPrefix, salesCodeStart),
      lastCode: formatGlobalSalesCode(requestedPrefix, provisionalEnd),
    })
    const timer = window.setTimeout(async () => {
      try {
        const result = await withGlobalSalesCodePreviewTimeout(previewGlobalSalesCodeRangeAction({
          organizationId, prefix: requestedPrefix, quantity,
        }))
        if (!isMountedRef.current || requestId !== salesCodePreviewRequestRef.current) return
        if (!result.ok) {
          setSalesCodePreview((current) => ({
            ...current,
            status: result.error === 'permission_denied' ? 'denied' : 'error',
          }))
          return
        }
        const previewCacheEntry: VariantSalesCodePreviewCacheEntry = {
          expiresAt: Date.now() + VARIANT_SALES_CODE_PREVIEW_CACHE_TTL_MS,
          prefix: result.data.prefix,
          startNumber: result.data.startNumber,
          firstCode: result.data.firstCode,
          lastCode: result.data.lastCode,
          movedPrefix: result.data.movedToNextPrefix,
        }
        variantSalesCodePreviewCache.set(cacheKey, previewCacheEntry)
        variantSalesCodePreviewCache.set(`${organizationId}:${result.data.prefix}:${quantity}`, previewCacheEntry)
        setSalesCodePrefix(result.data.prefix)
        setSalesCodeStart(result.data.startNumber)
        setSalesCodePreview({ status: 'ready', firstCode: result.data.firstCode, lastCode: result.data.lastCode, movedPrefix: result.data.movedToNextPrefix })
      } catch (error) {
        if (!isMountedRef.current || requestId !== salesCodePreviewRequestRef.current) return
        setSalesCodePreview((current) => ({
          ...current,
          status: error instanceof Error && error.message === 'global_sales_code_preview_timeout' ? 'timeout' : 'error',
        }))
      }
    }, VARIANT_SALES_CODE_PREVIEW_DEBOUNCE_MS)
    return () => window.clearTimeout(timer)
  }, [enabledIdentifiers.length, organizationId, salesCodeMode, salesCodePrefix])

    async function checkVariantIdentifiers() {
    if (checkInFlightRef.current || isIdentifierChecking) return
    if (!enabledIdentifiers.length || enabledIdentifiers.some((item) => !item.skuCode || !item.salesCode)) {
      onIdentifierCheckChange?.(false)
      setIdentifierCheck({ tone: 'idle', text: 'กรอก SKU และรหัสขาย / รหัส CF ให้ครบทุก Variant ก่อนตรวจ', collisionKeys: [], collisions: [] })
      return
    }
    const localCollisions = findDuplicateVariantIdentifiers(enabledIdentifiers)
    if (localCollisions.length) {
      const collisionKeys = localCollisions.map((collision) => `${collision.key}:${collision.field}`)
      onIdentifierCheckChange?.(false)
      setIdentifierCheck({
        tone: 'danger',
        text: `พบรหัสซ้ำ ${collisionKeys.length} จุด · ในฟอร์ม ${collisionKeys.length} กรุณาแก้รหัสที่ซ้ำก่อนตรวจฐานข้อมูล`,
        collisionKeys,
        collisions: localCollisions,
      })
      return
    }
    if (skuSequenceConflict) {
      onIdentifierCheckChange?.(false)
      setIdentifierCheck({
        tone: 'danger',
        text: `เลขลำดับ Product ${formattedSkuProductSequence} ถูกใช้แล้ว · กรุณาใช้เลขแนะนำ ${formattedRecommendedProductSequence}`,
        collisionKeys: [],
        collisions: [],
      })
      return
    }
    const invalidSalesCode = enabledIdentifiers.find((item) => !validateGlobalSalesCode(item.salesCode).ok)
    if (invalidSalesCode) {
      onIdentifierCheckChange?.(false)
      const validation = validateGlobalSalesCode(invalidSalesCode.salesCode)
      setIdentifierCheck({ tone: 'danger', text: validation.ok ? GLOBAL_SALES_CODE_UI_TEXT.errors.invalid_format : GLOBAL_SALES_CODE_UI_TEXT.errors[validation.error], collisionKeys: [`${invalidSalesCode.key}:sales_code`], collisions: [] })
      return
    }
    const requestId = ++checkRequestRef.current
    checkInFlightRef.current = true
    setIsIdentifierChecking(true)
    onIdentifierCheckChange?.(false)
    setIdentifierCheck({ tone: 'checking', text: `กำลังตรวจ ${enabledIdentifiers.length} Variant…`, collisionKeys: [], collisions: [] })
    try {
      const result = await withVariantIdentifierCheckTimeout(
        checkVariantProductIdentifiersAction({ organizationId, variants: enabledIdentifiers }),
      )
      if (!isMountedRef.current || requestId !== checkRequestRef.current) return
      if (!result.ok) {
        onIdentifierCheckChange?.(false)
        setIdentifierCheck({ tone: 'danger', text: 'ตรวจรหัสไม่สำเร็จ กรุณากด “ตรวจรหัสอีกครั้ง”', collisionKeys: [], collisions: [] })
        return
      }
      const collisionKeys = result.data.collisions.map((collision) => `${collision.key}:${collision.field}`)
      if (collisionKeys.length) {
        const inForm = result.data.collisions.filter((collision) => collision.reason === 'duplicate_in_form').length
        const existing = result.data.collisions.filter((collision) => collision.reason === 'already_exists').length
        onIdentifierCheckChange?.(false)
        setIdentifierCheck({ tone: 'danger', text: `พบรหัสซ้ำ ${collisionKeys.length} จุด${inForm ? ` · ในฟอร์ม ${inForm}` : ''}${existing ? ` · มีในระบบแล้ว ${existing}` : ''}`, collisionKeys, collisions: result.data.collisions })
      } else {
        onIdentifierCheckChange?.(true)
        setIdentifierCheck({ tone: 'success', text: `รหัสทั้ง ${result.data.checked} ค่า ของ ${enabledIdentifiers.length} Variant สามารถใช้ได้`, collisionKeys: [], collisions: [] })
      }
    } catch (error) {
      if (!isMountedRef.current || requestId !== checkRequestRef.current) return
      onIdentifierCheckChange?.(false)
      setIdentifierCheck({ tone: 'danger', text: variantIdentifierCheckFailureMessage(error), collisionKeys: [], collisions: [] })
    } finally {
      if (requestId === checkRequestRef.current) {
        checkInFlightRef.current = false
        if (isMountedRef.current) setIsIdentifierChecking(false)
      }
    }
  }

  useEffect(() => {
    isMountedRef.current = true
    return () => {
      isMountedRef.current = false
      checkRequestRef.current += 1
      sequencePreviewRequestRef.current += 1
      salesCodePreviewRequestRef.current += 1
      checkInFlightRef.current = false
    }
  }, [])

  useEffect(() => {
    checkRequestRef.current += 1
    checkInFlightRef.current = false
    if (isMountedRef.current) setIsIdentifierChecking(false)
    onIdentifierCheckChange?.(false)
    const timer = window.setTimeout(() => { void checkVariantIdentifiers() }, 650)
    return () => window.clearTimeout(timer)
    // Signature represents every identifier field; recheck after each edit.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [enabledIdentifierSignature, organizationId])

  useEffect(() => {
    const activeKeys = new Set(combinations.map((item) => item.key))
    manuallyEditedSkuKeysRef.current.forEach((key) => {
      if (!activeKeys.has(key)) manuallyEditedSkuKeysRef.current.delete(key)
    })
    const valuesById = new Map(groups.flatMap((group) => group.values.map((value) => [value.id, value])))
    setCombinations((current) => current.map((item) => {
      if (manuallyEditedSkuKeysRef.current.has(item.key)) return item
      const generatedSkuCode = `${skuBaseCode}-${item.optionValueIds.map((id) => valuesById.get(id)?.code ?? 'VAR').join('-')}`.slice(0, 80)
      return item.skuCode === generatedSkuCode ? item : { ...item, skuCode: generatedSkuCode }
    }))
  }, [groups, skuBaseCode, setCombinations])

function commitGroups(next: VariantOptionGroupDraft[]) {
    setGroups(next)
    setCombinations((current) => synchronizeVariantCombinations(next, current, skuBaseCode))
  }

  function addGroup() {
    if (groups.length >= 3) return
    const next = [...groups, {
      id: crypto.randomUUID(), name: `ตัวเลือก ${groups.length + 1}`,
      kind: 'custom' as const, values: [],
    }]
    commitGroups(next)
  }

  function addValue(groupId: string, rawValue: string) {
    const values = rawValue.split(',').map((entry) => entry.normalize('NFC').trim()).filter(Boolean)
    if (!values.length) return
    const next = groups.map((group) => {
      if (group.id !== groupId) return group
      const existing = new Set(group.values.map((value) => value.name.toLocaleLowerCase('th-TH')))
      const additions = values.flatMap((name, index) => {
        if (existing.has(name.toLocaleLowerCase('th-TH')) || group.values.length + index >= 12) return []
        return [{ id: crypto.randomUUID(), name: name.slice(0, 40), code: variantValueCode(name, group.values.length + index + 1) }]
      })
      return { ...group, values: [...group.values, ...additions].slice(0, 12) }
    })
    commitGroups(next)
  }

  function handleValueKeyDown(event: KeyboardEvent<HTMLInputElement>, groupId: string) {
    if (event.key !== 'Enter' && event.key !== ',') return
    event.preventDefault()
    addValue(groupId, event.currentTarget.value)
    event.currentTarget.value = ''
  }

  function updateCombination(key: string, patch: Partial<VariantCombinationDraft>) {
    setCombinations((current) => current.map((item) => item.key === key ? { ...item, ...patch } : item))
  }

  function useIdentifierSuggestion(collision: VariantIdentifierCollision) {
    if (!collision.suggestion) return
    const currentValue = collision.value.toUpperCase()
    const suggestion = collision.suggestion.toUpperCase()
    setCombinations((current) => current.map((item) => item.key !== collision.key ? item : ({
      ...item,
      skuCode: item.skuCode.toUpperCase() === currentValue ? suggestion : item.skuCode,
      salesCode: item.salesCode.toUpperCase() === currentValue ? suggestion : item.salesCode,
      barcode: item.barcode.toUpperCase() === currentValue ? suggestion : item.barcode,
    })))
  }

  function useAllIdentifierSuggestions() {
    if (!suggestedIdentifierCollisions.length) return
    setCombinations((current) => current.map((item) => {
      const collisions = suggestedIdentifierCollisions.filter((collision) => collision.key === item.key && collision.suggestion)
      if (!collisions.length) return item
      return collisions.reduce((next, collision) => {
        const currentValue = collision.value.toUpperCase()
        const suggestion = collision.suggestion!.toUpperCase()
        return {
          ...next,
          skuCode: next.skuCode.toUpperCase() === currentValue ? suggestion : next.skuCode,
          salesCode: next.salesCode.toUpperCase() === currentValue ? suggestion : next.salesCode,
          barcode: next.barcode.toUpperCase() === currentValue ? suggestion : next.barcode,
        }
      }, item)
    }))
  }

  function applyBulkValues() {
    const safePrefix = skuBaseCode
    const safeSalesPrefix = salesCodePrefix.toUpperCase().replace(/[^A-Z]/g, '').slice(0, 3) || 'A'
    const visibleSalesCodeMatch = salesCodePreview.firstCode?.match(/^([A-Z]{1,3})(\d{3})$/)
    const visibleSalesCodeStart = visibleSalesCodeMatch?.[1] === safeSalesPrefix
      ? Math.max(1, Number(visibleSalesCodeMatch[2]))
      : salesCodeStart
    const valuesById = new Map(groups.flatMap((group) => group.values.map((value) => [value.id, value])))
    let sequenceIndex = 0
    manuallyEditedSkuKeysRef.current.clear()
    setCombinations((current) => current.map((item, index) => {
      const skuCode = `${safePrefix}-${item.optionValueIds.map((id) => valuesById.get(id)?.code ?? 'VAR').join('-')}`.slice(0, 80)
      const salesCode = salesCodeMode === 'same-sku'
        ? skuCode
        : salesCodeMode === 'sequence' && item.enabled
          ? `${safeSalesPrefix}${String(visibleSalesCodeStart + sequenceIndex++).padStart(salesCodeDigits, '0')}`.slice(0, 80)
          : item.salesCode
      return {
        ...item,
        skuCode,
        salesCode,
        price: bulkPrice,
        status: bulkStatus,
        barcode: bulkBarcode === 'sku'
          ? skuCode
          : bulkBarcode === 'sales'
            ? salesCode
            : bulkBarcode === 'sequence'
              ? `290${String(index + 1).padStart(10, '0')}`
              : '',
      }
    }))
  }

  const valuesById = new Map(groups.flatMap((group) => group.values.map((value) => [value.id, { group, value }])))
  const enabledCount = combinations.filter((item) => item.enabled).length
  const allEnabled = combinations.length > 0 && enabledCount === combinations.length
  const groupLimitReached = groups.length >= 3
  const skuFormatPreview = [skuBaseCode, ...groups.flatMap((group) => group.values[0]?.code ? [group.values[0].code] : [])].join('-').slice(0, 80)
  const suggestedIdentifierCollisions = [...new Map(identifierCheck.collisions
    .filter((collision) => collision.reason === 'already_exists' && collision.suggestion)
    .map((collision) => [`${collision.key}:${collision.value.toUpperCase()}`, collision]))
    .values()]

  return <section className="product-variant-builder" aria-labelledby="variantBuilderTitle">
    <header className="product-variant-builder-head">
      <div><h3 id="variantBuilderTitle">กำหนดตัวเลือกและสร้าง SKU Combination</h3><p>เพิ่มสี ไซซ์ หรือตัวเลือกอื่น แล้วระบบจะสร้างรายการ SKU ที่ต้องขายและนับ Stock แยกกัน</p></div>
      <div className="product-variant-group-action">
        <button className="button compact secondary" type="button" onClick={addGroup} disabled={disabled || groupLimitReached} aria-describedby="variantGroupLimitHelp">{groupLimitReached ? 'ครบ 3 กลุ่มแล้ว' : '＋ เพิ่มกลุ่มตัวเลือก'}</button>
        <small id="variantGroupLimitHelp" role="status" aria-live="polite">{groupLimitReached ? 'ลบกลุ่มใดกลุ่มหนึ่งเพื่อเพิ่มกลุ่มใหม่' : `เพิ่มได้อีก ${3 - groups.length} กลุ่ม`}</small>
      </div>
    </header>
    <div className="product-variant-builder-body">
      <div className="product-variant-option-list">{groups.map((group, groupIndex) => <article className="product-variant-option-card" key={group.id}>
        <label><span>ชื่อกลุ่มตัวเลือก</span><input value={group.name} maxLength={40} disabled={disabled} aria-label={`ชื่อกลุ่มตัวเลือก ${groupIndex + 1}`} onChange={(event) => {
          const name = event.target.value.slice(0, 40)
          commitGroups(groups.map((item) => item.id === group.id ? { ...item, name, kind: groupKind(name) } : item))
        }} /></label>
        <label><span>ค่าตัวเลือก</span><span className="product-variant-values-editor">{group.values.map((value) => <span className="product-variant-value-chip" key={value.id}>{value.name}<button type="button" disabled={disabled} aria-label={`ลบ ${value.name}`} onClick={() => commitGroups(groups.map((item) => item.id === group.id ? { ...item, values: item.values.filter((entry) => entry.id !== value.id) } : item))}>×</button></span>)}<input maxLength={40} disabled={disabled || group.values.length >= 12} placeholder="พิมพ์ค่าแล้วกด Enter เช่น สีแดง" aria-label={`เพิ่มค่าในกลุ่ม ${group.name}`} onKeyDown={(event) => handleValueKeyDown(event, group.id)} onBlur={(event) => { if (event.currentTarget.value.trim()) { addValue(group.id, event.currentTarget.value); event.currentTarget.value = '' } }} /></span></label>
        <button className="product-variant-remove" type="button" disabled={disabled || groups.length <= 1} aria-label={`ลบกลุ่ม ${group.name}`} onClick={() => commitGroups(groups.filter((item) => item.id !== group.id))}>×</button>
      </article>)}</div>

      <div className="product-variant-bulk-toolbar" aria-label="เครื่องมือกรอกหลาย Combination">
        <div className="product-variant-code-settings-pair">
        <section className="product-variant-toolbar-section product-variant-code-settings-card" aria-labelledby="variantSkuSettingsHeading">
          <header className="product-variant-toolbar-heading"><h4 id="variantSkuSettingsHeading">กำหนดรหัส SKU</h4><span>ใช้รูปแบบเดียวกันกับทุกตัวเลือก</span></header>
          <div className="product-variant-sku-settings-grid">
            <label><span>คำนำหน้า SKU</span><input value={skuPrefix} maxLength={12} disabled={disabled} placeholder="เช่น MU" aria-describedby="variantSkuFormatHelp" onChange={(event) => setSkuPrefix(event.target.value.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 12))} /></label>
            <label><span>เลขลำดับ Product</span><input type="number" min="1" max="99999999" step="1" value={skuProductSequence} disabled={disabled} aria-describedby="variantSkuFormatHelp variantSkuNextHelp" onChange={(event) => setSkuProductSequence(Math.max(1, Math.trunc(Number(event.target.value) || 1)))} /></label>
            <div className="product-variant-next-sequence">
              <span className="product-variant-field-label">สถานะเลขลำดับ</span>
              {serverSequencePreview.status === 'ready' && skuSequenceConflict
                ? <button className="button compact secondary" type="button" disabled={disabled || recommendedProductSequence >= 99999999} aria-describedby="variantSkuNextHelp" onClick={() => setSkuProductSequence(recommendedProductSequence)}>ใช้เลขแนะนำ {formattedRecommendedProductSequence}</button>
                : <span className={`product-variant-sequence-status ${serverSequencePreview.status === 'ready' ? 'success' : serverSequencePreview.status === 'error' ? 'danger' : ''}`} role="status" aria-live="polite">
                  {serverSequencePreview.status === 'loading'
                    ? `กำลังตรวจเลขลำดับ ${formattedSkuProductSequence}…`
                    : serverSequencePreview.status === 'ready'
                      ? `เลขลำดับ ${formattedSkuProductSequence} ใช้ได้`
                      : serverSequencePreview.status === 'error'
                        ? 'ตรวจเลขลำดับไม่ได้'
                        : 'รอคำนำหน้า SKU'}
                </span>}
            </div>
            <div className="product-variant-sku-format-preview" id="variantSkuFormatHelp" role="status" aria-live="polite"><span>ตัวอย่างรหัสที่จะได้</span><strong>{skuFormatPreview}</strong></div>
          </div>
          <p className="product-variant-section-help" id="variantSkuNextHelp">{serverSequencePreview.status === 'ready' ? skuSequenceConflict ? `เลข ${formattedSkuProductSequence} ถูกใช้แล้ว · ระบบแนะนำเลขว่างถัดไปจากฐานข้อมูล` : `เลข ${formattedSkuProductSequence} ยังว่างและใช้ได้ · ระบบจะไม่เปลี่ยนค่าที่กรอก` : serverSequencePreview.status === 'error' ? 'เชื่อมฐานข้อมูลไม่ได้ จึงยังยืนยันเลขลำดับไม่ได้' : 'กรอกคำนำหน้าอย่างน้อย 2 ตัวอักษรเพื่อให้ระบบตรวจเลขลำดับ'}</p>
        </section>

        <section className="product-variant-toolbar-section product-variant-code-settings-card" aria-labelledby="variantSalesSettingsHeading">
          <header className="product-variant-toolbar-heading"><h4 id="variantSalesSettingsHeading">กำหนดรหัสขาย / รหัส CF</h4><span>ตั้งวิธีรันรหัสสำหรับทุกตัวเลือก</span></header>
          <div className="product-variant-sales-settings-grid">
            <label className="product-variant-sales-mode"><span>วิธีสร้างรหัสขาย</span><ProductCreationCombobox id="variantSalesCodeMode" value={salesCodeMode} options={salesCodeModeOptions} disabled={disabled} ariaLabel="วิธีสร้างรหัสขายหรือรหัส CF สำหรับทุก Variant" onChange={(value) => setSalesCodeMode(value as typeof salesCodeMode)} /></label>
            {salesCodeMode === 'sequence' ? <div className="product-variant-sales-sequence-card">
              <div className="product-variant-sales-sequence-heading"><strong>ตั้งค่าการรันรหัสต่อเนื่อง</strong><span>กำหนดเฉพาะ Prefix ระบบจะค้นหารหัสว่างและข้ามรหัสที่ถูกใช้แล้วให้อัตโนมัติ</span></div>
              <div className="product-variant-sales-sequence-controls"><label><span>Prefix</span><input value={salesCodePrefix} maxLength={3} disabled={disabled} onChange={(event) => { setSalesCodeStart(1); setSalesCodePrefix(event.target.value.toUpperCase().replace(/[^A-Z]/g, '').slice(0, 3)) }} /></label><div className="product-variant-sales-range-preview" role="status" aria-live="polite"><span>ช่วงรหัสที่จะใช้</span><strong>{salesCodePreview.firstCode && salesCodePreview.lastCode ? `${salesCodePreview.firstCode}–${salesCodePreview.lastCode}` : 'รอตรวจสอบ'}</strong><small>{salesCodePreview.status === 'loading' ? 'ตัวอย่างชั่วคราว · กำลังยืนยันกับระบบ' : salesCodePreview.status === 'ready' ? nextSalesCodeAfterRange ? `รหัสถัดไปหลังชุดนี้ ${nextSalesCodeAfterRange}${salesCodePreview.cached ? ' · ใช้ผลล่าสุด' : ''}` : 'รหัส Prefix นี้ถูกใช้ครบช่วงแล้ว' : salesCodePreview.status === 'error' || salesCodePreview.status === 'timeout' || salesCodePreview.status === 'denied' ? 'ตัวอย่างเท่านั้น · กดใช้ค่าแล้วตรวจรหัสซ้ำได้' : enabledIdentifiers.length ? `${enabledIdentifiers.length} Variant` : 'เพิ่มตัวเลือกให้ครบเพื่อคำนวณช่วงรหัส'}</small></div></div>
              <div className={`product-sequence-policy product-variant-sales-policy ${salesCodePreview.status === 'error' || salesCodePreview.status === 'timeout' || salesCodePreview.status === 'denied' ? 'danger' : ''}`} role="status" aria-live="polite"><span aria-hidden="true">ⓘ</span><span>{salesCodePreview.status === 'loading' ? 'แสดงตัวอย่างทันที และกำลังตรวจรหัสว่างจริงกับระบบ…' : salesCodePreview.status === 'ready' ? `ช่วงนี้ว่างและใช้ได้ ${enabledIdentifiers.length} รายการ${salesCodePreview.movedPrefix ? ' · ระบบเลื่อนไป Prefix ถัดไป' : ''}` : salesCodePreview.status === 'denied' ? GLOBAL_SALES_CODE_UI_TEXT.states.permission_denied : salesCodePreview.status === 'timeout' ? GLOBAL_SALES_CODE_UI_TEXT.states.timeout : salesCodePreview.status === 'error' ? 'ตรวจช่วงรหัสไม่ได้ กรุณาลองอีกครั้ง' : GLOBAL_SALES_CODE_UI_TEXT.help.format}</span></div>
            </div> : <div className="product-variant-sales-mode-note" role="note">{salesCodeMode === 'same-sku' ? 'ระบบจะใช้รหัสสินค้า (SKU) ของแต่ละ Variant เป็นรหัสขาย / รหัส CF' : 'กรอกรหัสขาย / รหัส CF ของแต่ละ Variant ได้โดยตรงในตารางด้านล่าง'}</div>}
          </div>
        </section>
        </div>

        <section className="product-variant-toolbar-section product-variant-default-settings" aria-labelledby="variantDefaultSettingsHeading">
          <header className="product-variant-toolbar-heading"><h4 id="variantDefaultSettingsHeading">ค่าเริ่มต้นของทุกรายการ</h4><span>นำค่าเหล่านี้ไปใส่ในตารางด้านล่าง</span></header>
          <div className="product-variant-default-settings-grid">
            <label><span>ราคาขายทุกตัวเลือก</span><input value={bulkPrice} type="number" min="0" max="999999999" step="0.01" disabled={disabled} placeholder="เช่น 390.00" onChange={(event) => setBulkPrice(event.target.value)} /></label>
            <label><span>Barcode</span><ProductCreationCombobox id="variantBulkBarcode" value={bulkBarcode} options={barcodeModeOptions} disabled={disabled} ariaLabel="วิธีกำหนด Barcode สำหรับทุก Variant" onChange={(value) => setBulkBarcode(value as typeof bulkBarcode)} /></label>
            <label><span>สถานะ</span><ProductCreationCombobox id="variantBulkStatus" value={bulkStatus} options={variantStatusOptions} disabled={disabled} ariaLabel="สถานะเริ่มต้นสำหรับทุก Variant" onChange={(value) => setBulkStatus(value as typeof bulkStatus)} /></label>
            <div className="product-variant-bulk-actions"><button className="button compact product-primary-action" type="button" disabled={disabled || combinations.length === 0} onClick={applyBulkValues}>ใช้กับทุกรายการ</button><button className="button compact secondary" type="button" disabled={disabled || combinations.length === 0} onClick={() => { setBulkPrice(''); setBulkBarcode('none'); setBulkStatus('draft'); setCombinations((current) => current.map((item) => ({ ...item, price: '', barcode: '', status: 'draft' }))) }}>ล้างค่า</button></div>
          </div>
        </section>
      </div>

      <div className={`product-variant-identifier-check ${skuSequenceConflict ? 'danger' : identifierCheck.tone}`} role="status" aria-live="polite"><span>{skuSequenceConflict || identifierCheck.tone === 'danger' ? '!' : identifierCheck.tone === 'success' ? '✓' : 'ⓘ'}</span><span>{skuSequenceConflict ? `เลขลำดับ Product ${formattedSkuProductSequence} ถูกใช้แล้ว · กรุณาใช้เลขแนะนำ ${formattedRecommendedProductSequence}` : identifierCheck.text}</span><button className="button compact secondary" type="button" disabled={disabled || isIdentifierChecking || skuSequenceConflict} aria-busy={isIdentifierChecking} onClick={() => { void checkVariantIdentifiers() }}>{isIdentifierChecking ? 'กำลังตรวจ…' : 'ตรวจรหัสอีกครั้ง'}</button></div>
      {suggestedIdentifierCollisions.length ? <div className="product-variant-identifier-suggestions"><div className="product-variant-identifier-suggestions-head"><strong id="variantIdentifierSuggestionsHeading">รหัสถัดไปที่ว่างจริง</strong><div className="product-variant-identifier-suggestion-list" role="list" aria-labelledby="variantIdentifierSuggestionsHeading">{suggestedIdentifierCollisions.map((collision) => <button className="button compact secondary" type="button" role="listitem" key={`${collision.key}:${collision.value}`} onClick={() => useIdentifierSuggestion(collision)} disabled={disabled}><span>{collision.field === 'sku_code' ? 'SKU Code' : collision.field === 'sales_code' ? 'รหัส CF' : 'Barcode'}</span><code>{collision.value}</code><span aria-hidden="true">→</span><code>{collision.suggestion}</code></button>)}</div><button className="button compact product-primary-action product-variant-use-all-suggestions" type="button" onClick={useAllIdentifierSuggestions} disabled={disabled}>ใช้รหัสแนะนำทั้งหมด ({suggestedIdentifierCollisions.length})</button></div><small>เลือกใช้ทีละรหัส หรือกดใช้ทั้งหมด แล้วระบบจะตรวจฐานข้อมูลซ้ำให้อัตโนมัติ</small></div> : null}

      <div className="product-variant-matrix-wrap"><table className="product-variant-matrix">
        <thead><tr><th><input type="checkbox" checked={allEnabled} ref={(node) => { if (node) node.indeterminate = enabledCount > 0 && enabledCount < combinations.length }} disabled={disabled || combinations.length === 0} aria-label="เปิดหรือปิดทุก Combination" onChange={(event) => setCombinations((current) => current.map((item) => ({ ...item, enabled: event.target.checked })))} /></th><th>ตัวเลือก</th><th>SKU Code</th><th>รหัสขาย / รหัส CF</th><th>ราคาขาย</th><th>Barcode</th><th>รูปประจำ Variant</th><th>สถานะ</th></tr></thead>
        <tbody>{combinations.length ? combinations.map((item) => {
          const selections = item.optionValueIds.flatMap((id) => { const found = valuesById.get(id); return found ? [found] : [] })
          const name = selections.map(({ value }) => value.name).join(' / ')
          const detail = selections.map(({ group, value }) => `${group.name}: ${value.name}`).join(' · ')
          const skuWasEditedManually = manuallyEditedSkuKeysRef.current.has(item.key)
          return <tr key={item.key} className={item.enabled ? '' : 'is-disabled'}><td><input type="checkbox" checked={item.enabled} disabled={disabled} aria-label={`เปิดขาย ${name}`} onChange={(event) => updateCombination(item.key, { enabled: event.target.checked })} /></td><td className="product-variant-combination-name"><strong>{name}</strong><span>{detail}</span></td><td><input value={item.skuCode} aria-invalid={identifierCheck.collisionKeys.includes(`${item.key}:sku_code`)} maxLength={80} disabled={disabled || !item.enabled} aria-label={`SKU Code ${name}${skuWasEditedManually ? ' แก้ไขเอง' : ' สร้างอัตโนมัติ'}`} onChange={(event) => { manuallyEditedSkuKeysRef.current.add(item.key); updateCombination(item.key, { skuCode: event.target.value.toUpperCase().replace(/[^A-Z0-9._-]/g, '').slice(0, 80) }) }} /></td><td><input value={item.salesCode} aria-invalid={identifierCheck.collisionKeys.includes(`${item.key}:sales_code`)} maxLength={80} disabled={disabled || !item.enabled} placeholder="เช่น B001" aria-label={`รหัสขาย / รหัส CF ${name}`} onChange={(event) => updateCombination(item.key, { salesCode: event.target.value.toUpperCase().replace(/[^A-Z0-9._-]/g, '').slice(0, 80) })} /></td><td><input value={item.price} type="number" min="0" max="999999999" step="0.01" disabled={disabled || !item.enabled} aria-label={`ราคาขาย ${name}`} onChange={(event) => updateCombination(item.key, { price: event.target.value })} /></td><td><input value={item.barcode} aria-invalid={identifierCheck.collisionKeys.includes(`${item.key}:barcode`)} maxLength={128} disabled={disabled || !item.enabled} placeholder="ยังไม่กำหนด" aria-label={`Barcode ${name}`} onChange={(event) => updateCombination(item.key, { barcode: event.target.value.toUpperCase().replace(/[^A-Z0-9._-]/g, '').slice(0, 128) })} /></td><td><span className="product-select-control"><select value={item.imageId} disabled={disabled || !item.enabled} aria-label={`รูปประจำ Variant ${name}`} onChange={(event) => updateCombination(item.key, { imageId: event.target.value })}><option value="">ใช้ภาพ Product</option>{images.map((image, imageIndex) => <option key={image.id} value={image.id}>ภาพที่ {imageIndex + 1} · {image.name}</option>)}</select></span></td><td><span className="product-select-control"><select value={item.status} disabled={disabled || !item.enabled} aria-label={`สถานะ ${name}`} onChange={(event) => updateCombination(item.key, { status: event.target.value as VariantCombinationDraft['status'] })}><option value="draft">ฉบับร่าง</option><option value="active">ใช้งานอยู่</option></select></span></td></tr>
        }) : <tr><td colSpan={8} className="product-variant-empty">เพิ่มค่าให้ครบทุกกลุ่ม เพื่อสร้าง SKU Combination</td></tr>}</tbody>
      </table></div>
      <div className="product-variant-builder-footnote"><span aria-hidden="true">ⓘ</span><span>ปิด Combination ที่ไม่ขายได้ · เมื่อกดสร้าง ระบบจะบันทึก Product และ SKU ที่เปิดไว้ทั้งหมดในคำสั่งเดียว</span></div>
    </div>
  </section>
}

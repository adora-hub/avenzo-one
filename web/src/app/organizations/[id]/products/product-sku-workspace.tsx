'use client'

import Image from 'next/image'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useEffect, useMemo, useRef, useState, useTransition, type ChangeEvent, type FormEvent } from 'react'
import { executeFoundationCommandAction, executeProductImageCleanupAction } from '@/app/actions/foundation'
import {
  OperationsEmptyState,
  OperationsStatusBadge,
} from '@/app/components/operations-ui'
import type {
  ProductReadModel,
  ProductWorkspaceDetail,
  ProductWorkspaceRow,
  ProductWorkspaceSkuDetail,
  SkuReadModel,
} from '@/lib/foundation/repositories'
import { createClient } from '@/lib/supabase/browser'
import {
  PRODUCT_IMAGE_MAX_FILES,
  uploadPreparedProductImage,
  validateProductImageFile,
  type PreparedProductImage,
} from '@/lib/foundation/product-image-upload'
import { ProductDetailSheet } from './product-detail-sheet'
import { ProductsDataGrid } from './products-data-grid'

type ViewMode = 'products' | 'skus'
type DateFilterField = 'created' | 'updated'

type EditorMode = 'create-product' | 'create-sku' | 'edit-product' | 'edit-sku' | 'edit-price' | null
type PendingLifecycle = {
  commandType: 'product.archive' | 'sku.archive'
  idKey: 'product_id' | 'sku_id'
  id: string
  version: number
  label: string
}

type ProductEditorImageDraft = {
  id: string
  file: File
  previewUrl: string
}

type Props = {
  organizationId: string
  organizationName: string
  skuCount: number
  view: ViewMode
  search: string
  bulkSearchActive: boolean
  status: string
  dateField: DateFilterField
  dateFrom: string
  dateTo: string
  brandId: string
  brandOptions: Array<{ id: string; name: string; status?: 'active' | 'archived'; version?: number }>
  categoryId: string
  categoryOptions: Array<{ id: string; name: string; status?: 'active' | 'archived'; version?: number }>
  tagIds: string[]
  tagOptions: Array<{ id: string; name: string; status?: 'active' | 'archived'; version?: number }>
  priceMin: string
  priceMax: string
  stockMin: string
  stockMax: string
  canReadInventory: boolean
  sort: 'updated_desc' | 'updated_asc'
  productWorkspaceRows: ProductWorkspaceRow[]
  productPage: number
  productPageSize: number
  productTotalCount: number
  skus: SkuReadModel[]
  productOptions: ProductReadModel[]
  selectedProduct: ProductWorkspaceDetail | null
  productAction: '' | 'edit' | 'skus' | 'price'
  selectedSku: (ProductWorkspaceSkuDetail & { productName: string }) | null
  nextCursor: string | null
  canCreate: boolean
  canManage: boolean
  canAdjustInventory: boolean
  inventoryLocationOptions: Array<{ id: string; name: string; code: string; warehouseName: string }>
  canReadCost: boolean
}

const statusLabels: Record<string, string> = {
  draft: 'ฉบับร่าง',
  active: 'ใช้งาน',
  archived: 'เก็บถาวร',
}

const statusFilterOptions = [
  { value: '', label: 'ทุกสถานะ' },
  { value: 'draft', label: 'ฉบับร่าง' },
  { value: 'active', label: 'ใช้งาน' },
  { value: 'archived', label: 'เก็บถาวร' },
] as const

const errorLabels: Record<string, string> = {
  authentication_required: 'Session หมดอายุ กรุณาเข้าสู่ระบบใหม่',
  tenant_access_denied: 'บัญชีนี้ไม่มีสิทธิ์เข้าถึง Organization',
  permission_denied: 'ไม่มีสิทธิ์จัดการ Product/SKU',
  branch_scope_denied: 'รายการนี้อยู่นอกขอบเขตสาขาที่ได้รับมอบหมาย',
  validation_failed: 'ข้อมูลไม่ครบหรือรูปแบบไม่ถูกต้อง',
  entity_not_found: 'ไม่พบรายการ หรือรายการถูกเปลี่ยนไปแล้ว',
  entity_inactive: 'สถานะปัจจุบันไม่อนุญาตให้ดำเนินการนี้',
  version_conflict: 'ข้อมูลถูกแก้ไขโดยผู้ใช้อื่น กรุณารีเฟรชแล้วลองใหม่',
  command_payload_conflict: 'รหัสคำสั่งซ้ำกับข้อมูลคนละชุด',
  duplicate_sku_code: 'SKU Code นี้ถูกใช้แล้วใน Organization',
  duplicate_sales_code: 'Sales Code นี้ถูกใช้แล้วใน Organization',
  duplicate_barcode: 'Barcode นี้ถูกใช้แล้วใน Organization',
  invalid_state_transition: 'ไม่สามารถเปลี่ยนไปยังสถานะที่เลือกได้',
  immutable_identifier: 'รหัสถาวรนี้เปลี่ยนไม่ได้ กรุณาสร้าง SKU ใหม่หากต้องการใช้รหัสอื่น',
  foundation_command_failed: 'ระบบไม่สามารถบันทึกรายการได้ กรุณาลองใหม่',
}

function statusTone(status: string) {
  if (status === 'active') return 'success' as const
  if (status === 'draft') return 'info' as const
  return 'neutral' as const
}

function formatUpdatedAt(value: string) {
  return new Intl.DateTimeFormat('th-TH', {
    dateStyle: 'medium',
    timeStyle: 'short',
    timeZone: 'Asia/Bangkok',
  }).format(new Date(value))
}

function buildHref(
  organizationId: string,
  values: Record<string, string | null | undefined>,
) {
  const params = new URLSearchParams()
  for (const [key, value] of Object.entries(values)) {
    if (value) params.set(key, value)
  }
  const query = params.toString()
  return `/organizations/${organizationId}/products${query ? `?${query}` : ''}`
}

function normalizeBulkCode(value: string) {
  return value.trim().toUpperCase()
}

function BulkSearchAlertIcon({ tone }: { tone: 'info' | 'success' | 'warning' | 'duplicate' }) {
  return <svg className="product-bulk-alert-icon" data-icon-override={tone} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    {tone === 'info' ? <path d="M9 8h6M9 12h6M9 16h4M5 5h14v14H5z" /> : null}
    {tone === 'success' ? <path d="m5 12 4 4L19 6" /> : null}
    {tone === 'warning' ? <path d="M12 4 3 20h18L12 4Zm0 5v5m0 3v.01" /> : null}
    {tone === 'duplicate' ? <path d="M8 8h10v10H8zM5 15H4V4h11v1" /> : null}
  </svg>
}

export function ProductSkuWorkspace({
  organizationId,
  organizationName,
  skuCount,
  view,
  search,
  bulkSearchActive,
  status,
  dateField,
  dateFrom,
  dateTo,
  brandId,
  brandOptions,
  categoryId,
  categoryOptions,
  tagIds,
  tagOptions,
  priceMin,
  priceMax,
  stockMin,
  stockMax,
  canReadInventory,
  sort,
  productWorkspaceRows,
  productPage,
  productPageSize,
  productTotalCount,
  skus,
  productOptions,
  selectedProduct,
  productAction,
  selectedSku,
  nextCursor,
  canCreate,
  canManage,
  canAdjustInventory,
  inventoryLocationOptions,
  canReadCost,
}: Props) {
  const router = useRouter()
  const firstFieldRef = useRef<HTMLInputElement>(null)
  const searchTimerRef = useRef<number | null>(null)
  const createMenuRef = useRef<HTMLDetailsElement>(null)
  const statusFilterRef = useRef<HTMLDivElement>(null)
  const statusFilterButtonRef = useRef<HTMLButtonElement>(null)
  const advancedFilterRef = useRef<HTMLDivElement>(null)
  const advancedFilterButtonRef = useRef<HTMLButtonElement>(null)
  const tagComboboxRef = useRef<HTMLDivElement>(null)
  const tagSearchInputRef = useRef<HTMLInputElement>(null)
  const [editorMode, setEditorMode] = useState<EditorMode>(() => {
    if (selectedProduct && productAction === 'edit' && canManage) return 'edit-product'
    if (selectedProduct && selectedSku && productAction === 'price' && canManage) return 'edit-price'
    return null
  })
  const [bulkSearchOpen, setBulkSearchOpen] = useState(false)
  const [bulkCodes, setBulkCodes] = useState(bulkSearchActive ? search.replaceAll(',', '\n') : '')
  const [bulkSearchAttempted, setBulkSearchAttempted] = useState(false)
  const [searchInput, setSearchInput] = useState(bulkSearchActive ? '' : search)
  const [statusFilter, setStatusFilter] = useState(status)
  const [statusFilterOpen, setStatusFilterOpen] = useState(false)
  const [advancedFilterOpen, setAdvancedFilterOpen] = useState(false)
  const [dateFieldFilter, setDateFieldFilter] = useState<DateFilterField>(dateField)
  const [dateFromFilter, setDateFromFilter] = useState(dateFrom)
  const [dateToFilter, setDateToFilter] = useState(dateTo)
  const [brandIdFilter, setBrandIdFilter] = useState(brandId)
  const [categoryIdFilter, setCategoryIdFilter] = useState(categoryId)
  const [tagIdsFilter, setTagIdsFilter] = useState(tagIds)
  const [tagComboboxOpen, setTagComboboxOpen] = useState(false)
  const [tagSearchInput, setTagSearchInput] = useState('')
  const [activeTagOptionIndex, setActiveTagOptionIndex] = useState(0)
  const [priceMinFilter, setPriceMinFilter] = useState(priceMin)
  const [priceMaxFilter, setPriceMaxFilter] = useState(priceMax)
  const [stockMinFilter, setStockMinFilter] = useState(stockMin)
  const [stockMaxFilter, setStockMaxFilter] = useState(stockMax)
  const [advancedFilterError, setAdvancedFilterError] = useState('')
  const [feedback, setFeedback] = useState<{ tone: 'success' | 'danger' | 'info'; text: string; code?: string } | null>(null)
  const [editorImageDrafts, setEditorImageDrafts] = useState<ProductEditorImageDraft[]>([])
  const [editorCoverImageId, setEditorCoverImageId] = useState('')
  const [editorImageError, setEditorImageError] = useState('')
  const [pendingLifecycle, setPendingLifecycle] = useState<PendingLifecycle | null>(null)
  const [isPending, startTransition] = useTransition()
  const [, startSearchTransition] = useTransition()
  const rows = view === 'products' ? productWorkspaceRows : skus
  const rawBulkCodes = bulkCodes.slice(0, 400).split(/[\s,;]+/).map(normalizeBulkCode).filter(Boolean)
  const uniqueBulkCodes = Array.from(new Set(rawBulkCodes)).slice(0, 50)
  const duplicateBulkCodeCount = rawBulkCodes.length - new Set(rawBulkCodes).size
  const knownIdentifiers = useMemo(() => new Set(productWorkspaceRows.flatMap((row) => row.skuPreview.flatMap((sku) => [sku.skuCode, sku.salesCode, sku.barcode])
    .filter((value): value is string => Boolean(value))
    .map(normalizeBulkCode))), [productWorkspaceRows])
  const foundBulkCodes = uniqueBulkCodes.filter((code) => knownIdentifiers.has(code))
  const missingBulkCodes = uniqueBulkCodes.filter((code) => !knownIdentifiers.has(code))
  const activeBulkCodes = bulkSearchActive ? Array.from(new Set(search.split(',').map(normalizeBulkCode).filter(Boolean))).slice(0, 50) : []
  const closeDetailHref = buildHref(organizationId, {
    view,
    q: search,
    status,
    date_by: dateFrom || dateTo ? dateField : undefined,
    date_from: dateFrom,
    date_to: dateTo,
    sort,
    page: view === 'products' ? String(productPage) : undefined,
    page_size: view === 'products' ? String(productPageSize) : undefined,
    bulk: bulkSearchActive ? '1' : undefined,
  })

  useEffect(() => {
    if (!editorMode) return
    firstFieldRef.current?.focus()
    function closeOnEscape(event: KeyboardEvent) {
      if (event.key !== 'Escape' || isPending) return
      if (productAction === 'edit' || productAction === 'price') router.replace(closeDetailHref)
      else setEditorMode(null)
    }
    window.addEventListener('keydown', closeOnEscape)
    return () => window.removeEventListener('keydown', closeOnEscape)
  }, [closeDetailHref, editorMode, isPending, productAction, router])

  useEffect(() => {
    if (productAction === '' && (editorMode === 'edit-product' || editorMode === 'edit-price')) {
      setEditorMode(null)
      return
    }
    if (!selectedProduct) return
    if (productAction === 'edit' && canManage) {
      setEditorMode('edit-product')
      return
    }
    if (productAction === 'skus') {
      window.requestAnimationFrame(() => document.getElementById('product-detail-skus')?.scrollIntoView({ block: 'start' }))
      return
    }
    if (productAction === 'price' && canManage && selectedSku) setEditorMode('edit-price')
  }, [canManage, editorMode, productAction, selectedProduct, selectedSku])

  useEffect(() => {
    if (editorMode !== 'edit-product' || !selectedProduct) return
    setEditorCoverImageId(selectedProduct.images.find((image) => image.isCover)?.id ?? selectedProduct.images[0]?.id ?? '')
    setEditorImageError('')
    setEditorImageDrafts((current) => {
      current.forEach((image) => URL.revokeObjectURL(image.previewUrl))
      return []
    })
  }, [editorMode, selectedProduct])

  useEffect(() => {
    if (!feedback || feedback.tone === 'danger') return
    const timeout = window.setTimeout(() => setFeedback(null), 4000)
    return () => window.clearTimeout(timeout)
  }, [feedback])

  useEffect(() => {
    if (!bulkSearchOpen) return
    function closeOnEscape(event: KeyboardEvent) {
      if (event.key === 'Escape') setBulkSearchOpen(false)
    }
    window.addEventListener('keydown', closeOnEscape)
    return () => window.removeEventListener('keydown', closeOnEscape)
  }, [bulkSearchOpen])

  useEffect(() => {
    if (!statusFilterOpen) return
    function closeOnOutsidePress(event: PointerEvent) {
      if (!statusFilterRef.current?.contains(event.target as Node)) setStatusFilterOpen(false)
    }
    document.addEventListener('pointerdown', closeOnOutsidePress)
    return () => document.removeEventListener('pointerdown', closeOnOutsidePress)
  }, [statusFilterOpen])

  useEffect(() => {
    if (!advancedFilterOpen) return
    function closeAdvancedFilter(event: PointerEvent) {
      if (!advancedFilterRef.current?.contains(event.target as Node)) setAdvancedFilterOpen(false)
    }
    function closeAdvancedFilterOnEscape(event: KeyboardEvent) {
      if (event.key !== 'Escape') return
      event.preventDefault()
      setTagComboboxOpen(false)
      setAdvancedFilterOpen(false)
      advancedFilterButtonRef.current?.focus()
    }
    document.addEventListener('pointerdown', closeAdvancedFilter)
    window.addEventListener('keydown', closeAdvancedFilterOnEscape)
    return () => {
      document.removeEventListener('pointerdown', closeAdvancedFilter)
      window.removeEventListener('keydown', closeAdvancedFilterOnEscape)
    }
  }, [advancedFilterOpen])

  useEffect(() => {
    if (!tagComboboxOpen) return
    function closeTagCombobox(event: PointerEvent) {
      if (!tagComboboxRef.current?.contains(event.target as Node)) setTagComboboxOpen(false)
    }
    document.addEventListener('pointerdown', closeTagCombobox)
    return () => document.removeEventListener('pointerdown', closeTagCombobox)
  }, [tagComboboxOpen])

  useEffect(() => {
    function closeCreateMenu(event: PointerEvent) {
      if (createMenuRef.current?.open && !createMenuRef.current.contains(event.target as Node)) {
        createMenuRef.current.open = false
      }
    }
    function closeCreateMenuOnEscape(event: KeyboardEvent) {
      if (event.key !== 'Escape' || !createMenuRef.current?.open) return
      createMenuRef.current.open = false
      createMenuRef.current.querySelector<HTMLElement>('summary')?.focus()
    }
    document.addEventListener('pointerdown', closeCreateMenu)
    window.addEventListener('keydown', closeCreateMenuOnEscape)
    return () => {
      document.removeEventListener('pointerdown', closeCreateMenu)
      window.removeEventListener('keydown', closeCreateMenuOnEscape)
    }
  }, [])

  useEffect(() => {
    setSearchInput(bulkSearchActive ? '' : search)
    setStatusFilter(status)
    setDateFieldFilter(dateField)
    setDateFromFilter(dateFrom)
    setDateToFilter(dateTo)
    setBrandIdFilter(brandId)
    setCategoryIdFilter(categoryId)
    setTagIdsFilter(tagIds)
    setPriceMinFilter(priceMin)
    setPriceMaxFilter(priceMax)
    setStockMinFilter(stockMin)
    setStockMaxFilter(stockMax)
    if (bulkSearchActive) setBulkCodes(search.replaceAll(',', '\n'))
  }, [brandId, bulkSearchActive, categoryId, dateField, dateFrom, dateTo, priceMax, priceMin, search, status, stockMax, stockMin, tagIds])

  useEffect(() => () => {
    if (searchTimerRef.current !== null) window.clearTimeout(searchTimerRef.current)
  }, [])

  function clearSearchTimer() {
    if (searchTimerRef.current === null) return
    window.clearTimeout(searchTimerRef.current)
    searchTimerRef.current = null
  }

  function navigateFilters(
    nextSearch: string,
    nextStatus: string,
    mode: 'push' | 'replace' = 'replace',
    nextBulkSearchActive = false,
    nextDateField: DateFilterField = dateField,
    nextDateFrom = dateFrom,
    nextDateTo = dateTo,
    nextBrandId = brandId,
    nextCategoryId = categoryId,
    nextTagIds: string[] = tagIds,
    nextPriceMin = priceMin,
    nextPriceMax = priceMax,
    nextStockMin = stockMin,
    nextStockMax = stockMax,
  ) {
    clearSearchTimer()
    const href = buildHref(organizationId, {
      view,
      q: nextSearch.trim(),
      status: nextStatus,
      date_by: nextDateFrom || nextDateTo ? nextDateField : undefined,
      date_from: nextDateFrom,
      date_to: nextDateTo,
      brand_id: nextBrandId,
      sort,
      category_id: nextCategoryId,
      page_size: view === 'products' ? String(productPageSize) : undefined,
      tag_ids: nextTagIds.join(','),
      bulk: nextBulkSearchActive ? '1' : undefined,
      price_min: nextPriceMin,
      price_max: nextPriceMax,
      stock_min: nextStockMin,
      stock_max: nextStockMax,
    })
    startSearchTransition(() => {
      if (mode === 'push') router.push(href, { scroll: false })
      else router.replace(href, { scroll: false })
    })
  }

  function scheduleSearch(nextSearch: string) {
    clearSearchTimer()
    searchTimerRef.current = window.setTimeout(() => {
      searchTimerRef.current = null
      navigateFilters(nextSearch, status)
    }, 250)
  }

  function openBulkSearch(value = searchInput) {
    clearSearchTimer()
    setBulkSearchAttempted(false)
    setBulkCodes(activeBulkCodes.length ? activeBulkCodes.join('\n') : value)
    setBulkSearchOpen(true)
  }

  function focusStatusOption(target: 'selected' | 'first' | 'last') {
    window.requestAnimationFrame(() => {
      const options = Array.from(statusFilterRef.current?.querySelectorAll<HTMLButtonElement>('[role="option"]') ?? [])
      if (!options.length) return
      if (target === 'first') options[0]?.focus()
      else if (target === 'last') options.at(-1)?.focus()
      else (options.find((option) => option.getAttribute('aria-selected') === 'true') ?? options[0])?.focus()
    })
  }

  function openStatusFilter(target: 'selected' | 'first' | 'last' = 'selected') {
    setAdvancedFilterOpen(false)
    setStatusFilterOpen(true)
    focusStatusOption(target)
  }

  function chooseStatusFilter(nextStatus: string) {
    setStatusFilter(nextStatus)
    setStatusFilterOpen(false)
    if (view === 'products') {
      setAdvancedFilterError('')
      setAdvancedFilterOpen(true)
      window.requestAnimationFrame(() => advancedFilterButtonRef.current?.focus())
    } else {
      statusFilterButtonRef.current?.focus()
      navigateFilters(bulkSearchActive ? search : searchInput, nextStatus, 'replace', bulkSearchActive)
    }
  }

  function toggleTagFilterOption(tagId: string) {
    setTagIdsFilter((current) => current.includes(tagId)
      ? current.filter((id) => id !== tagId)
      : current.length < 12 ? [...current, tagId] : current)
    setAdvancedFilterError('')
  }

  function clearAdvancedFilterDraft() {
    setStatusFilter('')
    setDateFieldFilter('created')
    setDateFromFilter('')
    setDateToFilter('')
    setBrandIdFilter('')
    setCategoryIdFilter('')
    setTagIdsFilter([])
    setTagSearchInput('')
    setTagComboboxOpen(false)
    setPriceMinFilter('')
    setPriceMaxFilter('')
    setAdvancedFilterError('')
    setStockMinFilter('')
    setStockMaxFilter('')
  }

  function applyAdvancedFilters() {
    if (dateFromFilter && dateToFilter && dateFromFilter > dateToFilter) {
      setAdvancedFilterError('วันที่เริ่มต้นต้องไม่อยู่หลังวันที่สิ้นสุด')
      return
    }
    if (priceMinFilter && priceMaxFilter && Number(priceMinFilter) > Number(priceMaxFilter)) {
      setAdvancedFilterError('ราคาต่ำสุดต้องไม่มากกว่าราคาสูงสุด')
      return
    }
    if (stockMinFilter && stockMaxFilter && Number(stockMinFilter) > Number(stockMaxFilter)) {
      setAdvancedFilterError('จำนวนสต๊อกต่ำสุดต้องไม่มากกว่าจำนวนสูงสุด')
      return
    }
    setAdvancedFilterError('')
    setTagComboboxOpen(false)
    setAdvancedFilterOpen(false)
    navigateFilters(bulkSearchActive ? search : searchInput, statusFilter, 'replace', bulkSearchActive, dateFieldFilter, dateFromFilter, dateToFilter, brandIdFilter, categoryIdFilter, tagIdsFilter, priceMinFilter, priceMaxFilter, stockMinFilter, stockMaxFilter)
    advancedFilterButtonRef.current?.focus()
  }

  function openEditor(mode: Exclude<EditorMode, null>) {
    setFeedback(null)
    setEditorMode(mode)
  }

  function closeEditor() {
    if (isPending) return
    editorImageDrafts.forEach((image) => URL.revokeObjectURL(image.previewUrl))
    setEditorImageDrafts([])
    setEditorImageError('')
    if (productAction === 'edit' || productAction === 'price') router.replace(closeDetailHref)
    else setEditorMode(null)
  }

  function selectProductEditorImages(event: ChangeEvent<HTMLInputElement>) {
    const files = Array.from(event.target.files ?? [])
    event.target.value = ''
    if (!files.length || !selectedProduct) return
    const remainingSlots = Math.max(0, PRODUCT_IMAGE_MAX_FILES - selectedProduct.images.length - editorImageDrafts.length)
    if (!remainingSlots) {
      setEditorImageError(`สินค้าเพิ่มรูปได้สูงสุด ${PRODUCT_IMAGE_MAX_FILES} รูป`)
      return
    }
    const accepted: ProductEditorImageDraft[] = []
    for (const file of files.slice(0, remainingSlots)) {
      try {
        validateProductImageFile(file)
        accepted.push({ id: crypto.randomUUID(), file, previewUrl: URL.createObjectURL(file) })
      } catch {
        setEditorImageError('รองรับ JPEG, PNG หรือ WebP และแต่ละรูปต้องไม่เกิน 5 MB')
      }
    }
    if (files.length > remainingSlots) setEditorImageError(`เลือกได้อีก ${remainingSlots} รูปเท่านั้น (สูงสุด ${PRODUCT_IMAGE_MAX_FILES} รูป)`)
    else if (accepted.length) setEditorImageError('')
    setEditorImageDrafts((current) => [...current, ...accepted])
  }

  function removeProductEditorImageDraft(id: string) {
    setEditorImageDrafts((current) => {
      const target = current.find((image) => image.id === id)
      if (target) URL.revokeObjectURL(target.previewUrl)
      return current.filter((image) => image.id !== id)
    })
  }

  async function executeEditorCommand(commandType: string, payload: Record<string, unknown>) {
    return executeFoundationCommandAction({
      kind: 'entity',
      commandId: crypto.randomUUID(),
      organizationId,
      commandType,
      payload,
    })
  }

  async function uploadProductEditorImages(product: ProductWorkspaceDetail, productName: string) {
    const existingImageIds = product.images.map((image) => image.id)
    if (!editorImageDrafts.length) {
      const currentCoverImageId = product.images.find((image) => image.isCover)?.id ?? existingImageIds[0]
      if (existingImageIds.length && editorCoverImageId && editorCoverImageId !== currentCoverImageId) {
        const reordered = await executeEditorCommand('product.images.reorder', {
          product_id: product.id,
          image_ids: existingImageIds,
          cover_image_id: editorCoverImageId,
        })
        if (!reordered.ok) throw new Error(reordered.error)
      }
      return existingImageIds
    }
    const client = createClient()
    const uploadedIds: string[] = []
    for (let index = 0; index < editorImageDrafts.length; index += 1) {
      const draft = editorImageDrafts[index]
      let reservation: PreparedProductImage | null = null
      try {
        const prepared = await executeEditorCommand('product.image.prepare', {
          product_id: product.id,
          original_file_name: draft.file.name,
          mime_type: draft.file.type,
          file_size_bytes: draft.file.size,
          alt_text: `${productName} รูปที่ ${product.images.length + index + 1}`.slice(0, 160),
        })
        if (!prepared.ok) throw new Error(prepared.error)
        reservation = prepared.data as PreparedProductImage
        await uploadPreparedProductImage(client, reservation, draft.file)
        const finalized = await executeEditorCommand('product.image.finalize', {
          image_id: reservation.entity_id,
          expected_version: reservation.version,
        })
        if (!finalized.ok) throw new Error(finalized.error)
        uploadedIds.push(reservation.entity_id)
      } catch (error) {
        if (reservation) {
          await executeProductImageCleanupAction({
            kind: 'entity',
            commandId: crypto.randomUUID(),
            organizationId,
            commandType: 'product.image.fail',
            payload: {
              image_id: reservation.entity_id,
              expected_version: reservation.version,
              failure_reason: error instanceof Error ? error.message.slice(0, 500) : 'client_upload_failed',
            },
          })
        }
        throw error
      }
    }
    const imageIds = [...existingImageIds, ...uploadedIds]
    const coverImageId = imageIds.includes(editorCoverImageId) ? editorCoverImageId : imageIds[0]
    if (imageIds.length && coverImageId) {
      const reordered = await executeEditorCommand('product.images.reorder', {
        product_id: product.id,
        image_ids: imageIds,
        cover_image_id: coverImageId,
      })
      if (!reordered.ok) throw new Error(reordered.error)
    }
    return imageIds
  }

  function submitProductEditor(data: FormData, product: ProductWorkspaceDetail) {
    const name = String(data.get('name') ?? '').trim()
    const tagIds = data.getAll('tagIds').map(String)
    setFeedback(null)
    startTransition(async () => {
      try {
        const metadata = await executeEditorCommand('product.metadata.update', {
          product_id: product.id,
          expected_version: product.version,
          category_id: String(data.get('categoryId') ?? '') || null,
          brand_id: String(data.get('brandId') ?? '') || null,
          structure_type: product.structureType,
          internal_note: String(data.get('internalNote') ?? '').trim() || null,
          tag_ids: tagIds,
        })
        if (!metadata.ok) throw new Error(metadata.error)
        const nextVersion = Number(metadata.data.version)
        const general = await executeEditorCommand('product.update', {
          product_id: product.id,
          expected_version: Number.isFinite(nextVersion) ? nextVersion : product.version + 1,
          name,
          description: String(data.get('description') ?? '').trim(),
        })
        if (!general.ok) throw new Error(general.error)
        await uploadProductEditorImages(product, name)
        editorImageDrafts.forEach((image) => URL.revokeObjectURL(image.previewUrl))
        setEditorImageDrafts([])
        setFeedback({ tone: 'success', text: 'บันทึกข้อมูลสินค้าเรียบร้อยแล้ว' })
        router.replace(closeDetailHref)
        router.refresh()
      } catch (error) {
        const code = error instanceof Error ? error.message : 'foundation_command_failed'
        setFeedback({ tone: 'danger', text: errorLabels[code] ?? 'บันทึกข้อมูลบางส่วนไม่สำเร็จ กรุณารีเฟรชแล้วตรวจสอบอีกครั้ง', code })
      }
    })
  }

  function runCommand(commandType: string, payload: Record<string, unknown>) {
    setFeedback(null)
    startTransition(async () => {
      const result = await executeFoundationCommandAction({
        kind: 'entity',
        commandId: crypto.randomUUID(),
        organizationId,
        commandType,
        payload,
      })
      if (!result.ok) {
        setFeedback({ tone: 'danger', text: errorLabels[result.error] ?? 'ไม่สามารถดำเนินการได้', code: result.error })
        return
      }
      setFeedback({ tone: 'success', text: 'บันทึกข้อมูลเรียบร้อยแล้ว' })
      if (productAction === 'edit' || productAction === 'price') router.replace(closeDetailHref)
      else {
        setEditorMode(null)
        router.refresh()
      }
    })
  }

  function submitEditor(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const data = new FormData(event.currentTarget)
    const name = String(data.get('name') ?? '').trim()

    if (editorMode === 'create-product') {
      runCommand('product.create', {
        name,
        description: String(data.get('description') ?? '').trim(),
      })
    } else if (editorMode === 'edit-product' && selectedProduct) {
      submitProductEditor(data, selectedProduct)
    } else if (editorMode === 'create-sku') {
      runCommand('sku.create', {
        product_id: String(data.get('productId') ?? ''),
        sku_code: String(data.get('skuCode') ?? '').trim(),
        name,
        barcode: String(data.get('barcode') ?? '').trim(),
        sales_code: String(data.get('salesCode') ?? '').trim(),
        base_unit_code: String(data.get('baseUnitCode') ?? '').trim(),
        status: String(data.get('status') ?? 'draft'),
      })
    } else if (editorMode === 'edit-sku' && selectedSku) {
      runCommand('sku.update', {
        sku_id: selectedSku.id,
        expected_version: selectedSku.version,
        name,
        barcode: String(data.get('barcode') ?? '').trim(),
        sales_code: selectedSku.salesCode ?? String(data.get('salesCode') ?? '').trim(),
      })
    } else if (editorMode === 'edit-price' && selectedSku) {
      const profile = selectedSku.profile
      runCommand('sku.profile.upsert', {
        sku_id: selectedSku.id,
        expected_version: profile?.version ?? 0,
        quantity_behavior: profile?.quantityBehavior ?? 'discrete',
        sale_price: Number(data.get('salePrice')),
        currency_code: profile?.currencyCode ?? 'THB',
        tax_category: profile?.taxCategory ?? 'standard',
        tax_rate: profile?.taxRate ?? 7,
        product_weight_kg: profile?.productWeightKg ?? null,
        product_length_cm: profile?.productLengthCm ?? null,
        product_width_cm: profile?.productWidthCm ?? null,
        product_height_cm: profile?.productHeightCm ?? null,
        package_weight_kg: profile?.packageWeightKg ?? null,
        package_length_cm: profile?.packageLengthCm ?? null,
        package_width_cm: profile?.packageWidthCm ?? null,
        package_height_cm: profile?.packageHeightCm ?? null,
        safety_stock: profile?.safetyStock ?? null,
        reorder_min: profile?.reorderMin ?? null,
        reorder_max: profile?.reorderMax ?? null,
      })
    }
  }

  function requestLifecycle(input: {
    commandType: 'product.activate' | 'product.archive' | 'sku.activate' | 'sku.archive'
    idKey: 'product_id' | 'sku_id'
    id: string
    version: number
    label: string
  }) {
    if (input.commandType.endsWith('.archive')) {
      setPendingLifecycle(input as PendingLifecycle)
      return
    }
    runCommand(input.commandType, { [input.idKey]: input.id, expected_version: input.version })
  }

  function submitBulkSearch(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const codes = uniqueBulkCodes
    setBulkSearchAttempted(true)
    if (!codes.length) return
    setBulkSearchOpen(false)
    setSearchInput('')
    navigateFilters(codes.join(','), status, 'push', true)
  }

  const nextHref = buildHref(organizationId, {
    view,
    q: search,
    status,
    date_by: dateFrom || dateTo ? dateField : undefined,
    date_from: dateFrom,
    date_to: dateTo,
    sort,
    cursor: nextCursor,
    bulk: bulkSearchActive ? '1' : undefined,
  })


  const activeTagOptions = tagOptions.filter((option) => option.status !== 'archived')
  const normalizedTagSearch = tagSearchInput.trim().toLocaleLowerCase('th-TH')
  const filteredTagOptions = activeTagOptions.filter((option) => !normalizedTagSearch || option.name.toLocaleLowerCase('th-TH').includes(normalizedTagSearch))
  const selectedTagOptions = tagIdsFilter.flatMap((id) => {
    const option = tagOptions.find((candidate) => candidate.id === id)
    return option ? [option] : []
  })
  const appliedAdvancedFilterCount = [
    status,
    dateFrom || dateTo,
    brandId,
    categoryId,
    tagIds.length ? 'tags' : '',
    priceMin || priceMax,
    stockMin || stockMax,
  ].filter(Boolean).length
  const advancedFilterDirty = statusFilter !== status || dateFieldFilter !== dateField || dateFromFilter !== dateFrom || dateToFilter !== dateTo || brandIdFilter !== brandId || categoryIdFilter !== categoryId || tagIdsFilter.join(',') !== tagIds.join(',') || priceMinFilter !== priceMin || priceMaxFilter !== priceMax || stockMinFilter !== stockMin || stockMaxFilter !== stockMax
  const hasAdvancedFilterDraft = Boolean(statusFilter || dateFromFilter || dateToFilter || brandIdFilter || categoryIdFilter || tagIdsFilter.length || priceMinFilter || priceMaxFilter || stockMinFilter || stockMaxFilter)

  const filterForm = <form className={`operations-filter-bar product-filter-bar${view === 'products' ? ' product-filter-bar-advanced' : ''}`} method="get" aria-label="ค้นหาและกรอง Product SKU" onSubmit={(event) => {
    if (view === 'products') {
      event.preventDefault()
      openBulkSearch(searchInput)
    }
  }}>
    <input type="hidden" name="view" value={view} />
    <input type="hidden" name="sort" value={sort} />
    <div className={`product-search-button-group${view === 'products' ? ' has-bulk-search' : ''}`}>
      <div className="product-search-wrap">
        <span className="product-search-icon" aria-hidden="true">⌕</span>
        <label className="sr-only" htmlFor="product-search">ค้นหา</label>
        <input id="product-search" name="q" type="text" autoComplete="off" value={searchInput} placeholder={view === 'products' ? 'ค้นหา Product, SKU, CF, Barcode, Brand หรือ Tag...' : 'ค้นหา SKU, ชื่อ, Barcode หรือ Sales Code'} maxLength={400} onChange={(event) => {
          const nextSearch = event.target.value
          setSearchInput(nextSearch)
          scheduleSearch(nextSearch)
        }} onKeyDown={(event) => {
          if (event.key === 'Enter' && view === 'products') {
            event.preventDefault()
            openBulkSearch(event.currentTarget.value)
          }
        }} />
        {searchInput ? <button className="product-search-clear" type="button" aria-label="ล้างคำค้นหา" onClick={() => {
          setSearchInput('')
          navigateFilters('', status)
        }}>×</button> : null}
      </div>
      {view === 'products' ? <button className="button secondary product-bulk-search-trigger" type="button" onClick={() => openBulkSearch()}><span aria-hidden="true">⌘</span> ค้นหาหลายรหัส</button> : null}
    </div>
        {view === 'skus' ? <>
<label className="sr-only" htmlFor="product-status">สถานะ</label>
    <div className="product-status-combobox" ref={statusFilterRef}>
      <input type="hidden" name="status" value={statusFilter} />
      <button
        id="product-status"
        className="product-status-combobox-trigger"
        ref={statusFilterButtonRef}
        type="button"
        role="combobox"
        aria-controls="product-status-options"
        aria-expanded={statusFilterOpen}
        aria-haspopup="listbox"
        onClick={() => {
          if (statusFilterOpen) setStatusFilterOpen(false)
          else openStatusFilter()
        }}
        onKeyDown={(event) => {
          if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
            event.preventDefault()
            openStatusFilter(event.key === 'ArrowDown' ? 'first' : 'last')
          }
          if (event.key === 'Escape' && statusFilterOpen) {
            event.preventDefault()
            setStatusFilterOpen(false)
          }
        }}
      >
        <span>{statusFilterOptions.find((option) => option.value === statusFilter)?.label ?? 'ทุกสถานะ'}</span>
        <span className="product-status-combobox-arrow" aria-hidden="true" />
      </button>
      {statusFilterOpen ? <div id="product-status-options" className="product-status-combobox-options" role="listbox" aria-label="กรองตามสถานะ">
        {statusFilterOptions.map((option) => <button
          key={option.value || 'all'}
          type="button"
          role="option"
          aria-selected={statusFilter === option.value}
          onClick={() => chooseStatusFilter(option.value)}
          onKeyDown={(event) => {
            const options = Array.from(statusFilterRef.current?.querySelectorAll<HTMLButtonElement>('[role="option"]') ?? [])
            const index = options.indexOf(event.currentTarget)
            if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
              event.preventDefault()
              const offset = event.key === 'ArrowDown' ? 1 : -1
              options[(index + offset + options.length) % options.length]?.focus()
            } else if (event.key === 'Home' || event.key === 'End') {
              event.preventDefault()
              options[event.key === 'Home' ? 0 : options.length - 1]?.focus()
            } else if (event.key === 'Escape' || event.key === 'Tab') {
              setStatusFilterOpen(false)
              if (event.key === 'Escape') {
                event.preventDefault()
                statusFilterButtonRef.current?.focus()
              }
            }
          }}
        >{option.label}</button>)}
      </div> : null}
    </div>
    </> : null}
    {view === 'products' ? <div className="product-advanced-filter-slot">
      <div className="product-advanced-filter" ref={advancedFilterRef}>
        <button
          ref={advancedFilterButtonRef}
          className="product-advanced-filter-trigger"
          type="button"
          aria-haspopup="dialog"
          aria-controls="product-advanced-filter-panel"
          aria-expanded={advancedFilterOpen}
          onClick={() => {
            setStatusFilterOpen(false)
            setAdvancedFilterOpen((open) => !open)
          }}
        >
          <span className="product-advanced-filter-trigger-label">ค้นหาแบบละเอียด{appliedAdvancedFilterCount ? <span className="product-advanced-filter-count">{appliedAdvancedFilterCount}</span> : null}</span>
          <span className="product-status-combobox-arrow" aria-hidden="true" />
        </button>
        {advancedFilterOpen ? <section id="product-advanced-filter-panel" className="product-advanced-filter-panel" role="dialog" aria-modal="false" aria-labelledby="product-advanced-filter-title">
          <header>
            <div><h2 id="product-advanced-filter-title">ตัวกรองขั้นสูง (Advanced Filter)</h2><p>เลือกเงื่อนไขที่ต้องการ แล้วกดค้นหาเพียงครั้งเดียว</p></div>
            <button className="product-advanced-filter-close" type="button" aria-label="ปิดตัวกรองขั้นสูง" onClick={() => {
              setTagComboboxOpen(false)
              setAdvancedFilterOpen(false)
              advancedFilterButtonRef.current?.focus()
            }}>×</button>
          </header>
          <div className="product-advanced-filter-body">
            <fieldset className="product-advanced-filter-fieldset product-advanced-filter-status">
              <legend>สถานะ</legend>
              <p id="product-status-filter-help">เลือกสถานะสินค้าที่ต้องการ หรือเลือกทุกสถานะเพื่อไม่จำกัดผลลัพธ์</p>
              <label className="product-advanced-filter-control">
                <span>สถานะสินค้า</span>
                <select value={statusFilter} aria-describedby="product-status-filter-help" onChange={(event) => {
                  setStatusFilter(event.target.value)
                  setAdvancedFilterError('')
                }}>
                  {statusFilterOptions.map((option) => <option key={option.value || 'all'} value={option.value}>{option.label}</option>)}
                </select>
              </label>
            </fieldset>
            <fieldset className="product-date-filter-fieldset">
              <legend>วันที่สร้าง / วันที่แก้ไข</legend>
              <p id="product-date-filter-help">เลือกประเภทวันที่และช่วงเวลาที่ต้องการค้นหา โดยเว้นช่องใดช่องหนึ่งได้</p>
              <div className="product-date-filter-grid">
                <label>
                  <span>อ้างอิงวันที่</span>
                  <select value={dateFieldFilter} onChange={(event) => {
                    setDateFieldFilter(event.target.value as DateFilterField)
                    setAdvancedFilterError('')
                  }}>
                    <option value="created">วันที่สร้าง</option>
                    <option value="updated">วันที่แก้ไข</option>
                  </select>
                </label>
                <label>
                  <span>วันที่เริ่มต้น</span>
                  <input type="date" value={dateFromFilter} max={dateToFilter || undefined} aria-describedby="product-date-filter-help" onChange={(event) => {
                    setDateFromFilter(event.target.value)
                    setAdvancedFilterError('')
                  }} />
                </label>
                <label>
                  <span>วันที่สิ้นสุด</span>
                  <input type="date" value={dateToFilter} min={dateFromFilter || undefined} aria-describedby="product-date-filter-help" onChange={(event) => {
                    setDateToFilter(event.target.value)
                    setAdvancedFilterError('')
                  }} />
                </label>
              </div>
            </fieldset>
            <fieldset className="product-advanced-filter-fieldset">
              <legend>แบรนด์</legend>
              <p id="product-brand-filter-help">เลือกแบรนด์ที่ต้องการค้นหา หรือเลือกทุกแบรนด์เพื่อไม่จำกัดผลลัพธ์</p>
              <label className="product-advanced-filter-control">
                <span>แบรนด์สินค้า</span>
                <select value={brandIdFilter} aria-describedby="product-brand-filter-help" onChange={(event) => {
                  setBrandIdFilter(event.target.value)
                  setAdvancedFilterError('')
                }}>
                  <option value="">ทุกแบรนด์</option>
                  {brandOptions.filter((option) => option.status !== 'archived').map((option) => <option key={option.id} value={option.id}>{option.name}</option>)}
                </select>
              </label>
            </fieldset>
            <fieldset className="product-advanced-filter-fieldset">
              <legend>หมวดหมู่</legend>
              <p id="product-category-filter-help">เลือกหมวดหมู่ที่ต้องการค้นหา หรือเลือกทุกหมวดหมู่เพื่อไม่จำกัดผลลัพธ์</p>
              <label className="product-advanced-filter-control">
                <span>หมวดหมู่สินค้า</span>
                <select value={categoryIdFilter} aria-describedby="product-category-filter-help" onChange={(event) => {
                  setCategoryIdFilter(event.target.value)
                  setAdvancedFilterError('')
                }}>
                  <option value="">ทุกหมวดหมู่</option>
                  {categoryOptions.filter((option) => option.status !== 'archived').map((option) => <option key={option.id} value={option.id}>{option.name}</option>)}
                </select>
              </label>
            </fieldset>
            <fieldset className="product-advanced-filter-fieldset product-advanced-filter-tags">
              <legend>ป้ายกำกับ (Tags)</legend>
              <p id="product-tag-filter-help">ค้นหาและเลือกได้หลายป้าย ผลลัพธ์จะแสดงสินค้าที่มีอย่างน้อยหนึ่งป้ายตรงกับที่เลือก</p>
              {activeTagOptions.length ? <div className="product-tag-multiselect" ref={tagComboboxRef}>
                <div className={`product-tag-multiselect-control${tagComboboxOpen ? ' is-open' : ''}`}>
                  <div className="product-tag-multiselect-values">
                    {selectedTagOptions.map((option) => <span className="product-tag-multiselect-chip" key={option.id}>
                      <span>{option.name}</span>
                      <button type="button" aria-label={`ลบป้ายกำกับ ${option.name}`} onClick={() => toggleTagFilterOption(option.id)}>×</button>
                    </span>)}
                    <input
                      ref={tagSearchInputRef}
                      type="text"
                      role="combobox"
                      aria-label="ค้นหาและเลือกป้ายกำกับ"
                      aria-describedby="product-tag-filter-help"
                      aria-autocomplete="list"
                      aria-expanded={tagComboboxOpen}
                      aria-controls="product-tag-filter-options"
                      aria-activedescendant={tagComboboxOpen && filteredTagOptions[activeTagOptionIndex] ? `product-tag-option-${filteredTagOptions[activeTagOptionIndex].id}` : undefined}
                      value={tagSearchInput}
                      placeholder={selectedTagOptions.length ? 'ค้นหา Tags เพิ่ม...' : 'ค้นหาและเลือก Tags...'}
                      maxLength={80}
                      onFocus={() => setTagComboboxOpen(true)}
                      onChange={(event) => {
                        setTagSearchInput(event.target.value)
                        setActiveTagOptionIndex(0)
                        setTagComboboxOpen(true)
                      }}
                      onKeyDown={(event) => {
                        if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
                          event.preventDefault()
                          setTagComboboxOpen(true)
                          if (!filteredTagOptions.length) return
                          const offset = event.key === 'ArrowDown' ? 1 : -1
                          setActiveTagOptionIndex((current) => (current + offset + filteredTagOptions.length) % filteredTagOptions.length)
                        } else if (event.key === 'Enter' && tagComboboxOpen && filteredTagOptions[activeTagOptionIndex]) {
                          event.preventDefault()
                          toggleTagFilterOption(filteredTagOptions[activeTagOptionIndex].id)
                          setTagSearchInput('')
                          setActiveTagOptionIndex(0)
                        } else if (event.key === 'Escape' && tagComboboxOpen) {
                          event.preventDefault()
                          event.stopPropagation()
                          setTagComboboxOpen(false)
                        } else if (event.key === 'Backspace' && !tagSearchInput && selectedTagOptions.length) {
                          toggleTagFilterOption(selectedTagOptions[selectedTagOptions.length - 1].id)
                        }
                      }}
                    />
                  </div>
                  <button className="product-tag-multiselect-toggle" type="button" aria-label={tagComboboxOpen ? 'ปิดรายการป้ายกำกับ' : 'เปิดรายการป้ายกำกับ'} aria-expanded={tagComboboxOpen} onClick={() => {
                    const nextOpen = !tagComboboxOpen
                    setTagComboboxOpen(nextOpen)
                    if (nextOpen) window.requestAnimationFrame(() => tagSearchInputRef.current?.focus())
                  }}>
                    <span className="product-status-combobox-arrow" aria-hidden="true" />
                  </button>
                </div>
                {tagComboboxOpen ? <div id="product-tag-filter-options" className="product-tag-multiselect-options" role="listbox" aria-label="รายการป้ายกำกับ" aria-multiselectable="true">
                  <div className="product-tag-multiselect-option-list">
                    {filteredTagOptions.length ? filteredTagOptions.map((option, index) => {
                      const selected = tagIdsFilter.includes(option.id)
                      const disabled = !selected && tagIdsFilter.length >= 12
                      return <button
                        id={`product-tag-option-${option.id}`}
                        key={option.id}
                        className={index === activeTagOptionIndex ? 'is-active' : undefined}
                        type="button"
                        role="option"
                        aria-selected={selected}
                        disabled={disabled}
                        onMouseEnter={() => setActiveTagOptionIndex(index)}
                        onClick={() => {
                          toggleTagFilterOption(option.id)
                          setTagSearchInput('')
                          setActiveTagOptionIndex(0)
                          window.requestAnimationFrame(() => tagSearchInputRef.current?.focus())
                        }}
                      >
                        <span>{option.name}</span>
                        <small>{selected ? 'เลือกแล้ว' : 'เลือก'}</small>
                      </button>
                    }) : <p className="product-tag-multiselect-empty">ไม่พบป้ายกำกับที่ตรงกับ “{tagSearchInput.trim()}”</p>}
                  </div>
                  <footer>
                    <span>{tagIdsFilter.length}/12 ป้าย</span>
                    <button type="button" disabled={!tagIdsFilter.length} onClick={() => {
                      setTagIdsFilter([])
                      setAdvancedFilterError('')
                      tagSearchInputRef.current?.focus()
                    }}>ล้าง Tags ที่เลือก</button>
                  </footer>
                </div> : null}
              </div> : <p className="product-advanced-filter-no-options">ยังไม่มีป้ายกำกับที่ใช้งานได้</p>}
              <small>{tagIdsFilter.length ? `เลือกแล้ว ${tagIdsFilter.length} ป้าย` : 'ยังไม่ได้เลือกป้ายกำกับ'}</small>
            </fieldset>
            <fieldset className="product-advanced-filter-fieldset">
              <legend>ช่วงราคาขาย</legend>
              <p id="product-price-filter-help">ค้นหา Product ที่มีอย่างน้อยหนึ่ง SKU อยู่ในช่วงราคาที่กำหนด</p>
              <div className="product-advanced-filter-range">
                <label>
                  <span>ราคาต่ำสุด</span>
                  <input type="number" inputMode="decimal" min="0" max="999999999.99" step="0.01" value={priceMinFilter} placeholder="เช่น 100" aria-describedby="product-price-filter-help" onChange={(event) => { setPriceMinFilter(event.target.value); setAdvancedFilterError('') }} />
                </label>
                <label>
                  <span>ราคาสูงสุด</span>
                  <input type="number" inputMode="decimal" min="0" max="999999999.99" step="0.01" value={priceMaxFilter} placeholder="เช่น 5,000" aria-describedby="product-price-filter-help" onChange={(event) => { setPriceMaxFilter(event.target.value); setAdvancedFilterError('') }} />
                </label>
              </div>
              <small>หน่วยบาท · เว้นว่างด้านใดด้านหนึ่งได้</small>
            </fieldset>
            <fieldset className="product-advanced-filter-fieldset">
              <legend>จำนวนสต๊อกที่ใช้ได้</legend>
              <p id="product-stock-filter-help">ค้นหา Product ที่มีอย่างน้อยหนึ่ง SKU ซึ่งยอด Available รวมทุกตำแหน่งอยู่ในช่วงที่กำหนด</p>
              {canReadInventory ? <>
                <div className="product-advanced-filter-range">
                  <label>
                    <span>จำนวนต่ำสุด</span>
                    <input type="number" inputMode="decimal" min="0" max="999999999999.999" step="0.001" value={stockMinFilter} placeholder="เช่น 1" aria-describedby="product-stock-filter-help" onChange={(event) => { setStockMinFilter(event.target.value); setAdvancedFilterError('') }} />
                  </label>
                  <label>
                    <span>จำนวนสูงสุด</span>
                    <input type="number" inputMode="decimal" min="0" max="999999999999.999" step="0.001" value={stockMaxFilter} placeholder="เช่น 100" aria-describedby="product-stock-filter-help" onChange={(event) => { setStockMaxFilter(event.target.value); setAdvancedFilterError('') }} />
                  </label>
                </div>
                <small>เว้นว่างด้านใดด้านหนึ่งได้ · สินค้าที่ไม่มี Stock นับเป็น 0</small>
              </> : <p className="product-advanced-filter-no-options">บัญชีนี้ไม่มีสิทธิ์ดูจำนวนสต๊อก</p>}
            </fieldset>
            {advancedFilterError ? <p className="product-advanced-filter-error" role="alert">{advancedFilterError}</p> : null}
          </div>
          <footer>
            <button className="button product-grid-button-secondary" type="button" disabled={!hasAdvancedFilterDraft} onClick={clearAdvancedFilterDraft}>ล้างทั้งหมด</button>
            <button className="button product-grid-button-primary" type="button" disabled={!advancedFilterDirty} onClick={applyAdvancedFilters}>ค้นหา</button>
          </footer>
        </section> : null}
      </div>
    </div> : null}
    {view === 'skus' ? <button className="button product-search-submit" type="submit" title="ค้นหา · Ctrl+Enter">ค้นหา</button> : <button className="sr-only" type="submit">ค้นหา</button>}
  </form>

  return <>
    <header className="product-modern-heading">
      <div className="product-heading-title-row">
        <h1>{view === 'products' ? 'สินค้า' : 'รหัสสินค้า (SKU)'}</h1>
        <span className="product-count-badge" aria-label={`${skuCount} SKU`}>
          {skuCount} SKU
        </span>
      </div>
      <div className="product-heading-subrow">
        <p>{view === 'products'
          ? `จัดการสินค้า รหัสสินค้า (SKU) รหัสขาย / รหัส CF และบาร์โค้ดของ ${organizationName}`
          : `จัดการรหัสสินค้า (SKU) รหัสขาย / รหัส CF และบาร์โค้ดของ ${organizationName}`}</p>
        {canCreate ? <details className="product-create-menu" ref={createMenuRef}>
          <summary className="button">＋ สร้างสินค้า <span aria-hidden="true">▾</span></summary>
          <div className="product-create-menu-panel" role="menu">
            <Link role="menuitem" href={`/organizations/${organizationId}/products/new`}><strong>สร้างสินค้าปกติ</strong><small>ข้อมูลครบสำหรับสินค้าขายประจำและเติม Stock ต่อเนื่อง</small></Link>
            <Link role="menuitem" href={`/organizations/${organizationId}/products/live-sale/rapid-entry`}><strong>สร้างสินค้าขายด่วน / Live Sale</strong><small>จอง Sales Code และเพิ่มสินค้ามาไว–ไปไวต่อเนื่อง</small></Link>
          </div>
        </details> : <span className="product-readonly-note">อ่านอย่างเดียว</span>}
      </div>
    </header>

    <section className="product-workspace-panel" aria-label="รายการ Product และ SKU">

    {feedback ? <div className={`product-feedback ${feedback.tone}`} role={feedback.tone === 'danger' ? 'alert' : 'status'}><span>{feedback.text}</span>{feedback.code === 'version_conflict' ? <button className="button secondary compact" type="button" onClick={() => router.refresh()}>รีเฟรชข้อมูล</button> : null}</div> : null}

    {view === 'products' ? <ProductsDataGrid
      organizationId={organizationId}
      rows={productWorkspaceRows}
      page={productPage}
      pageSize={productPageSize}
      totalCount={productTotalCount}
      search={search}
      status={status}
      dateField={dateField}
      dateFrom={dateFrom}
      dateTo={dateTo}
      sort={sort}
      brandId={brandId}
      toolbar={filterForm}
      categoryId={categoryId}
      tagIds={tagIds}
      priceMin={priceMin}
      priceMax={priceMax}
      stockMin={stockMin}
      stockMax={stockMax}
      clearHref={buildHref(organizationId, { view })}
      bulkActiveCount={activeBulkCodes.length}
      clearBulkHref={buildHref(organizationId, { view, status, date_by: dateFrom || dateTo ? dateField : undefined, date_from: dateFrom, date_to: dateTo, brand_id: brandId, category_id: categoryId, tag_ids: tagIds.join(','), price_min: priceMin, price_max: priceMax, stock_min: stockMin, stock_max: stockMax, sort })}
      emptyState={search || status || dateFrom || dateTo || brandId || categoryId || tagIds.length || priceMin || priceMax || stockMin || stockMax ? {
        title: 'ไม่พบรายการตามตัวกรอง',
        description: 'ลองเปลี่ยนคำค้นหา สถานะ หรือช่วงวันที่',
      } : {
        title: 'ยังไม่มี Product',
        description: canCreate ? 'เริ่มเพิ่มข้อมูลด้วยปุ่มสร้างสินค้า' : 'ติดต่อผู้ดูแล Organization เพื่อเพิ่มข้อมูล',
      }}
      canManage={canManage}
      canAdjustInventory={canAdjustInventory}
      inventoryLocationOptions={inventoryLocationOptions}
      canReadCost={canReadCost}
      brandOptions={brandOptions}
      categoryOptions={categoryOptions}
      tagOptions={tagOptions}
      isPending={isPending}
      onRequestLifecycle={requestLifecycle}
    /> : <>
      {filterForm}
      {!rows.length ? <OperationsEmptyState
      icon="＋"
      title={search || status ? 'ไม่พบรายการตามตัวกรอง' : 'ยังไม่มี SKU'}
      description={search || status ? 'ลองเปลี่ยนคำค้นหาหรือสถานะ' : canCreate ? 'เริ่มเพิ่มข้อมูลด้วยปุ่มด้านบน' : 'ติดต่อผู้ดูแล Organization เพื่อเพิ่มข้อมูล'}
    /> : <>
      <div className="product-table-wrap">
        <table className="product-data-table">
          <thead><tr>
            <th>SKU</th><th>Product</th><th>รหัสขาย</th><th>สถานะ</th><th>แก้ไขล่าสุด</th><th><span className="sr-only">รายละเอียด</span></th>
          </tr></thead>
          <tbody>{skus.map((sku) => <tr key={sku.id}>
            <td><strong className="product-code">{sku.skuCode}</strong><small>{sku.name}</small></td>
            <td>{sku.productName}</td>
            <td><span className="product-code">{sku.salesCode || '—'}</span><small>{sku.barcode || 'ไม่มี Barcode'}</small></td>
            <td><OperationsStatusBadge tone={statusTone(sku.status)}>{statusLabels[sku.status] ?? sku.status}</OperationsStatusBadge></td>
            <td>{formatUpdatedAt(sku.updatedAt)}</td>
            <td><Link className="product-row-link" href={buildHref(organizationId, { view, q: search, status, sku: sku.id })}>ดูรายละเอียด</Link></td>
          </tr>)}</tbody>
        </table>
      </div>

      <div className="product-mobile-list" role="list" aria-label="รายการ SKU">
        {skus.map((sku) => <article className="product-mobile-card" role="listitem" key={sku.id}>
          <div><strong className="product-code">{sku.skuCode}</strong><OperationsStatusBadge tone={statusTone(sku.status)}>{statusLabels[sku.status] ?? sku.status}</OperationsStatusBadge></div>
          <p>{sku.name} · {sku.productName}</p>
          <small>{sku.salesCode || 'ไม่มี Sales Code'} · {sku.barcode || 'ไม่มี Barcode'}</small>
          <Link className="product-row-link" href={buildHref(organizationId, { view, q: search, status, sku: sku.id })}>ดูรายละเอียด</Link>
        </article>)}
      </div>
      </>}
    </>}

    {nextCursor ? <nav className="product-pagination" aria-label="หน้าถัดไป">
      <Link className="button secondary" href={nextHref}>ดูรายการถัดไป</Link>
    </nav> : null}
    </section>

    {!editorMode ? <ProductDetailSheet
      selectedProduct={selectedProduct}
      selectedSku={selectedSku}
      closeHref={closeDetailHref}
      canReadCost={canReadCost}
    /> : null}

    {bulkSearchOpen ? <div className="product-modal-backdrop product-bulk-search-backdrop" role="presentation" onMouseDown={(event) => {
      if (event.target === event.currentTarget) setBulkSearchOpen(false)
    }}>
      <section className="product-editor-dialog product-bulk-search-dialog" role="dialog" aria-modal="true" aria-labelledby="product-bulk-search-title">
        <header className="product-bulk-search-header"><h2 id="product-bulk-search-title">ป้อนกลุ่มข้อมูล</h2><button className="product-bulk-search-close" type="button" aria-label="ปิด" onClick={() => setBulkSearchOpen(false)}>×</button></header>
        <form onSubmit={submitBulkSearch}>
          <div className="product-bulk-search-body">
            <p>ใส่ SKU, รหัส CF หรือ Barcode โดยแยกด้วย comma, เว้นวรรค หรือขึ้นบรรทัดใหม่</p>
            <label className="sr-only" htmlFor="product-bulk-search-codes">กลุ่มรหัสสินค้า</label>
            <textarea id="product-bulk-search-codes" className="product-bulk-search-textarea" autoFocus value={bulkCodes} maxLength={400} rows={7} placeholder={'B03\nb11\nBLZ-DBL-NVY'} onChange={(event) => {
              setBulkCodes(event.target.value)
              setBulkSearchAttempted(false)
            }} onKeyDown={(event) => {
              if (event.key === 'Enter' && event.ctrlKey) event.currentTarget.form?.requestSubmit()
            }} />
            <div className="product-bulk-search-alerts" aria-live="polite">
              <div className="product-bulk-alert info" role="status"><BulkSearchAlertIcon tone="info" /><span>รับข้อมูลทั้งหมด <strong>{uniqueBulkCodes.length}</strong> รหัส</span></div>
              <div className="product-bulk-alert success" role="status"><BulkSearchAlertIcon tone="success" /><span>พบสินค้า <strong>{foundBulkCodes.length}</strong> รหัส</span></div>
              {missingBulkCodes.length ? <div className="product-bulk-alert warning" role="alert"><BulkSearchAlertIcon tone="warning" /><span>ไม่พบ <strong>{missingBulkCodes.length}</strong> รหัส: {missingBulkCodes.join(', ')}</span></div> : null}
              {duplicateBulkCodeCount ? <div className="product-bulk-alert duplicate" role="status"><BulkSearchAlertIcon tone="duplicate" /><span>ตัดรหัสซ้ำออก <strong>{duplicateBulkCodeCount}</strong> รายการ</span></div> : null}
              {bulkSearchAttempted && !uniqueBulkCodes.length ? <div className="product-bulk-alert warning" role="alert"><BulkSearchAlertIcon tone="warning" /><span>กรุณาใส่รหัสอย่างน้อย 1 รายการ</span></div> : null}
            </div>
          </div>
          <footer className="product-bulk-search-footer"><button className="button secondary" type="button" onClick={() => setBulkSearchOpen(false)}>ยกเลิก</button><span className="product-bulk-search-tooltip"><span role="tooltip">กด Ctrl+Enter เพื่อค้นหาได้</span><button className="button" type="submit" aria-describedby="product-bulk-search-shortcut">ค้นหา</button><span id="product-bulk-search-shortcut" className="sr-only">กด Control และ Enter เพื่อค้นหา</span></span></footer>
        </form>
      </section>
    </div> : null}

    {editorMode ? <div className="product-modal-backdrop product-single-editor-backdrop" role="presentation" onMouseDown={(event) => {
      if (event.target === event.currentTarget) closeEditor()
    }}>
      <section className="product-editor-dialog product-single-editor-dialog" role="dialog" aria-modal="true" aria-labelledby="product-editor-title">
        <header><div><div className="eyebrow">ข้อมูลสินค้า</div><h2 id="product-editor-title">{editorMode === 'create-product' ? 'เพิ่มสินค้า' : editorMode === 'create-sku' ? 'เพิ่ม SKU' : editorMode === 'edit-product' ? 'แก้ไขข้อมูลสินค้า' : editorMode === 'edit-price' ? 'แก้ไขราคาขาย' : 'แก้ไข SKU'}</h2></div><button className="product-single-editor-close" type="button" aria-label="ปิดหน้าต่าง" disabled={isPending} onClick={closeEditor}>×</button></header>
        <form onSubmit={submitEditor}>
          {editorMode === 'edit-product' && selectedProduct ? <div className="product-complete-editor">
            <section className="product-complete-editor-section" aria-labelledby="product-edit-general-title">
              <div className="product-complete-editor-heading"><span className="product-complete-editor-step">1</span><div><h3 id="product-edit-general-title">ข้อมูลทั่วไป</h3><p>แก้ไขชื่อและคำอธิบายที่แสดงในรายการสินค้า</p></div></div>
              <div className="product-complete-editor-fields">
                <label className="field-stack"><span className="product-single-editor-label">ชื่อสินค้า <b aria-hidden="true">*</b></span><input ref={firstFieldRef} name="name" required maxLength={160} defaultValue={selectedProduct.name} /></label>
                <label className="field-stack"><span className="product-single-editor-label">คำอธิบาย <small>(ไม่บังคับ)</small></span><textarea name="description" maxLength={2000} defaultValue={selectedProduct.description ?? ''} /></label>
              </div>
            </section>

            <section className="product-complete-editor-section" aria-labelledby="product-edit-images-title">
              <div className="product-complete-editor-heading"><span className="product-complete-editor-step">2</span><div><h3 id="product-edit-images-title">รูปภาพสินค้า</h3><p>เพิ่มรูปใหม่ได้สูงสุด {PRODUCT_IMAGE_MAX_FILES} รูป และคลิกรูปเดิมเพื่อเลือกเป็นภาพปก</p></div></div>
              <div className="product-editor-image-grid">
                {selectedProduct.images.map((image) => <button className={`product-editor-image ${editorCoverImageId === image.id ? 'selected' : ''}`} type="button" key={image.id} onClick={() => setEditorCoverImageId(image.id)} aria-pressed={editorCoverImageId === image.id}>
                  <Image src={image.signedUrl} alt={image.altText ?? selectedProduct.name} width={112} height={112} unoptimized />
                  <span>{editorCoverImageId === image.id ? 'ภาพปก' : 'เลือกเป็นภาพปก'}</span>
                </button>)}
                {editorImageDrafts.map((image) => <div className="product-editor-image product-editor-image-new" key={image.id}>
                  <Image src={image.previewUrl} alt={`รูปใหม่ ${image.file.name}`} width={112} height={112} unoptimized />
                  <span>รูปใหม่</span>
                  <button type="button" aria-label={`นำ ${image.file.name} ออก`} onClick={() => removeProductEditorImageDraft(image.id)}>×</button>
                </div>)}
                {selectedProduct.images.length + editorImageDrafts.length < PRODUCT_IMAGE_MAX_FILES ? <label className="product-editor-image-add">
                  <input type="file" accept="image/jpeg,image/png,image/webp" multiple onChange={selectProductEditorImages} />
                  <svg viewBox="0 0 24 24" aria-hidden="true"><rect x="3" y="4" width="18" height="16" rx="2" /><circle cx="9" cy="10" r="2" /><path d="m5 18 5-5 3 3 2-2 4 4" /></svg>
                  <strong>เพิ่มรูปภาพ</strong><small>JPEG, PNG, WebP</small>
                </label> : null}
              </div>
              {editorImageError ? <div className="product-feedback danger" role="alert">{editorImageError}</div> : null}
            </section>

            <section className="product-complete-editor-section" aria-labelledby="product-edit-classification-title">
              <div className="product-complete-editor-heading"><span className="product-complete-editor-step">3</span><div><h3 id="product-edit-classification-title">หมวดหมู่และการจัดกลุ่ม</h3><p>กำหนดหมวดหมู่ แบรนด์ และ Tags สำหรับค้นหาและจัดสินค้า</p></div></div>
              <div className="product-complete-editor-fields form-grid-two">
                <label className="field-stack">หมวดหมู่<span className="product-select-control"><select name="categoryId" defaultValue={selectedProduct.category?.id ?? ''}><option value="">ไม่ระบุหมวดหมู่</option>{categoryOptions.filter((item) => item.status !== 'archived' || item.id === selectedProduct.category?.id).map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select></span></label>
                <label className="field-stack">แบรนด์<span className="product-select-control"><select name="brandId" defaultValue={selectedProduct.brand?.id ?? ''}><option value="">ไม่มีแบรนด์</option>{brandOptions.filter((item) => item.status !== 'archived' || item.id === selectedProduct.brand?.id).map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select></span></label>
              </div>
              <fieldset className="product-editor-tags"><legend>Tags <small>(เลือกได้หลายรายการ)</small></legend><div>{tagOptions.filter((item) => item.status !== 'archived' || selectedProduct.tags.some((tag) => tag.id === item.id)).map((item) => <label key={item.id}><input type="checkbox" name="tagIds" value={item.id} defaultChecked={selectedProduct.tags.some((tag) => tag.id === item.id)} /><span>{item.name}</span></label>)}</div></fieldset>
            </section>

            <section className="product-complete-editor-section" aria-labelledby="product-edit-shared-title">
              <div className="product-complete-editor-heading"><span className="product-complete-editor-step">4</span><div><h3 id="product-edit-shared-title">ข้อมูลส่วนกลาง</h3><p>ข้อมูลระดับ Product ที่ทุก SKU ภายใต้สินค้านี้ใช้อ้างอิงร่วมกัน</p></div></div>
              <div className="product-editor-shared-summary"><div><span>รูปแบบสินค้า</span><strong>{selectedProduct.structureType === 'variant' ? 'มีตัวเลือกหลายรายการ' : selectedProduct.structureType === 'bundle' ? 'Bundle / Kit' : 'สินค้าปกติ'}</strong></div><div><span>สถานะ</span><strong>{statusLabels[selectedProduct.status] ?? selectedProduct.status}</strong></div><div><span>จำนวน SKU</span><strong>{selectedProduct.skuCount} รายการ</strong></div></div>
              <label className="field-stack"><span className="product-single-editor-label">บันทึกภายใน <small>(ไม่แสดงให้ลูกค้าเห็น)</small></span><textarea name="internalNote" maxLength={4000} defaultValue={selectedProduct.internalNote ?? ''} /></label>
            </section>
          </div> : null}
          {editorMode === 'edit-price' && selectedSku ? <><div className="product-immutable-fields" role="note"><div><span>สินค้า / SKU</span><strong>{selectedSku.productName} · <span className="product-code">{selectedSku.skuCode}</span></strong></div><p>แก้ไขเฉพาะราคาขายของ SKU นี้ ระบบจะบันทึกผ่านคำสั่งที่มี Audit Log</p></div><label className="field-stack">ราคาขาย (บาท)<input ref={firstFieldRef} name="salePrice" type="number" inputMode="decimal" min="0" step="0.01" required defaultValue={selectedSku.profile?.salePrice ?? ''} placeholder="0.00" /></label></> : null}
          {(editorMode === 'create-sku') ? <label className="field-stack">Product<span className="product-select-control"><select name="productId" required defaultValue={selectedProduct?.id ?? ''}><option value="" disabled>เลือก Product</option>{productOptions.filter((product) => product.status !== 'archived').map((product) => <option key={product.id} value={product.id}>{product.name}</option>)}</select></span></label> : null}
          {(editorMode === 'create-sku') ? <label className="field-stack">SKU Code<input ref={firstFieldRef} name="skuCode" required maxLength={80} autoComplete="off" placeholder="เช่น SHIRT-BLK-M" /></label> : null}
          {(editorMode !== 'edit-price' && editorMode !== 'edit-product') ? <label className="field-stack"><span className="product-single-editor-label">ชื่อสินค้า <b aria-hidden="true">*</b></span><input ref={editorMode === 'create-sku' ? undefined : firstFieldRef} name="name" required maxLength={160} defaultValue={selectedProduct?.name ?? selectedSku?.name ?? ''} /></label> : null}
          {editorMode === 'create-product' ? <label className="field-stack"><span className="product-single-editor-label">คำอธิบาย <small>(ไม่บังคับ)</small></span><textarea name="description" maxLength={2000} defaultValue={selectedProduct?.description ?? ''} /></label> : null}
          {editorMode === 'edit-sku' && selectedSku ? <div className="product-immutable-fields" role="note"><div><span>SKU Code</span><strong className="product-code">{selectedSku.skuCode}</strong></div><div><span>Base Unit</span><strong>{selectedSku.baseUnitCode}</strong></div><p>สองค่านี้เป็นรหัสอ้างอิงถาวรและแก้ไขไม่ได้</p></div> : null}
          {(editorMode === 'create-sku' || editorMode === 'edit-sku') ? <div className="form-grid-two">{editorMode === 'edit-sku' && selectedSku?.salesCode ? <div className="field-stack product-readonly-field"><span>Sales Code</span><strong className="product-code">{selectedSku.salesCode}</strong><small>บันทึกถาวรแล้ว เปลี่ยนไม่ได้</small></div> : <label className="field-stack">Sales Code<input name="salesCode" maxLength={80} defaultValue={selectedSku?.salesCode ?? ''} placeholder="รหัส CF/ขาย" /><small>ตั้งได้ครั้งเดียวก่อนบันทึก</small></label>}<label className="field-stack">Barcode<input name="barcode" maxLength={128} defaultValue={selectedSku?.barcode ?? ''} inputMode="numeric" /></label></div> : null}
          {editorMode === 'create-sku' ? <div className="form-grid-two"><label className="field-stack">Base Unit<input name="baseUnitCode" required maxLength={32} defaultValue="piece" /></label><label className="field-stack">สถานะ<span className="product-select-control"><select name="status" defaultValue="draft"><option value="draft">ฉบับร่าง</option><option value="active">ใช้งาน</option></select></span></label></div> : null}
          {feedback?.tone === 'danger' ? <div className="product-feedback danger" role="alert">{feedback.text}</div> : null}
          <footer><button className="button secondary" type="button" disabled={isPending} onClick={closeEditor}>ยกเลิก</button><button className="button" type="submit" disabled={isPending}>{isPending ? 'กำลังบันทึก…' : editorMode === 'edit-product' ? 'บันทึกการแก้ไข' : 'บันทึก'}</button></footer>
        </form>
      </section>
    </div> : null}

    {pendingLifecycle ? <div className="product-modal-backdrop" role="presentation" onMouseDown={(event) => {
      if (event.target === event.currentTarget && !isPending) setPendingLifecycle(null)
    }}>
      <section className="product-editor-dialog product-lifecycle-dialog" role="alertdialog" aria-modal="true" aria-labelledby="product-lifecycle-title" aria-describedby="product-lifecycle-description">
        <header><div><div className="eyebrow">Safe lifecycle action</div><h2 id="product-lifecycle-title">ยืนยันการเก็บถาวร</h2></div><button className="button secondary compact" type="button" disabled={isPending} onClick={() => setPendingLifecycle(null)}>ปิด</button></header>
        <div className="product-lifecycle-content"><p id="product-lifecycle-description">คุณกำลังเก็บ <strong>{pendingLifecycle.label}</strong> ถาวร รายการจะไม่ถูกลบ แต่จะเปลี่ยนเป็นอ่านอย่างเดียวและนำกลับมาใช้งานไม่ได้</p>{pendingLifecycle.commandType === 'sku.archive' ? <p>SKU ที่ยังมี On hand มากกว่า 0 จะถูกระบบปฏิเสธ เพื่อป้องกัน Stock สูญหาย</p> : <p>การเก็บ Product ไม่ลบ SKU หรือประวัติ Stock ที่เกี่ยวข้อง</p>}</div>
        <footer><button className="button secondary" type="button" disabled={isPending} onClick={() => setPendingLifecycle(null)}>ยกเลิก</button><button className="button danger" type="button" disabled={isPending} onClick={() => { const item = pendingLifecycle; setPendingLifecycle(null); runCommand(item.commandType, { [item.idKey]: item.id, expected_version: item.version }) }}>{isPending ? 'กำลังดำเนินการ…' : 'ยืนยันเก็บถาวร'}</button></footer>
      </section>
    </div> : null}
  </>
}

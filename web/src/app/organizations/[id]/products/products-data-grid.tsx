'use client'

import Link from 'next/link'
import Image from 'next/image'
import { useRouter } from 'next/navigation'
import {
  Fragment, useEffect, useMemo, useRef, useState, useTransition,
  type DragEvent as ReactDragEvent,
  type FormEvent,
  type KeyboardEvent as ReactKeyboardEvent,
  type PointerEvent as ReactPointerEvent,
  type ReactNode,
} from 'react'
import { executeFoundationCommandAction } from '@/app/actions/foundation'
import { OperationsEmptyState } from '@/app/components/operations-ui'
import type { ProductWorkspaceRow } from '@/lib/foundation/repositories'
import {
  normalizeProductGridColumns,
  PRODUCT_GRID_DEFAULT_COLUMNS,
  type ProductGridColumnKey,
  type ProductGridColumnPreference,
} from './product-grid-preferences'
import { formatProductUnit } from './product-unit-labels'

const labels: Record<ProductGridColumnKey, string> = {
  product: 'สินค้า', salesCode: 'รหัส CF', sku: 'SKU / ตัวเลือก', stock: 'สต็อก',
  baseUnit: 'หน่วยนับ', price: 'ราคาขาย', status: 'สถานะ', updatedAt: 'แก้ไขล่าสุด',
  category: 'หมวดหมู่', brand: 'แบรนด์', tags: 'ป้ายกำกับ', barcode: 'Barcode',
  quantityBehavior: 'วิธีนับจำนวน', tax: 'ภาษี', safetyStock: 'Safety Stock',
  reorder: 'Reorder Min / Max', branches: 'สาขาที่มีสต็อก', createdAt: 'วันที่สร้าง',
  createdBy: 'ผู้สร้าง', cost: 'ราคาต้นทุน',
}

const PRODUCT_EXPORT_COLUMNS = [
  ['product', 'Product'], ['salesCode', 'รหัส CF'], ['sku', 'SKU Code'], ['barcode', 'Barcode'],
  ['stock', 'Stock'], ['baseUnit', 'Base Unit'], ['price', 'ราคาขาย'], ['category', 'หมวดหมู่'],
  ['brand', 'แบรนด์'], ['quantityBehavior', 'วิธีนับจำนวน'], ['tax', 'อัตราภาษี'], ['tags', 'Tags'],
  ['branches', 'สาขา'], ['createdAt', 'วันที่สร้าง'], ['updatedAt', 'แก้ไขล่าสุด'],
  ['createdBy', 'ผู้สร้าง'], ['status', 'Status'],
] as const

type ProductExportColumnKey = typeof PRODUCT_EXPORT_COLUMNS[number][0]

type GridSort = { key: ProductGridColumnKey; direction: 'asc' | 'desc' }
type QuickEditState = {
  kind: 'price' | 'stock'
  row: ProductWorkspaceRow
  sku: ProductWorkspaceRow['skuPreview'][number]
  left: number
  top: number
}

const PRODUCT_GRID_SELECTION_WIDTH = 52
const PRODUCT_GRID_PAGE_SIZES = [10, 25, 50, 100, 300, 400] as const

function ProductGridPaginationIcon({ direction }: { direction: 'first' | 'previous' | 'next' | 'last' }) {
  const isPrevious = direction === 'first' || direction === 'previous'
  const isEdge = direction === 'first' || direction === 'last'
  return <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    {isEdge ? <path d={direction === 'first' ? 'M5 4v12' : 'M15 4v12'} /> : null}
    <path d={isPrevious ? 'm12.5 5-5 5 5 5' : 'm7.5 5 5 5-5 5'} />
  </svg>
}

function ProductGridPinIcon() {
  return <svg className="product-grid-pin-icon" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
    <path d="M16 9V4h1V2H7v2h1v5c0 1.66-1.34 3-3 3v2h6v7h2v-7h6v-2c-1.66 0-3-1.34-3-3Z" transform="rotate(45 12 12)" />
  </svg>
}

function ProductGridDragHandleIcon() {
  return <svg viewBox="0 0 18 18" fill="currentColor" aria-hidden="true">
    <circle cx="6" cy="4" r="1.25" /><circle cx="12" cy="4" r="1.25" />
    <circle cx="6" cy="9" r="1.25" /><circle cx="12" cy="9" r="1.25" />
    <circle cx="6" cy="14" r="1.25" /><circle cx="12" cy="14" r="1.25" />
  </svg>
}

function ProductGridEditIcon() {
  return <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="m13.8 3.2 3 3L7 16H4v-3Z" /><path d="m12.3 4.7 3 3" /></svg>
}

function statusLabel(status: string) {
  return ({ draft: 'ฉบับร่าง', active: 'ใช้งานอยู่', archived: 'เก็บถาวร' } as Record<string, string>)[status] ?? status
}

function formatUpdatedAt(value: string) {
  return new Intl.DateTimeFormat('th-TH', {
    dateStyle: 'medium', timeStyle: 'short', timeZone: 'Asia/Bangkok',
  }).format(new Date(value))
}

function formatPrice(row: ProductWorkspaceRow) {
  if (row.price.mode === 'mixed-currency') return 'หลายสกุลเงิน'
  if (row.price.mode === 'not-set' || row.price.minimum === null || !row.price.currencyCode) return 'ยังไม่กำหนดราคา'
  const formatter = new Intl.NumberFormat('th-TH', {
    style: 'currency', currency: row.price.currencyCode,
    minimumFractionDigits: 2, maximumFractionDigits: 2,
  })
  if (row.price.mode === 'range' && row.price.maximum !== null) {
    return `${formatter.format(row.price.minimum)} – ${formatter.format(row.price.maximum)}`
  }
  return formatter.format(row.price.minimum)
}

function formatSkuPrice(sku: ProductWorkspaceRow['skuPreview'][number]) {
  const amount = sku.profile?.salePrice
  const currencyCode = sku.profile?.currencyCode
  if (amount === null || amount === undefined || !currencyCode) return 'ยังไม่กำหนดราคา'
  return new Intl.NumberFormat('th-TH', {
    style: 'currency', currency: currencyCode,
    minimumFractionDigits: 2, maximumFractionDigits: 2,
  }).format(amount)
}

function formatSummary(summary: ProductWorkspaceRow['quantityBehavior'], suffix = '') {
  if (summary.mode === 'mixed') return 'หลายค่า'
  if (summary.mode === 'not-set' || summary.value === null) return '—'
  return `${summary.value}${suffix}`
}

function formatPriceSummary(summary: ProductWorkspaceRow['price'] | null) {
  if (!summary || summary.mode === 'not-set') return 'ยังไม่กำหนด'
  if (summary.mode === 'mixed-currency' || !summary.currencyCode || summary.minimum === null) return 'หลายสกุลเงิน'
  const formatter = new Intl.NumberFormat('th-TH', { style: 'currency', currency: summary.currencyCode, minimumFractionDigits: 2, maximumFractionDigits: 2 })
  return summary.mode === 'range' && summary.maximum !== null
    ? `${formatter.format(summary.minimum)} – ${formatter.format(summary.maximum)}`
    : formatter.format(summary.minimum)
}

function detailHref(input: { organizationId: string; search: string; status: string; dateField: 'created' | 'updated'; dateFrom: string; dateTo: string; sort: string; productId: string; skuId?: string; page: number; pageSize: number; bulkSearchActive: boolean; action?: 'edit' | 'skus' | 'price' }) {
  const params = new URLSearchParams({ view: 'products', product: input.productId, page: String(input.page), page_size: String(input.pageSize) })
  if (input.search) params.set('q', input.search)
  if (input.status) params.set('status', input.status)
  if (input.dateFrom || input.dateTo) params.set('date_by', input.dateField)
  if (input.dateFrom) params.set('date_from', input.dateFrom)
  if (input.dateTo) params.set('date_to', input.dateTo)
  if (input.sort) params.set('sort', input.sort)
  if (input.bulkSearchActive) params.set('bulk', '1')
  if (input.skuId) params.set('sku', input.skuId)
  if (input.action) params.set('action', input.action)
  return `/organizations/${input.organizationId}/products?${params}`
}

export function ProductsDataGrid({
  organizationId, rows, search, status, dateField, dateFrom, dateTo, sort, toolbar, clearHref, bulkActiveCount, clearBulkHref, emptyState,
  page, pageSize, totalCount, canManage, canAdjustInventory, inventoryLocationOptions, canReadCost, isPending, onRequestLifecycle,
}: {
  organizationId: string
  rows: ProductWorkspaceRow[]
  search: string
  status: string
  sort: 'updated_desc' | 'updated_asc'
  dateField: 'created' | 'updated'
  dateFrom: string
  dateTo: string
  toolbar: ReactNode
  clearHref: string
  bulkActiveCount: number
  clearBulkHref: string
  emptyState: { title: string; description: string }
  page: number
  pageSize: number
  totalCount: number
  canManage: boolean
  canAdjustInventory: boolean
  inventoryLocationOptions: Array<{ id: string; name: string; code: string; warehouseName: string }>
  canReadCost: boolean
  isPending: boolean
  onRequestLifecycle: (input: {
    commandType: 'product.activate' | 'product.archive'
    idKey: 'product_id'
    id: string
    version: number
    label: string
  }) => void
}) {
  const router = useRouter()
  const storageKey = `avenzo:products-grid:${organizationId}:v1`
  const exportStorageKey = `avenzo:products-export-columns:${organizationId}:v1`
  const [columns, setColumns] = useState<ProductGridColumnPreference[]>(PRODUCT_GRID_DEFAULT_COLUMNS)
  const columnsRef = useRef<ProductGridColumnPreference[]>(PRODUCT_GRID_DEFAULT_COLUMNS)
  const [copied, setCopied] = useState<string | null>(null)
  const [copyTooltip, setCopyTooltip] = useState<{ key: string; text: string; left: number; top: number } | null>(null)
  const [orderTooltip, setOrderTooltip] = useState<{ key: ProductGridColumnKey; left: number; top: number } | null>(null)
  const [selectedRows, setSelectedRows] = useState<Set<string>>(new Set())
  const [expandedRows, setExpandedRows] = useState<Set<string>>(new Set())
  const [gridSort, setGridSort] = useState<GridSort>({ key: 'updatedAt', direction: sort === 'updated_desc' ? 'desc' : 'asc' })
  const [excelMenuOpen, setExcelMenuOpen] = useState(false)
  const [exportColumnsOpen, setExportColumnsOpen] = useState(false)
  const [exportColumns, setExportColumns] = useState<ProductExportColumnKey[]>(PRODUCT_EXPORT_COLUMNS.map(([key]) => key))
  const [exportColumnsDraft, setExportColumnsDraft] = useState<ProductExportColumnKey[]>(PRODUCT_EXPORT_COLUMNS.map(([key]) => key))
  const [customizeOpen, setCustomizeOpen] = useState(false)
  const [customizeDraft, setCustomizeDraft] = useState<ProductGridColumnPreference[]>(PRODUCT_GRID_DEFAULT_COLUMNS)
  const [customizePosition, setCustomizePosition] = useState({ left: 12, top: 12 })
  const [customizeDrag, setCustomizeDrag] = useState<{
    source: ProductGridColumnKey
    target: ProductGridColumnKey | null
    position: 'before' | 'after'
  } | null>(null)
  const [gridToast, setGridToast] = useState<string | null>(null)
  const [rowMenu, setRowMenu] = useState<{ rowId: string; left: number; top: number } | null>(null)
  const [imagePreview, setImagePreview] = useState<{ src: string; alt: string; name: string; left: number; top: number } | null>(null)
  const [quickEdit, setQuickEdit] = useState<QuickEditState | null>(null)
  const [quickEditError, setQuickEditError] = useState<string | null>(null)
  const [quickEditPending, startQuickEditTransition] = useTransition()
  const selectAllRef = useRef<HTMLInputElement>(null)
  const rowMenuRef = useRef<HTMLDivElement>(null)
  const rowMenuTriggerRef = useRef<HTMLButtonElement>(null)
  const quickEditRef = useRef<HTMLDivElement>(null)
  const excelMenuRef = useRef<HTMLDivElement>(null)
  const excelTriggerRef = useRef<HTMLButtonElement>(null)
  const excelImportRef = useRef<HTMLInputElement>(null)
  const exportColumnsDialogRef = useRef<HTMLElement>(null)
  const customizeRef = useRef<HTMLDivElement>(null)
  const customizeTriggerRef = useRef<HTMLButtonElement>(null)
  const resizeStateRef = useRef<{
    key: ProductGridColumnKey
    pointerId: number
    startX: number
    startWidth: number
  } | null>(null)

  useEffect(() => {
    try {
      const restored = normalizeProductGridColumns(JSON.parse(localStorage.getItem(storageKey) ?? 'null'))
      columnsRef.current = restored
      setColumns(restored)
    } catch {
      const restored = normalizeProductGridColumns(null)
      columnsRef.current = restored
      setColumns(restored)
    }
  }, [storageKey])

  useEffect(() => {
    const validKeys = new Set<ProductExportColumnKey>(PRODUCT_EXPORT_COLUMNS.map(([key]) => key))
    try {
      const stored = JSON.parse(localStorage.getItem(exportStorageKey) ?? 'null')
      const restored = Array.isArray(stored)
        ? Array.from(new Set(stored.filter((key): key is ProductExportColumnKey => typeof key === 'string' && validKeys.has(key as ProductExportColumnKey))))
        : []
      if (restored.length) {
        setExportColumns(restored)
        setExportColumnsDraft(restored)
      }
    } catch {
      // Invalid device preference falls back to all export columns.
    }
  }, [exportStorageKey])

  useEffect(() => {
    if (!excelMenuOpen) return
    function closeExcelMenu(event: MouseEvent) {
      if (!excelMenuRef.current?.contains(event.target as Node)) setExcelMenuOpen(false)
    }
    function closeExcelMenuOnEscape(event: KeyboardEvent) {
      if (event.key !== 'Escape') return
      setExcelMenuOpen(false)
      excelTriggerRef.current?.focus()
    }
    document.addEventListener('mousedown', closeExcelMenu)
    window.addEventListener('keydown', closeExcelMenuOnEscape)
    return () => {
      document.removeEventListener('mousedown', closeExcelMenu)
      window.removeEventListener('keydown', closeExcelMenuOnEscape)
    }
  }, [excelMenuOpen])

  useEffect(() => {
    if (!gridToast) return
    const timeout = window.setTimeout(() => setGridToast(null), 3200)
    return () => window.clearTimeout(timeout)
  }, [gridToast])

  useEffect(() => {
    if (!rowMenu) return
    function closeRowMenu(event: MouseEvent) {
      if (rowMenuRef.current?.contains(event.target as Node) || rowMenuTriggerRef.current?.contains(event.target as Node)) return
      setRowMenu(null)
    }
    function closeRowMenuOnEscape(event: KeyboardEvent) {
      if (event.key !== 'Escape') return
      event.preventDefault()
      setRowMenu(null)
      rowMenuTriggerRef.current?.focus()
    }
    document.addEventListener('mousedown', closeRowMenu)
    window.addEventListener('keydown', closeRowMenuOnEscape)
    return () => {
      document.removeEventListener('mousedown', closeRowMenu)
      window.removeEventListener('keydown', closeRowMenuOnEscape)
    }
  }, [rowMenu])

  useEffect(() => {
    if (!quickEdit) return
    function closeQuickEdit(event: PointerEvent) {
      if (!quickEditRef.current?.contains(event.target as Node)) setQuickEdit(null)
    }
    function closeQuickEditOnEscape(event: KeyboardEvent) {
      if (event.key === 'Escape' && !quickEditPending) setQuickEdit(null)
    }
    document.addEventListener('pointerdown', closeQuickEdit)
    window.addEventListener('keydown', closeQuickEditOnEscape)
    return () => {
      document.removeEventListener('pointerdown', closeQuickEdit)
      window.removeEventListener('keydown', closeQuickEditOnEscape)
    }
  }, [quickEdit, quickEditPending])

  useEffect(() => {
    if (!exportColumnsOpen) return
    window.requestAnimationFrame(() => exportColumnsDialogRef.current?.querySelector<HTMLInputElement>('input')?.focus())
  }, [exportColumnsOpen])

  useEffect(() => {
    if (!customizeOpen) return
    function closeCustomizeOnOutsideClick(event: MouseEvent) {
      if (!customizeRef.current?.contains(event.target as Node)) closeCustomizeColumns(false)
    }
    function closeCustomizeOnEscape(event: KeyboardEvent) {
      if (event.key !== 'Escape') return
      event.preventDefault()
      closeCustomizeColumns()
    }
    document.addEventListener('mousedown', closeCustomizeOnOutsideClick)
    window.addEventListener('keydown', closeCustomizeOnEscape)
    return () => {
      document.removeEventListener('mousedown', closeCustomizeOnOutsideClick)
      window.removeEventListener('keydown', closeCustomizeOnEscape)
    }
  }, [customizeOpen])

  const availableColumns = useMemo(() => columns.filter((column) => canReadCost || column.key !== 'cost'), [canReadCost, columns])
  const visibleColumns = useMemo(() => {
    const visible = availableColumns.filter((column) => column.visible)
    return [...visible.filter((column) => column.pinned), ...visible.filter((column) => !column.pinned)]
  }, [availableColumns])
  const pinnedColumns = useMemo(() => visibleColumns.filter((column) => column.pinned), [visibleColumns])
  const lastPinnedKey = pinnedColumns.at(-1)?.key ?? null
  const totalPages = Math.max(1, Math.ceil(totalCount / pageSize))
  const currentPage = Math.min(Math.max(page, 1), totalPages)
  const rangeStart = totalCount === 0 ? 0 : (currentPage - 1) * pageSize + 1
  const rangeEnd = Math.min(currentPage * pageSize, totalCount)
  const bulkSearchActive = bulkActiveCount > 0
  const displayedRows = useMemo(() => [...rows].sort((left, right) => {
    const value = (row: ProductWorkspaceRow) => {
      if (gridSort.key === 'product') return row.name
      if (gridSort.key === 'salesCode') return row.skuPreview[0]?.salesCode ?? ''
      if (gridSort.key === 'sku') return row.skuPreview[0]?.skuCode ?? ''
      if (gridSort.key === 'stock') return row.stock.available
      if (gridSort.key === 'baseUnit') return row.stock.baseUnitCode ?? ''
      if (gridSort.key === 'price') return row.price.minimum ?? Number.POSITIVE_INFINITY
      if (gridSort.key === 'category') return row.category?.name ?? ''
      if (gridSort.key === 'brand') return row.brand?.name ?? ''
      if (gridSort.key === 'tags') return row.tags.map((tag) => tag.name).join(' ')
      if (gridSort.key === 'barcode') return row.skuPreview[0]?.barcode ?? ''
      if (gridSort.key === 'quantityBehavior') return row.quantityBehavior.value ?? ''
      if (gridSort.key === 'tax') return row.taxRate.value ?? Number.POSITIVE_INFINITY
      if (gridSort.key === 'safetyStock') return row.safetyStock.value ?? Number.POSITIVE_INFINITY
      if (gridSort.key === 'reorder') return row.reorderMin.value ?? Number.POSITIVE_INFINITY
      if (gridSort.key === 'branches') return row.stock.branchCodes.join(' ')
      if (gridSort.key === 'createdAt') return new Date(row.createdAt).getTime()
      if (gridSort.key === 'createdBy') return row.createdByDisplayName ?? ''
      if (gridSort.key === 'cost') return row.cost?.minimum ?? Number.POSITIVE_INFINITY
      if (gridSort.key === 'status') return row.status
      return new Date(row.updatedAt).getTime()
    }
    const leftValue = value(left)
    const rightValue = value(right)
    const compared = typeof leftValue === 'number' && typeof rightValue === 'number'
      ? leftValue - rightValue
      : String(leftValue).localeCompare(String(rightValue), 'th')
    return gridSort.direction === 'asc' ? compared : -compared
  }), [gridSort, rows])
  useEffect(() => {
    const displayedIds = new Set(displayedRows.map((row) => row.id))
    setSelectedRows((current) => {
      const next = new Set(Array.from(current).filter((id) => displayedIds.has(id)))
      return next.size === current.size ? current : next
    })
  }, [displayedRows])
  useEffect(() => {
    if (!selectAllRef.current) return
    selectAllRef.current.indeterminate = selectedRows.size > 0 && selectedRows.size < displayedRows.length
  }, [displayedRows.length, selectedRows])
  const pinnedOffsets = useMemo(() => {
    const offsets = new Map<ProductGridColumnKey, number>()
    let left = PRODUCT_GRID_SELECTION_WIDTH
    for (const column of pinnedColumns) {
      offsets.set(column.key, left)
      left += column.width
    }
    return offsets
  }, [pinnedColumns])
  function toggleSort(key: ProductGridColumnKey) {
    setGridSort((current) => ({
      key,
      direction: current.key === key && current.direction === 'asc' ? 'desc' : 'asc',
    }))
  }

  function paginationHref(nextPage: number, nextPageSize = pageSize) {
    const params = new URLSearchParams({
      view: 'products',
      page: String(nextPage),
      page_size: String(nextPageSize),
      sort,
    })
    if (search) params.set('q', search)
    if (status) params.set('status', status)
    if (bulkSearchActive) params.set('bulk', '1')
    if (dateFrom || dateTo) params.set('date_by', dateField)
    if (dateFrom) params.set('date_from', dateFrom)
    if (dateTo) params.set('date_to', dateTo)
    return `/organizations/${organizationId}/products?${params}`
  }

  function downloadProductTemplate() {
    const csv = [
      'Product Name,Category,Brand,SKU Code,Sales Code,Barcode,Base Unit,Quantity Behavior,Price,Tax,Tags,Branches,Status',
      'Example Product,Apparel,Example Brand,SKU-001,CF-001,8850000000001,piece,discrete,100,VAT 7%,new|sample,BKK-01,draft',
    ].join('\n')
    const url = URL.createObjectURL(new Blob([`\ufeff${csv}`], { type: 'text/csv;charset=utf-8' }))
    const anchor = document.createElement('a')
    anchor.href = url
    anchor.download = 'avenzo-products-template.csv'
    anchor.click()
    window.setTimeout(() => URL.revokeObjectURL(url), 0)
    setExcelMenuOpen(false)
    setGridToast('ดาวน์โหลด Template แล้ว')
  }

  function openExportColumns() {
    setExportColumnsDraft(exportColumns)
    setExcelMenuOpen(false)
    setExportColumnsOpen(true)
  }

  function saveExportColumns() {
    if (!exportColumnsDraft.length) {
      setGridToast('เลือกอย่างน้อย 1 คอลัมน์')
      return
    }
    setExportColumns(exportColumnsDraft)
    localStorage.setItem(exportStorageKey, JSON.stringify(exportColumnsDraft))
    setExportColumnsOpen(false)
    setGridToast(`บันทึกคอลัมน์ส่งออก ${exportColumnsDraft.length} รายการแล้ว`)
    excelTriggerRef.current?.focus()
  }

  function handleExcelMenuKeyDown(event: ReactKeyboardEvent<HTMLDivElement>) {
    const items = Array.from(event.currentTarget.querySelectorAll<HTMLButtonElement>('[role="menuitem"]'))
    const currentIndex = items.indexOf(document.activeElement as HTMLButtonElement)
    if (event.key === 'Escape') {
      event.preventDefault()
      setExcelMenuOpen(false)
      excelTriggerRef.current?.focus()
      return
    }
    if (event.key === 'Tab') {
      setExcelMenuOpen(false)
      return
    }
    if (event.key === 'Home' || event.key === 'End') {
      event.preventDefault()
      items[event.key === 'Home' ? 0 : items.length - 1]?.focus()
      return
    }
    const delta = event.key === 'ArrowDown' ? 1 : event.key === 'ArrowUp' ? -1 : 0
    if (!delta || !items.length) return
    event.preventDefault()
    items[(Math.max(currentIndex, 0) + delta + items.length) % items.length]?.focus()
  }

  function handleExportColumnsKeyDown(event: ReactKeyboardEvent<HTMLElement>) {
    if (event.key === 'Escape') {
      event.preventDefault()
      setExportColumnsOpen(false)
      excelTriggerRef.current?.focus()
      return
    }
    if (event.key !== 'Tab') return
    const focusable = Array.from(event.currentTarget.querySelectorAll<HTMLElement>('button:not([disabled]), input:not([disabled]), [href], [tabindex]:not([tabindex="-1"])'))
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

  function toggleAllRows(checked: boolean) {
    setSelectedRows(checked ? new Set(displayedRows.map((row) => row.id)) : new Set())
  }

  function toggleRow(rowId: string, checked: boolean) {
    setSelectedRows((current) => {
      const next = new Set(current)
      if (checked) next.add(rowId)
      else next.delete(rowId)
      return next
    })
  }

  function openRowMenu(button: HTMLButtonElement, rowId: string, focusMenu = false) {
    rowMenuTriggerRef.current = button
    const rect = button.getBoundingClientRect()
    const menuWidth = 188
    const menuHeight = 126
    const left = Math.max(8, Math.min(window.innerWidth - menuWidth - 8, rect.right - menuWidth))
    const top = rect.bottom + menuHeight + 8 <= window.innerHeight
      ? rect.bottom + 4
      : Math.max(8, rect.top - menuHeight - 4)
    setRowMenu({ rowId, left, top })
    if (focusMenu) window.requestAnimationFrame(() => rowMenuRef.current?.querySelector<HTMLElement>('[role="menuitem"]')?.focus())
  }

  function statusTransitionReason(row: ProductWorkspaceRow, targetStatus: 'draft' | 'active' | 'archived') {
    if (targetStatus === row.status) return null
    if (!canManage) return 'บัญชีนี้ไม่มีสิทธิ์จัดการสถานะสินค้า'
    if (row.status === 'archived') return 'สินค้าที่เก็บถาวรแล้วเปลี่ยนสถานะไม่ได้'
    if (targetStatus === 'draft') return 'สินค้าที่เปิดใช้งานแล้วไม่สามารถย้อนกลับเป็นฉบับร่างได้'
    return null
  }

  function chooseProductStatus(row: ProductWorkspaceRow, targetStatus: 'draft' | 'active' | 'archived') {
    const reason = statusTransitionReason(row, targetStatus)
    if (targetStatus === row.status) return
    if (reason) {
      setGridToast(reason)
      return
    }
    onRequestLifecycle({
      commandType: targetStatus === 'active' ? 'product.activate' : 'product.archive',
      idKey: 'product_id', id: row.id, version: row.version, label: row.name,
    })
  }

  function productStatusControl(row: ProductWorkspaceRow) {
    const options = [
      { value: 'active', label: 'ใช้งานอยู่' },
      { value: 'draft', label: 'ฉบับร่าง' },
      { value: 'archived', label: 'เก็บถาวร' },
    ] as const
    return <div className={`product-grid-status-select-shell ${row.status}`}>
      <span className="product-grid-status-dot" aria-hidden="true" />
      <select
        className="product-grid-status-select"
        aria-label={`สถานะ ${statusLabel(row.status)} ของ ${row.name}`}
        value={row.status}
        disabled={!canManage || isPending}
        onChange={(event) => chooseProductStatus(row, event.currentTarget.value as 'draft' | 'active' | 'archived')}
      >
        {options.map((option) => <option
          key={option.value}
          value={option.value}
          disabled={Boolean(statusTransitionReason(row, option.value))}
        >{option.label}</option>)}
      </select>
      <svg className="product-grid-status-chevron" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true"><path d="m6 8 4 4 4-4" /></svg>
    </div>
  }

  function commitColumns(next: ProductGridColumnPreference[]) {
    const normalized = normalizeProductGridColumns(next)
    columnsRef.current = normalized
    setColumns(normalized)
    try {
      localStorage.setItem(storageKey, JSON.stringify(normalized))
    } catch {
      // Immediate persistence is best effort; the existing effect retries after render.
    }
  }

  function updateColumn(key: ProductGridColumnKey, patch: Partial<ProductGridColumnPreference>) {
    commitColumns(columnsRef.current.map((column) => column.key === key
      ? { ...column, ...patch }
      : column))
  }

  function openCustomizeColumns() {
    if (customizeOpen) {
      closeCustomizeColumns()
      return
    }
    const triggerRect = customizeTriggerRef.current?.getBoundingClientRect()
    const popoverWidth = Math.min(590, window.innerWidth - 24)
    const left = Math.max(12, Math.min(window.innerWidth - popoverWidth - 12, (triggerRect?.right ?? window.innerWidth - 12) - popoverWidth))
    const top = Math.max(12, Math.min(window.innerHeight - 500, (triggerRect?.bottom ?? 12) + 7))
    setExcelMenuOpen(false)
    setCustomizeDraft(columnsRef.current.map((column) => ({ ...column })))
    setCustomizePosition({ left, top })
    setCustomizeOpen(true)
    window.requestAnimationFrame(() => customizeRef.current?.querySelector<HTMLInputElement>('input')?.focus())
  }

  function closeCustomizeColumns(restoreFocus = true) {
    setCustomizeOpen(false)
    setCustomizeDrag(null)
    setOrderTooltip(null)
    if (restoreFocus) window.requestAnimationFrame(() => customizeTriggerRef.current?.focus())
  }

  function updateCustomizeDraft(key: ProductGridColumnKey, patch: Partial<ProductGridColumnPreference>) {
    setCustomizeDraft((current) => {
      const selected = current.find((column) => column.key === key)
      if (!selected) return current
      if (patch.pinned === true && !selected.pinned && current.filter((column) => column.pinned && column.visible).length >= 3) {
        setGridToast('ปักหมุดได้สูงสุด 3 คอลัมน์')
        return current
      }
      return current.map((column) => {
        if (column.key !== key) return column
        const next = { ...column, ...patch }
        if (patch.visible === false) next.pinned = false
        if (patch.pinned === true) next.visible = true
        if (patch.width != null) next.width = Math.min(Math.max(Math.round(patch.width), 96), 520)
        return next
      })
    })
  }

  function reorderCustomizeDraft(sourceKey: ProductGridColumnKey, targetKey: ProductGridColumnKey, position: 'before' | 'after') {
    if (sourceKey === targetKey) return
    setCustomizeDraft((current) => {
      const next = current.map((column) => ({ ...column }))
      const sourceIndex = next.findIndex((column) => column.key === sourceKey)
      if (sourceIndex < 0) return current
      const [column] = next.splice(sourceIndex, 1)
      const targetIndex = next.findIndex((candidate) => candidate.key === targetKey)
      if (targetIndex < 0) return current
      next.splice(targetIndex + (position === 'after' ? 1 : 0), 0, column)
      return next
    })
  }

  function moveCustomizeDraft(key: ProductGridColumnKey, delta: -1 | 1) {
    const displayedKeys = customizeDraft
      .filter((column) => canReadCost || column.key !== 'cost')
      .map((column) => column.key)
    const index = displayedKeys.indexOf(key)
    const targetKey = displayedKeys[index + delta]
    if (!targetKey) return
    reorderCustomizeDraft(key, targetKey, delta === -1 ? 'before' : 'after')
  }

  function startCustomizeDrag(event: ReactDragEvent<HTMLButtonElement>, key: ProductGridColumnKey) {
    event.dataTransfer.effectAllowed = 'move'
    event.dataTransfer.setData('text/plain', key)
    setOrderTooltip(null)
    setCustomizeDrag({ source: key, target: null, position: 'before' })
  }

  function showOrderTooltip(target: HTMLButtonElement, key: ProductGridColumnKey) {
    const bounds = target.getBoundingClientRect()
    setOrderTooltip({ key, left: bounds.right + 10, top: bounds.top + bounds.height / 2 })
  }

  function moveCustomizeDrag(event: ReactDragEvent<HTMLDivElement>, target: ProductGridColumnKey) {
    event.preventDefault()
    event.dataTransfer.dropEffect = 'move'
    const bounds = event.currentTarget.getBoundingClientRect()
    const position = event.clientY < bounds.top + bounds.height / 2 ? 'before' : 'after'
    setCustomizeDrag((current) => current ? { ...current, target, position } : current)
  }

  function dropCustomizeDrag(event: ReactDragEvent<HTMLDivElement>, target: ProductGridColumnKey) {
    event.preventDefault()
    const source = customizeDrag?.source ?? event.dataTransfer.getData('text/plain') as ProductGridColumnKey
    const bounds = event.currentTarget.getBoundingClientRect()
    const position = event.clientY < bounds.top + bounds.height / 2 ? 'before' : 'after'
    if (source) reorderCustomizeDraft(source, target, position)
    setCustomizeDrag(null)
  }

  function restoreCustomizeDraft() {
    setCustomizeDraft(PRODUCT_GRID_DEFAULT_COLUMNS.map((column) => ({ ...column })))
    setGridToast('เตรียมคืนค่าคอลัมน์เดิม กดบันทึกเพื่อยืนยัน')
  }

  function saveCustomizeColumns() {
    if (!customizeDraft.some((column) => column.visible)) {
      setGridToast('ต้องแสดงอย่างน้อย 1 คอลัมน์')
      return
    }
    commitColumns(customizeDraft)
    closeCustomizeColumns()
    setGridToast('บันทึกการตั้งค่าคอลัมน์แล้ว')
  }

  function startColumnResize(event: ReactPointerEvent<HTMLSpanElement>, column: ProductGridColumnPreference) {
    event.preventDefault()
    resizeStateRef.current = {
      key: column.key,
      pointerId: event.pointerId,
      startX: event.clientX,
      startWidth: column.width,
    }
    event.currentTarget.dataset.resizing = 'true'
    event.currentTarget.setPointerCapture(event.pointerId)
  }

  function moveColumnResize(event: ReactPointerEvent<HTMLSpanElement>, key: ProductGridColumnKey) {
    const state = resizeStateRef.current
    if (!state || state.key !== key || state.pointerId !== event.pointerId) return
    updateColumn(key, { width: state.startWidth + event.clientX - state.startX })
  }

  function stopColumnResize(event: ReactPointerEvent<HTMLSpanElement>) {
    const state = resizeStateRef.current
    if (!state || state.pointerId !== event.pointerId) return
    if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId)
    event.currentTarget.dataset.resizing = 'false'
    resizeStateRef.current = null
  }

  function resizeColumnWithKeyboard(event: ReactKeyboardEvent<HTMLSpanElement>, column: ProductGridColumnPreference) {
    if (!['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) return
    event.preventDefault()
    const nextWidth = event.key === 'Home'
      ? 96
      : event.key === 'End'
        ? 520
        : column.width + (event.key === 'ArrowRight' ? 8 : -8)
    updateColumn(column.key, { width: nextWidth })
  }

  async function copyCode(value: string, key: string) {
    try {
      await navigator.clipboard.writeText(value)
      setCopied(key)
      setCopyTooltip((current) => current?.key === key ? { ...current, text: 'คัดลอกแล้ว' } : current)
      window.setTimeout(() => setCopied(null), 1600)
    } catch {
      setCopied(null)
      setCopyTooltip((current) => current?.key === key ? { ...current, text: 'คัดลอกไม่สำเร็จ' } : current)
    }
  }

  function showCopyTooltip(button: HTMLButtonElement, key: string, text: string) {
    const rect = button.getBoundingClientRect()
    const safeHalfWidth = 90
    setCopyTooltip({
      key,
      text,
      left: Math.min(Math.max(rect.left + rect.width / 2, safeHalfWidth + 8), window.innerWidth - safeHalfWidth - 8),
      top: rect.top - 7,
    })
  }
  function copyButton(value: string, key: string, tooltip: string) {
    return <button className="product-grid-copy-button" type="button" data-tooltip={tooltip} data-copied={copied === key || undefined} aria-label={`${tooltip} ${value}`} aria-describedby={copyTooltip?.key === key ? 'product-grid-copy-tooltip' : undefined} onMouseEnter={(event) => showCopyTooltip(event.currentTarget, key, tooltip)} onMouseLeave={() => setCopyTooltip(null)} onFocus={(event) => showCopyTooltip(event.currentTarget, key, tooltip)} onBlur={() => setCopyTooltip(null)} onClick={() => copyCode(value, key)}><span aria-hidden="true">{copied === key ? '✓' : '⧉'}</span></button>
  }

  function showImagePreview(target: HTMLElement, row: ProductWorkspaceRow) {
    if (!row.coverImage) return
    const rect = target.getBoundingClientRect()
    const previewWidth = 260
    const previewHeight = 316
    let left = rect.right + 12
    if (left + previewWidth > window.innerWidth - 8) left = rect.left - previewWidth - 12
    const top = Math.max(8, Math.min(rect.top - 8, window.innerHeight - previewHeight - 8))
    setImagePreview({
      src: row.coverImage.signedUrl,
      alt: row.coverImage.altText || row.name,
      name: row.name,
      left: Math.max(8, left),
      top,
    })
  }

  function openQuickEdit(target: HTMLButtonElement, kind: QuickEditState['kind'], row: ProductWorkspaceRow, sku: ProductWorkspaceRow['skuPreview'][number]) {
    const rect = target.getBoundingClientRect()
    const width = kind === 'stock' ? 360 : 320
    const estimatedHeight = kind === 'stock' ? 390 : 245
    const left = Math.max(8, Math.min(rect.left, window.innerWidth - width - 8))
    const preferredTop = rect.bottom + 8
    const top = preferredTop + estimatedHeight <= window.innerHeight - 8
      ? preferredTop
      : Math.max(8, rect.top - estimatedHeight - 8)
    setQuickEditError(null)
    setQuickEdit({ kind, row, sku, left, top })
  }

  function submitQuickEdit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!quickEdit) return
    const data = new FormData(event.currentTarget)
    const targetSku = quickEdit.row.skuPreview.find((sku) => sku.id === String(data.get('skuId') ?? quickEdit.sku.id)) ?? quickEdit.sku
    const profile = targetSku.profile
    const command = quickEdit.kind === 'price'
      ? {
          kind: 'entity' as const,
          commandId: crypto.randomUUID(),
          organizationId,
          commandType: 'sku.profile.upsert',
          payload: {
            sku_id: targetSku.id,
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
          },
        }
      : {
          kind: 'inventory' as const,
          commandId: crypto.randomUUID(),
          organizationId,
          commandType: String(data.get('direction')) as 'adjustment_in' | 'adjustment_out',
          skuId: targetSku.id,
          sourceLocationId: data.get('direction') === 'adjustment_out' ? String(data.get('locationId')) : null,
          destinationLocationId: data.get('direction') === 'adjustment_in' ? String(data.get('locationId')) : null,
          quantity: Number(data.get('quantity')),
          reasonCode: 'stock_count',
          reasonNote: String(data.get('reasonNote') ?? '').trim(),
        }
    setQuickEditError(null)
    startQuickEditTransition(async () => {
      const result = await executeFoundationCommandAction(command)
      if (!result.ok) {
        const message = result.error === 'version_conflict'
          ? 'ข้อมูลถูกแก้ไขแล้ว กรุณารีเฟรชและลองใหม่'
          : result.error === 'insufficient_stock'
            ? 'สต๊อกไม่เพียงพอสำหรับการปรับลด'
            : result.error === 'permission_denied'
              ? 'บัญชีนี้ไม่มีสิทธิ์แก้ไขรายการนี้'
              : 'บันทึกไม่สำเร็จ กรุณาตรวจข้อมูลแล้วลองใหม่'
        setQuickEditError(message)
        return
      }
      setGridToast(quickEdit.kind === 'price' ? 'อัปเดตราคาขายเรียบร้อยแล้ว' : 'บันทึก Stock Movement เรียบร้อยแล้ว')
      setQuickEdit(null)
      router.refresh()
    })
  }

  function toggleVariantRow(rowId: string) {
    setExpandedRows((current) => {
      const next = new Set(current)
      if (next.has(rowId)) next.delete(rowId)
      else next.add(rowId)
      return next
    })
  }
  function cell(row: ProductWorkspaceRow, key: ProductGridColumnKey) {
    const firstSku = row.skuPreview[0]
    const common = columns.find((column) => column.key === key)!
    const style = common.pinned ? { left: pinnedOffsets.get(key) ?? 0 } : undefined
    const className = [
      common.pinned ? 'product-grid-pinned' : '',
      common.pinned && key === lastPinnedKey ? 'product-grid-pinned-boundary' : '',
    ].filter(Boolean).join(' ') || undefined
    const stack = (primary: ReactNode, secondary?: ReactNode) => <div className="product-grid-cell-stack">
      <div className="product-grid-cell-primary">{primary}</div>
      <div className="product-grid-cell-secondary">{secondary}</div>
    </div>
    if (key === 'product') return <td key={key} className={className} style={style}>
      <div className="product-grid-product">
        {row.coverImage
          ? <button className="product-grid-image" type="button" aria-label={`ดูภาพขยาย ${row.name}`} aria-describedby={imagePreview?.src === row.coverImage.signedUrl ? 'product-grid-image-preview' : undefined} onMouseEnter={(event) => showImagePreview(event.currentTarget, row)} onMouseLeave={() => setImagePreview(null)} onFocus={(event) => showImagePreview(event.currentTarget, row)} onBlur={() => setImagePreview(null)}><Image src={row.coverImage.signedUrl} alt={row.coverImage.altText || row.name} fill sizes="42px" unoptimized /></button>
          : <span className="product-grid-placeholder" aria-hidden="true">{row.name.slice(0, 1).toUpperCase()}</span>}
        {stack(<strong>{row.name}</strong>, row.description || 'ไม่มีคำอธิบาย')}
      </div>
    </td>
    if (key === 'salesCode') return <td key={key} className={className} style={style}>{stack(firstSku?.salesCode ? <div className="product-grid-code-line"><code>{firstSku.salesCode}</code>{copyButton(firstSku.salesCode, `${row.id}:sales`, 'คัดลอกรหัส CF')}</div> : <span className="product-grid-muted">—</span>, row.skuPreview.filter((sku) => sku.salesCode).length > 1 ? `${row.skuPreview.filter((sku) => sku.salesCode).length} รหัส CF` : undefined)}</td>
    if (key === 'sku') return <td key={key} className={className} style={style}>{stack(firstSku ? <div className="product-grid-code-line"><code>{firstSku.skuCode}</code>{copyButton(firstSku.skuCode, `${row.id}:sku`, 'คัดลอก SKU')}</div> : <span className="product-grid-muted">ยังไม่มี SKU</span>, firstSku ? row.skuCount > 1 ? <button className="product-grid-variant-toggle" type="button" aria-expanded={expandedRows.has(row.id)} aria-controls={`product-grid-variants-${row.id}-desktop`} onClick={() => toggleVariantRow(row.id)}><span>{expandedRows.has(row.id) ? 'ซ่อนตัวเลือก' : `ดู ${row.skuCount} ตัวเลือก`}</span><span className="product-grid-variant-toggle-icon" data-expanded={expandedRows.has(row.id)}><ProductGridPaginationIcon direction="next" /></span></button> : '1 SKU' : undefined)}</td>
    if (key === 'stock') {
      const content = row.stock.mode === 'single-unit' ? stack(<strong>{row.stock.onHand} in stock</strong>, `Available ${row.stock.available}`) : row.stock.mode === 'mixed-units' ? stack(<strong>หลายหน่วย</strong>, 'ไม่รวมยอดข้ามหน่วย') : row.stock.mode === 'not-authorized' ? stack(<span className="product-grid-muted">ไม่มีสิทธิ์ดู Stock</span>) : stack(<span className="product-grid-muted">ยังไม่มียอด Stock</span>)
      const firstActiveSku = row.skuPreview.find((sku) => sku.status === 'active')
      const stockSku = firstActiveSku ?? firstSku
      const editTooltipKey = `${row.id}:stock-edit`
      const editTooltipText = firstActiveSku ? 'แก้ไขจำนวนสต๊อก' : 'เปิดใช้งาน SKU ก่อนปรับสต๊อก'
      return <td key={key} className={className} style={style}><div className="product-grid-inline-edit-cell">{content}{canAdjustInventory && stockSku && row.stock.mode !== 'not-authorized' ? <button className="product-grid-cell-edit-button" type="button" aria-disabled={!firstActiveSku} aria-label={firstActiveSku ? `แก้ไขจำนวนสต๊อก ${firstActiveSku.skuCode}` : `ต้องเปิดใช้งาน SKU ${stockSku.skuCode} ก่อนปรับสต๊อก`} aria-describedby={copyTooltip?.key === editTooltipKey ? 'product-grid-copy-tooltip' : undefined} data-tooltip={editTooltipText} onMouseEnter={(event) => showCopyTooltip(event.currentTarget, editTooltipKey, editTooltipText)} onMouseLeave={() => setCopyTooltip(null)} onFocus={(event) => showCopyTooltip(event.currentTarget, editTooltipKey, editTooltipText)} onBlur={() => setCopyTooltip(null)} onClick={(event) => {
        setCopyTooltip(null)
        if (firstActiveSku) openQuickEdit(event.currentTarget, 'stock', row, firstActiveSku)
        else setGridToast('กรุณาเปลี่ยนสถานะ SKU เป็น “ใช้งานอยู่” ก่อนปรับจำนวนสต๊อก')
      }}><ProductGridEditIcon /></button> : null}</div></td>
    }
    if (key === 'baseUnit') return <td key={key} className={className} style={style}>{stack(<strong>{row.stock.mode === 'mixed-units' ? 'หลายหน่วย' : formatProductUnit(row.stock.baseUnitCode)}</strong>)}</td>
    if (key === 'price') {
      const content = stack(<strong>{formatPrice(row)}</strong>)
      const editTooltipKey = `${row.id}:price-edit`
      return <td key={key} className={className} style={style}><div className="product-grid-inline-edit-cell">{content}{canManage && firstSku ? <button className="product-grid-cell-edit-button" type="button" aria-label={`แก้ไขราคาขาย ${firstSku.skuCode}`} aria-describedby={copyTooltip?.key === editTooltipKey ? 'product-grid-copy-tooltip' : undefined} data-tooltip="แก้ไขราคาขาย" onMouseEnter={(event) => showCopyTooltip(event.currentTarget, editTooltipKey, 'แก้ไขราคาขาย')} onMouseLeave={() => setCopyTooltip(null)} onFocus={(event) => showCopyTooltip(event.currentTarget, editTooltipKey, 'แก้ไขราคาขาย')} onBlur={() => setCopyTooltip(null)} onClick={(event) => { setCopyTooltip(null); openQuickEdit(event.currentTarget, 'price', row, firstSku) }}><ProductGridEditIcon /></button> : null}</div></td>
    }
    if (key === 'category') return <td key={key} className={className} style={style}>{stack(row.category?.name ?? <span className="product-grid-muted">—</span>)}</td>
    if (key === 'brand') return <td key={key} className={className} style={style}>{stack(row.brand?.name ?? <span className="product-grid-muted">—</span>)}</td>
    if (key === 'tags') return <td key={key} className={className} style={style}>{stack(row.tags.length ? <span className="product-grid-tag-list">{row.tags.map((tag) => tag.name).join(', ')}</span> : <span className="product-grid-muted">—</span>)}</td>
    if (key === 'barcode') return <td key={key} className={className} style={style}>{stack(firstSku?.barcode ? <div className="product-grid-code-line"><code>{firstSku.barcode}</code>{copyButton(firstSku.barcode, `${row.id}:barcode`, 'คัดลอก Barcode')}</div> : <span className="product-grid-muted">—</span>)}</td>
    if (key === 'quantityBehavior') return <td key={key} className={className} style={style}>{stack(formatSummary(row.quantityBehavior))}</td>
    if (key === 'tax') return <td key={key} className={className} style={style}>{row.taxCategory.mode === 'mixed' || row.taxRate.mode === 'mixed' ? stack('หลายค่า') : stack(<strong>{formatSummary(row.taxCategory)}</strong>, formatSummary(row.taxRate, '%'))}</td>
    if (key === 'safetyStock') return <td key={key} className={className} style={style}>{stack(formatSummary(row.safetyStock))}</td>
    if (key === 'reorder') return <td key={key} className={className} style={style}>{stack(<strong>{formatSummary(row.reorderMin)}</strong>, `Max ${formatSummary(row.reorderMax)}`)}</td>
    if (key === 'branches') return <td key={key} className={className} style={style}>{stack(row.stock.mode === 'not-authorized' ? <span className="product-grid-muted">ไม่มีสิทธิ์ดู Stock</span> : row.stock.branchCodes.length ? row.stock.branchCodes.join(', ') : <span className="product-grid-muted">—</span>)}</td>
    if (key === 'createdAt') return <td key={key} className={className} style={style}>{stack(formatUpdatedAt(row.createdAt))}</td>
    if (key === 'createdBy') return <td key={key} className={className} style={style}>{stack(row.createdByDisplayName ?? <span className="product-grid-muted">—</span>)}</td>
    if (key === 'cost') return <td key={key} className={className} style={style}>{stack(<strong>{formatPriceSummary(row.cost)}</strong>)}</td>
    if (key === 'status') return <td key={key} className={className} style={style}>{stack(productStatusControl(row))}</td>
    return <td key={key} className={className} style={style}>{stack(formatUpdatedAt(row.updatedAt))}</td>
  }

  function variantPanel(row: ProductWorkspaceRow, idSuffix: 'desktop' | 'mobile') {
    const hiddenCount = Math.max(0, row.skuCount - row.skuPreview.length)
    return <section id={`product-grid-variants-${row.id}-${idSuffix}`} className="product-grid-variant-card" aria-label={`SKU และตัวเลือกของ ${row.name}`}>
      <header><div><strong>SKU / ตัวเลือกทั้งหมด</strong><span>รหัสสำหรับขายและตัดสต็อกแยกกัน</span></div><span className="product-grid-variant-count">{row.skuCount} SKU</span></header>
      <div className="product-grid-variant-table" role="table" aria-label={`รายการ SKU ของ ${row.name}`}>
        <div className="product-grid-variant-table-head" role="row"><span role="columnheader">ตัวเลือก</span><span role="columnheader">SKU</span><span role="columnheader">รหัสขาย / CF</span><span role="columnheader">Barcode</span><span role="columnheader">ราคาขาย</span><span role="columnheader">หน่วยนับ</span><span role="columnheader">สถานะ</span></div>
        {row.skuPreview.map((sku, index) => <div className="product-grid-variant-table-row" role="row" key={sku.id}>
          <span role="cell"><strong>{sku.name || `ตัวเลือก ${index + 1}`}</strong></span>
          <span role="cell" className="product-grid-variant-code"><code>{sku.skuCode}</code>{copyButton(sku.skuCode, `${row.id}:${sku.id}:sku`, 'คัดลอก SKU')}</span>
          <span role="cell" className="product-grid-variant-code">{sku.salesCode ? <><code>{sku.salesCode}</code>{copyButton(sku.salesCode, `${row.id}:${sku.id}:sales`, 'คัดลอกรหัส CF')}</> : <span className="product-grid-muted">—</span>}</span>
          <span role="cell" className="product-grid-variant-code">{sku.barcode ? <><code>{sku.barcode}</code>{copyButton(sku.barcode, `${row.id}:${sku.id}:barcode`, 'คัดลอก Barcode')}</> : <span className="product-grid-muted">—</span>}</span>
          <span role="cell"><strong>{formatSkuPrice(sku)}</strong></span>
          <span role="cell">{formatProductUnit(sku.baseUnitCode)}</span>
          <span role="cell"><span className={`product-grid-variant-status ${sku.status}`}><i aria-hidden="true" />{statusLabel(sku.status)}</span></span>
        </div>)}
      </div>
      {hiddenCount > 0 ? <footer>แสดง {row.skuPreview.length} จาก {row.skuCount} SKU <Link href={detailHref({ organizationId, search, status, dateField, dateFrom, dateTo, sort, productId: row.id, page: currentPage, pageSize, bulkSearchActive, action: 'skus' })}>ดูรายการทั้งหมด</Link></footer> : null}
    </section>
  }

  return <>
    <div className="product-grid-toolbar">
      <div className="product-grid-filter-slot">{toolbar}</div>
      <div className="product-grid-action-icons" role="menubar" aria-label="เครื่องมือตาราง">
        <Link className="product-grid-icon-button" data-tooltip="ล้างตัวกรอง" aria-label="ล้างตัวกรอง" href={clearHref}>
          <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false"><path d="M4 4h16l-6.2 7.2v5.3l-3.6 2v-7.3z" /><path d="m16 16 4 4m0-4-4 4" /></svg>
        </Link>
        <div className="product-grid-excel-menu" ref={excelMenuRef}>
          <button ref={excelTriggerRef} className="product-grid-icon-button" type="button" role="menuitem" data-tooltip="เครื่องมือ Excel" aria-label="เครื่องมือ Excel" aria-haspopup="menu" aria-expanded={excelMenuOpen} onClick={() => setExcelMenuOpen((open) => !open)} onKeyDown={(event) => {
            if (event.key !== 'ArrowDown') return
            event.preventDefault()
            setExcelMenuOpen(true)
            window.requestAnimationFrame(() => excelMenuRef.current?.querySelector<HTMLButtonElement>('[role="menu"] [role="menuitem"]')?.focus())
          }}>
            <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false"><path d="M4 4h16v16H4z" /><path d="M9 4v16M9 9h11M9 15h11M3 8l4 8M7 8l-4 8" /></svg>
          </button>
          {excelMenuOpen ? <div className="product-grid-excel-panel" role="menu" aria-label="เครื่องมือ Excel" onKeyDown={handleExcelMenuKeyDown}>
            <button type="button" role="menuitem" onClick={() => excelImportRef.current?.click()}><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 3v12m0 0-4-4m4 4 4-4" /><path d="M4 17v3h16v-3" /></svg>นำเข้าด้วยไฟล์ Excel</button>
            <button type="button" role="menuitem" onClick={downloadProductTemplate}><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 3v12m0 0-4-4m4 4 4-4" /><path d="M4 20h16" /></svg>ดาวน์โหลด Template</button>
            <button type="button" role="menuitem" onClick={openExportColumns}><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 5h16M4 12h16M4 19h16" /><path d="M8 3v4M16 10v4M11 17v4" /></svg>กำหนดคอลัมน์ที่ส่งออก</button>
          </div> : null}
          <input ref={excelImportRef} type="file" accept=".xlsx,.xls,.csv" hidden onChange={(event) => {
            const file = event.currentTarget.files?.[0]
            if (file) setGridToast(`เลือกไฟล์ ${file.name} แล้ว — Preview จะไม่อัปโหลดข้อมูล`)
            event.currentTarget.value = ''
            setExcelMenuOpen(false)
          }} />
        </div>
      <div className="product-grid-customize" ref={customizeRef}>
        <button ref={customizeTriggerRef} className="product-grid-icon-button" type="button" role="menuitem" data-tooltip="ปรับแต่งคอลัมน์" aria-label="ปรับแต่งคอลัมน์" aria-haspopup="dialog" aria-controls="product-grid-customize-popover" aria-expanded={customizeOpen} onClick={openCustomizeColumns}>
          <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false"><path d="M4 5h16M4 12h16M4 19h16" /><path d="M8 3v4M16 10v4M11 17v4" /></svg>
        </button>
        {customizeOpen ? <section id="product-grid-customize-popover" className="product-grid-customize-panel" role="dialog" aria-modal="false" aria-labelledby="product-grid-customize-title" style={customizePosition}>
          <header className="product-grid-customize-header"><div><h2 id="product-grid-customize-title">Customize Columns</h2><p>แสดง ซ่อน ปรับความกว้าง ปักหมุด และจัดลำดับคอลัมน์</p></div><button className="product-bulk-search-close" type="button" aria-label="ปิด Customize" onClick={() => closeCustomizeColumns()}>×</button></header>
          <div className="product-grid-customize-table-head" aria-hidden="true"><span>Column</span><span>Width</span><span>Pin</span><span>Order</span></div>
          <div className="product-grid-customize-list">
            {customizeDraft.filter((column) => canReadCost || column.key !== 'cost').map((column) => <div
              className="product-grid-customize-row"
              key={column.key}
              data-dragging={customizeDrag?.source === column.key || undefined}
              data-drop-position={customizeDrag?.target === column.key && customizeDrag.source !== column.key ? customizeDrag.position : undefined}
              onDragOver={(event) => moveCustomizeDrag(event, column.key)}
              onDrop={(event) => dropCustomizeDrag(event, column.key)}
            >
              <label className="product-grid-customize-visible"><input type="checkbox" checked={column.visible} onChange={(event) => updateCustomizeDraft(column.key, { visible: event.target.checked })} /><span>{labels[column.key]}</span></label>
              <label><span className="sr-only">ความกว้าง {labels[column.key]}</span><input className="product-grid-customize-width" aria-label={`ความกว้าง ${labels[column.key]}`} type="number" min="96" max="520" step="1" value={column.width} onChange={(event) => updateCustomizeDraft(column.key, { width: Number(event.target.value) })} /></label>
              <label className="product-grid-customize-pin" data-pinned={column.pinned}><input type="checkbox" checked={column.pinned} onChange={(event) => updateCustomizeDraft(column.key, { pinned: event.target.checked })} /><span>ปักหมุด</span><ProductGridPinIcon /></label>
              <div className="product-grid-customize-order"><button
                className="product-grid-customize-drag-handle"
                type="button"
                draggable
                aria-label={`ลากเพื่อจัดลำดับ ${labels[column.key]} ใช้ลูกศรขึ้นหรือลงได้`}
                aria-describedby={orderTooltip?.key === column.key ? 'product-grid-order-tooltip' : undefined}
                onMouseEnter={(event) => showOrderTooltip(event.currentTarget, column.key)}
                onMouseLeave={() => setOrderTooltip(null)}
                onFocus={(event) => showOrderTooltip(event.currentTarget, column.key)}
                onBlur={() => setOrderTooltip(null)}
                onDragStart={(event) => startCustomizeDrag(event, column.key)}
                onDragEnd={() => setCustomizeDrag(null)}
                onKeyDown={(event) => {
                  if (event.key !== 'ArrowUp' && event.key !== 'ArrowDown') return
                  event.preventDefault()
                  moveCustomizeDraft(column.key, event.key === 'ArrowUp' ? -1 : 1)
                }}
              ><ProductGridDragHandleIcon /></button></div>
            </div>)}
          </div>
          <footer className="product-grid-customize-footer"><button className="button product-grid-button-tertiary" type="button" onClick={restoreCustomizeDraft}>คืนค่าเดิม</button><button className="button product-grid-button-secondary" type="button" onClick={() => closeCustomizeColumns()}>ยกเลิก</button><button className="button product-grid-button-primary" type="button" onClick={saveCustomizeColumns}>บันทึก</button></footer>
        </section> : null}
      </div>
      </div>
    </div>
    {bulkActiveCount > 0 ? <div className="product-grid-bulk-active" aria-live="polite">
      กำลังค้นหาแบบกลุ่ม <strong>{bulkActiveCount}</strong> รหัส
      <Link className="button compact secondary" href={clearBulkHref}>ล้างกลุ่มรหัส</Link>
    </div> : null}
    {selectedRows.size > 0 ? <div className="product-grid-selection-active" aria-live="polite">
      เลือกแล้ว <strong>{selectedRows.size}</strong> รายการ
      <button className="button compact secondary" type="button" onClick={() => setSelectedRows(new Set())}>ยกเลิกการเลือก</button>
    </div> : null}
    {!rows.length ? <OperationsEmptyState icon="＋" title={emptyState.title} description={emptyState.description} /> : <>
    <div className="product-table-wrap product-grid-wrap">
      <table className="product-data-table product-grid-table">
        <colgroup><col style={{ width: PRODUCT_GRID_SELECTION_WIDTH }} />{visibleColumns.map((column) => <col key={column.key} style={{ width: column.width }} />)}<col style={{ width: 72 }} /></colgroup>
        <thead><tr><th className={`product-grid-selection product-grid-selection-pinned${lastPinnedKey ? '' : ' product-grid-pinned-boundary'}`}><input ref={selectAllRef} type="checkbox" aria-label="เลือกสินค้าทั้งหมด" checked={displayedRows.length > 0 && selectedRows.size === displayedRows.length} onChange={(event) => toggleAllRows(event.target.checked)} /></th>{visibleColumns.map((column) => <th key={column.key} className={[
          column.pinned ? 'product-grid-pinned' : '',
          column.pinned && column.key === lastPinnedKey ? 'product-grid-pinned-boundary' : '',
        ].filter(Boolean).join(' ') || undefined} style={column.pinned ? { left: pinnedOffsets.get(column.key) ?? PRODUCT_GRID_SELECTION_WIDTH } : undefined}>
          <button className="product-grid-sort" type="button" onClick={() => toggleSort(column.key)} aria-label={`จัดเรียงตาม${labels[column.key]}`}>
            <span>{labels[column.key]}</span>{column.pinned ? <span className="product-grid-header-pin" title="ปักหมุดแล้ว"><ProductGridPinIcon /></span> : null}<span aria-hidden="true">{gridSort.key === column.key ? (gridSort.direction === 'asc' ? '↑' : '↓') : '↕'}</span>
          </button>
          <span
            className="product-grid-column-resizer"
            data-column-resizer={column.key}
            data-resizing="false"
            role="separator"
            aria-label={`ปรับความกว้างคอลัมน์ ${labels[column.key]}`}
            aria-orientation="vertical"
            aria-valuemin={96}
            aria-valuemax={520}
            aria-valuenow={column.width}
            tabIndex={0}
            onPointerDown={(event) => startColumnResize(event, column)}
            onPointerMove={(event) => moveColumnResize(event, column.key)}
            onPointerUp={stopColumnResize}
            onPointerCancel={stopColumnResize}
            onKeyDown={(event) => resizeColumnWithKeyboard(event, column)}
          />
        </th>)}<th className="product-grid-actions-column product-grid-actions-column-header"><span className="product-grid-actions-header-icon" title="การดำเนินการ"><span aria-hidden="true">⋯</span><span className="sr-only">การดำเนินการ</span></span></th></tr></thead>
        <tbody>{displayedRows.map((row) => <Fragment key={row.id}><tr data-selected={selectedRows.has(row.id)} data-expanded={expandedRows.has(row.id)}><td className={`product-grid-selection product-grid-selection-pinned${lastPinnedKey ? '' : ' product-grid-pinned-boundary'}`}><input type="checkbox" aria-label={`เลือก ${row.name}`} checked={selectedRows.has(row.id)} onChange={(event) => toggleRow(row.id, event.target.checked)} /></td>{visibleColumns.map((column) => cell(row, column.key))}<td className="product-grid-actions-column"><button className="product-grid-row-action" type="button" data-tooltip="การดำเนินการ" aria-label={`เปิดเมนู ${row.name}`} aria-describedby={copyTooltip?.key === `${row.id}:actions` ? 'product-grid-copy-tooltip' : undefined} aria-haspopup="menu" aria-expanded={rowMenu?.rowId === row.id} onMouseEnter={(event) => showCopyTooltip(event.currentTarget, `${row.id}:actions`, 'การดำเนินการ')} onMouseLeave={() => setCopyTooltip(null)} onFocus={(event) => showCopyTooltip(event.currentTarget, `${row.id}:actions`, 'การดำเนินการ')} onBlur={() => setCopyTooltip(null)} onClick={(event) => { setCopyTooltip(null); rowMenu?.rowId === row.id ? setRowMenu(null) : openRowMenu(event.currentTarget, row.id) }} onKeyDown={(event) => {
          if (!['ArrowDown', 'Enter', ' '].includes(event.key)) return
          event.preventDefault()
          setCopyTooltip(null)
          openRowMenu(event.currentTarget, row.id, true)
        }}>⋯</button></td></tr>{expandedRows.has(row.id) && row.skuCount > 1 ? <tr className="product-grid-variant-expanded-row"><td colSpan={visibleColumns.length + 2}>{variantPanel(row, 'desktop')}</td></tr> : null}</Fragment>)}</tbody>
      </table>
    </div>
    <div className="product-mobile-list product-grid-mobile" role="list" aria-label="รายการ Product">
      {rows.map((row) => <article className="product-mobile-card" role="listitem" key={row.id}>
        <div><strong>{row.name}</strong>{productStatusControl(row)}</div>
        <p>{row.skuPreview[0]?.salesCode || 'ไม่มีรหัส CF'} · {row.skuCount} SKU</p>
        <small>{row.stock.mode === 'single-unit' ? `Stock ${row.stock.onHand} · Available ${row.stock.available}` : row.stock.mode === 'mixed-units' ? 'Stock หลายหน่วย' : 'ยังไม่มียอด Stock'}</small>
        {row.skuCount > 1 ? <button className="product-grid-mobile-variant-toggle" type="button" aria-expanded={expandedRows.has(row.id)} aria-controls={`product-grid-variants-${row.id}-mobile`} onClick={() => toggleVariantRow(row.id)}>{expandedRows.has(row.id) ? 'ซ่อนตัวเลือก' : `ดู ${row.skuCount} ตัวเลือก`}</button> : null}
        {expandedRows.has(row.id) && row.skuCount > 1 ? variantPanel(row, 'mobile') : null}
        <Link className="product-row-link" href={detailHref({ organizationId, search, status, dateField, dateFrom, dateTo, sort, productId: row.id, page: currentPage, pageSize, bulkSearchActive })}>ดูรายละเอียด</Link>
      </article>)}
    </div>
    </>}
    <footer className="product-grid-footer product-grid-pagination-footer" aria-label="การแบ่งหน้ารายการสินค้า">
      <label className="product-grid-page-size">
        <span>Rows per page</span>
        <select
          aria-label="จำนวนแถวต่อหน้า"
          value={pageSize}
          onChange={(event) => router.push(paginationHref(1, Number(event.target.value)), { scroll: false })}
        >
          {PRODUCT_GRID_PAGE_SIZES.map((size) => <option value={size} key={size}>{size}</option>)}
        </select>
      </label>
      <span className="product-grid-page-range" aria-live="polite">{rangeStart}–{rangeEnd} of {totalCount}</span>
      <nav className="product-grid-page-actions" aria-label="เปลี่ยนหน้ารายการสินค้า">
        {currentPage <= 1
          ? <span className="product-grid-page-button" aria-label="หน้าแรก" aria-disabled="true"><ProductGridPaginationIcon direction="first" /></span>
          : <Link className="product-grid-page-button" href={paginationHref(1)} aria-label="หน้าแรก" scroll={false}><ProductGridPaginationIcon direction="first" /></Link>}
        {currentPage <= 1
          ? <span className="product-grid-page-button" aria-label="หน้าก่อนหน้า" aria-disabled="true"><ProductGridPaginationIcon direction="previous" /></span>
          : <Link className="product-grid-page-button" href={paginationHref(currentPage - 1)} aria-label="หน้าก่อนหน้า" scroll={false}><ProductGridPaginationIcon direction="previous" /></Link>}
        {currentPage >= totalPages
          ? <span className="product-grid-page-button" aria-label="หน้าถัดไป" aria-disabled="true"><ProductGridPaginationIcon direction="next" /></span>
          : <Link className="product-grid-page-button" href={paginationHref(currentPage + 1)} aria-label="หน้าถัดไป" scroll={false}><ProductGridPaginationIcon direction="next" /></Link>}
        {currentPage >= totalPages
          ? <span className="product-grid-page-button" aria-label="หน้าสุดท้าย" aria-disabled="true"><ProductGridPaginationIcon direction="last" /></span>
          : <Link className="product-grid-page-button" href={paginationHref(totalPages)} aria-label="หน้าสุดท้าย" scroll={false}><ProductGridPaginationIcon direction="last" /></Link>}
      </nav>
    </footer>
    {rowMenu ? <div ref={rowMenuRef} className="product-grid-row-menu" role="menu" aria-label="เมนูสินค้า" style={{ left: rowMenu.left, top: rowMenu.top }} onKeyDown={(event) => {
      const items = Array.from(event.currentTarget.querySelectorAll<HTMLElement>('[role="menuitem"]'))
      const currentIndex = items.indexOf(document.activeElement as HTMLElement)
      if (event.key === 'Tab') {
        setRowMenu(null)
        return
      }
      if (event.key === 'Home' || event.key === 'End') {
        event.preventDefault()
        items[event.key === 'Home' ? 0 : items.length - 1]?.focus()
        return
      }
      const delta = event.key === 'ArrowDown' ? 1 : event.key === 'ArrowUp' ? -1 : 0
      if (!delta || !items.length) return
      event.preventDefault()
      items[(Math.max(currentIndex, 0) + delta + items.length) % items.length]?.focus()
    }}>
      <Link role="menuitem" href={detailHref({ organizationId, search, status, dateField, dateFrom, dateTo, sort, productId: rowMenu.rowId, page: currentPage, pageSize, bulkSearchActive })}>ดูรายละเอียดแบบ Quick View</Link>
      <Link role="menuitem" href={detailHref({ organizationId, search, status, dateField, dateFrom, dateTo, sort, productId: rowMenu.rowId, page: currentPage, pageSize, bulkSearchActive, action: 'edit' })}>แก้ไขสินค้า</Link>
      <Link role="menuitem" href={detailHref({ organizationId, search, status, dateField, dateFrom, dateTo, sort, productId: rowMenu.rowId, page: currentPage, pageSize, bulkSearchActive, action: 'skus' })}>จัดการ SKU</Link>
    </div> : null}
    {quickEdit ? <div ref={quickEditRef} className="product-grid-quick-editor" data-kind={quickEdit.kind} role="dialog" aria-modal="false" aria-labelledby="product-grid-quick-editor-title" style={{ left: quickEdit.left, top: quickEdit.top }}>
      <header><div><h2 id="product-grid-quick-editor-title">{quickEdit.kind === 'price' ? 'แก้ไขราคาขาย' : 'ปรับจำนวนสต๊อก'}</h2><p title={`${quickEdit.row.name} · ${quickEdit.sku.skuCode}`}>{quickEdit.row.name} · <span className="product-code">{quickEdit.sku.skuCode}</span></p></div><button type="button" aria-label="ปิด" disabled={quickEditPending} onClick={() => setQuickEdit(null)}>×</button></header>
      <form onSubmit={submitQuickEdit}>
        {quickEdit.row.skuPreview.filter((sku) => quickEdit.kind === 'price' || sku.status === 'active').length > 1 ? <label className="field-stack">SKU / ตัวเลือก<select name="skuId" value={quickEdit.sku.id} onChange={(event) => setQuickEdit((current) => {
          if (!current) return current
          const sku = current.row.skuPreview.find((item) => item.id === event.target.value)
          return sku ? { ...current, sku } : current
        })}>{quickEdit.row.skuPreview.filter((sku) => quickEdit.kind === 'price' || sku.status === 'active').map((sku) => <option key={sku.id} value={sku.id}>{sku.skuCode}</option>)}</select></label> : <input name="skuId" type="hidden" value={quickEdit.sku.id} />}
        {quickEdit.kind === 'price' ? <label className="field-stack">ราคาขาย (บาท)<input key={quickEdit.sku.id} name="salePrice" type="number" inputMode="decimal" min="0" step="0.01" required autoFocus defaultValue={quickEdit.sku.profile?.salePrice ?? ''} placeholder="0.00" /></label> : <>
          <div className="product-grid-quick-stock-summary"><span>ยอดรวมปัจจุบัน</span><strong>{quickEdit.row.stock.mode === 'single-unit' ? `${quickEdit.row.stock.onHand ?? 0} ${formatProductUnit(quickEdit.sku.baseUnitCode)}` : 'ยังไม่มียอด Stock'}</strong></div>
          <div className="form-grid-two"><label className="field-stack">วิธีปรับ<select name="direction" defaultValue="adjustment_in" autoFocus><option value="adjustment_in">ปรับเพิ่ม</option><option value="adjustment_out">ปรับลด</option></select></label><label className="field-stack">จำนวน<input name="quantity" type="number" inputMode="decimal" min="0.000001" step="0.000001" required /></label></div>
          <label className="field-stack">ตำแหน่งจัดเก็บ<select name="locationId" required defaultValue=""><option value="" disabled>เลือกตำแหน่ง</option>{inventoryLocationOptions.map((location) => <option key={location.id} value={location.id}>{location.warehouseName} · {location.code} · {location.name}</option>)}</select></label>
          <label className="field-stack">เหตุผล<textarea name="reasonNote" required minLength={3} maxLength={500} placeholder="เช่น ตรวจนับสต๊อกหน้าร้าน" /></label>
        </>}
        {quickEditError ? <div className="product-grid-quick-edit-error" role="alert">{quickEditError}</div> : null}
        <footer><button className="button product-grid-button-secondary" type="button" disabled={quickEditPending} onClick={() => setQuickEdit(null)}>ยกเลิก</button><button className="button product-grid-button-primary" type="submit" disabled={quickEditPending || (quickEdit.kind === 'stock' && !inventoryLocationOptions.length)}>{quickEditPending ? 'กำลังบันทึก…' : 'บันทึก'}</button></footer>
      </form>
    </div> : null}
    {copyTooltip ? <div id="product-grid-copy-tooltip" className="product-grid-copy-tooltip" role="tooltip" style={{ left: copyTooltip.left, top: copyTooltip.top }}>{copyTooltip.text}</div> : null}
    {imagePreview ? <div id="product-grid-image-preview" className="product-grid-image-preview" role="tooltip" style={{ left: imagePreview.left, top: imagePreview.top }}><Image src={imagePreview.src} alt={imagePreview.alt} width={240} height={240} unoptimized /><strong>{imagePreview.name}</strong><span>ภาพสินค้า</span></div> : null}
    {orderTooltip ? <div id="product-grid-order-tooltip" className="product-grid-order-tooltip" role="tooltip" style={{ left: orderTooltip.left, top: orderTooltip.top }}>ลากเพื่อจัดลำดับ</div> : null}
    {exportColumnsOpen ? <div className="product-modal-backdrop product-export-columns-backdrop" role="presentation" onMouseDown={(event) => {
      if (event.target === event.currentTarget) setExportColumnsOpen(false)
    }}>
      <section ref={exportColumnsDialogRef} className="product-editor-dialog product-export-columns-dialog" role="dialog" aria-modal="true" aria-labelledby="product-export-columns-title" aria-describedby="product-export-columns-description" onKeyDown={handleExportColumnsKeyDown}>
        <header><h2 id="product-export-columns-title">กำหนดคอลัมน์ที่ส่งออก</h2><button className="product-bulk-search-close" type="button" aria-label="ปิด" onClick={() => setExportColumnsOpen(false)}>×</button></header>
        <div className="product-export-columns-body">
          <p id="product-export-columns-description">เลือกข้อมูลที่จะใช้เมื่อต้องส่งออกรายการสินค้า การตั้งค่านี้แยกจากคอลัมน์ที่แสดงในตาราง</p>
          <div className="product-export-column-list">
            {PRODUCT_EXPORT_COLUMNS.map(([key, label]) => <label className="product-export-column-option" key={key}><input type="checkbox" checked={exportColumnsDraft.includes(key)} onChange={(event) => setExportColumnsDraft((current) => event.target.checked ? Array.from(new Set([...current, key])) : current.filter((item) => item !== key))} /><span>{label}</span></label>)}
          </div>
        </div>
        <footer><button className="button product-grid-button-tertiary" type="button" onClick={() => setExportColumnsDraft(PRODUCT_EXPORT_COLUMNS.map(([key]) => key))}>เลือกทั้งหมด</button><button className="button product-grid-button-secondary" type="button" onClick={() => setExportColumnsOpen(false)}>ยกเลิก</button><button className="button product-grid-button-primary" type="button" onClick={saveExportColumns}>บันทึก</button></footer>
      </section>
    </div> : null}
    {gridToast ? <div className="product-grid-toast" role="status" aria-live="polite">{gridToast}</div> : null}
  </>
}

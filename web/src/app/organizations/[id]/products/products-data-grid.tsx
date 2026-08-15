'use client'

import Link from 'next/link'
import Image from 'next/image'
import {
  useEffect, useMemo, useRef, useState,
  type KeyboardEvent as ReactKeyboardEvent,
  type PointerEvent as ReactPointerEvent,
  type ReactNode,
} from 'react'
import { OperationsEmptyState, OperationsStatusBadge } from '@/app/components/operations-ui'
import type { ProductWorkspaceRow } from '@/lib/foundation/repositories'
import {
  normalizeProductGridColumns,
  PRODUCT_GRID_DEFAULT_COLUMNS,
  type ProductGridColumnKey,
  type ProductGridColumnPreference,
} from './product-grid-preferences'

const labels: Record<ProductGridColumnKey, string> = {
  product: 'สินค้า', salesCode: 'รหัส CF', sku: 'SKU / ตัวเลือก', stock: 'สต็อก',
  baseUnit: 'หน่วยนับ', status: 'สถานะ', updatedAt: 'แก้ไขล่าสุด',
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

function statusTone(status: string) {
  if (status === 'active') return 'success' as const
  if (status === 'draft') return 'info' as const
  return 'neutral' as const
}

function statusLabel(status: string) {
  return ({ draft: 'ฉบับร่าง', active: 'ใช้งานอยู่', archived: 'เก็บถาวร' } as Record<string, string>)[status] ?? status
}

function formatUpdatedAt(value: string) {
  return new Intl.DateTimeFormat('th-TH', {
    dateStyle: 'medium', timeStyle: 'short', timeZone: 'Asia/Bangkok',
  }).format(new Date(value))
}

function detailHref(input: { organizationId: string; search: string; status: string; sort: string; productId: string; action?: 'edit' | 'skus' }) {
  const params = new URLSearchParams({ view: 'products', product: input.productId })
  if (input.search) params.set('q', input.search)
  if (input.status) params.set('status', input.status)
  if (input.sort) params.set('sort', input.sort)
  if (input.action) params.set('action', input.action)
  return `/organizations/${input.organizationId}/products?${params}`
}

export function ProductsDataGrid({
  organizationId, rows, search, status, sort, toolbar, clearHref, bulkActiveCount, clearBulkHref, emptyState,
}: {
  organizationId: string
  rows: ProductWorkspaceRow[]
  search: string
  status: string
  sort: 'updated_desc' | 'updated_asc'
  toolbar: ReactNode
  clearHref: string
  bulkActiveCount: number
  clearBulkHref: string
  emptyState: { title: string; description: string }
}) {
  const storageKey = `avenzo:products-grid:${organizationId}:v1`
  const exportStorageKey = `avenzo:products-export-columns:${organizationId}:v1`
  const [columns, setColumns] = useState<ProductGridColumnPreference[]>(PRODUCT_GRID_DEFAULT_COLUMNS)
  const columnsRef = useRef<ProductGridColumnPreference[]>(PRODUCT_GRID_DEFAULT_COLUMNS)
  const [copied, setCopied] = useState<string | null>(null)
  const [copyTooltip, setCopyTooltip] = useState<{ key: string; text: string; left: number; top: number } | null>(null)
  const [selectedRows, setSelectedRows] = useState<Set<string>>(new Set())
  const [gridSort, setGridSort] = useState<GridSort>({ key: 'updatedAt', direction: sort === 'updated_desc' ? 'desc' : 'asc' })
  const [excelMenuOpen, setExcelMenuOpen] = useState(false)
  const [exportColumnsOpen, setExportColumnsOpen] = useState(false)
  const [exportColumns, setExportColumns] = useState<ProductExportColumnKey[]>(PRODUCT_EXPORT_COLUMNS.map(([key]) => key))
  const [exportColumnsDraft, setExportColumnsDraft] = useState<ProductExportColumnKey[]>(PRODUCT_EXPORT_COLUMNS.map(([key]) => key))
  const [customizeOpen, setCustomizeOpen] = useState(false)
  const [customizeDraft, setCustomizeDraft] = useState<ProductGridColumnPreference[]>(PRODUCT_GRID_DEFAULT_COLUMNS)
  const [customizePosition, setCustomizePosition] = useState({ left: 12, top: 12 })
  const [gridToast, setGridToast] = useState<string | null>(null)
  const [rowMenu, setRowMenu] = useState<{ rowId: string; left: number; top: number } | null>(null)
  const selectAllRef = useRef<HTMLInputElement>(null)
  const rowMenuRef = useRef<HTMLDivElement>(null)
  const rowMenuTriggerRef = useRef<HTMLButtonElement>(null)
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

  const visibleColumns = useMemo(() => columns.filter((column) => column.visible), [columns])
  const displayedRows = useMemo(() => [...rows].sort((left, right) => {
    const value = (row: ProductWorkspaceRow) => {
      if (gridSort.key === 'product') return row.name
      if (gridSort.key === 'salesCode') return row.skuPreview[0]?.salesCode ?? ''
      if (gridSort.key === 'sku') return row.skuPreview[0]?.skuCode ?? ''
      if (gridSort.key === 'stock') return row.stock.available
      if (gridSort.key === 'baseUnit') return row.stock.baseUnitCode ?? ''
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
    let left = 0
    for (const column of visibleColumns.filter((item) => item.pinned)) {
      offsets.set(column.key, left)
      left += column.width
    }
    return offsets
  }, [visibleColumns])
  function toggleSort(key: ProductGridColumnKey) {
    setGridSort((current) => ({
      key,
      direction: current.key === key && current.direction === 'asc' ? 'desc' : 'asc',
    }))
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

  function moveCustomizeDraft(index: number, delta: -1 | 1) {
    const target = index + delta
    if (target < 0 || target >= customizeDraft.length) return
    setCustomizeDraft((current) => {
      const next = current.map((column) => ({ ...column }))
      const [column] = next.splice(index, 1)
      next.splice(target, 0, column)
      return next
    })
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
      window.setTimeout(() => setCopied(null), 1600)
    } catch {
      setCopied(null)
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

  function cell(row: ProductWorkspaceRow, key: ProductGridColumnKey) {
    const firstSku = row.skuPreview[0]
    const common = columns.find((column) => column.key === key)!
    const style = common.pinned ? { left: pinnedOffsets.get(key) ?? 0 } : undefined
    const className = common.pinned ? 'product-grid-pinned' : undefined
    if (key === 'product') return <td key={key} className={className} style={style}>
      <div className="product-grid-product">
        {row.coverImage
          ? <span className="product-grid-image"><Image src={row.coverImage.signedUrl} alt={row.coverImage.altText || row.name} fill sizes="42px" unoptimized /></span>
          : <span className="product-grid-placeholder" aria-hidden="true">{row.name.slice(0, 1).toUpperCase()}</span>}
        <span><strong>{row.name}</strong><small>{row.description || 'ไม่มีคำอธิบาย'}</small></span>
      </div>
    </td>
    if (key === 'salesCode') return <td key={key} className={className} style={style}>{firstSku?.salesCode ? <div className="product-grid-code-line"><code>{firstSku.salesCode}</code><button type="button" data-tooltip="คัดลอกรหัส CF" aria-label={`คัดลอกรหัส CF ${firstSku.salesCode}`} aria-describedby={copyTooltip?.key === `${row.id}:sales` ? 'product-grid-copy-tooltip' : undefined} onMouseEnter={(event) => showCopyTooltip(event.currentTarget, `${row.id}:sales`, 'คัดลอกรหัส CF')} onMouseLeave={() => setCopyTooltip(null)} onFocus={(event) => showCopyTooltip(event.currentTarget, `${row.id}:sales`, 'คัดลอกรหัส CF')} onBlur={() => setCopyTooltip(null)} onClick={() => copyCode(firstSku.salesCode!, `${row.id}:sales`)}>{copied === `${row.id}:sales` ? '✓' : '⧉'}</button></div> : <span className="product-grid-muted">—</span>}{row.skuPreview.filter((sku) => sku.salesCode).length > 1 ? <small>+ รหัสอื่น</small> : null}</td>
    if (key === 'sku') return <td key={key} className={className} style={style}>{firstSku ? <><div className="product-grid-code-line"><code>{firstSku.skuCode}</code><button type="button" data-tooltip="คัดลอก SKU" aria-label={`คัดลอก SKU Code ${firstSku.skuCode}`} aria-describedby={copyTooltip?.key === `${row.id}:sku` ? 'product-grid-copy-tooltip' : undefined} onMouseEnter={(event) => showCopyTooltip(event.currentTarget, `${row.id}:sku`, 'คัดลอก SKU')} onMouseLeave={() => setCopyTooltip(null)} onFocus={(event) => showCopyTooltip(event.currentTarget, `${row.id}:sku`, 'คัดลอก SKU')} onBlur={() => setCopyTooltip(null)} onClick={() => copyCode(firstSku.skuCode, `${row.id}:sku`)}>{copied === `${row.id}:sku` ? '✓' : '⧉'}</button></div><small>{row.skuCount} {row.skuCount === 1 ? 'SKU' : 'variants'}</small></> : <span className="product-grid-muted">ยังไม่มี SKU</span>}</td>
    if (key === 'stock') return <td key={key} className={className} style={style}>{row.stock.mode === 'single-unit' ? <><strong>{row.stock.onHand} in stock</strong><small>Available {row.stock.available}</small></> : row.stock.mode === 'mixed-units' ? <><strong>หลายหน่วย</strong><small>ไม่รวมยอดข้ามหน่วย</small></> : row.stock.mode === 'not-authorized' ? <span className="product-grid-muted">ไม่มีสิทธิ์ดู Stock</span> : <span className="product-grid-muted">ยังไม่มียอด Stock</span>}</td>
    if (key === 'baseUnit') return <td key={key} className={className} style={style}><strong>{row.stock.baseUnitCode || (row.stock.mode === 'mixed-units' ? 'หลายหน่วย' : '—')}</strong></td>
    if (key === 'status') return <td key={key} className={className} style={style}><Link className={`product-grid-status-control ${row.status}`} title="เปิดรายละเอียดเพื่อจัดการสถานะอย่างปลอดภัย" aria-label={`${statusLabel(row.status)} เปิดรายละเอียดเพื่อจัดการสถานะ`} href={detailHref({ organizationId, search, status, sort, productId: row.id })}><span aria-hidden="true" />{statusLabel(row.status)}<span aria-hidden="true" /></Link></td>
    return <td key={key} className={className} style={style}>{formatUpdatedAt(row.updatedAt)}</td>
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
            {customizeDraft.map((column, index) => <div className="product-grid-customize-row" key={column.key}>
              <label className="product-grid-customize-visible"><input type="checkbox" checked={column.visible} onChange={(event) => updateCustomizeDraft(column.key, { visible: event.target.checked })} /><span>{labels[column.key]}</span></label>
              <label><span className="sr-only">ความกว้าง {labels[column.key]}</span><input className="product-grid-customize-width" aria-label={`ความกว้าง ${labels[column.key]}`} type="number" min="96" max="520" step="1" value={column.width} onChange={(event) => updateCustomizeDraft(column.key, { width: Number(event.target.value) })} /></label>
              <label className="product-grid-customize-pin"><input type="checkbox" checked={column.pinned} onChange={(event) => updateCustomizeDraft(column.key, { pinned: event.target.checked })} /> ปักหมุด</label>
              <div className="product-grid-customize-order"><button className="button" type="button" aria-label={`เลื่อน ${labels[column.key]} ขึ้น`} disabled={index === 0} onClick={() => moveCustomizeDraft(index, -1)}>↑</button><button className="button" type="button" aria-label={`เลื่อน ${labels[column.key]} ลง`} disabled={index === customizeDraft.length - 1} onClick={() => moveCustomizeDraft(index, 1)}>↓</button></div>
            </div>)}
          </div>
          <footer className="product-grid-customize-footer"><button className="button secondary" type="button" onClick={restoreCustomizeDraft}>คืนค่าเดิม</button><button className="button secondary" type="button" onClick={() => closeCustomizeColumns()}>ยกเลิก</button><button className="button" type="button" onClick={saveCustomizeColumns}>บันทึก</button></footer>
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
        <colgroup><col style={{ width: 52 }} />{visibleColumns.map((column) => <col key={column.key} style={{ width: column.width }} />)}<col style={{ width: 72 }} /></colgroup>
        <thead><tr><th className="product-grid-selection"><input ref={selectAllRef} type="checkbox" aria-label="เลือกสินค้าทั้งหมด" checked={displayedRows.length > 0 && selectedRows.size === displayedRows.length} onChange={(event) => toggleAllRows(event.target.checked)} /></th>{visibleColumns.map((column) => <th key={column.key} className={column.pinned ? 'product-grid-pinned' : undefined} style={column.pinned ? { left: 52 + (pinnedOffsets.get(column.key) ?? 0) } : undefined}>
          <button className="product-grid-sort" type="button" onClick={() => toggleSort(column.key)} aria-label={`จัดเรียงตาม${labels[column.key]}`}>
            <span>{labels[column.key]}</span><span aria-hidden="true">{gridSort.key === column.key ? (gridSort.direction === 'asc' ? '↑' : '↓') : '↕'}</span>
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
        </th>)}<th><span className="sr-only">รายละเอียด</span></th></tr></thead>
        <tbody>{displayedRows.map((row) => <tr key={row.id} data-selected={selectedRows.has(row.id)}><td className="product-grid-selection"><input type="checkbox" aria-label={`เลือก ${row.name}`} checked={selectedRows.has(row.id)} onChange={(event) => toggleRow(row.id, event.target.checked)} /></td>{visibleColumns.map((column) => cell(row, column.key))}<td><button className="product-grid-row-action" type="button" aria-label={`เปิดเมนู ${row.name}`} aria-haspopup="menu" aria-expanded={rowMenu?.rowId === row.id} onClick={(event) => rowMenu?.rowId === row.id ? setRowMenu(null) : openRowMenu(event.currentTarget, row.id)} onKeyDown={(event) => {
          if (!['ArrowDown', 'Enter', ' '].includes(event.key)) return
          event.preventDefault()
          openRowMenu(event.currentTarget, row.id, true)
        }}>⋯</button></td></tr>)}</tbody>
      </table>
    </div>
    <div className="product-mobile-list product-grid-mobile" role="list" aria-label="รายการ Product">
      {rows.map((row) => <article className="product-mobile-card" role="listitem" key={row.id}>
        <div><strong>{row.name}</strong><OperationsStatusBadge tone={statusTone(row.status)}>{statusLabel(row.status)}</OperationsStatusBadge></div>
        <p>{row.skuPreview[0]?.salesCode || 'ไม่มีรหัส CF'} · {row.skuCount} SKU</p>
        <small>{row.stock.mode === 'single-unit' ? `Stock ${row.stock.onHand} · Available ${row.stock.available}` : row.stock.mode === 'mixed-units' ? 'Stock หลายหน่วย' : 'ยังไม่มียอด Stock'}</small>
        <Link className="product-row-link" href={detailHref({ organizationId, search, status, sort, productId: row.id })}>ดูรายละเอียด</Link>
      </article>)}
    </div>
    </>}
    <div className="product-grid-footer"><span>{rows.length} รายการในหน้าปัจจุบัน</span><span>การตั้งค่าคอลัมน์บันทึกในอุปกรณ์นี้</span></div>
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
      <Link role="menuitem" href={detailHref({ organizationId, search, status, sort, productId: rowMenu.rowId })}>ดูรายละเอียดแบบ Quick View</Link>
      <Link role="menuitem" href={detailHref({ organizationId, search, status, sort, productId: rowMenu.rowId, action: 'edit' })}>แก้ไขสินค้า</Link>
      <Link role="menuitem" href={detailHref({ organizationId, search, status, sort, productId: rowMenu.rowId, action: 'skus' })}>จัดการ SKU</Link>
    </div> : null}
    {copyTooltip ? <div id="product-grid-copy-tooltip" className="product-grid-copy-tooltip" role="tooltip" style={{ left: copyTooltip.left, top: copyTooltip.top }}>{copyTooltip.text}</div> : null}
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
        <footer><button className="button secondary" type="button" onClick={() => setExportColumnsDraft(PRODUCT_EXPORT_COLUMNS.map(([key]) => key))}>เลือกทั้งหมด</button><button className="button secondary" type="button" onClick={() => setExportColumnsOpen(false)}>ยกเลิก</button><button className="button" type="button" onClick={saveExportColumns}>บันทึก</button></footer>
      </section>
    </div> : null}
    {gridToast ? <div className="product-grid-toast" role="status" aria-live="polite">{gridToast}</div> : null}
  </>
}

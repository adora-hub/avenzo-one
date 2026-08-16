'use client'

import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useEffect, useMemo, useRef, useState, useTransition, type FormEvent } from 'react'
import { executeFoundationCommandAction } from '@/app/actions/foundation'
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
import { ProductDetailSheet } from './product-detail-sheet'
import { ProductsDataGrid } from './products-data-grid'

type ViewMode = 'products' | 'skus'
type EditorMode = 'create-product' | 'create-sku' | 'edit-product' | 'edit-sku' | null
type PendingLifecycle = {
  commandType: 'product.archive' | 'sku.archive'
  idKey: 'product_id' | 'sku_id'
  id: string
  version: number
  label: string
}

type Props = {
  organizationId: string
  organizationName: string
  skuCount: number
  view: ViewMode
  search: string
  bulkSearchActive: boolean
  status: string
  sort: 'updated_desc' | 'updated_asc'
  productWorkspaceRows: ProductWorkspaceRow[]
  productPage: number
  productPageSize: number
  productTotalCount: number
  skus: SkuReadModel[]
  productOptions: ProductReadModel[]
  selectedProduct: ProductWorkspaceDetail | null
  productAction: '' | 'edit' | 'skus'
  selectedSku: (ProductWorkspaceSkuDetail & { productName: string }) | null
  nextCursor: string | null
  canManage: boolean
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
  canManage,
  canReadCost,
}: Props) {
  const router = useRouter()
  const firstFieldRef = useRef<HTMLInputElement>(null)
  const searchTimerRef = useRef<number | null>(null)
  const createMenuRef = useRef<HTMLDetailsElement>(null)
  const statusFilterRef = useRef<HTMLDivElement>(null)
  const statusFilterButtonRef = useRef<HTMLButtonElement>(null)
  const [editorMode, setEditorMode] = useState<EditorMode>(null)
  const [bulkSearchOpen, setBulkSearchOpen] = useState(false)
  const [bulkCodes, setBulkCodes] = useState(bulkSearchActive ? search.replaceAll(',', '\n') : '')
  const [bulkSearchAttempted, setBulkSearchAttempted] = useState(false)
  const [searchInput, setSearchInput] = useState(bulkSearchActive ? '' : search)
  const [statusFilter, setStatusFilter] = useState(status)
  const [statusFilterOpen, setStatusFilterOpen] = useState(false)
  const [feedback, setFeedback] = useState<{ tone: 'success' | 'danger' | 'info'; text: string; code?: string } | null>(null)
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

  useEffect(() => {
    if (!editorMode) return
    firstFieldRef.current?.focus()
    function closeOnEscape(event: KeyboardEvent) {
      if (event.key === 'Escape' && !isPending) setEditorMode(null)
    }
    window.addEventListener('keydown', closeOnEscape)
    return () => window.removeEventListener('keydown', closeOnEscape)
  }, [editorMode, isPending])

  useEffect(() => {
    if (!selectedProduct) return
    if (productAction === 'edit' && canManage) {
      setEditorMode('edit-product')
      return
    }
    if (productAction === 'skus') {
      window.requestAnimationFrame(() => document.getElementById('product-detail-skus')?.scrollIntoView({ block: 'start' }))
    }
  }, [canManage, productAction, selectedProduct])

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
    if (bulkSearchActive) setBulkCodes(search.replaceAll(',', '\n'))
  }, [bulkSearchActive, search, status])

  useEffect(() => () => {
    if (searchTimerRef.current !== null) window.clearTimeout(searchTimerRef.current)
  }, [])

  function clearSearchTimer() {
    if (searchTimerRef.current === null) return
    window.clearTimeout(searchTimerRef.current)
    searchTimerRef.current = null
  }

  function navigateFilters(nextSearch: string, nextStatus: string, mode: 'push' | 'replace' = 'replace', nextBulkSearchActive = false) {
    clearSearchTimer()
    const href = buildHref(organizationId, {
      view,
      q: nextSearch.trim(),
      status: nextStatus,
      sort,
      page_size: view === 'products' ? String(productPageSize) : undefined,
      bulk: nextBulkSearchActive ? '1' : undefined,
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
      navigateFilters(nextSearch, statusFilter)
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
    setStatusFilterOpen(true)
    focusStatusOption(target)
  }

  function chooseStatusFilter(nextStatus: string) {
    setStatusFilter(nextStatus)
    setStatusFilterOpen(false)
    statusFilterButtonRef.current?.focus()
    navigateFilters(bulkSearchActive ? search : searchInput, nextStatus, 'replace', bulkSearchActive)
  }

  function openEditor(mode: Exclude<EditorMode, null>) {
    setFeedback(null)
    setEditorMode(mode)
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
      setEditorMode(null)
      router.refresh()
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
      runCommand('product.update', {
        product_id: selectedProduct.id,
        expected_version: selectedProduct.version,
        name,
        description: String(data.get('description') ?? '').trim(),
      })
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
    navigateFilters(codes.join(','), statusFilter, 'push', true)
  }

  const closeDetailHref = buildHref(organizationId, {
    view,
    q: search,
    status,
    sort,
    page: view === 'products' ? String(productPage) : undefined,
    page_size: view === 'products' ? String(productPageSize) : undefined,
    bulk: bulkSearchActive ? '1' : undefined,
  })
  const nextHref = buildHref(organizationId, { view, q: search, status, sort, cursor: nextCursor, bulk: bulkSearchActive ? '1' : undefined })

  const filterForm = <form className="operations-filter-bar product-filter-bar" method="get" aria-label="ค้นหาและกรอง Product SKU" onSubmit={(event) => {
    if (view === 'products') {
      event.preventDefault()
      openBulkSearch(searchInput)
    }
  }}>
    <input type="hidden" name="view" value={view} />
    <input type="hidden" name="sort" value={sort} />
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
        navigateFilters('', statusFilter)
      }}>×</button> : null}
    </div>
    {view === 'products' ? <button className="button secondary product-bulk-search-trigger" type="button" onClick={() => openBulkSearch()}><span aria-hidden="true">⌘</span> ค้นหาหลายรหัส</button> : null}
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
    {view === 'skus' ? <button className="button product-search-submit" type="submit" title="ค้นหา · Ctrl+Enter">ค้นหา</button> : <button className="sr-only" type="submit">ค้นหา</button>}
  </form>

  return <>
    <header className="product-modern-heading">
      <div className="product-heading-title-row">
        <h1>{view === 'products' ? 'Products' : 'SKUs'}</h1>
        <span className="product-count-badge" aria-label={`${skuCount} SKU`}>
          {skuCount} SKU
        </span>
      </div>
      <div className="product-heading-subrow">
        <p>จัดการสินค้า รหัส SKU, Sales Code และ Barcode ของ {organizationName}</p>
        {canManage ? <details className="product-create-menu" ref={createMenuRef}>
          <summary className="button">＋ สร้างสินค้า <span aria-hidden="true">▾</span></summary>
          <div className="product-create-menu-panel" role="menu">
            <Link role="menuitem" href={`/organizations/${organizationId}/products/new`}><strong>สร้างสินค้าปกติ</strong><small>ข้อมูลครบสำหรับสินค้าขายประจำและเติม Stock ต่อเนื่อง</small></Link>
            <button type="button" role="menuitem" onClick={(event) => {
              event.currentTarget.closest('details')?.removeAttribute('open')
              setFeedback({ tone: 'info', text: 'สร้างสินค้าขายด่วน / Live Sale อยู่ในแผนเชื่อมระบบจริงหลังสัญญา Atomic Sales Code พร้อมใช้งาน' })
            }}><strong>สร้างสินค้าขายด่วน / Live Sale</strong><small>จอง Sales Code และเพิ่มสินค้ามาไว–ไปไวต่อเนื่อง</small></button>
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
      sort={sort}
      toolbar={filterForm}
      clearHref={buildHref(organizationId, { view })}
      bulkActiveCount={activeBulkCodes.length}
      clearBulkHref={buildHref(organizationId, { view, status, sort })}
      emptyState={search || status ? {
        title: 'ไม่พบรายการตามตัวกรอง',
        description: 'ลองเปลี่ยนคำค้นหาหรือสถานะ',
      } : {
        title: 'ยังไม่มี Product',
        description: canManage ? 'เริ่มเพิ่มข้อมูลด้วยปุ่มสร้างสินค้า' : 'ติดต่อผู้ดูแล Organization เพื่อเพิ่มข้อมูล',
      }}
      canManage={canManage}
      canReadCost={canReadCost}
      isPending={isPending}
      onRequestLifecycle={requestLifecycle}
    /> : <>
      {filterForm}
      {!rows.length ? <OperationsEmptyState
      icon="＋"
      title={search || status ? 'ไม่พบรายการตามตัวกรอง' : 'ยังไม่มี SKU'}
      description={search || status ? 'ลองเปลี่ยนคำค้นหาหรือสถานะ' : canManage ? 'เริ่มเพิ่มข้อมูลด้วยปุ่มด้านบน' : 'ติดต่อผู้ดูแล Organization เพื่อเพิ่มข้อมูล'}
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

    <ProductDetailSheet
      organizationId={organizationId}
      selectedProduct={selectedProduct}
      selectedSku={selectedSku}
      closeHref={closeDetailHref}
      canManage={canManage}
      canReadCost={canReadCost}
      isPending={isPending}
      openEditor={openEditor}
      requestLifecycle={requestLifecycle}
    />

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

    {editorMode ? <div className="product-modal-backdrop" role="presentation" onMouseDown={(event) => {
      if (event.target === event.currentTarget && !isPending) setEditorMode(null)
    }}>
      <section className="product-editor-dialog" role="dialog" aria-modal="true" aria-labelledby="product-editor-title">
        <header><div><div className="eyebrow">Product/SKU command</div><h2 id="product-editor-title">{editorMode === 'create-product' ? 'เพิ่ม Product' : editorMode === 'create-sku' ? 'เพิ่ม SKU' : editorMode === 'edit-product' ? 'แก้ไข Product' : 'แก้ไข SKU'}</h2></div><button className="button secondary compact" type="button" disabled={isPending} onClick={() => setEditorMode(null)}>ปิด</button></header>
        <form onSubmit={submitEditor}>
          {(editorMode === 'create-sku') ? <label className="field-stack">Product<select name="productId" required defaultValue={selectedProduct?.id ?? ''}><option value="" disabled>เลือก Product</option>{productOptions.filter((product) => product.status !== 'archived').map((product) => <option key={product.id} value={product.id}>{product.name}</option>)}</select></label> : null}
          {(editorMode === 'create-sku') ? <label className="field-stack">SKU Code<input ref={firstFieldRef} name="skuCode" required maxLength={80} autoComplete="off" placeholder="เช่น SHIRT-BLK-M" /></label> : null}
          <label className="field-stack">ชื่อ<input ref={editorMode === 'create-sku' ? undefined : firstFieldRef} name="name" required maxLength={160} defaultValue={selectedProduct?.name ?? selectedSku?.name ?? ''} /></label>
          {(editorMode === 'create-product' || editorMode === 'edit-product') ? <label className="field-stack">คำอธิบาย<textarea name="description" maxLength={2000} defaultValue={selectedProduct?.description ?? ''} /></label> : null}
          {editorMode === 'edit-sku' && selectedSku ? <div className="product-immutable-fields" role="note"><div><span>SKU Code</span><strong className="product-code">{selectedSku.skuCode}</strong></div><div><span>Base Unit</span><strong>{selectedSku.baseUnitCode}</strong></div><p>สองค่านี้เป็นรหัสอ้างอิงถาวรและแก้ไขไม่ได้</p></div> : null}
          {(editorMode === 'create-sku' || editorMode === 'edit-sku') ? <div className="form-grid-two">{editorMode === 'edit-sku' && selectedSku?.salesCode ? <div className="field-stack product-readonly-field"><span>Sales Code</span><strong className="product-code">{selectedSku.salesCode}</strong><small>บันทึกถาวรแล้ว เปลี่ยนไม่ได้</small></div> : <label className="field-stack">Sales Code<input name="salesCode" maxLength={80} defaultValue={selectedSku?.salesCode ?? ''} placeholder="รหัส CF/ขาย" /><small>ตั้งได้ครั้งเดียวก่อนบันทึก</small></label>}<label className="field-stack">Barcode<input name="barcode" maxLength={128} defaultValue={selectedSku?.barcode ?? ''} inputMode="numeric" /></label></div> : null}
          {editorMode === 'create-sku' ? <div className="form-grid-two"><label className="field-stack">Base Unit<input name="baseUnitCode" required maxLength={32} defaultValue="piece" /></label><label className="field-stack">สถานะ<select name="status" defaultValue="draft"><option value="draft">ฉบับร่าง</option><option value="active">ใช้งาน</option></select></label></div> : null}
          {feedback?.tone === 'danger' ? <div className="product-feedback danger" role="alert">{feedback.text}</div> : null}
          <footer><button className="button secondary" type="button" disabled={isPending} onClick={() => setEditorMode(null)}>ยกเลิก</button><button className="button" type="submit" disabled={isPending}>{isPending ? 'กำลังบันทึก…' : 'บันทึก'}</button></footer>
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

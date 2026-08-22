'use client'

import Image from 'next/image'
import { useCallback, useEffect, useRef, useState } from 'react'
import type { ChangeEvent, DragEvent, FormEvent, KeyboardEvent, PointerEvent as ReactPointerEvent } from 'react'
import { RAPID_BROWSER_DRAFT_VERSION, rapidBrowserDraftStorageKey, rapidReservationKey, serializeRapidBrowserDraft } from './rapid-entry-browser-draft'
import type { RapidBrowserDraft } from './rapid-entry-browser-draft'
import type { RapidRangeSelection } from './rapid-prefix-assistant'
import { RapidSelectCombobox } from './rapid-select-combobox'
import {
  executeGlobalSalesCodeCreationAction,
  executeRapidInitialStockWorkflowAction,
  loadInitialStockDestinationsAction,
} from '@/app/actions/foundation'
import { runRapidEntryImagePipeline, type RapidImageRecoveryItem } from './rapid-entry-image-pipeline'

type Props = {
  organizationId: string
  actorUserId: string
  selectedRange: RapidRangeSelection | null
  namingTemplate: string
  canManage: boolean
  reservationExpired: boolean
  assignedSalesCodes: string[]
  restoredDraft: RapidBrowserDraft | null
  onDraftRestored: () => void
  onDraftSaved: (savedAt: string, message: string) => void
  categories: Array<{ id: string; name: string }>
}
type EditableField = 'productName' | 'category' | 'price' | 'stock' | 'unit' | 'branch'
type BulkAction = 'price' | 'stock' | 'unit' | 'category' | 'branch' | 'restore-name'
type BulkTarget = 'selected' | 'all'
type RapidStatusFilter = 'attention' | 'invalid' | 'ready' | 'all'
type RapidImageDraft = { file: File; previewUrl: string }
type RapidRowDraft = { index: number; salesCode: string; productName: string; category: string; price: string; stock: string; unit: string; branch: string; selected: boolean; nameOverridden: boolean; image: RapidImageDraft | null; imageFileName: string; imageError: string; created: boolean }
type EditingCell = { rowIndex: number; field: EditableField; originalValue: string; originalNameOverridden: boolean }
type PendingBulk = { action: BulkAction; target: BulkTarget; value: string; affectedCount: number; rowIndexes: number[]; includesHiddenSelection: boolean }
type ResizableColumn = 'code' | 'image' | 'name' | 'category' | 'price' | 'stock' | 'unit' | 'branch' | 'status'
type ValidationField = EditableField | 'image'
type ValidationIssue = { rowIndex: number; salesCode: string; field: ValidationField; message: string }
type RapidExecutionSnapshot = {
  rowIndex: number
  productName: string
  category?: string
  price?: string
  stock: string
  unit: string
  branch?: string
  imageFileName?: string
}
type RapidExecutionJournal = {
  version: 1
  reservationKey: string
  commandId: string
  payload: Record<string, unknown>
  rowSnapshots: RapidExecutionSnapshot[]
  createdItems?: Array<Record<string, unknown>>
  stockWorkflowId: string
  stockIdempotencyKey: string
  activationIds?: Record<string, { product: string; sku: string }>
  imageRecovery: RapidImageRecoveryItem[]
}

const ROW_COUNT = 50
const RAPID_EXECUTION_JOURNAL_VERSION = 1
const MAX_IMAGE_BYTES = 5 * 1024 * 1024
const ALLOWED_IMAGE_TYPES = new Set(['image/jpeg', 'image/png', 'image/webp'])
const EDITABLE_FIELDS: EditableField[] = ['productName', 'category', 'price', 'stock', 'unit', 'branch']
const UNIT_OPTIONS = ['ชิ้น', 'คู่', 'ใบ', 'ขวด', 'แพ็ค', 'ชุด', 'กล่อง', 'กิโลกรัม']
const CATEGORY_OPTIONS = ['ไม่ระบุหมวดหมู่', 'ต่างหู', 'กำไล', 'กระเป๋า', 'เสื้อผ้า', 'น้ำหอม']
const BRANCH_OPTIONS = ['BKK-01']
const UNIT_CODE: Record<string, string> = { 'ชิ้น': 'piece', 'คู่': 'pair', 'ใบ': 'item', 'ขวด': 'bottle', 'แพ็ค': 'pack', 'ชุด': 'set', 'กล่อง': 'box', 'กิโลกรัม': 'kg' }
const COLUMN_CONFIG: Record<ResizableColumn, { label: string; width: number; min: number; max: number }> = {
  code: { label: 'รหัสขาย', width: 130, min: 90, max: 260 },
  image: { label: 'รูปภาพ', width: 78, min: 64, max: 160 },
  name: { label: 'ชื่อสินค้า', width: 260, min: 140, max: 520 },
  category: { label: 'หมวดหมู่', width: 150, min: 110, max: 280 },
  price: { label: 'ราคาขาย', width: 120, min: 90, max: 220 },
  stock: { label: 'สต็อกเริ่มต้น', width: 130, min: 100, max: 240 },
  unit: { label: 'หน่วย', width: 130, min: 90, max: 220 },
  branch: { label: 'สาขา', width: 150, min: 100, max: 280 },
  status: { label: 'สถานะ', width: 100, min: 88, max: 180 },
}

function rapidExecutionJournalKey(organizationId: string, actorUserId: string) {
  return `avenzo:rapid-entry:execution:${organizationId}:${actorUserId}`
}

function codeFor(range: RapidRangeSelection, offset: number) {
  return `${range.prefix}${String(range.start + offset).padStart(3, '0')}`
}

function productNameFor(template: string, code: string) {
  return template.replaceAll('{code}', code).replaceAll('{campaign}', 'PayDay').replaceAll('{date}', '21-08-2026')
    .replaceAll('{branch}', 'BKK-01').replaceAll('{seller}', 'แม่ค้า A').replace(/\s+/g, ' ').trim()
}

function draftRows(range: RapidRangeSelection, namingTemplate: string, assignedSalesCodes: ReadonlySet<string>): RapidRowDraft[] {
  return Array.from({ length: ROW_COUNT }, (_, index) => {
    const salesCode = codeFor(range, index)
    return { index, salesCode, productName: productNameFor(namingTemplate, salesCode), category: 'ไม่ระบุหมวดหมู่', price: '', stock: '', unit: 'ชิ้น', branch: 'BKK-01', selected: false, nameOverridden: false, image: null, imageFileName: '', imageError: '', created: assignedSalesCodes.has(salesCode) }
  })
}

function errorFor(row: RapidRowDraft, field: EditableField, categoryOptions = CATEGORY_OPTIONS) {
  if (field === 'productName') {
    if (!row.productName.trim()) return 'กรุณากรอกชื่อสินค้า'
    if (row.productName.length > 120) return 'ชื่อสินค้าไม่เกิน 120 ตัวอักษร'
    return ''
  }
  if (field === 'price') {
    if (!row.price) return ''
    return /^\d+(\.\d{0,2})?$/.test(row.price) && Number(row.price) >= 0 ? '' : 'ราคาไม่ถูกต้อง'
  }
  if (field === 'stock') {
    if (!row.stock) return ''
    return /^\d+$/.test(row.stock) && Number(row.stock) <= 999999 ? '' : 'จำนวนต้องเป็น 0–999,999'
  }
  if (field === 'unit') return UNIT_OPTIONS.includes(row.unit) ? '' : 'กรุณาเลือกหน่วยที่กำหนด'
  if (field === 'category') return categoryOptions.includes(row.category) ? '' : 'กรุณาเลือกหมวดหมู่ที่กำหนด'
  return BRANCH_OPTIONS.includes(row.branch) ? '' : 'ไม่มีสิทธิ์ใช้สาขานี้'
}

function rowHasEntry(row: RapidRowDraft) {
  return Boolean(row.price || row.stock || row.image || row.imageError || row.nameOverridden
    || row.category !== 'ไม่ระบุหมวดหมู่' || row.unit !== 'ชิ้น' || row.branch !== 'BKK-01')
}

function fieldErrorFor(row: RapidRowDraft, field: EditableField, categoryOptions = CATEGORY_OPTIONS) {
  const formatError = errorFor(row, field, categoryOptions)
  if (formatError) return formatError
  if (!rowHasEntry(row)) return ''
  if (field === 'price' && !row.price) return 'กรุณากรอกราคาขาย'
  if (field === 'stock' && !row.stock) return 'กรุณากรอกสต็อกเริ่มต้น'
  return ''
}

function validationIssuesFor(row: RapidRowDraft, categoryOptions = CATEGORY_OPTIONS): ValidationIssue[] {
  if (!rowHasEntry(row)) return []
  const issues: ValidationIssue[] = EDITABLE_FIELDS.flatMap((field): ValidationIssue[] => {
    const message = fieldErrorFor(row, field, categoryOptions)
    return message ? [{ rowIndex: row.index, salesCode: row.salesCode, field, message }] : []
  })
  if (row.imageError) issues.push({ rowIndex: row.index, salesCode: row.salesCode, field: 'image', message: row.imageError })
  return issues
}

function rowIsReady(row: RapidRowDraft, categoryOptions = CATEGORY_OPTIONS) {
  return rowHasEntry(row) && validationIssuesFor(row, categoryOptions).length === 0
}

function rowState(row: RapidRowDraft, isEditing: boolean, categoryOptions = CATEGORY_OPTIONS) {
  if (row.created) return { label: 'สร้างแล้ว', className: 'is-created' }
  if (!rowHasEntry(row)) return { label: 'ยังไม่กรอก', className: 'is-empty' }
  if (validationIssuesFor(row, categoryOptions).length) return { label: 'ต้องแก้ไข', className: 'is-invalid' }
  if (isEditing) return { label: 'กำลังแก้ไข', className: 'is-editing' }
  if (row.selected) return { label: 'เลือกพร้อมสร้าง', className: 'is-selected-ready' }
  return { label: 'พร้อมสร้าง', className: 'is-ready' }
}

function fieldLabel(field: EditableField) {
  if (field === 'productName') return 'ชื่อสินค้า'
  if (field === 'price') return 'ราคาขาย'
  if (field === 'stock') return 'สต็อกเริ่มต้น'
  if (field === 'unit') return 'หน่วย'
  if (field === 'category') return 'หมวดหมู่'
  return 'สาขา'
}

function ImagePlaceholderIcon() {
  return <svg viewBox="0 0 24 24" aria-hidden="true"><rect x="3" y="4" width="18" height="16" rx="2" /><circle cx="9" cy="10" r="2" /><path d="m5 18 5-5 3 3 2-2 4 4" /></svg>
}

function ReplaceImageIcon() {
  return <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 7h4l1.5-2h5L16 7h4v11H4z" /><circle cx="12" cy="12.5" r="3" /></svg>
}

function RemoveImageIcon() {
  return <svg viewBox="0 0 24 24" aria-hidden="true"><path d="m7 7 10 10M17 7 7 17" /></svg>
}

function SelectAllIcon() {
  return <svg viewBox="0 0 24 24" aria-hidden="true"><rect x="4" y="4" width="16" height="16" rx="3" /><path d="m8 12 2.5 2.5L16 9" /></svg>
}

function ClearSelectionIcon() {
  return <svg viewBox="0 0 24 24" aria-hidden="true"><rect x="4" y="4" width="16" height="16" rx="3" /><path d="m9 9 6 6m0-6-6 6" /></svg>
}

function UndoIcon() {
  return <svg viewBox="0 0 24 24" aria-hidden="true"><path d="m9 7-5 5 5 5" /><path d="M5 12h8a6 6 0 0 1 6 6" /></svg>
}

function ReadyPlacementIcon({ direction }: { direction: 'up' | 'down' }) {
  return direction === 'up'
    ? <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 19V5M7 10l5-5 5 5" /></svg>
    : <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 5v14m-5-5 5 5 5-5" /></svg>
}

export function RapidEntryTable({ organizationId, actorUserId, selectedRange, namingTemplate, canManage, reservationExpired, assignedSalesCodes, restoredDraft, onDraftRestored, onDraftSaved, categories }: Props) {
  const [rows, setRows] = useState<RapidRowDraft[]>([])
  const [editingCell, setEditingCell] = useState<EditingCell | null>(null)
  const [bulkAction, setBulkAction] = useState<BulkAction>('price')
  const [bulkValue, setBulkValue] = useState('')
  const [bulkTarget, setBulkTarget] = useState<BulkTarget>('selected')
  const [includeHiddenSelected, setIncludeHiddenSelected] = useState(false)
  const [statusFilter, setStatusFilter] = useState<RapidStatusFilter>('attention')
  const [readyRowsAtBottom, setReadyRowsAtBottom] = useState(true)
  const [rowOrderNotice, setRowOrderNotice] = useState('')
  const [pendingBulk, setPendingBulk] = useState<PendingBulk | null>(null)
  const [undoSnapshot, setUndoSnapshot] = useState<RapidRowDraft[] | null>(null)
  const [bulkNotice, setBulkNotice] = useState('')
  const [bulkNoticeTone, setBulkNoticeTone] = useState<'success' | 'error'>('success')
  const [categoryOptions, setCategoryOptions] = useState(CATEGORY_OPTIONS)
  const [categoryManagerOpen, setCategoryManagerOpen] = useState(false)
  const [newCategoryName, setNewCategoryName] = useState('')
  const [categoryManagerNotice, setCategoryManagerNotice] = useState('')
  const [dragImageRow, setDragImageRow] = useState<number | null>(null)
  const [reviewOpen, setReviewOpen] = useState(false)
  const [validationNotice, setValidationNotice] = useState<{ tone: 'success' | 'error' | 'info'; message: string } | null>(null)
  const [columnWidths, setColumnWidths] = useState<Record<ResizableColumn, number>>(() => Object.fromEntries(
    Object.entries(COLUMN_CONFIG).map(([key, config]) => [key, config.width]),
  ) as Record<ResizableColumn, number>)
  const activeInputRef = useRef<HTMLInputElement | null>(null)
  const imageObjectUrlsRef = useRef(new Set<string>())
  const rangeIdentityRef = useRef('')
  const restoredReservationRef = useRef('')
  const readyCodesRef = useRef<Set<string> | null>(null)
  const [draftHydrated, setDraftHydrated] = useState(false)
  const [creationStage, setCreationStage] = useState<'idle' | 'creating' | 'images' | 'stock' | 'success' | 'error'>('idle')
  const [creationMessage, setCreationMessage] = useState('')
  const [imageRecovery, setImageRecovery] = useState<RapidImageRecoveryItem[]>([])
  const executionRef = useRef<{
    commandId: string
    payload: Record<string, unknown>
    reservationKey: string
    rowSnapshots: RapidExecutionSnapshot[]
    createdItems?: Array<Record<string, unknown>>
    stockWorkflowId: string
    stockIdempotencyKey: string
    activationIds?: Record<string, { product: string; sku: string }>
  } | null>(null)

  const persistExecutionJournal = useCallback((execution = executionRef.current, recovery = imageRecovery) => {
    if (!execution) return
    const journal: RapidExecutionJournal = {
      version: RAPID_EXECUTION_JOURNAL_VERSION,
      reservationKey: execution.reservationKey,
      commandId: execution.commandId,
      payload: execution.payload,
      rowSnapshots: execution.rowSnapshots,
      createdItems: execution.createdItems,
      stockWorkflowId: execution.stockWorkflowId,
      stockIdempotencyKey: execution.stockIdempotencyKey,
      activationIds: execution.activationIds,
      imageRecovery: recovery,
    }
    window.localStorage.setItem(rapidExecutionJournalKey(organizationId, actorUserId), JSON.stringify(journal))
  }, [actorUserId, imageRecovery, organizationId])

  const persistBrowserDraft = useCallback((notify = true) => {
    if (!draftHydrated || !selectedRange || rows.length !== ROW_COUNT) return false
    const savedAt = new Date().toISOString()
    const draft: RapidBrowserDraft = {
      version: RAPID_BROWSER_DRAFT_VERSION,
      organizationId,
      actorUserId,
      reservationKey: rapidReservationKey(selectedRange),
      savedAt,
      range: selectedRange,
      namingTemplate,
      rows: rows.map((row) => ({
        index: row.index,
        salesCode: row.salesCode,
        productName: row.productName,
        category: row.category,
        price: row.price,
        stock: row.stock,
        unit: row.unit,
        branch: row.branch,
        selected: row.selected,
        nameOverridden: row.nameOverridden,
        imageFileName: (row.image?.file.name ?? row.imageFileName).slice(0, 160),
        created: row.created,
      })),
      categoryOptions,
      columnWidths,
    }
    const serialized = serializeRapidBrowserDraft(draft)
    if (!serialized.ok) {
      if (notify) onDraftSaved(savedAt, `Browser Draft มีขนาด ${Math.ceil(serialized.bytes / 1024)} KB ซึ่งเกินขีดจำกัด 256 KB จึงยังไม่บันทึก`)
      return false
    }
    try {
      window.localStorage.setItem(rapidBrowserDraftStorageKey(organizationId, actorUserId), serialized.value)
      if (notify) {
        const imageCount = rows.filter((row) => row.image).length
        onDraftSaved(savedAt, imageCount
          ? `บันทึกข้อมูลตารางแล้ว · ไฟล์ภาพ ${imageCount} รายการจะไม่ถูกเก็บใน Browser และต้องเลือกใหม่หลัง F5`
          : `บันทึกข้อมูลตารางอัตโนมัติแล้ว ${rows.length} แถว · ${Math.ceil(serialized.bytes / 1024)} KB`)
      }
      return true
    } catch {
      if (notify) onDraftSaved(savedAt, 'Browser ไม่อนุญาตให้บันทึก Draft กรุณาอย่าปิดหรือรีเฟรชหน้านี้')
      return false
    }
  }, [actorUserId, categoryOptions, columnWidths, draftHydrated, namingTemplate, onDraftSaved, organizationId, rows, selectedRange])

  useEffect(() => {
    if (!bulkNotice || bulkNoticeTone !== 'success') return
    const timeout = window.setTimeout(() => setBulkNotice(''), 5000)
    return () => window.clearTimeout(timeout)
  }, [bulkNotice, bulkNoticeTone])

  useEffect(() => {
    if (!rowOrderNotice) return
    const timeout = window.setTimeout(() => setRowOrderNotice(''), 7000)
    return () => window.clearTimeout(timeout)
  }, [rowOrderNotice])

  function revokeImageUrl(url: string) {
    if (!imageObjectUrlsRef.current.has(url)) return
    URL.revokeObjectURL(url)
    imageObjectUrlsRef.current.delete(url)
  }

  function revokeAllImageUrls() {
    imageObjectUrlsRef.current.forEach((url) => URL.revokeObjectURL(url))
    imageObjectUrlsRef.current.clear()
  }

  useEffect(() => {
    const rangeIdentity = selectedRange ? `${selectedRange.prefix}:${selectedRange.start}:${selectedRange.end}` : ''
    if (!selectedRange) {
      if (rangeIdentityRef.current) revokeAllImageUrls()
      rangeIdentityRef.current = ''
      setRows([])
      setEditingCell(null)
      setReviewOpen(false)
      setValidationNotice(null)
      setDraftHydrated(false)
      readyCodesRef.current = null
      return
    }
    const assignedCodeSet = new Set(assignedSalesCodes)
    const generated = draftRows(selectedRange, namingTemplate, assignedCodeSet)
    if (rangeIdentityRef.current !== rangeIdentity) {
      revokeAllImageUrls()
      rangeIdentityRef.current = rangeIdentity
      const canRestore = restoredDraft && restoredDraft.reservationKey === rangeIdentity && restoredReservationRef.current !== rangeIdentity
      if (canRestore) {
        restoredReservationRef.current = rangeIdentity
        setRows(restoredDraft.rows.map((row) => {
          const created = Boolean(row.created || assignedCodeSet.has(row.salesCode))
          return {
            ...row,
            created,
            selected: Boolean(row.selected && !created),
            image: null,
            imageFileName: created ? '' : row.imageFileName,
            imageError: !created && row.imageFileName ? `กรุณาเลือกภาพ “${row.imageFileName}” ใหม่หลัง F5` : '',
          }
        }))
        setCategoryOptions(Array.from(new Set([...CATEGORY_OPTIONS, ...restoredDraft.categoryOptions])))
        setColumnWidths((current) => Object.fromEntries(Object.entries(current).map(([column, width]) => {
          const config = COLUMN_CONFIG[column as ResizableColumn]
          const restoredWidth = Number(restoredDraft.columnWidths[column])
          return [column, Number.isFinite(restoredWidth) ? Math.min(config.max, Math.max(config.min, restoredWidth)) : width]
        })) as Record<ResizableColumn, number>)
        onDraftRestored()
      } else setRows(generated)
      setEditingCell(null)
      setReviewOpen(false)
      setValidationNotice(null)
      setDraftHydrated(true)
      readyCodesRef.current = null
      return
    }
    setRows((current) => current.map((row, index) => ({
      ...row,
      category: row.category || 'ไม่ระบุหมวดหมู่',
      ...(!row.nameOverridden ? { productName: generated[index].productName } : {}),
    })))
  }, [assignedSalesCodes, selectedRange, namingTemplate, restoredDraft, onDraftRestored])

  useEffect(() => {
    if (!selectedRange?.reservationBatchId) return
    const journalKey = rapidExecutionJournalKey(organizationId, actorUserId)
    const clearStaleDuplicateAttempt = (execution: Pick<RapidExecutionJournal, 'createdItems' | 'rowSnapshots'>) => {
      const staleDuplicateAttempt = !execution.createdItems?.length
        && execution.rowSnapshots.length > 0
        && execution.rowSnapshots.every((snapshot) => rows[snapshot.rowIndex]?.created)
      if (!staleDuplicateAttempt) return false
      window.localStorage.removeItem(journalKey)
      executionRef.current = null
      setImageRecovery([])
      setCreationStage('idle')
      setCreationMessage('')
      setValidationNotice(null)
      return true
    }
    if (executionRef.current) {
      clearStaleDuplicateAttempt(executionRef.current)
      return
    }
    try {
      const raw = window.localStorage.getItem(journalKey)
      if (!raw) return
      const journal = JSON.parse(raw) as Partial<RapidExecutionJournal>
      if (journal.version !== RAPID_EXECUTION_JOURNAL_VERSION
        || journal.reservationKey !== rapidReservationKey(selectedRange)
        || typeof journal.commandId !== 'string'
        || typeof journal.stockWorkflowId !== 'string'
        || typeof journal.stockIdempotencyKey !== 'string'
        || !journal.payload || !Array.isArray(journal.rowSnapshots)) return
      if (clearStaleDuplicateAttempt(journal as RapidExecutionJournal)) return
      executionRef.current = {
        reservationKey: journal.reservationKey,
        commandId: journal.commandId,
        payload: journal.payload,
        rowSnapshots: journal.rowSnapshots,
        createdItems: Array.isArray(journal.createdItems) ? journal.createdItems : undefined,
        stockWorkflowId: journal.stockWorkflowId,
        stockIdempotencyKey: journal.stockIdempotencyKey,
        activationIds: journal.activationIds,
      }
      const creationItems = Array.isArray((journal.payload as { creation_items?: unknown[] }).creation_items)
        ? (journal.payload as { creation_items: Array<Record<string, unknown>> }).creation_items
        : []
      const categoryNameById = new Map(categories.map((category) => [category.id, category.name]))
      setRows((current) => current.map((row) => {
        const snapshot = journal.rowSnapshots!.find((item) => item.rowIndex === row.index)
        if (!snapshot) return row
        const clientRowId = `rapid-row-${String(row.index + 1).padStart(3, '0')}`
        const creationItem = creationItems.find((item) => item.client_row_id === clientRowId)
        const itemPayload = creationItem?.payload && typeof creationItem.payload === 'object' && !Array.isArray(creationItem.payload)
          ? creationItem.payload as Record<string, unknown>
          : {}
        const imageFileName = snapshot.imageFileName ?? row.imageFileName
        return {
          ...row,
          productName: snapshot.productName,
          category: snapshot.category ?? categoryNameById.get(String(itemPayload.category_id ?? '')) ?? 'ไม่ระบุหมวดหมู่',
          price: snapshot.price ?? String(itemPayload.sale_price ?? row.price),
          stock: snapshot.stock,
          unit: snapshot.unit,
          branch: snapshot.branch ?? row.branch,
          selected: true,
          nameOverridden: snapshot.productName !== productNameFor(namingTemplate, row.salesCode),
          imageFileName,
          imageError: imageFileName ? `กรุณาเลือกภาพ “${imageFileName}” ใหม่หลัง F5` : '',
        }
      }))
      const recoveredImages = Array.isArray(journal.imageRecovery) ? journal.imageRecovery : []
      setImageRecovery(recoveredImages)
      setCreationStage('error')
      setCreationMessage(journal.createdItems?.length
        ? 'พบงานสร้างที่ยังไม่จบ ข้อมูลสินค้าเดิมถูกเก็บไว้แล้ว เลือกภาพที่ค้างอีกครั้งแล้วกด “ลองอีกครั้ง”'
        : 'พบงานสร้างที่ยังไม่จบ กด “ลองอีกครั้ง” เพื่อใช้ Command เดิมโดยไม่สร้างรายการซ้ำ')
    } catch {
      window.localStorage.removeItem(journalKey)
    }
  }, [actorUserId, categories, namingTemplate, organizationId, rows, selectedRange])

  useEffect(() => {
    if (!draftHydrated || !selectedRange || rows.length !== ROW_COUNT) return
    const saveTimer = window.setTimeout(() => persistBrowserDraft(), 400)
    return () => window.clearTimeout(saveTimer)
  }, [draftHydrated, persistBrowserDraft, rows.length, selectedRange])

  useEffect(() => {
    if (!draftHydrated || !selectedRange || rows.length !== ROW_COUNT) return
    const saveBeforeLeave = () => { persistBrowserDraft(false) }
    const saveWhenHidden = () => {
      if (document.visibilityState === 'hidden') saveBeforeLeave()
    }
    window.addEventListener('pagehide', saveBeforeLeave)
    document.addEventListener('visibilitychange', saveWhenHidden)
    return () => {
      window.removeEventListener('pagehide', saveBeforeLeave)
      document.removeEventListener('visibilitychange', saveWhenHidden)
    }
  }, [draftHydrated, persistBrowserDraft, rows.length, selectedRange])

  useEffect(() => () => revokeAllImageUrls(), [])

  useEffect(() => {
    if (!draftHydrated || rows.length !== ROW_COUNT) return
    const currentReadyCodes = new Set(rows.filter((row) => rowIsReady(row, categoryOptions)).map((row) => row.salesCode))
    if (readyCodesRef.current === null) {
      readyCodesRef.current = currentReadyCodes
      return
    }
    const newlyReadyCodes = [...currentReadyCodes].filter((code) => !readyCodesRef.current?.has(code))
    readyCodesRef.current = currentReadyCodes
    if (!readyRowsAtBottom || !newlyReadyCodes.length) return
    const subject = newlyReadyCodes.length === 1 ? newlyReadyCodes[0] : `${newlyReadyCodes.length} รายการ`
    setRowOrderNotice(`${subject} พร้อมสร้างแล้ว — ย้ายออกจากงานที่ต้องทำและไว้ท้ายมุมมองทั้งหมด`)
  }, [categoryOptions, draftHydrated, readyRowsAtBottom, rows])

  useEffect(() => {
    if (!editingCell) return
    activeInputRef.current?.focus()
    activeInputRef.current?.select()
  }, [editingCell])

  function beginEditing(rowIndex: number, field: EditableField) {
    const row = rows[rowIndex]
    if (row && !row.created) setEditingCell({ rowIndex, field, originalValue: row[field] ?? '', originalNameOverridden: row.nameOverridden })
  }

  function updateCell(rowIndex: number, field: EditableField, event: ChangeEvent<HTMLInputElement>) {
    const maxLength = field === 'productName' ? 120 : field === 'price' ? 12 : field === 'stock' ? 6 : 24
    const value = event.target.value.replace(/[\r\n\t]/g, field === 'productName' ? ' ' : '').slice(0, maxLength)
    setRows((current) => current.map((row, index) => index === rowIndex
      ? { ...row, [field]: value, ...(field === 'productName' ? { nameOverridden: true } : {}) }
      : row))
  }

  function imageValidationError(file: File) {
    if (!ALLOWED_IMAGE_TYPES.has(file.type)) return 'รองรับเฉพาะ JPEG, PNG หรือ WebP'
    if (file.size <= 0) return 'ไฟล์ภาพว่างเปล่า กรุณาเลือกไฟล์ใหม่'
    if (file.size > MAX_IMAGE_BYTES) return 'รูปภาพต้องมีขนาดไม่เกิน 5 MB'
    return ''
  }

  function setRowImage(rowIndex: number, file: File | undefined) {
    if (!file || !canManage || rows[rowIndex]?.created) return
    const validationError = imageValidationError(file)
    if (validationError) {
      setRows((current) => current.map((row, index) => index === rowIndex ? { ...row, imageError: validationError } : row))
      return
    }
    const previewUrl = URL.createObjectURL(file)
    imageObjectUrlsRef.current.add(previewUrl)
    setRows((current) => current.map((row, index) => {
      if (index !== rowIndex) return row
      if (row.image) revokeImageUrl(row.image.previewUrl)
      return { ...row, image: { file, previewUrl }, imageFileName: file.name.slice(0, 160), imageError: '' }
    }))
  }

  function removeRowImage(rowIndex: number) {
    if (!canManage) return
    setRows((current) => current.map((row, index) => {
      if (index !== rowIndex) return row
      if (row.image) revokeImageUrl(row.image.previewUrl)
      return { ...row, image: null, imageFileName: '', imageError: '' }
    }))
  }

  function dropRowImage(event: DragEvent<HTMLDivElement>, rowIndex: number) {
    event.preventDefault()
    setDragImageRow(null)
    setRowImage(rowIndex, event.dataTransfer.files[0])
  }

  function handleRowImageChange(event: ChangeEvent<HTMLInputElement>, rowIndex: number) {
    const input = event.currentTarget
    setRowImage(rowIndex, input.files?.[0])
    input.value = ''
    input.blur()
    requestAnimationFrame(() => document.getElementById(`rapid-cell-productName-${rowIndex}`)?.focus())
  }

  function imageCell(row: RapidRowDraft) {
    if (row.created) return <div className="live-sale-rapid-image-cell is-created" aria-label={`รูปภาพรหัส ${row.salesCode} บันทึกแล้ว`}><span aria-hidden="true">✓</span></div>
    const input = <input type="file" accept="image/jpeg,image/png,image/webp" disabled={!canManage} aria-label={`เลือกภาพปกรหัส ${row.salesCode}`}
      onChange={(event) => handleRowImageChange(event, row.index)} />
    return <div id={`rapid-image-${row.index}`} tabIndex={row.imageError ? 0 : -1} className={`live-sale-rapid-image-cell${dragImageRow === row.index ? ' is-dragging' : ''}${row.imageError ? ' is-invalid' : ''}`}
      onDragEnter={(event) => { event.preventDefault(); if (canManage) setDragImageRow(row.index) }}
      onDragOver={(event) => { event.preventDefault(); if (canManage) event.dataTransfer.dropEffect = 'copy' }}
      onDragLeave={(event) => { if (!event.currentTarget.contains(event.relatedTarget as Node | null)) setDragImageRow(null) }}
      onDrop={(event) => dropRowImage(event, row.index)}>
      {row.image ? <>
        <label className="live-sale-rapid-image-preview-trigger" data-tooltip="เปลี่ยนภาพ" aria-label={`เปลี่ยนภาพรหัส ${row.salesCode}`}>
          <Image className="live-sale-rapid-image-preview" src={row.image.previewUrl} alt={`ภาพปก ${row.productName}`} width={72} height={72} sizes="40px" unoptimized />{input}
        </label>
        <div className="live-sale-rapid-image-actions">
          <label className="live-sale-rapid-image-action" data-tooltip="เปลี่ยนภาพ" aria-label={`เปลี่ยนภาพรหัส ${row.salesCode}`}><ReplaceImageIcon />{input}</label>
          <button className="live-sale-rapid-image-action" type="button" data-tooltip="นำภาพออก" aria-label={`นำภาพรหัส ${row.salesCode} ออก`} onClick={() => removeRowImage(row.index)}><RemoveImageIcon /></button>
        </div>
      </> : <label className="live-sale-rapid-image-placeholder" data-tooltip="เพิ่มภาพ" aria-label={`เพิ่มภาพรหัส ${row.salesCode}`}><ImagePlaceholderIcon />{input}</label>}
      {row.imageError ? <span className="live-sale-rapid-image-error" role="alert" data-tooltip={row.imageError} aria-label={row.imageError}>!</span> : null}
    </div>
  }

  function cancelEditing() {
    if (!editingCell) return
    setRows((current) => current.map((row, index) => index === editingCell.rowIndex
      ? { ...row, [editingCell.field]: editingCell.originalValue, nameOverridden: editingCell.originalNameOverridden }
      : row))
    setEditingCell(null)
  }

  function moveEditing(rowIndex: number, field: EditableField, direction: 'down' | 'next' | 'previous') {
    let targetRow = rowIndex
    let targetField = field
    if (direction === 'down') targetRow += 1
    else {
      const currentPosition = rowIndex * EDITABLE_FIELDS.length + EDITABLE_FIELDS.indexOf(field)
      const targetPosition = currentPosition + (direction === 'next' ? 1 : -1)
      if (targetPosition < 0 || targetPosition >= rows.length * EDITABLE_FIELDS.length) { setEditingCell(null); return }
      targetRow = Math.floor(targetPosition / EDITABLE_FIELDS.length)
      targetField = EDITABLE_FIELDS[targetPosition % EDITABLE_FIELDS.length]
    }
    if (targetRow >= rows.length) { setEditingCell(null); return }
    beginEditing(targetRow, targetField)
  }

  function handleEditorKey(event: KeyboardEvent<HTMLInputElement>, rowIndex: number, field: EditableField) {
    if (event.key === 'Escape') { event.preventDefault(); cancelEditing(); return }
    if (event.key === 'Enter') { event.preventDefault(); moveEditing(rowIndex, field, 'down'); return }
    if (event.key === 'Tab') { event.preventDefault(); moveEditing(rowIndex, field, event.shiftKey ? 'previous' : 'next') }
  }

  function editableCell(row: RapidRowDraft, field: EditableField) {
    const isEditing = editingCell?.rowIndex === row.index && editingCell.field === field
    const error = fieldErrorFor(row, field, categoryOptions)
    const value = row[field] ?? ''
    const errorId = `rapid-${field}-${row.index}-error`
    if (isEditing) return <div className={`live-sale-rapid-editor${error ? ' is-invalid' : ''}`}>
      <input id={`rapid-cell-${field}-${row.index}`} ref={activeInputRef} value={value} onChange={(event) => updateCell(row.index, field, event)}
        onKeyDown={(event) => handleEditorKey(event, row.index, field)}
        onBlur={() => setEditingCell((current) => current?.rowIndex === row.index && current.field === field ? null : current)}
        inputMode={field === 'price' || field === 'stock' ? 'decimal' : 'text'}
        list={field === 'unit' ? 'rapidUnitOptions' : field === 'category' ? 'rapidCategoryOptions' : field === 'branch' ? 'rapidBranchOptions' : undefined}
        disabled={!canManage} maxLength={field === 'productName' ? 120 : field === 'price' ? 12 : field === 'stock' ? 6 : 24}
        aria-label={`${fieldLabel(field)} รหัส ${row.salesCode}`} aria-invalid={Boolean(error)} aria-describedby={error ? errorId : undefined} />
      {error && <small id={errorId}>{error}</small>}
    </div>

    return <button id={`rapid-cell-${field}-${row.index}`} className={`live-sale-rapid-editable-cell${error ? ' is-invalid' : ''}`} type="button"
      onClick={() => beginEditing(row.index, field)} aria-label={`แก้ไข${fieldLabel(field)} รหัส ${row.salesCode}`}>
      <span title={value}>{value || 'คลิกเพื่อกรอก'}</span>
      {field === 'productName' && row.nameOverridden && <small>แก้ไขเฉพาะรายการ</small>}
      {error && <small id={errorId}>{error}</small>}
    </button>
  }

  function toggleRow(rowIndex: number, selected: boolean) {
    setRows((current) => current.map((row, index) => index === rowIndex && !row.created ? { ...row, selected } : row))
  }

  function toggleAll(selected: boolean) {
    setRows((current) => current.map((row) => ({ ...row, selected: row.created ? false : selected })))
  }

  function changeStatusFilter(filter: RapidStatusFilter) {
    setStatusFilter(filter)
    setIncludeHiddenSelected(false)
  }

  function clearHiddenSelection() {
    setRows((current) => current.map((row) => visibleRowIndexes.has(row.index) ? row : { ...row, selected: false }))
    setIncludeHiddenSelected(false)
    setBulkNoticeTone('success')
    setBulkNotice(`ล้างรายการที่เลือกจากสถานะอื่นแล้ว ${hiddenSelectedRows.length} รายการ`)
  }

  function focusValidationIssue(issue: ValidationIssue) {
    setReviewOpen(false)
    const cellId = issue.field === 'image' ? `rapid-image-${issue.rowIndex}` : `rapid-cell-${issue.field}-${issue.rowIndex}`
    if (issue.field !== 'image') beginEditing(issue.rowIndex, issue.field)
    requestAnimationFrame(() => {
      const element = document.getElementById(cellId)
      element?.scrollIntoView({ block: 'center', inline: 'center', behavior: 'smooth' })
      element?.focus({ preventScroll: true })
    })
  }

  function selectReadyRows() {
    const readyRows = rows.filter((row) => !row.created && rowIsReady(row, categoryOptions))
    setRows((current) => current.map((row) => ({ ...row, selected: !row.created && rowIsReady(row, categoryOptions) })))
    setValidationNotice({ tone: 'success', message: `เลือกเฉพาะรายการที่พร้อมสร้างแล้ว ${readyRows.length} รายการ` })
  }

  function reviewSelectedRows() {
    if (reservationExpired) {
      setValidationNotice({ tone: 'error', message: 'ช่วงรหัสหมดอายุแล้ว ข้อมูลยังอยู่ครบ กรุณาล้าง Draft และจองช่วงรหัสใหม่ก่อนสร้างสินค้า' })
      return
    }
    const selectedRows = rows.filter((row) => row.selected && !row.created)
    if (!selectedRows.length) {
      setValidationNotice({ tone: 'error', message: 'กรุณาเลือกรายการที่ต้องการตรวจสอบอย่างน้อย 1 รายการ' })
      return
    }
    const selectedWithEntry = selectedRows.filter(rowHasEntry)
    const issues = selectedWithEntry.flatMap((row) => validationIssuesFor(row, categoryOptions))
    if (issues.length) {
      setValidationNotice({ tone: 'error', message: `พบข้อมูลที่ต้องแก้ ${issues.length} จุดในรายการที่เลือก` })
      focusValidationIssue(issues[0])
      return
    }
    const readySelected = selectedWithEntry.filter((row) => rowIsReady(row, categoryOptions))
    if (!readySelected.length) {
      setValidationNotice({ tone: 'info', message: 'รายการที่เลือกยังเป็นแถวว่าง จึงยังไม่มีรายการสำหรับตรวจสอบ' })
      return
    }
    setValidationNotice(null)
    setReviewOpen(true)
  }

  async function submitSelectedRows() {
    if (!selectedRange?.reservationBatchId || reservationExpired || creationStage === 'creating' || creationStage === 'images' || creationStage === 'stock') return
    const pendingExecution = executionRef.current
    const submissionRows = pendingExecution
      ? pendingExecution.rowSnapshots.map((snapshot) => rows[snapshot.rowIndex]).filter((row): row is RapidRowDraft => Boolean(row))
       : rows.filter((row) => row.selected && !row.created && rowIsReady(row, categoryOptions))
    if (!submissionRows.length) {
      setReviewOpen(false)
      setValidationNotice({ tone: 'error', message: 'ไม่มีรายการที่พร้อมสร้าง กรุณาตรวจข้อมูลและเลือกรายการก่อน' })
      return
    }
    const missingRecoveryImage = pendingExecution && submissionRows.find((row) => row.imageError && !row.image
      && !imageRecovery.some((item) => item.clientRowId === `rapid-row-${String(row.index + 1).padStart(3, '0')}` && item.stage === 'ready'))
    if (missingRecoveryImage) {
      setReviewOpen(false)
      setCreationStage('error')
      setCreationMessage(`กรุณาเลือกภาพของ ${missingRecoveryImage.salesCode} ใหม่ก่อนลองอีกครั้ง`)
      return
    }
    const defaultCategory = categories[0]
    if (!defaultCategory) {
      setReviewOpen(false)
      setValidationNotice({ tone: 'error', message: 'ยังไม่มีหมวดหมู่สินค้าที่พร้อมใช้งาน กรุณาสร้างหมวดหมู่ก่อนส่งสร้างสินค้า' })
      return
    }
    const categoryByName = new Map(categories.map((category) => [category.name, category.id]))
    const unresolvedCategory = submissionRows.find((row) => row.category !== 'ไม่ระบุหมวดหมู่' && !categoryByName.has(row.category))
    if (unresolvedCategory) {
      setReviewOpen(false)
      setValidationNotice({ tone: 'error', message: `หมวดหมู่ “${unresolvedCategory.category}” ยังไม่ได้บันทึกใน Master Data` })
      return
    }

    const destinations = await loadInitialStockDestinationsAction({ organizationId })
    if (!destinations.ok) {
      setReviewOpen(false)
      setValidationNotice({ tone: 'error', message: 'ตรวจสอบสาขา คลัง และตำแหน่งรับสต็อกไม่สำเร็จ กรุณาลองอีกครั้ง' })
      return
    }
    const firstBranchCode = submissionRows[0].branch
    if (submissionRows.some((row) => row.branch !== firstBranchCode)) {
      setReviewOpen(false)
      setValidationNotice({ tone: 'error', message: 'รายการที่สร้างพร้อมกันต้องอยู่ในสาขาเดียวกัน' })
      return
    }
    const warehouse = destinations.data.warehouses.find((item) => item.code === firstBranchCode)
    const location = warehouse && (destinations.data.locations.find((item) => item.warehouseId === warehouse.id && item.isDefault)
      ?? destinations.data.locations.find((item) => item.warehouseId === warehouse.id))
    if (!warehouse || !location) {
      setReviewOpen(false)
      setValidationNotice({ tone: 'error', message: `ยังไม่พบคลังและตำแหน่งรับสต็อกที่พร้อมใช้งานสำหรับสาขา ${firstBranchCode}` })
      return
    }

    // Flush the latest edited rows before the first write. The regular
    // autosave is debounced and may not have run when Create is clicked.
    if (!pendingExecution) persistBrowserDraft(false)
    setReviewOpen(false)
    setCreationMessage('กำลังสร้าง Product และ SKU ทั้งชุด…')
    setCreationStage('creating')
    try {
      if (!executionRef.current) {
        executionRef.current = {
          reservationKey: rapidReservationKey(selectedRange),
          commandId: crypto.randomUUID(),
          stockWorkflowId: crypto.randomUUID(),
          stockIdempotencyKey: crypto.randomUUID(),
          rowSnapshots: submissionRows.map((row) => ({
            rowIndex: row.index,
            productName: row.productName,
            category: row.category,
            price: row.price,
            stock: row.stock,
            unit: row.unit,
            branch: row.branch,
            imageFileName: row.image?.file.name ?? row.imageFileName,
          })),
          payload: {
            sales_code_mode: 'reserved_batch',
            reservation_batch_id: selectedRange.reservationBatchId,
            creation_items: submissionRows.map((row) => ({
              client_row_id: `rapid-row-${String(row.index + 1).padStart(3, '0')}`,
              command_id: crypto.randomUUID(),
              command_type: 'product.create_with_initial_sku',
              sales_code: row.salesCode,
              payload: {
                name: row.productName.trim(),
                sku_name: row.productName.trim(),
                sku_code: row.salesCode,
                category_id: row.category === 'ไม่ระบุหมวดหมู่' ? defaultCategory.id : categoryByName.get(row.category),
                structure_type: 'standard',
                base_unit_code: UNIT_CODE[row.unit] ?? 'piece',
                sale_price: Number(row.price),
              },
              handoff: { branch_id: warehouse.branchId, initial_stock: Number(row.stock) },
            })),
          },
        }
        persistExecutionJournal(executionRef.current, [])
      }
      const execution = executionRef.current
      if (!execution.createdItems) {
        // A failed pre-BE-03B browser journal may still contain branch_code.
        // Repair only the handoff scope while retaining the same retry command.
        const payload = execution.payload as { creation_items?: Array<Record<string, unknown>> }
        execution.payload = {
          ...execution.payload,
          creation_items: (payload.creation_items ?? []).map((item) => {
            const handoff = (item.handoff && typeof item.handoff === 'object' && !Array.isArray(item.handoff))
              ? { ...item.handoff as Record<string, unknown> }
              : {}
            delete handoff.branch_code
            return { ...item, handoff: { ...handoff, branch_id: warehouse.branchId } }
          }),
        }
        persistExecutionJournal(execution)
        const creation = await executeGlobalSalesCodeCreationAction({
          commandId: execution.commandId,
          organizationId,
          flow: 'rapid',
          payload: execution.payload,
        })
        if (!creation.ok || creation.data.created_count !== submissionRows.length) {
          throw new Error(creation.ok ? 'rapid_creation_incomplete' : creation.error)
        }
        execution.createdItems = creation.data.results
        persistExecutionJournal(execution)
      }
      const createdProducts = submissionRows.map((row) => {
        const clientRowId = `rapid-row-${String(row.index + 1).padStart(3, '0')}`
        const created = execution.createdItems!.find((item) => item.client_row_id === clientRowId)
        if (!created?.product_id || !created?.sku_id || !created?.product_version || !created?.sku_version) throw new Error('rapid_creation_result_invalid')
        return { row, clientRowId, created }
      })

      const stagedImages = createdProducts.flatMap(({ row, clientRowId }) => row.image
        ? [{ clientRowId, file: row.image.file }]
        : [])
      if (stagedImages.length) {
        setCreationStage('images')
        setCreationMessage(`กำลังอัปโหลดและตรวจรูปภาพ ${stagedImages.length} รายการ…`)
        const imageResult = await runRapidEntryImagePipeline({
          organizationId,
          createdProducts: createdProducts.map(({ row, clientRowId, created }) => ({ clientRowId, productId: String(created.product_id), productName: row.productName })),
          images: stagedImages,
          previousItems: imageRecovery,
          onStage: (item) => setImageRecovery((current) => {
            const next = [...current.filter((entry) => entry.clientRowId !== item.clientRowId), item]
            persistExecutionJournal(execution, next)
            return next
          }),
        })
        setImageRecovery(imageResult.items)
        persistExecutionJournal(execution, imageResult.items)
        if (imageResult.status !== 'succeeded') throw new Error(imageResult.compensationPendingCount ? 'rapid_image_cleanup_pending' : 'rapid_image_upload_failed')
      }

      setCreationStage('stock')
      setCreationMessage('กำลังเปิดใช้งานสินค้าและรับสต็อกแบบ Atomic Batch…')
      const snapshotByIndex = new Map(execution.rowSnapshots.map((snapshot) => [snapshot.rowIndex, snapshot]))
      const stockItems = createdProducts.map(({ row, clientRowId, created }) => {
        const snapshot = snapshotByIndex.get(row.index)
        if (!snapshot) throw new Error('rapid_execution_snapshot_missing')
        execution.activationIds ??= {}
        execution.activationIds[clientRowId] ??= { product: crypto.randomUUID(), sku: crypto.randomUUID() }
        return {
          clientRowId,
          productId: String(created.product_id),
          productVersion: Number(created.product_version),
          productActivationCommandId: execution.activationIds[clientRowId].product,
          skuId: String(created.sku_id),
          skuVersion: Number(created.sku_version),
          skuActivationCommandId: execution.activationIds[clientRowId].sku,
          locationId: location.id,
          quantity: Number(snapshot.stock),
          unitCode: UNIT_CODE[snapshot.unit] ?? 'piece',
        }
      })
      persistExecutionJournal(execution)
      const stock = await executeRapidInitialStockWorkflowAction({
        contractVersion: 1,
        workflowId: execution.stockWorkflowId,
        organizationId,
        branchId: warehouse.branchId,
        idempotencyKey: execution.stockIdempotencyKey,
        reference: `rapid:${execution.commandId}:initial-stock`,
        items: stockItems,
      })
      if (!stock.ok || stock.data.status !== 'completed') throw new Error(stock.ok ? stock.data.error ?? stock.data.status : stock.error)

      window.localStorage.removeItem(rapidExecutionJournalKey(organizationId, actorUserId))
      executionRef.current = null
      const createdIndexes = new Set(submissionRows.map((row) => row.index))
      setRows((current) => current.map((row) => {
        if (!createdIndexes.has(row.index)) return row
        if (row.image) revokeImageUrl(row.image.previewUrl)
        return { ...row, created: true, selected: false, image: null, imageError: '' }
      }))
      setCreationStage('success')
      setCreationMessage(`สร้างสินค้า ${submissionRows.length} รายการ อัปโหลดรูป ${stagedImages.length} ภาพ และรับสต็อกสำเร็จครบทั้งชุด`)
      setValidationNotice({ tone: 'success', message: `สร้างสินค้าและสต็อกสำเร็จ ${submissionRows.length} รายการ ไม่มีรายการสำเร็จบางส่วน` })
    } catch (error) {
      const message = error instanceof Error ? error.message : 'rapid_creation_failed'
      setCreationStage('error')
      setCreationMessage(`ทำรายการยังไม่สำเร็จ: ${message} · กด “ลองอีกครั้ง” เพื่อใช้ Command และ Batch key เดิม`)
      setValidationNotice({ tone: 'error', message: `ระบบหยุดที่ขั้นตอนสร้างจริงและเก็บข้อมูลสำหรับลองใหม่: ${message}` })
    }
  }

  function bulkValueIsValid(action: BulkAction, value: string) {
    if (action === 'restore-name') return true
    if (action === 'price') return /^\d+(\.\d{0,2})?$/.test(value) && Number(value) >= 0
    if (action === 'stock') return /^\d+$/.test(value) && Number(value) <= 999999
    if (action === 'unit') return UNIT_OPTIONS.includes(value)
    if (action === 'category') return categoryOptions.includes(value)
    return BRANCH_OPTIONS.includes(value)
  }

  function requestBulkApply() {
    const targetRows = bulkTarget === 'all' ? rows.filter((row) => !row.created) : selectedBulkRows
    const affectedCount = targetRows.length
    if (!affectedCount) { setBulkNoticeTone('error'); setBulkNotice('กรุณาเลือกอย่างน้อย 1 รายการก่อนใช้เครื่องมือแบบกลุ่ม'); return }
    if (!bulkValueIsValid(bulkAction, bulkValue)) { setBulkNoticeTone('error'); setBulkNotice('ค่าที่ต้องการใช้ยังไม่ถูกต้อง กรุณาตรวจอีกครั้ง'); return }
    setBulkNotice('')
    setPendingBulk({ action: bulkAction, target: bulkTarget, value: bulkValue, affectedCount, rowIndexes: targetRows.map((row) => row.index), includesHiddenSelection: bulkTarget === 'selected' && includeHiddenSelected && hiddenSelectedRows.length > 0 })
  }

  function confirmBulkApply() {
    if (!pendingBulk) return
    setUndoSnapshot(rows.map((row) => ({ ...row })))
    setRows((current) => current.map((row) => {
      const affected = pendingBulk.rowIndexes.includes(row.index)
      if (!affected) return row
      if (pendingBulk.action === 'restore-name') return { ...row, productName: productNameFor(namingTemplate, row.salesCode), nameOverridden: false }
      return { ...row, [pendingBulk.action]: pendingBulk.value }
    }))
    setBulkNoticeTone('success')
    setBulkNotice(`ใช้ค่ากับ ${pendingBulk.affectedCount} รายการแล้ว`)
    setPendingBulk(null)
  }

  function undoBulkApply() {
    if (!undoSnapshot) return
    setRows(undoSnapshot.map((row) => ({ ...row })))
    setUndoSnapshot(null)
    setBulkNoticeTone('success')
    setBulkNotice('ย้อนกลับคำสั่งแบบกลุ่มล่าสุดแล้ว')
  }

  function addCategory(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const normalized = newCategoryName.replace(/\s+/g, ' ').trim().slice(0, 60)
    if (!normalized) { setCategoryManagerNotice('กรุณากรอกชื่อหมวดหมู่'); return }
    if (categoryOptions.some((category) => category.toLocaleLowerCase('th-TH') === normalized.toLocaleLowerCase('th-TH'))) {
      setCategoryManagerNotice('มีหมวดหมู่นี้อยู่แล้ว')
      return
    }
    setCategoryOptions((current) => [...current, normalized])
    setNewCategoryName('')
    setCategoryManagerNotice(`เพิ่มหมวดหมู่ “${normalized}” แล้ว — UI Simulation`)
  }

  function beginColumnResize(event: ReactPointerEvent<HTMLButtonElement>, column: ResizableColumn) {
    event.preventDefault()
    event.stopPropagation()
    const startX = event.clientX
    const startWidth = columnWidths[column]
    const config = COLUMN_CONFIG[column]
    const handleMove = (moveEvent: globalThis.PointerEvent) => {
      const nextWidth = Math.min(config.max, Math.max(config.min, startWidth + moveEvent.clientX - startX))
      setColumnWidths((current) => ({ ...current, [column]: Math.round(nextWidth) }))
    }
    const handleEnd = () => {
      window.removeEventListener('pointermove', handleMove)
      window.removeEventListener('pointerup', handleEnd)
      window.removeEventListener('pointercancel', handleEnd)
    }
    window.addEventListener('pointermove', handleMove)
    window.addEventListener('pointerup', handleEnd)
    window.addEventListener('pointercancel', handleEnd)
  }

  function columnValues(column: ResizableColumn) {
    if (column === 'code') return rows.map((row) => row.salesCode)
    if (column === 'name') return rows.map((row) => row.productName)
    if (column === 'category') return rows.map((row) => row.category)
    if (column === 'price') return rows.map((row) => row.price || 'คลิกเพื่อกรอก')
    if (column === 'stock') return rows.map((row) => row.stock || 'คลิกเพื่อกรอก')
    if (column === 'unit') return rows.map((row) => row.unit)
    if (column === 'branch') return rows.map((row) => row.branch)
    if (column === 'status') return rows.map((row) => rowState(row, false, categoryOptions).label)
    return ['รูปภาพ']
  }

  function autoFitColumn(column: ResizableColumn) {
    const config = COLUMN_CONFIG[column]
    const canvas = document.createElement('canvas')
    const context = canvas.getContext('2d')
    if (context) context.font = '10px Arial, sans-serif'
    const longest = [config.label, ...columnValues(column)].reduce((maximum, value) => {
      const measured = context?.measureText(value).width ?? value.length * 7
      return Math.max(maximum, measured)
    }, 0)
    const horizontalCellPadding = 10 // 5px ซ้าย + 5px ขวา
    const controlAllowance = column === 'name' || column === 'price' || column === 'stock' || column === 'unit' || column === 'branch' ? 18 : 8
    const fitted = Math.min(config.max, Math.max(config.min, Math.ceil(longest + horizontalCellPadding + controlAllowance)))
    setColumnWidths((current) => ({ ...current, [column]: fitted }))
  }

  function resizableHeader(column: ResizableColumn, className = '') {
    return <th className={`is-resizable ${className}`.trim()}>
      <span>{COLUMN_CONFIG[column].label}</span>
      <button type="button" className="live-sale-rapid-column-resizer" onPointerDown={(event) => beginColumnResize(event, column)}
        onDoubleClick={(event) => { event.preventDefault(); event.stopPropagation(); autoFitColumn(column) }}
        aria-label={`ปรับขนาดคอลัมน์${COLUMN_CONFIG[column].label} ดับเบิลคลิกเพื่อพอดีข้อความ`} />
    </th>
  }

  const editableRows = rows.filter((row) => !row.created)
  const createdRows = rows.filter((row) => row.created)
  const selectedRows = editableRows.filter((row) => row.selected)
  const selectedCount = selectedRows.length
  const allSelected = editableRows.length > 0 && selectedCount === editableRows.length
  const readyRows = editableRows.filter((row) => rowIsReady(row, categoryOptions))
  const readyCount = readyRows.length
  const invalidRows = editableRows.filter((row) => rowHasEntry(row) && validationIssuesFor(row, categoryOptions).length > 0)
  const emptyRows = editableRows.filter((row) => !rowHasEntry(row))
  const attentionRows = editableRows.filter((row) => !rowIsReady(row, categoryOptions))
  const visibleRows = statusFilter === 'attention' ? attentionRows
    : statusFilter === 'invalid' ? invalidRows
      : statusFilter === 'ready' ? readyRows
        : [...editableRows, ...createdRows]
  const displayedRows = statusFilter === 'all'
    ? readyRowsAtBottom
      ? [...visibleRows.filter((row) => !rowIsReady(row, categoryOptions)), ...visibleRows.filter((row) => rowIsReady(row, categoryOptions))]
      : [...visibleRows.filter((row) => rowIsReady(row, categoryOptions)), ...visibleRows.filter((row) => !rowIsReady(row, categoryOptions))]
    : visibleRows
  const visibleRowIndexes = new Set(visibleRows.map((row) => row.index))
  const visibleSelectedRows = selectedRows.filter((row) => visibleRowIndexes.has(row.index))
  const hiddenSelectedRows = selectedRows.filter((row) => !visibleRowIndexes.has(row.index))
  const selectedBulkRows = includeHiddenSelected ? selectedRows : visibleSelectedRows
  const selectedReadyRows = selectedRows.filter((row) => rowIsReady(row, categoryOptions))
  const firstInvalidIssue = invalidRows.flatMap((row) => validationIssuesFor(row, categoryOptions))[0]
  const tableWidth = 84 + Object.values(columnWidths).reduce((total, width) => total + width, 0)
  const bulkScopeCount = bulkTarget === 'all' ? editableRows.length : selectedBulkRows.length
  const bulkScopeUnavailable = bulkTarget === 'selected' && selectedBulkRows.length === 0
  const bulkScopeLabel: Record<BulkAction, string> = {
    price: 'ราคานี้', stock: 'จำนวนสต็อกนี้', unit: 'หน่วยนี้', category: 'หมวดหมู่นี้', branch: 'สาขานี้', 'restore-name': 'ชื่อจาก Template นี้',
  }

  return <section className="live-sale-rapid-table-card" aria-labelledby="rapidEntryTableTitle">
    {bulkNotice && bulkNoticeTone === 'success' ? <div className="live-sale-rapid-bulk-toast" role="status" aria-live="polite"><span aria-hidden="true">✓</span><span>{bulkNotice}</span></div> : null}
    {rowOrderNotice ? <div className="live-sale-rapid-order-toast" role="status" aria-live="polite"><span aria-hidden="true">✓</span><span>{rowOrderNotice}</span><button type="button" onClick={() => { setReadyRowsAtBottom(false); changeStatusFilter('all'); setRowOrderNotice('') }}>ย้อนกลับ</button></div> : null}
    <datalist id="rapidUnitOptions">{UNIT_OPTIONS.map((unit) => <option key={unit} value={unit} />)}</datalist>
    <datalist id="rapidCategoryOptions">{categoryOptions.map((category) => <option key={category} value={category} />)}</datalist>
    <datalist id="rapidBranchOptions">{BRANCH_OPTIONS.map((branch) => <option key={branch} value={branch} />)}</datalist>
    <header className="live-sale-rapid-section-header live-sale-rapid-step-three-header"><div className="live-sale-rapid-section-title"><span aria-hidden="true">3</span><div><h3 id="rapidEntryTableTitle">เตรียมข้อมูลสินค้า 50 รายการ <small>(คลิกชื่อ ราคา หรือสต็อกเพื่อแก้ไข · Enter ลงแถวถัดไป · Tab เลื่อนไปขวา · Escape ยกเลิก)</small></h3></div></div>
      <div className="live-sale-rapid-table-summary" aria-label="สรุปจำนวนแถว"><span>ทั้งหมด <strong>{rows.length}</strong></span><span>เลือกแล้ว <strong>{selectedCount}</strong></span><span>พร้อมสร้าง <strong>{readyCount}</strong></span><span>ต้องแก้ <strong>{invalidRows.length}</strong></span></div></header>

    {selectedRange && <details className="live-sale-rapid-tools-disclosure">
      <summary><span><strong>เครื่องมือปรับหลายรายการ</strong><small>ราคา · สต็อก · หน่วย · หมวดหมู่ · สาขา</small></span><span className="live-sale-rapid-tools-summary-actions"><span className="live-sale-rapid-tools-selection-count">{visibleSelectedRows.length} รายการในสถานะนี้{hiddenSelectedRows.length ? ` · ซ่อน ${hiddenSelectedRows.length}` : ''}</span><span className="live-sale-rapid-tools-switch" aria-hidden="true"><span className="is-off">ปิด</span><span className="is-on">เปิด</span></span></span></summary>
      <section className="live-sale-rapid-bulk-toolbar" aria-labelledby="rapidBulkToolbarTitle">
      <header><div><h4 id="rapidBulkToolbarTitle">แก้ไขหลายรายการพร้อมกัน <small>(ใช้เฉพาะรายการที่เลือก และย้อนกลับคำสั่งล่าสุดได้)</small></h4></div>{bulkAction === 'category' ? <div className="live-sale-rapid-bulk-header-actions"><button type="button" onClick={() => { setCategoryManagerNotice(''); setCategoryManagerOpen(true) }} disabled={!canManage}>＋ จัดการหมวดหมู่</button></div> : null}</header>
      <div className="live-sale-rapid-bulk-controls">
        <label><span>ข้อมูลที่ต้องการแก้ไข</span><RapidSelectCombobox id="rapidBulkAction" value={bulkAction} options={[{ value: 'price', label: 'ราคาขาย' }, { value: 'stock', label: 'สต็อกเริ่มต้น' }, { value: 'unit', label: 'หน่วย' }, { value: 'category', label: 'หมวดหมู่' }, { value: 'branch', label: 'สาขา' }, { value: 'restore-name', label: 'คืนชื่อจาก Template' }]} onChange={(value) => { setBulkAction(value as BulkAction); setBulkValue('') }} disabled={!canManage} /></label>
        {bulkAction === 'unit' ? <label><span>หน่วยที่ต้องการใช้</span><RapidSelectCombobox id="rapidBulkUnit" value={bulkValue} options={[{ value: '', label: 'เลือกหน่วย' }, ...UNIT_OPTIONS.map((unit) => ({ value: unit, label: unit }))]} onChange={setBulkValue} disabled={!canManage} /></label>
          : bulkAction === 'category' ? <label><span>หมวดหมู่ที่ต้องการใช้</span><RapidSelectCombobox id="rapidBulkCategory" value={bulkValue} options={[{ value: '', label: 'เลือกหมวดหมู่' }, ...categoryOptions.map((category) => ({ value: category, label: category }))]} onChange={setBulkValue} disabled={!canManage} /></label>
          : bulkAction === 'branch' ? <label><span>สาขาที่ต้องการใช้</span><RapidSelectCombobox id="rapidBulkBranch" value={bulkValue} options={[{ value: '', label: 'เลือกสาขา' }, ...BRANCH_OPTIONS.map((branch) => ({ value: branch, label: branch }))]} onChange={setBulkValue} disabled={!canManage} /></label>
          : bulkAction !== 'restore-name' ? <label><span>{bulkAction === 'price' ? 'ราคาขาย' : 'จำนวนสต็อก'}</span><input value={bulkValue} onChange={(event) => setBulkValue(event.target.value.slice(0, bulkAction === 'price' ? 12 : 6))} inputMode="decimal" disabled={!canManage} placeholder={bulkAction === 'price' ? 'เช่น 390.00' : 'เช่น 12'} /></label>
          : <div className="live-sale-rapid-bulk-template-note"><span>ชื่อจะกลับไปใช้ Template ปัจจุบัน</span><code>{namingTemplate}</code></div>}
        <div className="live-sale-rapid-bulk-scope"><span id="rapidBulkScopeLabel">นำค่าไปใช้กับ</span><div className="live-sale-rapid-bulk-scope-group" role="group" aria-labelledby="rapidBulkScopeLabel">
          <button type="button" className={bulkTarget === 'selected' ? 'is-active' : ''} onClick={() => setBulkTarget('selected')} disabled={!canManage || !visibleSelectedRows.length} aria-pressed={bulkTarget === 'selected'}>เฉพาะรายการที่เห็นและเลือก ({visibleSelectedRows.length})</button>
          <button type="button" className={bulkTarget === 'all' ? 'is-active' : ''} onClick={() => setBulkTarget('all')} disabled={!canManage} aria-pressed={bulkTarget === 'all'}>ทุก 50 รายการ</button>
        </div><small className={bulkScopeUnavailable ? 'is-warning' : ''}>{bulkScopeUnavailable ? 'กรุณาเลือกรายการในสถานะนี้ก่อน หรือเลือกทุก 50 รายการ' : `${bulkScopeLabel[bulkAction]}จะใช้กับ ${bulkScopeCount} รายการ`}</small></div>
        <button className="button live-sale-rapid-bulk-review-button" type="button" onClick={requestBulkApply} disabled={!canManage || !rows.length || bulkScopeUnavailable}>ตรวจสอบก่อนใช้</button>
        {bulkTarget === 'selected' && hiddenSelectedRows.length ? <div className="live-sale-rapid-hidden-selection" role="status"><span>มีรายการที่เลือกจากสถานะอื่น {hiddenSelectedRows.length} รายการ — ยังไม่รวมในการแก้ไขครั้งนี้</span><div><button type="button" className={includeHiddenSelected ? 'is-active' : ''} onClick={() => setIncludeHiddenSelected((current) => !current)} aria-pressed={includeHiddenSelected}>{includeHiddenSelected ? 'รวมรายการที่ซ่อนแล้ว' : `รวมรายการที่ซ่อนอีก ${hiddenSelectedRows.length}`}</button><button type="button" onClick={clearHiddenSelection}>ล้างรายการที่ซ่อน</button></div></div> : null}
      </div>
      <footer><div className="live-sale-rapid-bulk-secondary-actions" aria-label="คำสั่งรอง"><button type="button" onClick={() => toggleAll(true)} disabled={!canManage || allSelected} data-tooltip="เลือกสินค้าทั้ง 50 รายการ" aria-label="เลือกทั้งหมด"><SelectAllIcon /><span>เลือกทั้งหมด</span></button><button type="button" onClick={() => toggleAll(false)} disabled={!canManage || !selectedCount} data-tooltip="ล้างรายการที่เลือกทั้งหมด" aria-label="ล้างการเลือก"><ClearSelectionIcon /><span>ล้างการเลือก</span></button></div>
        <div className="live-sale-rapid-bulk-footer-end">{bulkNotice && bulkNoticeTone === 'error' ? <span className="live-sale-rapid-bulk-inline-error" role="alert">{bulkNotice}</span> : null}{undoSnapshot ? <button className="live-sale-rapid-bulk-undo" type="button" onClick={undoBulkApply} data-tooltip="ย้อนกลับการแก้ไขแบบกลุ่มครั้งล่าสุด" aria-label="ย้อนกลับการแก้ไขล่าสุด"><UndoIcon /><span>ย้อนกลับการแก้ไขล่าสุด</span></button> : null}</div></footer>
      </section>
    </details>}

    {selectedRange && <section className="live-sale-rapid-validation-summary" aria-labelledby="rapidValidationTitle">
      <header className="live-sale-rapid-section-header"><div className="live-sale-rapid-section-title"><span aria-hidden="true">4</span><div><h3 id="rapidValidationTitle">ตรวจสอบก่อนสร้าง</h3><p>แถวที่ยังไม่กรอกจะถูกเว้นไว้ และจะส่งต่อเฉพาะรายการที่เลือกและข้อมูลครบเท่านั้น</p></div></div>
        <div className="live-sale-rapid-validation-actions"><button type="button" onClick={selectReadyRows} disabled={!canManage || !readyCount}>เลือกเฉพาะรายการพร้อมสร้าง</button><button className="button" type="button" onClick={reviewSelectedRows} disabled={!canManage || !rows.length || reservationExpired} aria-describedby={reservationExpired ? 'rapidReservationStatus' : undefined}>ตรวจรายการที่เลือก</button></div></header>
      <div className="live-sale-rapid-validation-counters" aria-label="สถานะการตรวจรายการ"><span><strong>{readyCount}</strong> พร้อมสร้าง</span><span className="is-danger"><strong>{invalidRows.length}</strong> ต้องแก้ไข</span><span><strong>{emptyRows.length}</strong> ยังไม่กรอก</span><span className="is-accent"><strong>{selectedReadyRows.length}</strong> เลือกพร้อมสร้าง</span></div>
      {validationNotice ? <div className={`live-sale-rapid-validation-notice is-${validationNotice.tone}`} role="status"><span>{validationNotice.message}</span>{validationNotice.tone === 'error' && firstInvalidIssue ? <button type="button" onClick={() => focusValidationIssue(firstInvalidIssue)}>ไปยังจุดแรกที่ต้องแก้</button> : null}</div> : null}
      {creationStage !== 'idle' ? <div className={`live-sale-rapid-validation-notice is-${creationStage === 'success' ? 'success' : creationStage === 'error' ? 'error' : 'info'}`} role="status" aria-live="polite" aria-busy={creationStage === 'creating' || creationStage === 'images' || creationStage === 'stock'}><span>{creationMessage}</span>{creationStage === 'error' ? <button type="button" onClick={submitSelectedRows}>ลองอีกครั้ง</button> : null}</div> : null}
      {invalidRows.length ? <div className="live-sale-rapid-validation-issues"><strong>รายการที่ต้องตรวจ</strong><div>{invalidRows.slice(0, 3).map((row) => { const issue = validationIssuesFor(row, categoryOptions)[0]; return <button key={row.salesCode} type="button" onClick={() => focusValidationIssue(issue)}><span>{row.salesCode}</span><small>{issue.message}</small></button> })}</div>{invalidRows.length > 3 ? <small>และอีก {invalidRows.length - 3} รายการ</small> : null}</div> : null}
    </section>}

    {!selectedRange ? <div className="live-sale-rapid-table-empty" role="status"><strong>ตารางจะสร้างหลังเลือกช่วงรหัส</strong>
      <span>กลับไปกด “ใช้ช่วงที่แนะนำ” แล้วระบบจะแสดงรหัสขายและชื่อสินค้าให้ครบ 50 แถว</span></div> : <div className="live-sale-rapid-table-shell">
      <nav className="live-sale-rapid-status-filter" aria-label="กรองรายการตามสถานะ">
        <div role="group" aria-label="สถานะที่ต้องการแสดง">
          <button type="button" className={statusFilter === 'attention' ? 'is-active' : ''} onClick={() => changeStatusFilter('attention')} aria-pressed={statusFilter === 'attention'}><span>รอดำเนินการ</span><strong>{attentionRows.length}</strong></button>
          <button type="button" className={statusFilter === 'invalid' ? 'is-active' : ''} onClick={() => changeStatusFilter('invalid')} aria-pressed={statusFilter === 'invalid'}><span>ข้อมูลไม่ครบ</span><strong>{invalidRows.length}</strong></button>
          <button type="button" className={statusFilter === 'ready' ? 'is-active' : ''} onClick={() => changeStatusFilter('ready')} aria-pressed={statusFilter === 'ready'}><span>พร้อมสร้าง</span><strong>{readyCount}</strong></button>
          <button type="button" className={statusFilter === 'all' ? 'is-active' : ''} onClick={() => changeStatusFilter('all')} aria-pressed={statusFilter === 'all'}><span>ทั้งหมด</span><strong>{rows.length}</strong></button>
        </div>
        <button type="button" className="live-sale-rapid-order-toggle" onClick={() => { setReadyRowsAtBottom((current) => !current); changeStatusFilter('all'); setRowOrderNotice('') }} aria-pressed={readyRowsAtBottom}><ReadyPlacementIcon direction={readyRowsAtBottom ? 'up' : 'down'} /><span>{readyRowsAtBottom ? 'สถานะพร้อมสร้างไว้ด้านบน' : 'สถานะพร้อมสร้างไว้ด้านล่าง'}</span></button>
      </nav>
      <div className="live-sale-rapid-table-scroll" tabIndex={0} role="region" aria-label="ตารางเตรียมสินค้า 50 รายการ เลื่อนได้ทั้งแนวตั้งและแนวนอน">
        <table className="live-sale-rapid-table" style={{ width: tableWidth }}><colgroup><col className="row-column" /><col className="select-column" />
          <col className="code-column" style={{ width: columnWidths.code }} /><col className="image-column" style={{ width: columnWidths.image }} /><col className="name-column" style={{ width: columnWidths.name }} /><col className="category-column" style={{ width: columnWidths.category }} />
          <col className="price-column" style={{ width: columnWidths.price }} /><col className="stock-column" style={{ width: columnWidths.stock }} /><col className="unit-column" style={{ width: columnWidths.unit }} />
          <col className="branch-column" style={{ width: columnWidths.branch }} /><col className="status-column" style={{ width: columnWidths.status }} /></colgroup>
          <thead><tr><th className="is-pinned-row" aria-label="ลำดับแถว">#</th><th className="is-pinned-select"><input type="checkbox" checked={allSelected} onChange={(event) => toggleAll(event.target.checked)} disabled={!canManage || !rows.length} aria-label="เลือกทุกรายการ" /></th>
            <th className="is-pinned-code is-resizable"><span>{COLUMN_CONFIG.code.label}</span><button type="button" className="live-sale-rapid-column-resizer" onPointerDown={(event) => beginColumnResize(event, 'code')}
              onDoubleClick={(event) => { event.preventDefault(); event.stopPropagation(); autoFitColumn('code') }} aria-label="ปรับขนาดคอลัมน์รหัสขาย ดับเบิลคลิกเพื่อพอดีข้อความ" /></th>
            {resizableHeader('image')}{resizableHeader('name')}{resizableHeader('category')}{resizableHeader('price', 'is-number')}{resizableHeader('stock', 'is-number')}{resizableHeader('unit')}{resizableHeader('branch')}{resizableHeader('status', 'is-pinned-status')}</tr></thead>
          <tbody>{displayedRows.length ? displayedRows.map((row) => { const state = rowState(row, editingCell?.rowIndex === row.index, categoryOptions); return <tr key={row.salesCode} data-rapid-row-index={row.index} className={`${state.className}${row.selected ? ' is-selected' : ''}`}>
            <td className="is-pinned-row"><span className="live-sale-rapid-row-number">{row.index + 1}</span></td>
            <td className="is-pinned-select"><input type="checkbox" checked={row.selected} onChange={(event) => toggleRow(row.index, event.target.checked)} disabled={!canManage || row.created} aria-label={row.created ? `รหัส ${row.salesCode} สร้างแล้ว` : `เลือกรหัส ${row.salesCode}`} /></td>
            <td className="is-pinned-code"><strong>{row.salesCode}</strong></td>
            <td>{imageCell(row)}</td><td>{editableCell(row, 'productName')}</td><td>{editableCell(row, 'category')}</td>
            <td className="is-number">{editableCell(row, 'price')}</td><td className="is-number">{editableCell(row, 'stock')}</td>
            <td>{editableCell(row, 'unit')}</td><td>{editableCell(row, 'branch')}</td>
            <td className="is-pinned-status"><span className={`live-sale-rapid-row-status ${state.className}`}>{state.label}</span></td></tr> }) : <tr className="live-sale-rapid-filter-empty"><td colSpan={11}><strong>ไม่มีรายการในสถานะนี้</strong><span>เลือกสถานะอื่นเพื่อดูรายการที่เหลือ โดยข้อมูลและรายการที่เลือกไว้จะไม่ถูกล้าง</span></td></tr>}</tbody>
        </table>
      </div><footer><span className="live-sale-rapid-table-range"><strong>แสดงรายการ</strong><span>{displayedRows.length} จาก {rows.length} รายการ</span></span><span>การจัดลำดับไม่เปลี่ยนเลขแถว รหัสขาย หรือรายการที่เลือก · รองรับการวางค่าในเซลล์เดียว</span></footer>
    </div>}

    {reviewOpen && <div className="live-sale-rapid-bulk-dialog-backdrop" role="presentation"><section className="live-sale-rapid-bulk-dialog live-sale-rapid-review-dialog" role="dialog" aria-modal="true" aria-labelledby="rapidReviewTitle">
      <header><div><span className="live-sale-rapid-kicker">ตัวอย่างก่อนส่งสร้าง</span><h4 id="rapidReviewTitle">พร้อมส่งต่อ {selectedReadyRows.length} รายการ</h4></div><button type="button" onClick={() => setReviewOpen(false)} aria-label="ปิดตัวอย่างรายการพร้อมสร้าง">×</button></header>
      <div><p>ตรวจเฉพาะรายการที่เลือกและข้อมูลครบแล้ว แถวว่างจะไม่ถูกนำมารวมในขั้นตอนนี้</p><div className="live-sale-rapid-review-list" role="list">{selectedReadyRows.map((row) => <div key={row.salesCode} role="listitem"><strong>{row.salesCode}</strong><span>{row.productName}</span><small>{row.category} · ฿{row.price} · {row.stock} {row.unit} · {row.branch}</small></div>)}</div>
        <aside>ระบบจะสร้าง Product/SKU ทั้งชุดก่อน จากนั้นอัปโหลดรูป และรับสต็อกผ่าน Atomic Batch โดยไม่ใช้ผลสำเร็จบางส่วน</aside></div>
      <footer><button className="button secondary" type="button" onClick={() => setReviewOpen(false)}>กลับไปแก้ไข</button><button className="button" type="button" onClick={submitSelectedRows}>สร้าง {selectedReadyRows.length} รายการ</button></footer>
    </section></div>}

    {categoryManagerOpen && <div className="live-sale-rapid-bulk-dialog-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) setCategoryManagerOpen(false) }}>
      <section className="live-sale-rapid-bulk-dialog live-sale-category-manager-dialog" role="dialog" aria-modal="true" aria-labelledby="rapidCategoryManagerTitle">
        <header><div><span className="live-sale-rapid-kicker">Master Data Manager</span><h4 id="rapidCategoryManagerTitle">จัดการหมวดหมู่</h4><p>เพิ่มหมวดหมู่ครั้งเดียว แล้วนำไปใช้กับแต่ละแถวหรือหลายรายการพร้อมกัน</p></div><button type="button" onClick={() => setCategoryManagerOpen(false)} aria-label="ปิดหน้าต่างจัดการหมวดหมู่">×</button></header>
        <div><form className="live-sale-category-manager-form" onSubmit={addCategory}><label><span>ชื่อหมวดหมู่ใหม่</span><div><input value={newCategoryName} onChange={(event) => { setNewCategoryName(event.target.value.slice(0, 60)); setCategoryManagerNotice('') }} maxLength={60} placeholder="เช่น กำไลทอง" autoFocus /><button className="button" type="submit" disabled={!canManage}>เพิ่มหมวดหมู่</button></div></label></form>
          {categoryManagerNotice ? <p className="live-sale-category-manager-notice" role="status">{categoryManagerNotice}</p> : null}
          <section className="live-sale-category-manager-list" aria-label={`หมวดหมู่ทั้งหมด ${categoryOptions.length} รายการ`}><header><strong>หมวดหมู่ที่ใช้ได้</strong><span>{categoryOptions.length} รายการ</span></header><div>{categoryOptions.map((category) => <span key={category}>{category}</span>)}</div></section>
          <aside>UI Simulation เท่านั้น · หมวดหมู่ที่เพิ่มยังไม่ถูกบันทึกลงฐานข้อมูล</aside>
        </div>
        <footer><button className="button secondary" type="button" onClick={() => setCategoryManagerOpen(false)}>เสร็จสิ้น</button></footer>
      </section>
    </div>}

    {pendingBulk && <div className="live-sale-rapid-bulk-dialog-backdrop" role="presentation"><section className="live-sale-rapid-bulk-dialog" role="dialog" aria-modal="true" aria-labelledby="rapidBulkConfirmTitle">
      <header><div><span className="live-sale-rapid-kicker">ยืนยันคำสั่งแบบกลุ่ม</span><h4 id="rapidBulkConfirmTitle">ใช้ค่ากับ {pendingBulk.affectedCount} รายการ?</h4></div><button type="button" onClick={() => setPendingBulk(null)} aria-label="ปิดหน้าต่างยืนยัน">×</button></header>
      <div><p>{pendingBulk.target === 'all' ? 'คุณเลือกให้เปลี่ยนทุก 50 รายการ โปรดตรวจอีกครั้งก่อนยืนยัน' : pendingBulk.includesHiddenSelection ? `คำสั่งนี้รวมรายการจากสถานะอื่นด้วย รวมทั้งหมด ${pendingBulk.affectedCount} รายการ` : `คำสั่งนี้จะเปลี่ยนเฉพาะ ${pendingBulk.affectedCount} รายการที่มองเห็นและติ๊กไว้`}</p>
        <dl><div><dt>ข้อมูล</dt><dd>{fieldLabel(pendingBulk.action === 'restore-name' ? 'productName' : pendingBulk.action)}</dd></div><div><dt>ค่าใหม่</dt><dd>{pendingBulk.action === 'restore-name' ? namingTemplate : pendingBulk.value}</dd></div><div><dt>จำนวน</dt><dd>{pendingBulk.affectedCount} รายการ</dd></div></dl></div>
      <footer><button className="button secondary" type="button" onClick={() => setPendingBulk(null)}>ยกเลิก</button><button className="button" type="button" onClick={confirmBulkApply}>ยืนยันและใช้ค่า</button></footer>
    </section></div>}
  </section>
}

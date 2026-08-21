'use client'

import Image from 'next/image'
import { useEffect, useRef, useState } from 'react'
import type { ChangeEvent, DragEvent, FormEvent, KeyboardEvent, PointerEvent as ReactPointerEvent } from 'react'
import type { RapidRangeSelection } from './rapid-prefix-assistant'

type Props = { selectedRange: RapidRangeSelection | null; namingTemplate: string; canManage: boolean }
type EditableField = 'productName' | 'category' | 'price' | 'stock' | 'unit' | 'branch'
type BulkAction = 'price' | 'stock' | 'unit' | 'category' | 'branch' | 'restore-name'
type BulkTarget = 'selected' | 'all'
type RapidImageDraft = { file: File; previewUrl: string }
type RapidRowDraft = { index: number; salesCode: string; productName: string; category: string; price: string; stock: string; unit: string; branch: string; selected: boolean; nameOverridden: boolean; image: RapidImageDraft | null; imageError: string }
type EditingCell = { rowIndex: number; field: EditableField; originalValue: string; originalNameOverridden: boolean }
type PendingBulk = { action: BulkAction; target: BulkTarget; value: string; affectedCount: number }
type ResizableColumn = 'code' | 'image' | 'name' | 'category' | 'price' | 'stock' | 'unit' | 'branch' | 'status'
type ValidationField = EditableField | 'image'
type ValidationIssue = { rowIndex: number; salesCode: string; field: ValidationField; message: string }

const ROW_COUNT = 50
const MAX_IMAGE_BYTES = 5 * 1024 * 1024
const ALLOWED_IMAGE_TYPES = new Set(['image/jpeg', 'image/png', 'image/webp'])
const EDITABLE_FIELDS: EditableField[] = ['productName', 'category', 'price', 'stock', 'unit', 'branch']
const UNIT_OPTIONS = ['ชิ้น', 'คู่', 'ใบ', 'ขวด', 'แพ็ค', 'ชุด', 'กล่อง', 'กิโลกรัม']
const CATEGORY_OPTIONS = ['ไม่ระบุหมวดหมู่', 'ต่างหู', 'กำไล', 'กระเป๋า', 'เสื้อผ้า', 'น้ำหอม']
const BRANCH_OPTIONS = ['BKK-01']
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

function codeFor(range: RapidRangeSelection, offset: number) {
  return `${range.prefix}${String(range.start + offset).padStart(3, '0')}`
}

function productNameFor(template: string, code: string) {
  return template.replaceAll('{code}', code).replaceAll('{campaign}', 'PayDay').replaceAll('{date}', '21-08-2026')
    .replaceAll('{branch}', 'BKK-01').replaceAll('{seller}', 'แม่ค้า A').replace(/\s+/g, ' ').trim()
}

function draftRows(range: RapidRangeSelection, namingTemplate: string): RapidRowDraft[] {
  return Array.from({ length: ROW_COUNT }, (_, index) => {
    const salesCode = codeFor(range, index)
    return { index, salesCode, productName: productNameFor(namingTemplate, salesCode), category: 'ไม่ระบุหมวดหมู่', price: '', stock: '', unit: 'ชิ้น', branch: 'BKK-01', selected: false, nameOverridden: false, image: null, imageError: '' }
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

export function RapidEntryTable({ selectedRange, namingTemplate, canManage }: Props) {
  const [rows, setRows] = useState<RapidRowDraft[]>([])
  const [editingCell, setEditingCell] = useState<EditingCell | null>(null)
  const [bulkAction, setBulkAction] = useState<BulkAction>('price')
  const [bulkValue, setBulkValue] = useState('')
  const [bulkTarget, setBulkTarget] = useState<BulkTarget>('selected')
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
      return
    }
    const generated = draftRows(selectedRange, namingTemplate)
    if (rangeIdentityRef.current !== rangeIdentity) {
      revokeAllImageUrls()
      rangeIdentityRef.current = rangeIdentity
      setRows(generated)
      setEditingCell(null)
      setReviewOpen(false)
      setValidationNotice(null)
      return
    }
    setRows((current) => current.map((row, index) => ({
      ...row,
      category: row.category || 'ไม่ระบุหมวดหมู่',
      ...(!row.nameOverridden ? { productName: generated[index].productName } : {}),
    })))
  }, [selectedRange, namingTemplate])

  useEffect(() => () => revokeAllImageUrls(), [])

  useEffect(() => {
    if (!editingCell) return
    activeInputRef.current?.focus()
    activeInputRef.current?.select()
  }, [editingCell])

  function beginEditing(rowIndex: number, field: EditableField) {
    const row = rows[rowIndex]
    if (row) setEditingCell({ rowIndex, field, originalValue: row[field] ?? '', originalNameOverridden: row.nameOverridden })
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
    if (!file || !canManage) return
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
      return { ...row, image: { file, previewUrl }, imageError: '' }
    }))
  }

  function removeRowImage(rowIndex: number) {
    if (!canManage) return
    setRows((current) => current.map((row, index) => {
      if (index !== rowIndex) return row
      if (row.image) revokeImageUrl(row.image.previewUrl)
      return { ...row, image: null, imageError: '' }
    }))
  }

  function dropRowImage(event: DragEvent<HTMLDivElement>, rowIndex: number) {
    event.preventDefault()
    setDragImageRow(null)
    setRowImage(rowIndex, event.dataTransfer.files[0])
  }

  function imageCell(row: RapidRowDraft) {
    const input = <input type="file" accept="image/jpeg,image/png,image/webp" disabled={!canManage} aria-label={`เลือกภาพปกรหัส ${row.salesCode}`}
      onChange={(event) => { setRowImage(row.index, event.currentTarget.files?.[0]); event.currentTarget.value = '' }} />
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
    setRows((current) => current.map((row, index) => index === rowIndex ? { ...row, selected } : row))
  }

  function toggleAll(selected: boolean) {
    setRows((current) => current.map((row) => ({ ...row, selected })))
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
    const readyRows = rows.filter((row) => rowIsReady(row, categoryOptions))
    setRows((current) => current.map((row) => ({ ...row, selected: rowIsReady(row, categoryOptions) })))
    setValidationNotice({ tone: 'success', message: `เลือกเฉพาะรายการที่พร้อมสร้างแล้ว ${readyRows.length} รายการ` })
  }

  function reviewSelectedRows() {
    const selectedRows = rows.filter((row) => row.selected)
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

  function bulkValueIsValid(action: BulkAction, value: string) {
    if (action === 'restore-name') return true
    if (action === 'price') return /^\d+(\.\d{0,2})?$/.test(value) && Number(value) >= 0
    if (action === 'stock') return /^\d+$/.test(value) && Number(value) <= 999999
    if (action === 'unit') return UNIT_OPTIONS.includes(value)
    if (action === 'category') return categoryOptions.includes(value)
    return BRANCH_OPTIONS.includes(value)
  }

  function requestBulkApply() {
    const affectedCount = bulkTarget === 'all' ? rows.length : rows.filter((row) => row.selected).length
    if (!affectedCount) { setBulkNoticeTone('error'); setBulkNotice('กรุณาเลือกอย่างน้อย 1 รายการก่อนใช้เครื่องมือแบบกลุ่ม'); return }
    if (!bulkValueIsValid(bulkAction, bulkValue)) { setBulkNoticeTone('error'); setBulkNotice('ค่าที่ต้องการใช้ยังไม่ถูกต้อง กรุณาตรวจอีกครั้ง'); return }
    setBulkNotice('')
    setPendingBulk({ action: bulkAction, target: bulkTarget, value: bulkValue, affectedCount })
  }

  function confirmBulkApply() {
    if (!pendingBulk) return
    setUndoSnapshot(rows.map((row) => ({ ...row })))
    setRows((current) => current.map((row) => {
      const affected = pendingBulk.target === 'all' || row.selected
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

  const selectedRows = rows.filter((row) => row.selected)
  const selectedCount = selectedRows.length
  const allSelected = rows.length > 0 && selectedCount === rows.length
  const readyRows = rows.filter((row) => rowIsReady(row, categoryOptions))
  const readyCount = readyRows.length
  const invalidRows = rows.filter((row) => rowHasEntry(row) && validationIssuesFor(row, categoryOptions).length > 0)
  const emptyRows = rows.filter((row) => !rowHasEntry(row))
  const selectedReadyRows = selectedRows.filter((row) => rowIsReady(row, categoryOptions))
  const firstInvalidIssue = invalidRows.flatMap((row) => validationIssuesFor(row, categoryOptions))[0]
  const tableWidth = 84 + Object.values(columnWidths).reduce((total, width) => total + width, 0)

  return <section className="live-sale-rapid-table-card" aria-labelledby="rapidEntryTableTitle">
    <datalist id="rapidUnitOptions">{UNIT_OPTIONS.map((unit) => <option key={unit} value={unit} />)}</datalist>
    <datalist id="rapidCategoryOptions">{categoryOptions.map((category) => <option key={category} value={category} />)}</datalist>
    <datalist id="rapidBranchOptions">{BRANCH_OPTIONS.map((branch) => <option key={branch} value={branch} />)}</datalist>
    <header><div><span className="live-sale-rapid-kicker">ขั้นตอนที่ 3 · ตารางสินค้า</span><h3 id="rapidEntryTableTitle">เตรียมข้อมูลสินค้า 50 รายการ</h3>
      <p>คลิกชื่อ ราคา หรือสต็อกเพื่อแก้ไข · Enter ลงแถวถัดไป · Tab เลื่อนไปขวา · Escape ยกเลิก</p></div>
      <div className="live-sale-rapid-table-summary" aria-label="สรุปจำนวนแถว"><span>ทั้งหมด <strong>{rows.length}</strong></span><span>เลือกแล้ว <strong>{selectedCount}</strong></span><span>พร้อมสร้าง <strong>{readyCount}</strong></span><span>ต้องแก้ <strong>{invalidRows.length}</strong></span></div></header>

    {selectedRange && <section className="live-sale-rapid-bulk-toolbar" aria-labelledby="rapidBulkToolbarTitle">
      <header><div><h4 id="rapidBulkToolbarTitle">แก้ไขหลายรายการพร้อมกัน</h4><p>ค่าเริ่มต้นกระทบเฉพาะรายการที่ติ๊ก และสามารถย้อนกลับคำสั่งล่าสุดได้</p></div><div className="live-sale-rapid-bulk-header-actions"><button type="button" onClick={() => { setCategoryManagerNotice(''); setCategoryManagerOpen(true) }} disabled={!canManage}>＋ จัดการหมวดหมู่</button><span>{selectedCount} รายการที่เลือก</span></div></header>
      <div className="live-sale-rapid-bulk-controls">
        <label><span>ข้อมูลที่ต้องการแก้ไข</span><select value={bulkAction} onChange={(event) => { setBulkAction(event.target.value as BulkAction); setBulkValue('') }} disabled={!canManage}>
          <option value="price">ราคาขาย</option><option value="stock">สต็อกเริ่มต้น</option><option value="unit">หน่วย</option><option value="category">หมวดหมู่</option><option value="branch">สาขา</option><option value="restore-name">คืนชื่อจาก Template</option>
        </select></label>
        {bulkAction === 'unit' ? <label><span>หน่วยที่ต้องการใช้</span><select value={bulkValue} onChange={(event) => setBulkValue(event.target.value)} disabled={!canManage}><option value="">เลือกหน่วย</option>{UNIT_OPTIONS.map((unit) => <option key={unit} value={unit}>{unit}</option>)}</select></label>
          : bulkAction === 'category' ? <label><span>หมวดหมู่ที่ต้องการใช้</span><select value={bulkValue} onChange={(event) => setBulkValue(event.target.value)} disabled={!canManage}><option value="">เลือกหมวดหมู่</option>{categoryOptions.map((category) => <option key={category} value={category}>{category}</option>)}</select></label>
          : bulkAction === 'branch' ? <label><span>สาขาที่ต้องการใช้</span><select value={bulkValue} onChange={(event) => setBulkValue(event.target.value)} disabled={!canManage}><option value="">เลือกสาขา</option>{BRANCH_OPTIONS.map((branch) => <option key={branch} value={branch}>{branch}</option>)}</select></label>
          : bulkAction !== 'restore-name' ? <label><span>{bulkAction === 'price' ? 'ราคาขาย' : 'จำนวนสต็อก'}</span><input value={bulkValue} onChange={(event) => setBulkValue(event.target.value.slice(0, bulkAction === 'price' ? 12 : 6))} inputMode="decimal" disabled={!canManage} placeholder={bulkAction === 'price' ? 'เช่น 390.00' : 'เช่น 12'} /></label>
          : <div className="live-sale-rapid-bulk-template-note"><span>ชื่อจะกลับไปใช้ Template ปัจจุบัน</span><code>{namingTemplate}</code></div>}
        <fieldset disabled={!canManage}><legend>ใช้กับ</legend><label><input type="radio" name="rapidBulkTarget" checked={bulkTarget === 'selected'} onChange={() => setBulkTarget('selected')} />รายการที่เลือก ({selectedCount})</label>
          <label><input type="radio" name="rapidBulkTarget" checked={bulkTarget === 'all'} onChange={() => setBulkTarget('all')} />ทุก 50 รายการ</label></fieldset>
        <button className="button" type="button" onClick={requestBulkApply} disabled={!canManage || !rows.length}>ตรวจสอบก่อนใช้</button>
      </div>
      <footer><div><button type="button" onClick={() => toggleAll(true)} disabled={!canManage || allSelected}>เลือกทั้งหมด</button><button type="button" onClick={() => toggleAll(false)} disabled={!canManage || !selectedCount}>ล้างการเลือก</button></div>
        <div>{bulkNotice && <span className={`is-${bulkNoticeTone}`} role="status">{bulkNotice}</span>}<button type="button" onClick={undoBulkApply} disabled={!undoSnapshot}>↶ ย้อนกลับล่าสุด</button></div></footer>
    </section>}

    {selectedRange && <section className="live-sale-rapid-validation-summary" aria-labelledby="rapidValidationTitle">
      <header><div><span className="live-sale-rapid-kicker">Rapid-UI-08 · ตรวจสอบก่อนสร้าง</span><h4 id="rapidValidationTitle">ตรวจความพร้อมของรายการ</h4><p>แถวที่ยังไม่กรอกจะถูกเว้นไว้ และจะส่งต่อเฉพาะรายการที่เลือกและข้อมูลครบเท่านั้น</p></div>
        <div className="live-sale-rapid-validation-actions"><button type="button" onClick={selectReadyRows} disabled={!canManage || !readyCount}>เลือกเฉพาะรายการพร้อมสร้าง</button><button className="button" type="button" onClick={reviewSelectedRows} disabled={!canManage || !rows.length}>ตรวจรายการที่เลือก</button></div></header>
      <div className="live-sale-rapid-validation-counters" aria-label="สถานะการตรวจรายการ"><span><strong>{readyCount}</strong> พร้อมสร้าง</span><span className="is-danger"><strong>{invalidRows.length}</strong> ต้องแก้ไข</span><span><strong>{emptyRows.length}</strong> ยังไม่กรอก</span><span className="is-accent"><strong>{selectedReadyRows.length}</strong> เลือกพร้อมสร้าง</span></div>
      {validationNotice ? <div className={`live-sale-rapid-validation-notice is-${validationNotice.tone}`} role="status"><span>{validationNotice.message}</span>{validationNotice.tone === 'error' && firstInvalidIssue ? <button type="button" onClick={() => focusValidationIssue(firstInvalidIssue)}>ไปยังจุดแรกที่ต้องแก้</button> : null}</div> : null}
      {invalidRows.length ? <div className="live-sale-rapid-validation-issues"><strong>รายการที่ต้องตรวจ</strong><div>{invalidRows.slice(0, 3).map((row) => { const issue = validationIssuesFor(row, categoryOptions)[0]; return <button key={row.salesCode} type="button" onClick={() => focusValidationIssue(issue)}><span>{row.salesCode}</span><small>{issue.message}</small></button> })}</div>{invalidRows.length > 3 ? <small>และอีก {invalidRows.length - 3} รายการ</small> : null}</div> : null}
    </section>}

    {!selectedRange ? <div className="live-sale-rapid-table-empty" role="status"><strong>ตารางจะสร้างหลังเลือกช่วงรหัส</strong>
      <span>กลับไปกด “ใช้ช่วงที่แนะนำ” แล้วระบบจะแสดงรหัสขายและชื่อสินค้าให้ครบ 50 แถว</span></div> : <div className="live-sale-rapid-table-shell">
      <div className="live-sale-rapid-table-scroll" tabIndex={0} role="region" aria-label="ตารางเตรียมสินค้า 50 รายการ เลื่อนได้ทั้งแนวตั้งและแนวนอน">
        <table className="live-sale-rapid-table" style={{ width: tableWidth }}><colgroup><col className="row-column" /><col className="select-column" />
          <col className="code-column" style={{ width: columnWidths.code }} /><col className="image-column" style={{ width: columnWidths.image }} /><col className="name-column" style={{ width: columnWidths.name }} /><col className="category-column" style={{ width: columnWidths.category }} />
          <col className="price-column" style={{ width: columnWidths.price }} /><col className="stock-column" style={{ width: columnWidths.stock }} /><col className="unit-column" style={{ width: columnWidths.unit }} />
          <col className="branch-column" style={{ width: columnWidths.branch }} /><col className="status-column" style={{ width: columnWidths.status }} /></colgroup>
          <thead><tr><th className="is-pinned-row" aria-label="ลำดับแถว">#</th><th className="is-pinned-select"><input type="checkbox" checked={allSelected} onChange={(event) => toggleAll(event.target.checked)} disabled={!canManage || !rows.length} aria-label="เลือกทุกรายการ" /></th>
            <th className="is-pinned-code is-resizable"><span>{COLUMN_CONFIG.code.label}</span><button type="button" className="live-sale-rapid-column-resizer" onPointerDown={(event) => beginColumnResize(event, 'code')}
              onDoubleClick={(event) => { event.preventDefault(); event.stopPropagation(); autoFitColumn('code') }} aria-label="ปรับขนาดคอลัมน์รหัสขาย ดับเบิลคลิกเพื่อพอดีข้อความ" /></th>
            {resizableHeader('image')}{resizableHeader('name')}{resizableHeader('category')}{resizableHeader('price', 'is-number')}{resizableHeader('stock', 'is-number')}{resizableHeader('unit')}{resizableHeader('branch')}{resizableHeader('status', 'is-pinned-status')}</tr></thead>
          <tbody>{rows.map((row) => { const state = rowState(row, editingCell?.rowIndex === row.index, categoryOptions); return <tr key={row.salesCode} data-rapid-row-index={row.index} className={`${state.className}${row.selected ? ' is-selected' : ''}`}>
            <td className="is-pinned-row"><span className="live-sale-rapid-row-number">{row.index + 1}</span></td>
            <td className="is-pinned-select"><input type="checkbox" checked={row.selected} onChange={(event) => toggleRow(row.index, event.target.checked)} disabled={!canManage} aria-label={`เลือกรหัส ${row.salesCode}`} /></td>
            <td className="is-pinned-code"><strong>{row.salesCode}</strong></td>
            <td>{imageCell(row)}</td><td>{editableCell(row, 'productName')}</td><td>{editableCell(row, 'category')}</td>
            <td className="is-number">{editableCell(row, 'price')}</td><td className="is-number">{editableCell(row, 'stock')}</td>
            <td>{editableCell(row, 'unit')}</td><td>{editableCell(row, 'branch')}</td>
            <td className="is-pinned-status"><span className={`live-sale-rapid-row-status ${state.className}`}>{state.label}</span></td></tr> })}</tbody>
        </table>
      </div><footer><span>แสดง 50 จาก 50 รายการ</span><span>รองรับการวางค่าในเซลล์เดียว · ยังไม่รองรับ Multi-cell paste</span></footer>
    </div>}

    {reviewOpen && <div className="live-sale-rapid-bulk-dialog-backdrop" role="presentation"><section className="live-sale-rapid-bulk-dialog live-sale-rapid-review-dialog" role="dialog" aria-modal="true" aria-labelledby="rapidReviewTitle">
      <header><div><span className="live-sale-rapid-kicker">ตัวอย่างก่อนส่งสร้าง</span><h4 id="rapidReviewTitle">พร้อมส่งต่อ {selectedReadyRows.length} รายการ</h4></div><button type="button" onClick={() => setReviewOpen(false)} aria-label="ปิดตัวอย่างรายการพร้อมสร้าง">×</button></header>
      <div><p>ตรวจเฉพาะรายการที่เลือกและข้อมูลครบแล้ว แถวว่างจะไม่ถูกนำมารวมในขั้นตอนนี้</p><div className="live-sale-rapid-review-list" role="list">{selectedReadyRows.map((row) => <div key={row.salesCode} role="listitem"><strong>{row.salesCode}</strong><span>{row.productName}</span><small>{row.category} · ฿{row.price} · {row.stock} {row.unit} · {row.branch}</small></div>)}</div>
        <aside>UI Preview เท่านั้น · ยังไม่มีการสร้าง Product, SKU, อัปโหลดภาพ หรือเพิ่ม Stock จริง</aside></div>
      <footer><button className="button secondary" type="button" onClick={() => setReviewOpen(false)}>กลับไปแก้ไข</button><button className="button" type="button" onClick={() => { setReviewOpen(false); setValidationNotice({ tone: 'success', message: `ยืนยันรายการพร้อมสร้างแล้ว ${selectedReadyRows.length} รายการ — UI Preview` }) }}>ยืนยันรายการที่เลือก</button></footer>
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
      <div><p>{pendingBulk.target === 'all' ? 'คุณเลือกให้เปลี่ยนทุก 50 รายการ โปรดตรวจอีกครั้งก่อนยืนยัน' : `คำสั่งนี้จะเปลี่ยนเฉพาะ ${pendingBulk.affectedCount} รายการที่ติ๊กไว้`}</p>
        <dl><div><dt>ข้อมูล</dt><dd>{fieldLabel(pendingBulk.action === 'restore-name' ? 'productName' : pendingBulk.action)}</dd></div><div><dt>ค่าใหม่</dt><dd>{pendingBulk.action === 'restore-name' ? namingTemplate : pendingBulk.value}</dd></div><div><dt>จำนวน</dt><dd>{pendingBulk.affectedCount} รายการ</dd></div></dl></div>
      <footer><button className="button secondary" type="button" onClick={() => setPendingBulk(null)}>ยกเลิก</button><button className="button" type="button" onClick={confirmBulkApply}>ยืนยันและใช้ค่า</button></footer>
    </section></div>}
  </section>
}

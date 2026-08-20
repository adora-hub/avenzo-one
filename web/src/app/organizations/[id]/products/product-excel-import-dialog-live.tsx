'use client'

import { IconAlertCircle, IconArrowLeft, IconCircleCheck, IconDownload, IconFileSpreadsheet, IconTrash, IconUpload, IconX } from '@tabler/icons-react'
import { useRouter } from 'next/navigation'
import { useEffect, useMemo, useRef, useState, type DragEvent, type KeyboardEvent } from 'react'
import { checkProductImportIdentifiersAction } from '@/app/actions/product-import'
import { executeProductImportRowsAction } from '@/app/actions/product-import-execute'
import { findProductImportFileDuplicates } from './product-excel-import-duplicates'
import { ProductImportParseError, parseProductImportFile } from './product-excel-import'
import { validateProductImportRows, type ProductImportIssue, type ProductImportNormalizedRow } from './product-excel-import-validation'

type ImportResult = {
  sourceRow: number
  commandId: string
  status: 'created' | 'skipped' | 'failed'
  productId?: string
  skuId?: string
  error?: string
  warnings: string[]
}
type PreviewState = {
  rows: ProductImportNormalizedRow[]
  issues: ProductImportIssue[]
  existing: Set<string>
  commandIds: Record<number, string>
}

export function ProductExcelImportDialogLive({ open, organizationId, onClose }: { open: boolean; organizationId: string; onClose: () => void }) {
  const router = useRouter()
  const dialogRef = useRef<HTMLElement>(null)
  const inputRef = useRef<HTMLInputElement>(null)
  const [file, setFile] = useState<File | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [dragging, setDragging] = useState(false)
  const [busy, setBusy] = useState(false)
  const [step, setStep] = useState<'setup' | 'preview' | 'importing' | 'complete'>('setup')
  const [preview, setPreview] = useState<PreviewState | null>(null)
  const [results, setResults] = useState<ImportResult[]>([])
  const [processed, setProcessed] = useState(0)
  const [totalToImport, setTotalToImport] = useState(0)

  useEffect(() => {
    if (!open) return
    const previousOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    window.requestAnimationFrame(() => dialogRef.current?.querySelector<HTMLElement>('button, input, [tabindex]:not([tabindex="-1"])')?.focus())
    return () => { document.body.style.overflow = previousOverflow }
  }, [open])

  const issueByRow = useMemo(() => {
    const grouped = new Map<number, ProductImportIssue[]>()
    preview?.issues.forEach((issue) => grouped.set(issue.sourceRow, [...(grouped.get(issue.sourceRow) ?? []), issue]))
    return grouped
  }, [preview])
  const existingRows = preview?.rows.filter((row) => rowIdentifiers(row).some((value) => preview.existing.has(value))) ?? []
  const readyRows = preview?.rows.filter((row) => !issueByRow.has(row.sourceRow) && !rowIdentifiers(row).some((value) => preview.existing.has(value))) ?? []
  const errorRows = new Set(preview?.issues.map((issue) => issue.sourceRow) ?? [])
  const createdCount = results.filter((result) => result.status === 'created').length
  const skippedCount = results.filter((result) => result.status === 'skipped').length
  const failedCount = results.filter((result) => result.status === 'failed').length

  if (!open) return null

  function selectFile(nextFile: File | undefined) {
    setError(null); setPreview(null); setResults([]); setStep('setup')
    if (!nextFile) return
    if (!/\.(xlsx|xls|csv)$/i.test(nextFile.name)) {
      setFile(null); setError('รองรับเฉพาะไฟล์ .xlsx หรือ .csv; ไฟล์ .xls เดิมกรุณาบันทึกใหม่เป็น .xlsx'); return
    }
    if (nextFile.size > 10 * 1024 * 1024) {
      setFile(null); setError('ไฟล์ต้องมีขนาดไม่เกิน 10 MB'); return
    }
    setFile(nextFile)
  }

  async function inspectFile() {
    if (!file || busy) return
    setBusy(true); setError(null)
    try {
      const parsed = parseProductImportFile(new Uint8Array(await file.arrayBuffer()), file.name)
      const validation = validateProductImportRows(parsed.rows)
      const fileDuplicates = findProductImportFileDuplicates(validation.rows)
      const identifiers = validation.rows.flatMap(rowIdentifiers)
      const check = identifiers.length ? await checkProductImportIdentifiersAction({ organizationId, identifiers }) : { ok: true as const, data: { checked: 0, existing: [] } }
      if (!check.ok) throw new Error('ไม่สามารถตรวจรหัสกับ Organization ได้ กรุณาลองใหม่')
      setPreview({
        rows: validation.rows,
        issues: [...validation.issues, ...fileDuplicates],
        existing: new Set(check.data.existing),
        commandIds: Object.fromEntries(validation.rows.map((row) => [row.sourceRow, crypto.randomUUID()])),
      })
      setStep('preview')
    } catch (caught) {
      setError(caught instanceof ProductImportParseError || caught instanceof Error ? caught.message : 'ไม่สามารถอ่านไฟล์ได้')
    } finally { setBusy(false) }
  }

  async function importRows() {
    if (!preview || busy || !readyRows.length) return
    setBusy(true); setError(null); setResults([]); setProcessed(0); setTotalToImport(readyRows.length); setStep('importing')
    const collected: ImportResult[] = existingRows.map((row) => ({
      sourceRow: row.sourceRow, commandId: preview.commandIds[row.sourceRow], status: 'skipped', error: 'identifier_already_exists', warnings: [],
    }))
    try {
      for (let index = 0; index < readyRows.length; index += 25) {
        const batch = readyRows.slice(index, index + 25).map((row) => ({ ...row, commandId: preview.commandIds[row.sourceRow] }))
        const response = await executeProductImportRowsAction({ organizationId, rows: batch })
        if (!response.ok) {
          batch.forEach((row) => collected.push({ sourceRow: row.sourceRow, commandId: row.commandId, status: 'failed', error: response.error, warnings: [] }))
        } else collected.push(...response.data)
        setResults([...collected])
        setProcessed(Math.min(index + batch.length, readyRows.length))
      }
      setStep('complete')
      router.refresh()
    } catch {
      setError('การนำเข้าหยุดก่อนเสร็จ คุณสามารถกดลองใหม่โดยระบบจะใช้ Command ID เดิมและไม่สร้างรายการซ้ำ')
      setStep('complete')
    } finally { setBusy(false) }
  }

  async function downloadTemplate() {
    const { createProductTemplateWorkbook } = await import('./product-excel-template')
    const workbook = createProductTemplateWorkbook()
    const buffer = workbook.buffer.slice(workbook.byteOffset, workbook.byteOffset + workbook.byteLength) as ArrayBuffer
    downloadBlob(new Blob([buffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }), 'avenzo-products-template.xlsx')
  }

  function downloadErrorReport() {
    const lines = [['แถว', 'สถานะ', 'ข้อผิดพลาด', 'คำเตือน'], ...results.filter((result) => result.status !== 'created' || result.warnings.length).map((result) => [String(result.sourceRow), result.status, result.error ?? '', result.warnings.join(' | ')])]
    downloadBlob(new Blob(['\uFEFF' + lines.map((line) => line.map(csvCell).join(',')).join('\r\n')], { type: 'text/csv;charset=utf-8' }), 'avenzo-product-import-report.csv')
  }

  function close() { if (!busy) onClose() }
  function handleKeyDown(event: KeyboardEvent<HTMLElement>) { if (event.key === 'Escape') { event.preventDefault(); close() } }

  return <div className="product-modal-backdrop product-excel-import-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) close() }}>
    <section ref={dialogRef} className="product-excel-import-dialog" role="dialog" aria-modal="true" aria-labelledby="product-excel-import-title" aria-describedby="product-excel-import-description" onKeyDown={handleKeyDown}>
      <header><div><h2 id="product-excel-import-title">นำเข้าสินค้าด้วย Excel</h2><p id="product-excel-import-description">เตรียม ตรวจสอบ และยืนยันข้อมูลก่อนนำเข้า</p></div><button className="product-master-modal-close" type="button" aria-label="ปิดหน้าต่างนำเข้า Excel" disabled={busy} onClick={close}><IconX aria-hidden="true" size={18} /></button></header>
      <div className="product-excel-import-body">
        {step === 'setup' ? <Setup file={file} error={error} dragging={dragging} inputRef={inputRef} busy={busy} onDownloadTemplate={downloadTemplate} onSetDragging={setDragging} onSelectFile={selectFile} /> : null}
        {step === 'preview' && preview ? <Preview file={file} preview={preview} issueByRow={issueByRow} readyCount={readyRows.length} existingCount={existingRows.length} errorCount={errorRows.size} /> : null}
        {step === 'importing' ? <div className="product-excel-import-complete" role="status" aria-live="polite"><IconUpload aria-hidden="true" size={42} /><h3>กำลังนำเข้าสินค้า</h3><p>ดำเนินการทีละชุดและบันทึก Product กับ SKU แบบ atomic โดยไม่เปลี่ยน Stock</p><progress max={Math.max(totalToImport, 1)} value={processed} /><strong>{processed.toLocaleString('th-TH')} / {totalToImport.toLocaleString('th-TH')} รายการ</strong></div> : null}
        {step === 'complete' ? <div className="product-excel-import-complete"><IconCircleCheck aria-hidden="true" size={46} /><h3>ดำเนินการนำเข้าเสร็จแล้ว</h3><p>สินค้าที่สร้างสำเร็จอยู่ในสถานะฉบับร่าง และยังไม่มีการเปลี่ยนแปลง Stock</p><dl><div><dt>สร้างสำเร็จ</dt><dd>{createdCount} SKU</dd></div><div><dt>ข้ามรายการเดิม</dt><dd>{skippedCount} SKU</dd></div><div><dt>ไม่สำเร็จ</dt><dd>{failedCount} SKU</dd></div></dl>{error ? <div className="product-excel-import-file-error" role="alert"><IconAlertCircle aria-hidden="true" size={16} />{error}</div> : null}{results.some((result) => result.status !== 'created' || result.warnings.length) ? <button className="button product-grid-button-secondary" type="button" onClick={downloadErrorReport}><IconDownload aria-hidden="true" size={15} />ดาวน์โหลดรายงาน</button> : null}</div> : null}
      </div>
      <footer>{step === 'setup' ? <><button className="button product-grid-button-secondary" type="button" onClick={close}>ยกเลิก</button><button className="button product-grid-button-primary" type="button" disabled={!file || busy} onClick={inspectFile}>{busy ? 'กำลังตรวจสอบ…' : 'ตรวจสอบไฟล์'}</button></> : step === 'preview' ? <><button className="button product-grid-button-secondary product-excel-import-back" type="button" onClick={() => setStep('setup')}><IconArrowLeft aria-hidden="true" size={16} />ย้อนกลับ</button><button className="button product-grid-button-primary" type="button" disabled={!readyRows.length || errorRows.size > 0} onClick={importRows}>ยืนยันนำเข้า {readyRows.length.toLocaleString('th-TH')} รายการ</button></> : step === 'complete' ? <>{failedCount > 0 || error ? <button className="button product-grid-button-secondary" type="button" onClick={importRows}>ลองนำเข้าอีกครั้ง</button> : null}<button className="button product-grid-button-primary" type="button" onClick={close}>ปิด</button></> : <button className="button product-grid-button-primary" type="button" disabled>กำลังนำเข้า…</button>}</footer>
    </section>
  </div>
}

function Setup({ file, error, dragging, inputRef, busy, onDownloadTemplate, onSetDragging, onSelectFile }: { file: File | null; error: string | null; dragging: boolean; inputRef: React.RefObject<HTMLInputElement | null>; busy: boolean; onDownloadTemplate: () => void; onSetDragging: (value: boolean) => void; onSelectFile: (file: File | undefined) => void }) {
  return <><div className="product-excel-import-notice" role="note"><IconAlertCircle aria-hidden="true" size={18} /><div><strong>เตรียมไฟล์ให้ตรงกับ Template ก่อนนำเข้า</strong><ol><li>หนึ่งแถวแทนหนึ่ง SKU และต้องมี SKU Code ทุกแถว</li><li>รองรับ .xlsx และ .csv ไม่เกิน 20,000 แถว / 10 MB</li><li>รหัสซ้ำและ master data จะถูกตรวจสอบก่อนยืนยัน</li><li>สินค้าถูกสร้างเป็นฉบับร่าง และขั้นตอนนี้ไม่เขียน Stock</li></ol></div></div><div className="product-excel-import-template"><div><strong>Template พร้อมคู่มือภาษาไทย</strong><span>ใช้หัวคอลัมน์มาตรฐานเพื่อลดข้อผิดพลาด</span></div><button className="button product-excel-import-template-download" type="button" onClick={onDownloadTemplate}><IconDownload aria-hidden="true" size={14} />ดาวน์โหลด Template</button></div><section className="product-excel-import-upload" aria-labelledby="product-excel-import-upload-title"><div><strong id="product-excel-import-upload-title">เลือกไฟล์สินค้า</strong><span>รองรับ .xlsx และ .csv ขนาดไม่เกิน 10 MB</span></div>{file ? <div className="product-excel-import-file"><IconFileSpreadsheet aria-hidden="true" size={22} /><span><strong>{file.name}</strong><small>{(file.size / 1024).toLocaleString('th-TH', { maximumFractionDigits: 1 })} KB · พร้อมตรวจสอบ</small></span><button className="product-inline-icon" type="button" aria-label="นำไฟล์ที่เลือกออก" data-tooltip="นำไฟล์ออก" onClick={() => { onSelectFile(undefined); if (inputRef.current) inputRef.current.value = '' }}><IconTrash aria-hidden="true" size={17} /></button></div> : <label className="product-excel-import-dropzone" data-dragging={dragging || undefined} onDragEnter={(event) => { event.preventDefault(); onSetDragging(true) }} onDragOver={(event) => event.preventDefault()} onDragLeave={(event) => { if (!event.currentTarget.contains(event.relatedTarget as Node | null)) onSetDragging(false) }} onDrop={(event: DragEvent<HTMLLabelElement>) => { event.preventDefault(); onSetDragging(false); onSelectFile(event.dataTransfer.files?.[0]) }}><IconUpload aria-hidden="true" size={30} /><strong>คลิกเพื่อเลือก หรือลากไฟล์มาวางที่นี่</strong><span>ไฟล์จะถูกอ่านเพื่อ Preview ก่อนส่งคำสั่งจริง</span><input ref={inputRef} type="file" accept=".xlsx,.xls,.csv" disabled={busy} onChange={(event) => onSelectFile(event.currentTarget.files?.[0])} /></label>}{error ? <div className="product-excel-import-file-error" role="alert"><IconAlertCircle aria-hidden="true" size={16} />{error}</div> : null}</section></>
}

function Preview({ file, preview, issueByRow, readyCount, existingCount, errorCount }: { file: File | null; preview: PreviewState; issueByRow: Map<number, ProductImportIssue[]>; readyCount: number; existingCount: number; errorCount: number }) {
  return <><div className="product-excel-import-preview-banner"><IconFileSpreadsheet aria-hidden="true" size={22} /><div><strong>{file?.name}</strong><span>อ่านข้อมูลจริง {preview.rows.length.toLocaleString('th-TH')} แถว · ยังไม่บันทึกฐานข้อมูล</span></div></div><div className="product-excel-import-summary" aria-label="สรุปผลตรวจสอบ"><div><span>ทั้งหมด</span><strong>{preview.rows.length}</strong></div><div data-tone="success"><span>พร้อมนำเข้า</span><strong>{readyCount}</strong></div><div data-tone="warning"><span>รหัสเดิม (ข้าม)</span><strong>{existingCount}</strong></div><div data-tone="danger"><span>ต้องแก้ไข</span><strong>{errorCount}</strong></div></div><section className="product-excel-import-preview-table" aria-labelledby="product-excel-import-preview-title"><div className="product-excel-import-preview-heading"><div><strong id="product-excel-import-preview-title">ตัวอย่างรายการก่อนยืนยัน</strong><span>แสดงข้อมูลจริงสูงสุด 100 แถวแรก</span></div><span className="product-excel-import-policy-chip">ข้ามรายการซ้ำ</span></div><div className="product-excel-import-table-scroll"><table><thead><tr><th>แถว</th><th>SKU</th><th>สินค้า</th><th>ผลตรวจสอบ</th></tr></thead><tbody>{preview.rows.slice(0, 100).map((row) => { const issues = issueByRow.get(row.sourceRow) ?? []; const exists = rowIdentifiers(row).some((value) => preview.existing.has(value)); const result = issues.length ? issues[0].message : exists ? 'ข้ามรายการซ้ำ' : 'พร้อมเพิ่ม'; const tone = issues.length ? 'danger' : exists ? 'warning' : 'success'; return <tr key={row.sourceRow}><td>{row.sourceRow}</td><td>{row.skuCode}</td><td>{row.productName}</td><td><span className="product-excel-import-result" data-tone={tone}>{result}</span></td></tr> })}</tbody></table></div></section></>
}

function rowIdentifiers(row: Pick<ProductImportNormalizedRow, 'skuCode' | 'salesCode' | 'barcode'>) { return [...new Set([row.skuCode, row.salesCode, row.barcode].filter((value): value is string => Boolean(value)).map((value) => value.normalize('NFKC').trim().toUpperCase()))] }
function csvCell(value: string) { return /[",\r\n]/.test(value) ? `"${value.replaceAll('"', '""')}"` : value }
function downloadBlob(blob: Blob, fileName: string) { const url = URL.createObjectURL(blob); const anchor = document.createElement('a'); anchor.href = url; anchor.download = fileName; anchor.click(); window.setTimeout(() => URL.revokeObjectURL(url), 0) }

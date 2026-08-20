import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import test from 'node:test'
import { formatInitialStockBatchId, resolveInitialStockBatchOutcome } from '../src/lib/foundation/initial-stock-batch-ui.ts'

const read = (path) => readFile(new URL(path, import.meta.url), 'utf8')
const formPath = '../src/app/organizations/[id]/products/new/unified-product-creation-form.tsx'
const stylesPath = '../src/app/globals.css'

test('UI-01.2 models Initial Stock as one batch without partial success', async () => {
  assert.equal(resolveInitialStockBatchOutcome({ hasValidationErrors: false, isDuplicate: false }), 'success')
  assert.equal(resolveInitialStockBatchOutcome({ hasValidationErrors: true, isDuplicate: false }), 'error')
  assert.equal(resolveInitialStockBatchOutcome({ hasValidationErrors: false, isDuplicate: true }), 'duplicate')
  const form = await read(formPath)
  assert.doesNotMatch(form, /InitialStockBatchStatus[^\n]*partial/)
  assert.match(form, /rows: initialStockRows\.map/)
  assert.match(form, /collectInitialStockBatchIssues\(\)/)
  assert.match(form, /resolveInitialStockBatchOutcome/)
})
test('UI-01.2 shows batch rollback copy and identifies invalid SKU rows', async () => {
  const form = await read(formPath)
  assert.match(form, /บันทึก Initial Stock ไม่สำเร็จ — Rollback ทั้ง Batch/)
  assert.match(form, /ไม่มี SKU ใดถูกเพิ่มสต็อกสำเร็จบางส่วน/)
  assert.match(form, /ข้อมูลที่กรอกยังอยู่ครบเพื่อให้แก้ไขได้/)
  assert.match(form, /data-batch-invalid=\{batchIssue \? 'true' : 'false'\}/)
  assert.match(form, /product-initial-stock-row-batch-error/)
})

test('UI-01.2 reports success only after every batch validation passes', async () => {
  assert.equal(resolveInitialStockBatchOutcome({ hasValidationErrors: true, isDuplicate: true }), 'error')
  const form = await read(formPath)
  const handler = form.slice(form.indexOf('function validateInitialStockBatch()'), form.indexOf('const variantPrices'))
  assert.match(handler, /hasValidationErrors: batchErrors\.length > 0 \|\| rowIssues\.length > 0/)
  assert.match(form, /ทุก SKU ผ่านการตรวจสอบทั้ง Batch/)
  assert.match(form, /เป็นผลจาก UI Simulation เท่านั้น ยังไม่มีการเพิ่ม Stock หรือสร้าง Stock Movement จริง/)
  assert.doesNotMatch(handler, /executeFoundationCommandAction|loadInitialStockDestinationsAction|supabase|fetch\(/)
})
test('UI-01.2 preserves the same batch for retry and handles duplicate UI results', async () => {
  const form = await read(formPath)
  assert.equal(formatInitialStockBatchId(1), 'UI-BATCH-001')
  assert.match(form, /formatInitialStockBatchId\(initialStockBatchRevision\)/)
  assert.match(form, /initialStockLastSuccessfulFingerprint === initialStockBatchFingerprint/)
  assert.match(form, /setInitialStockBatchStatus\(outcome\)/)
  assert.match(form, /พบ Batch เดิม — ไม่ดำเนินการซ้ำ/)
  assert.match(form, /Retry จะใช้ Batch ID เดิมจนกว่าจะเริ่มสินค้ารายการใหม่/)
  assert.match(form, /ลองบันทึกทั้งชุดอีกครั้ง/)
})

test('UI-01.2 disables confirmation and batch inputs while loading', async () => {
  const form = await read(formPath)
  assert.match(form, /disabled=\{initialStockBatchStatus === 'loading'\} aria-busy=\{initialStockBatchStatus === 'loading'\}/)
  assert.match(form, /กำลังประมวลผล…/)
  assert.match(form, /disabled=\{initialStockBatchStatus === 'loading'\} aria-invalid=/)
  assert.match(form, /initialStockDestinationStatus !== 'ready' \|\| initialStockBatchStatus === 'loading'/)
})

test('UI-01.2 applies semantic batch states and preserves Owner section order', async () => {
  const [form, styles] = await Promise.all([read(formPath), read(stylesPath)])
  const sectionIds = ['general', 'images', 'sku', 'pricing', 'inventory', 'packaging', 'physical', 'metadata']
  const positions = sectionIds.map((id) => form.indexOf(`<section id="${id}"`))
  assert.ok(positions.every((position) => position >= 0))
  assert.deepEqual([...positions].sort((left, right) => left - right), positions)
  assert.match(styles, /\.product-initial-stock-batch-state\.danger[^}]*var\(--status-danger-/)
  assert.match(styles, /\.product-initial-stock-batch-state\.success[^}]*var\(--status-success-/)
  assert.match(styles, /tr\[data-batch-invalid="true"\][^}]*var\(--status-danger-surface\)/)
  assert.match(styles, /@media \(max-width: 760px\)[\s\S]*\.product-initial-stock-batch-panel > footer \.button \{ width: 100%/)
})

test('UI-01.3 explains rollback impact and gives actionable correction controls', async () => {
  const [form, styles] = await Promise.all([read(formPath), read(stylesPath)])
  assert.match(form, /ไม่มี SKU ใดถูกเพิ่มสต็อกสำเร็จบางส่วน ข้อมูลที่กรอกยังอยู่ครบเพื่อให้แก้ไขได้/)
  assert.match(form, /initialStockAffectedSkuCount/)
  assert.match(form, /0<\/strong> SKU ที่บันทึก/)
  assert.match(form, /สาเหตุที่ต้องแก้/)
  assert.match(form, /รายการ SKU ที่พบปัญหา/)
  assert.match(form, /issue\.skuCode/)
  assert.match(form, /focusInitialStockCorrectionTarget/)
  assert.match(form, />แก้ไขข้อมูล<\/button>/)
  assert.match(form, />ตรวจสอบอีกครั้ง<\/button>/)
  assert.match(styles, /\.product-initial-stock-rollback-impact/)
  assert.match(styles, /\.product-initial-stock-rollback-actions/)
})

test('UI-01.3 moves keyboard focus to the first correctable batch field', async () => {
  const form = await read(formPath)
  assert.match(form, /aria-label="สาขารับสต็อกเริ่มต้น"/)
  assert.match(form, /aria-label="คลังรับสต็อกเริ่มต้น"/)
  assert.match(form, /aria-label="ตำแหน่งรับสต็อกเริ่มต้น"/)
  assert.match(form, /querySelectorAll<HTMLInputElement>/)
  assert.match(form, /firstIssue\?\.field === 'skuCode'/)
  assert.match(form, /document\.getElementById\('skuCode'\)/)
  assert.match(form, /\.product-variant-matrix input\[aria-label\^="SKU Code "\]/)
  assert.match(form, /scrollIntoView\(\{ behavior: 'smooth', block: 'center' \}\)/)
  assert.match(form, /target\.focus\(\{ preventScroll: true \}\)/)
})

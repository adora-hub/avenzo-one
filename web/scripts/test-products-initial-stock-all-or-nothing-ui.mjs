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
  assert.match(form, /ไม่มี SKU ใดถูกเพิ่มสต็อก ข้อมูลที่กรอกยังอยู่ครบเพื่อให้แก้ไขได้/)
  assert.match(form, /ข้อมูลที่กรอกยังอยู่ครบเพื่อให้แก้ไขได้/)
  assert.match(form, /data-batch-invalid=\{batchIssues\.length \? 'true' : 'false'\}/)
  assert.match(form, /product-initial-stock-row-batch-error/)
})

test('UI-01.2 reports success only after every batch validation passes', async () => {
  assert.equal(resolveInitialStockBatchOutcome({ hasValidationErrors: true, isDuplicate: true }), 'error')
  const form = await read(formPath)
  const handler = form.slice(form.indexOf('function validateInitialStockBatch('), form.indexOf('const variantPrices'))
  assert.match(handler, /hasValidationErrors: batchErrors\.length > 0 \|\| rowIssues\.length > 0/)
  assert.match(form, /ทุก SKU ผ่านการตรวจสอบทั้ง Batch/)
  assert.match(form, /เป็นผลจาก UI Simulation เท่านั้น ยังไม่มีการเพิ่ม Stock หรือสร้าง Stock Movement จริง/)
  assert.doesNotMatch(handler, /executeFoundationCommandAction|loadInitialStockDestinationsAction|supabase|fetch\(/)
})
test('UI-01.2 handles duplicate UI results without writing stock', async () => {
  const form = await read(formPath)
  assert.equal(formatInitialStockBatchId(1), 'UI-BATCH-001')
  assert.match(form, /formatInitialStockBatchId\(initialStockBatchRevision\)/)
  assert.match(form, /initialStockLastSuccessfulFingerprint === validationBatchFingerprint/)
  assert.match(form, /setInitialStockBatchStatus\(outcome\)/)
  assert.match(form, /พบคำสั่งซ้ำ — แสดงผลลัพธ์เดิม/)


})

test('UI-01.2 disables confirmation and batch inputs while loading', async () => {
  const form = await read(formPath)
  assert.match(form, /disabled=\{initialStockBatchActionDisabled\} aria-busy=\{initialStockBatchStatus === 'loading'\}/)
  assert.match(form, /กำลังประมวลผล…/)
  assert.match(form, /disabled=\{initialStockBatchStatus === 'loading' \|\| Boolean\(initialStockEmptyState\) \|\| initialStockPermissionRestricted\} aria-invalid=/)
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
  assert.match(styles, /@media \(max-width: 760px\)[\s\S]*\.product-initial-stock-batch-panel > footer > \.button \{ width: 100%/)
})

test('UI-01.3 explains rollback impact and gives actionable correction controls', async () => {
  const [form, styles] = await Promise.all([read(formPath), read(stylesPath)])
  assert.match(form, /ไม่มี SKU ใดถูกเพิ่มสต็อก ข้อมูลที่กรอกยังอยู่ครบเพื่อให้แก้ไขได้/)
  assert.match(form, /initialStockAffectedSkuCount/)
  assert.match(form, /0<\/strong> SKU ที่บันทึก/)
  assert.match(form, /สาเหตุที่ต้องแก้/)
  assert.match(form, /รายการ SKU ที่พบปัญหา/)
  assert.match(form, /issue\.skuCode/)
  assert.match(form, /focusInitialStockCorrectionTarget/)
  assert.match(form, />แก้ไขข้อมูล<\/button>/)
  assert.match(form, />ลองอีกครั้ง<\/button>/)
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
test('UI-01.4A locks the batch synchronously and exposes an accessible stable loading state', async () => {
  const [form, styles] = await Promise.all([read(formPath), read(stylesPath)])
  const handler = form.slice(form.indexOf('function validateInitialStockBatch('), form.indexOf('const variantPrices'))
  assert.match(form, /initialStockBatchInFlightRef = useRef\(false\)/)
  assert.match(handler, /if \(initialStockBatchInFlightRef\.current \|\| initialStockBatchStatus === 'loading'\) return/)
  assert.match(handler, /initialStockBatchInFlightRef\.current = true/)
  assert.match(handler, /initialStockBatchInFlightRef\.current = false/)
  assert.match(form, /aria-busy=\{initialStockBatchStatus === 'loading'\}/)
  assert.match(form, /aria-atomic="true"/)
  assert.match(form, /product-loading-spinner/)
  assert.match(form, /ปุ่มยืนยันและข้อมูลใน Batch ถูกปิดชั่วคราวเพื่อป้องกันการกดซ้ำ/)
  assert.match(styles, /\.product-initial-stock-batch-state\.loading[^}]*min-height: 62px/)
  assert.match(styles, /\.product-initial-stock-batch-panel > footer > \.product-primary-action[^}]*min-width: 190px/)
  assert.match(styles, /@media \(prefers-reduced-motion: reduce\) \{[\s\S]*?\.product-loading-spinner \{ animation: none; \}/)
})
test('UI-01.4B validates every required batch field and clears resolved warnings live', async () => {
  const [form, styles] = await Promise.all([read(formPath), read(stylesPath)])
  const collector = form.slice(form.indexOf('function collectInitialStockBatchIssues()'), form.indexOf('function focusInitialStockCorrectionTarget()'))
  assert.match(form, /field: 'skuCode' \| 'baseUnitCode' \| 'quantity'/)
  assert.match(collector, /field: 'skuCode'/)
  assert.match(collector, /field: 'baseUnitCode'/)
  assert.match(collector, /field: 'quantity'/)
  assert.match(collector, /BASE_UNIT_CODES\.has\(row\.baseUnitCode\)/)
  assert.match(form, /initialStockLiveBatchIssues/)
  assert.match(form, /initialStockShowValidation/)
  assert.match(form, /ระบบตรวจใหม่จากข้อมูลปัจจุบัน จุดที่แก้ถูกแล้วจะหายจากรายการโดยอัตโนมัติ/)
  assert.match(form, /aria-describedby=\{initialStockBranchInvalid \? "initialStockBranchError" : undefined\}/)
  assert.match(form, /aria-describedby=\{initialStockWarehouseInvalid \? "initialStockWarehouseError" : undefined\}/)
  assert.match(form, /aria-describedby=\{initialStockLocationInvalid \? "initialStockLocationError" : undefined\}/)
  assert.match(form, /data-field-invalid=\{skuIssue \? 'true' : 'false'\}/)
  assert.match(form, /data-field-invalid=\{unitIssue \? 'true' : 'false'\}/)
  assert.match(form, /firstIssue\?\.field === 'baseUnitCode'/)
  assert.match(styles, /td\[data-field-invalid="true"\][^}]*var\(--status-danger-border\)/)
})
test('UI-01.4C distinguishes a duplicate from a new success and shows the prior result', async () => {
  const [form, styles] = await Promise.all([read(formPath), read(stylesPath)])
  const handler = form.slice(form.indexOf('function validateInitialStockBatch('), form.indexOf('const variantPrices'))
  assert.match(form, /type InitialStockBatchResultSummary/)
  assert.match(form, /initialStockLastSuccessfulResult/)
  assert.match(form, /setInitialStockLastSuccessfulResult\(validationBatchResult\)/)
  assert.match(form, /setInitialStockLastSuccessfulResult\(null\)/)
  assert.match(handler, /if \(outcome === 'success'\) \{/)
  assert.match(form, /พบคำสั่งซ้ำ — แสดงผลลัพธ์เดิม/)
  assert.match(form, /ข้อมูลชุดนี้ตรงกับ Batch ที่เคยตรวจผ่านใน Browser session นี้/)
  assert.match(form, /product-initial-stock-duplicate-summary/)
  assert.match(form, /initialStockDuplicateResult\.batchId/)
  assert.match(form, /initialStockDuplicateResult\.skuCount/)
  assert.match(form, /initialStockDuplicateResult\.totalQuantity/)
  assert.match(form, /initialStockDuplicateResult\.destinationLabel/)
  assert.match(form, /ไม่มีการเพิ่มสต็อกซ้ำ/)
  assert.match(form, /ยังไม่มี Stock write หรือ Stock Movement จริง/)
  assert.match(form, /aria-live="polite" aria-atomic="true"/)
  assert.match(styles, /\.product-initial-stock-duplicate-summary[^}]*grid-template-columns: repeat\(2/)
  assert.match(styles, /@media \(max-width: 760px\)[\s\S]*\.product-initial-stock-duplicate-summary \{ grid-template-columns: 1fr; \}/)
})
test('UI-01.4D creates a new Batch ID for retry and preserves the entered batch values', async () => {
  const form = await read(formPath)
  const retryHandler = form.slice(form.indexOf('function retryInitialStockBatch()'), form.indexOf('function validateInitialStockBatch('))
  assert.match(retryHandler, /const nextBatchRevision = initialStockBatchRevision \+ 1/)
  assert.match(retryHandler, /setInitialStockBatchRevision\(nextBatchRevision\)/)
  assert.match(retryHandler, /runInitialStockBatchValidation\(nextBatchRevision\)/)
  assert.doesNotMatch(retryHandler, /setInitialStockQuantities|setInitialStockBranchId|setInitialStockWarehouse|setInitialStockLocation/)
  assert.match(form, /การลองอีกครั้งจะสร้าง Batch ID ใหม่ โดยเก็บค่าจำนวน สาขา คลัง และตำแหน่งเดิมไว้/)
  assert.match(form, />ลองอีกครั้ง<\/button>/)
})

test('UI-01.4D guards retry while loading and never presents partial success', async () => {
  const form = await read(formPath)
  const retryHandler = form.slice(form.indexOf('function retryInitialStockBatch()'), form.indexOf('function validateInitialStockBatch('))
  assert.match(retryHandler, /if \(initialStockBatchInFlightRef\.current \|\| initialStockBatchStatus === 'loading' \|\| initialStockEmptyState\) return/)
  assert.match(form, /onClick=\{retryInitialStockBatch\} disabled=\{initialStockBatchActionDisabled\} aria-busy=\{initialStockBatchBusy\}/)
  assert.match(form, /กำลังลองอีกครั้งด้วย Batch ใหม่…/)
  assert.match(form, /ไม่มี SKU ใดถูกเพิ่มสต็อก ข้อมูลที่กรอกยังอยู่ครบเพื่อให้แก้ไขได้/)
  assert.doesNotMatch(form, /Partial Success|partial success|สำเร็จบางส่วน/)
})

test('Input-Button Group Height Parity keeps the bulk action level with its number field', async () => {
  const styles = await read(stylesPath)
  assert.match(styles, /--input-action-group-height: 34px/)
  assert.match(styles, /\.product-initial-stock-bulk input,[\s\S]*?\.product-initial-stock-bulk > \.button \{[\s\S]*?height: var\(--input-action-group-height\); min-height: var\(--input-action-group-height\)/)
  assert.match(styles, /\.product-initial-stock-bulk > \.button \{ padding-block: 0; \}/)
  assert.match(
    styles,
    /@media \(pointer: coarse\)[\s\S]*?\.product-initial-stock-bulk \{ --input-action-group-height: 44px; \}/
  )
})
test('UI-01.4E presents concurrent conflict as a full-batch rollback', async () => {
  const form = await read(formPath)
  const helper = await read('../src/lib/foundation/initial-stock-batch-ui.ts')
  assert.match(helper, /InitialStockBatchStatus[^\n]*'conflict'/)
  assert.match(form, /พบข้อมูล Initial Stock เปลี่ยนแปลงพร้อมกัน — Rollback ทั้ง Batch/)
  assert.match(form, /initialStockBatchStatus !== 'conflict'/)
  assert.match(form, /ไม่มี SKU ใดถูกเพิ่มสต็อก กรุณาตรวจสอบข้อมูลล่าสุดก่อนลองอีกครั้ง/)
  assert.match(form, /ผลกระทบจาก concurrent conflict/)
  assert.match(form, /0<\/strong> SKU ที่บันทึก/)
  assert.match(form, /ข้อมูลปลายทางหรือยอดอ้างอิงถูกแก้ไขระหว่างการตรวจสอบ Batch/)
  assert.doesNotMatch(form, /Partial Success|partial success|สำเร็จบางส่วน/)
})

test('UI-01.4E requires review before retry and preserves the new-Batch retry contract', async () => {
  const form = await read(formPath)
  const simulationHandler = form.slice(form.indexOf('function simulateInitialStockConflict()'), form.indexOf('function validateInitialStockBatch()'))
  assert.match(simulationHandler, /setInitialStockBatchStatus\('conflict'\)/)
  assert.match(simulationHandler, /function reviewInitialStockConflict\(\)/)
  assert.match(simulationHandler, /collectInitialStockBatchIssues\(\)/)
  assert.match(simulationHandler, /collectInitialStockBatchErrors\(rowIssues\)/)
  assert.match(simulationHandler, /setInitialStockConflictReviewed\(true\)/)
  assert.match(simulationHandler, /initialStockBatchStatus === 'conflict' && !initialStockConflictReviewed/)
  assert.match(form, /disabled=\{initialStockBatchActionDisabled \|\| !initialStockConflictReviewed\}/)
  assert.ok(form.includes('aria-describedby={initialStockEmptyState ? "initialStockEmptyState" : "initialStockConflictReviewStatus"}'))
  assert.match(form, /ตรวจสอบข้อมูลอีกครั้ง/)
  assert.match(form, /ลองใหม่ด้วย Batch ID ใหม่/)
})

test('UI-01.4E stays local UI-only and provides an explicit Owner simulation trigger', async () => {
  const form = await read(formPath)
  const simulationHandler = form.slice(form.indexOf('function simulateInitialStockConflict()'), form.indexOf('function validateInitialStockBatch()'))
  assert.match(form, /initialStockBatchStatus === 'success' \|\| initialStockBatchStatus === 'duplicate'/)
  assert.match(form, />จำลอง Conflict<\/button>/)
  assert.doesNotMatch(simulationHandler, /executeFoundationCommandAction|loadInitialStockDestinationsAction|supabase|fetch\(/)
  assert.doesNotMatch(simulationHandler, /setInitialStockQuantities|setInitialStockBranchId|setInitialStockWarehouse|setInitialStockLocation/)
})

test('UI-01.4E uses semantic conflict tokens and existing responsive actions', async () => {
  const styles = await read(stylesPath)
  assert.match(styles, /\.product-initial-stock-conflict-review[^}]*var\(--status-warning-border\)[^}]*var\(--status-warning-text\)[^}]*var\(--surface-default\)/)
  assert.match(styles, /\.product-initial-stock-conflict-review\.reviewed[^}]*var\(--status-info-border\)[^}]*var\(--status-info-text\)/)
  assert.match(styles, /\.product-initial-stock-batch-panel > footer \{[^}]*flex-wrap: wrap/)
  assert.match(styles, /@media \(max-width: 760px\)[\s\S]*\.product-initial-stock-rollback-actions \.button \{ width: 100%/)
})
test('UI-01.4F covers missing SKU, warehouse, branch warehouse, and location empty states', async () => {
  const form = await read(formPath)
  assert.ok(form.includes("const initialStockMissingSku = initialStockRows.length === 0 || initialStockRows.some((row) => row.skuCode === 'ยังไม่กำหนด SKU')"))
  assert.ok(form.includes('ยังไม่มี SKU สำหรับกำหนด Initial Stock'))
  assert.ok(form.includes('initialStockWarehouses.length === 0'))
  assert.ok(form.includes('ยังไม่มีคลังสำหรับ Initial Stock'))
  assert.ok(form.includes('initialStockBranchId && filteredInitialStockWarehouses.length === 0'))
  assert.ok(form.includes('สาขานี้ยังไม่มีคลังที่พร้อมใช้งาน'))
  assert.ok(form.includes('initialStockWarehouse && filteredInitialStockLocations.length === 0'))
  assert.ok(form.includes('คลังนี้ยังไม่มีตำแหน่งจัดเก็บ'))
  assert.ok(form.includes('ขั้นตอนถัดไป:'))
  assert.ok(form.includes('UI Simulation เท่านั้น · ไม่มี Stock write จริง'))
})

test('UI-01.4F disables Batch actions and provides accessible keyboard focus guidance', async () => {
  const [form, styles] = await Promise.all([read(formPath), read(stylesPath)])
  assert.ok(form.includes('const initialStockBatchActionDisabled = initialStockBatchBusy || Boolean(initialStockEmptyState)'))
  assert.ok(form.includes('id="initialStockEmptyState" className="product-inline-note warning product-initial-stock-empty-state" role="status" aria-live="polite" aria-atomic="true"'))
  assert.ok(form.includes('aria-describedby={initialStockEmptyState ? "initialStockEmptyState"'))
  assert.ok(form.includes('onClick={focusInitialStockEmptyStateTarget} aria-describedby="initialStockEmptyState"'))
  assert.ok(form.includes('document.querySelector<HTMLElement>(initialStockEmptyState.focusSelector)'))
  assert.match(form, /focusSelector: structure === 'variant'.+product-variant-matrix input.+SKU Code/)
  assert.ok(form.includes("target?.scrollIntoView({ behavior: 'smooth', block: 'center' })"))
  assert.ok(form.includes('target?.focus({ preventScroll: true })'))
  assert.ok(styles.includes('.product-initial-stock-empty-state { align-items: center; border: 1px solid var(--status-warning-border); }'))
  assert.ok(styles.includes('.product-initial-stock-empty-state > .button { width: 100%; }'))
  assert.ok(!styles.includes('.product-initial-stock-empty-state { color: var(--status-danger'))
})

test('UI-01.4F gives Empty State priority over quantity and Batch validation', async () => {
  const form = await read(formPath)
  assert.ok(form.includes("structure === 'standard' && !queueReviewMode && initialStockEnabled && !initialStockMissingSku"))
  assert.ok(form.includes('isMultiInitialStock && initialStockEnabled && !initialStockMissingSku'))
  assert.ok(form.includes('const initialStockShowValidation = !initialStockEmptyState'))
  assert.ok(form.includes("value={initialStockBulkQuantity} disabled={initialStockBatchStatus === 'loading' || Boolean(initialStockEmptyState) || initialStockPermissionRestricted}"))
  assert.ok(form.includes("disabled={initialStockBatchStatus === 'loading' || Boolean(initialStockEmptyState) || initialStockPermissionRestricted || !initialStockBulkQuantity.trim()"))
  assert.ok(form.includes("value={initialStockQuantities[row.key] ?? ''} disabled={initialStockBatchStatus === 'loading' || Boolean(initialStockEmptyState) || initialStockPermissionRestricted}"))
})

test('Queued standard products become the Initial Stock batch rows instead of the next blank SKU', async () => {
  const form = await read(formPath)
  const rowsModel = form.slice(form.indexOf('const initialStockRows ='), form.indexOf('const initialStockTotal ='))
  assert.ok(rowsModel.includes('queueReviewMode'))
  assert.ok(rowsModel.includes('skuDrafts.map((draft)'))
  assert.ok(rowsModel.includes('key: `queue:${draft.id}`'))
  assert.ok(rowsModel.includes("skuCode: draft.skuCode.trim() || 'ยังไม่กำหนด SKU'"))
  assert.ok(rowsModel.includes("name: draft.snapshot.fields.name?.trim() || draft.name.trim() || 'สินค้าในคิว'"))
  assert.ok(rowsModel.indexOf('queueReviewMode') < rowsModel.indexOf("structure === 'variant'"))
  assert.ok(form.includes("const isMultiInitialStock = structure === 'variant' || queueReviewMode"))
})

test('UI-01.4F remains client-only, preserves values and Owner section order, and has no partial success', async () => {
  const form = await read(formPath)
  const emptyModel = form.slice(form.indexOf('const initialStockMissingSku'), form.indexOf('const selectInitialStockWarehouse'))
  const emptyHandlers = form.slice(form.indexOf('function reviewInitialStockConflict()'), form.indexOf('function runInitialStockBatchValidation('))
  for (const forbidden of ['executeFoundationCommandAction', 'loadInitialStockDestinationsAction', 'supabase', 'fetch(']) {
    assert.ok(!(emptyModel + emptyHandlers).includes(forbidden))
  }
  for (const setter of ['setInitialStockQuantities', 'setInitialStockBranchId', 'setInitialStockWarehouse', 'setInitialStockLocation']) {
    assert.ok(!emptyHandlers.includes(setter))
  }
  assert.ok(emptyHandlers.includes('if (initialStockEmptyState) return'))
  for (const partialCopy of ['Partial Success', 'partial success', 'สำเร็จบางส่วน']) {
    assert.ok(!form.includes(partialCopy))
  }
  const sectionIds = ['general', 'images', 'sku', 'pricing', 'inventory', 'packaging', 'physical', 'metadata']
  const positions = sectionIds.map((id) => form.indexOf('<section id="' + id + '"'))
  assert.ok(positions.every((position) => position >= 0))
  assert.deepEqual([...positions].sort((left, right) => left - right), positions)
})
test('UI-01.4G presents permission denial separately from validation and reports zero writes', async () => {
  const [form, helper] = await Promise.all([read(formPath), read('../src/lib/foundation/initial-stock-batch-ui.ts')])
  assert.match(helper, /InitialStockBatchStatus[^\n]*'permission'/)
  assert.match(form, /initialStockPermissionReason.+receive.+destination.+changed/)
  assert.match(form, /simulateInitialStockPermission\('receive'\).+simulateInitialStockPermission\('destination'\).+simulateInitialStockPermission\('changed'\)/)
  assert.ok(form.includes("initialStockBatchStatus === 'permission'"))
  assert.ok(form.includes('id="initialStockPermissionState"'))
  assert.ok(form.includes('role="alert" aria-live="assertive" tabIndex={-1}'))
  assert.ok(form.includes('<strong>0</strong> SKU'))
  assert.ok(form.includes('UI Simulation'))
  assert.doesNotMatch(form, /Partial Success|partial success/)
})

test('UI-01.4G locks protected destination and quantity controls while retaining destination escape', async () => {
  const form = await read(formPath)
  assert.ok(form.includes("const initialStockPermissionRestricted = initialStockPermissionDenied"))
  assert.ok(form.includes("const initialStockDestinationPermissionLocked = initialStockPermissionRestricted && initialStockPermissionReason !== 'destination'"))
  assert.ok(form.includes("initialStockBatchActionDisabled = initialStockBatchBusy || Boolean(initialStockEmptyState) || initialStockPermissionRestricted"))
  assert.ok(form.includes("disabled={initialStockDestinationStatus !== 'ready' || initialStockBatchStatus === 'loading' || initialStockDestinationPermissionLocked}"))
  assert.ok(form.includes("disabled={initialStockBatchStatus === 'loading' || Boolean(initialStockEmptyState) || initialStockPermissionRestricted}"))
  assert.ok(form.includes('focusInitialStockDestinationChoice'))
})

test('UI-01.4G rechecks permission with loading and double-click guards without clearing entered values', async () => {
  const form = await read(formPath)
  const handler = form.slice(form.indexOf('function simulateInitialStockPermission('), form.indexOf('function reviewInitialStockConflict()'))
  assert.match(handler, /if \(initialStockBatchInFlightRef\.current \|\| initialStockBatchStatus === 'loading'\) return/)
  assert.match(handler, /setInitialStockBatchStatus\('loading'\)/)
  assert.match(handler, /setInitialStockBatchStatus\('permission'\)/)
  assert.match(handler, /focusInitialStockPermissionState/)
  for (const setter of ['setInitialStockQuantities', 'setInitialStockBranchId', 'setInitialStockWarehouse', 'setInitialStockLocation']) {
    assert.ok(!handler.includes(setter))
  }
  assert.match(form, /initialStockPermissionDenied \?/)
})

test('UI-01.4G uses semantic warning tokens and remains local UI-only', async () => {
  const [form, styles] = await Promise.all([read(formPath), read(stylesPath)])
  const handler = form.slice(form.indexOf('function simulateInitialStockPermission('), form.indexOf('function reviewInitialStockConflict()'))
  assert.match(styles, /\.product-initial-stock-batch-state\.permission[^}]*var\(--status-warning-border\)[^}]*var\(--status-warning-text\)[^}]*var\(--status-warning-surface\)/)
  assert.match(styles, /\.product-initial-stock-batch-state\.permission:focus-visible/)
  assert.match(styles, /\.product-initial-stock-permission-guidance/)
  assert.match(styles, /\.product-initial-stock-permission-simulations[^}]*inline-flex[^}]*flex-wrap: nowrap/)
  assert.match(styles, /\.product-initial-stock-permission-simulations \.button[^}]*min-width: 0[^}]*border-radius: 0/)
  assert.doesNotMatch(handler, /executeFoundationCommandAction|loadInitialStockDestinationsAction|supabase|fetch\(/)
})
test('UI-01.4H presents a complete all-or-nothing success summary', async () => {
  const form = await read(formPath)
  assert.ok(form.includes('id="initialStockBatchSuccess"'))
  assert.ok(form.includes('ทุก SKU ผ่านการตรวจสอบทั้ง Batch'))
  assert.ok(form.includes('initialStockCurrentResult.skuCount}/{initialStockCurrentResult.skuCount'))
  assert.ok(form.includes('initialStockCurrentResult.totalQuantity'))
  assert.ok(form.includes('initialStockCurrentResult.destinationLabel'))
  assert.doesNotMatch(form, /สำเร็จบางส่วน|Partial Success|partial success/)
})

test('UI-01.4H clearly separates UI validation from real stock writes', async () => {
  const form = await read(formPath)
  assert.ok(form.includes('ตรวจผ่านเท่านั้น — ยังไม่ได้เพิ่มสต็อกจริง'))
  assert.ok(form.includes('เป็นผลจาก UI Simulation เท่านั้น ยังไม่มีการเพิ่ม Stock หรือสร้าง Stock Movement จริง'))
  assert.match(form, /id="initialStockBatchSuccess"[^>]*role="status"[^>]*aria-live="polite"[^>]*aria-atomic="true"[^>]*tabIndex=\{-1\}/)
})

test('UI-01.4H uses semantic success tokens and responsive summaries', async () => {
  const styles = await read(stylesPath)
  assert.match(styles, /\.product-initial-stock-success-summary > div \{[^}]*var\(--status-success-border\)[^}]*var\(--surface-default\)/)
  assert.match(styles, /\.product-initial-stock-success-safety \{[^}]*var\(--status-success-border\)[^}]*var\(--status-success-text\)/)
  assert.match(styles, /\.product-initial-stock-success-summary \{ grid-template-columns: 1fr; \}/)
})

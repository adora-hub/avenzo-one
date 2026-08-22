import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import test from 'node:test'

const tablePath = new URL('../src/app/organizations/[id]/products/live-sale/rapid-entry/rapid-entry-table.tsx', import.meta.url)
const shellPath = new URL('../src/app/organizations/[id]/products/live-sale/rapid-entry/rapid-entry-workspace-shell.tsx', import.meta.url)
const actionPath = new URL('../src/app/actions/foundation.ts', import.meta.url)
const serverPath = new URL('../src/lib/foundation/server-service.ts', import.meta.url)
const gscPath = new URL('../src/lib/foundation/global-sales-code-creation.server.ts', import.meta.url)
const pagePath = new URL('../src/app/organizations/[id]/products/live-sale/rapid-entry/page.tsx', import.meta.url)

test('Rapid-BE-06 submits the reserved selected subset through the trusted creation action', async () => {
  const table = await readFile(tablePath, 'utf8')
  assert.match(table, /sales_code_mode: 'reserved_batch'/)
  assert.match(table, /reservation_batch_id: selectedRange\.reservationBatchId/)
  assert.match(table, /executeGlobalSalesCodeCreationAction/)
  assert.match(table, /flow: 'rapid'/)
  assert.match(table, /creation\.data\.created_count !== submissionRows\.length/)
})

test('Rapid-BE-06 runs image finalize before one Initial Stock workflow', async () => {
  const table = await readFile(tablePath, 'utf8')
  assert.ok(table.indexOf('runRapidEntryImagePipeline') < table.indexOf('executeRapidInitialStockWorkflowAction({'))
  assert.match(table, /loadInitialStockDestinationsAction/)
  assert.match(table, /initial-stock/)
  assert.match(table, /ไม่มีรายการสำเร็จบางส่วน/)
})

test('Rapid-BE-06 resolves the real branch UUID before Product creation', async () => {
  const table = await readFile(tablePath, 'utf8')
  const destinationLookup = table.indexOf('const destinations = await loadInitialStockDestinationsAction({ organizationId })')
  const creationCall = table.indexOf('const creation = await executeGlobalSalesCodeCreationAction({')
  assert.ok(destinationLookup >= 0 && destinationLookup < creationCall)
  assert.match(table, /handoff: \{ branch_id: warehouse\.branchId, initial_stock: Number\(row\.stock\) \}/)
  assert.match(table, /branch_id: warehouse\.branchId/)
  assert.doesNotMatch(table, /handoff: \{ branch_code: row\.branch/)
})

test('Rapid-BE-06 preserves creation, activation and Batch keys on retry', async () => {
  const table = await readFile(tablePath, 'utf8')
  assert.match(table, /if \(!executionRef\.current\)/)
  assert.match(table, /if \(!pendingExecution\) persistBrowserDraft\(false\)/)
  assert.match(table, /stockIdempotencyKey: crypto\.randomUUID\(\)/)
  assert.match(table, /execution\.activationIds\[clientRowId\] \?\?=/)
  assert.match(table, /กด “ลองอีกครั้ง” เพื่อใช้ Command และ Batch key เดิม/)
})

test('Rapid-BE-06 restores an unfinished execution without issuing new identities', async () => {
  const table = await readFile(tablePath, 'utf8')
  assert.match(table, /rapidExecutionJournalKey/)
  assert.match(table, /persistExecutionJournal\(execution/)
  assert.match(table, /journal\.reservationKey !== rapidReservationKey\(selectedRange\)/)
  assert.match(table, /executionRef\.current = \{/)
  assert.match(table, /window\.localStorage\.removeItem\((?:rapidExecutionJournalKey|journalKey)/)
  assert.match(table, /กรุณาเลือกภาพของ .* ใหม่ก่อนลองอีกครั้ง/)
  assert.match(table, /price: snapshot\.price \?\? String\(itemPayload\.sale_price/)
  assert.match(table, /selected: true/)
  assert.match(table, /imageFileName: row\.image\?\.file\.name \?\? row\.imageFileName/)
})

test('Rapid-BE-06 exposes an authenticated server action with granular permissions', async () => {
  const [action, server] = await Promise.all([readFile(actionPath, 'utf8'), readFile(serverPath, 'utf8')])
  assert.match(action, /executeRapidInitialStockWorkflowAction/)
  assert.match(server, /requireFoundationPermission\(actor, 'product\.update'\)/)
  assert.match(server, /requireFoundationPermission\(actor, 'inventory\.receive', \[input\.branchId\]\)/)
})

test('Rapid-BE-06 enables the reserved_batch mode without relaxing normal/variant cardinality', async () => {
  const source = await readFile(gscPath, 'utf8')
  assert.match(source, /'reserved_batch'/)
  assert.match(source, /\(flow === 'normal' \|\| flow === 'variant'\) && items\.length !== 1/)
})

test('Rapid-BE-06 UI states clearly identify Local Backend and no remote deployment', async () => {
  const shell = await readFile(shellPath, 'utf8')
  assert.match(shell, /LOCAL BACKEND/)
  assert.match(shell, /PREVIEW และ Production ยังไม่ถูกแก้ไข/)
  assert.doesNotMatch(shell, /UI PREVIEW/)
})

test('Rapid-BE-06 reconciles assigned codes and never submits successful rows twice', async () => {
  const [page, table] = await Promise.all([readFile(pagePath, 'utf8'), readFile(tablePath, 'utf8')])
  assert.match(page, /\.from\('sales_code_reservations'\)/)
  assert.match(page, /\.eq\('status', 'assigned'\)/)
  assert.match(page, /assignedSalesCodes=\{assignedSalesCodes\}/)
  assert.match(table, /if \(row\.created\) return \{ label: 'สร้างแล้ว', className: 'is-created' \}/)
  assert.match(table, /row\.selected && !row\.created && rowIsReady/)
  assert.match(table, /created: true, selected: false/)
  assert.match(table, /const staleDuplicateAttempt = !execution\.createdItems\?\.length/)
  assert.match(table, /execution\.rowSnapshots\.every\(\(snapshot\) => rows\[snapshot\.rowIndex\]\?\.created\)/)
  assert.match(table, /setCreationStage\('idle'\)/)
  assert.match(table, /imageFileName: created \? '' : row\.imageFileName/)
  assert.match(table, /if \(row\.created\) return <div className="live-sale-rapid-image-cell is-created"/)
  assert.doesNotMatch(table, /removeItem\(rapidBrowserDraftStorageKey\(organizationId, actorUserId\)\)/)
})

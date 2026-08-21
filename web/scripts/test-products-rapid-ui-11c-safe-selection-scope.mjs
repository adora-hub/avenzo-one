import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import test from 'node:test'

const root = new URL('../', import.meta.url)
const read = (path) => readFile(new URL(path, root), 'utf8')

test('UI-11C separates visible and hidden selection', async () => {
  const table = await read('src/app/organizations/[id]/products/live-sale/rapid-entry/rapid-entry-table.tsx')
  assert.match(table, /const visibleSelectedRows = selectedRows\.filter/)
  assert.match(table, /const hiddenSelectedRows = selectedRows\.filter/)
  assert.match(table, /const selectedBulkRows = includeHiddenSelected \? selectedRows : visibleSelectedRows/)
  assert.match(table, /เฉพาะรายการที่เห็นและเลือก \(\{visibleSelectedRows\.length\}\)/)
  assert.match(table, /มีรายการที่เลือกจากสถานะอื่น \{hiddenSelectedRows\.length\} รายการ — ยังไม่รวมในการแก้ไขครั้งนี้/)
})

test('UI-11C requires explicit hidden-selection opt-in and supports clearing it', async () => {
  const table = await read('src/app/organizations/[id]/products/live-sale/rapid-entry/rapid-entry-table.tsx')
  assert.match(table, /useState\(false\).*includeHiddenSelected|const \[includeHiddenSelected, setIncludeHiddenSelected\] = useState\(false\)/)
  assert.match(table, /รวมรายการที่ซ่อนอีก \$\{hiddenSelectedRows\.length\}/)
  assert.match(table, /ล้างรายการที่ซ่อน/)
  assert.match(table, /function clearHiddenSelection\(\)/)
  assert.match(table, /setIncludeHiddenSelected\(false\)/)
})

test('UI-11C snapshots exact target rows before confirmation', async () => {
  const table = await read('src/app/organizations/[id]/products/live-sale/rapid-entry/rapid-entry-table.tsx')
  assert.match(table, /rowIndexes: targetRows\.map\(\(row\) => row\.index\)/)
  assert.match(table, /const affected = pendingBulk\.rowIndexes\.includes\(row\.index\)/)
  assert.doesNotMatch(table, /const affected = pendingBulk\.target === 'all' \|\| row\.selected/)
  assert.match(table, /คำสั่งนี้รวมรายการจากสถานะอื่นด้วย/)
})

test('UI-11C follows the warning and confirmation design contract', async () => {
  const styles = await read('src/app/globals.css')
  const design = await read('../docs/AVENZO_ONE_Design_System_and_UIUX_Standards_V1.md')
  assert.match(styles, /\.live-sale-rapid-hidden-selection \{[^}]*status-warning-border/)
  assert.match(styles, /\.live-sale-rapid-hidden-selection button\.is-active \{[^}]*background: #111217/)
  assert.match(design, /Safe Selection Scope/)
  assert.match(design, /ไม่นำมารวมอัตโนมัติ/)
  assert.match(design, /Snapshot รายการเป้าหมายก่อนเปิด Confirmation Dialog/)
})

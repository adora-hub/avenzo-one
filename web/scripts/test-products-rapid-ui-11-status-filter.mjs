import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import test from 'node:test'

const root = new URL('../', import.meta.url)
const read = (path) => readFile(new URL(path, root), 'utf8')

test('UI-11A defaults to the work queue and filters display rows only', async () => {
  const table = await read('src/app/organizations/[id]/products/live-sale/rapid-entry/rapid-entry-table.tsx')
  assert.match(table, /type RapidStatusFilter = 'attention' \| 'invalid' \| 'ready' \| 'all'/)
  assert.match(table, /useState<RapidStatusFilter>\('attention'\)/)
  assert.match(table, /const visibleRows = statusFilter === 'attention'/)
  assert.match(table, /<tbody>\{displayedRows\.length \? displayedRows\.map/)
  assert.match(table, /ไม่เปลี่ยนเลขแถว รหัสขาย หรือรายการที่เลือก/)
})

test('UI-11A exposes accessible status buttons with live counts', async () => {
  const table = await read('src/app/organizations/[id]/products/live-sale/rapid-entry/rapid-entry-table.tsx')
  assert.match(table, /aria-label="กรองรายการตามสถานะ"/)
  assert.match(table, /role="group" aria-label="สถานะที่ต้องการแสดง"/)
  for (const label of ['ต้องกรอก\/ต้องแก้', 'ต้องแก้', 'พร้อมสร้าง', 'ทั้งหมด']) assert.match(table, new RegExp(label))
  assert.match(table, /aria-pressed=\{statusFilter === 'attention'\}/)
  assert.match(table, /aria-pressed=\{statusFilter === 'all'\}/)
  assert.doesNotMatch(table, /live-sale-rapid-status-filter[^\n]*<div><strong>แสดงรายการ/)
  assert.match(table, /live-sale-rapid-table-range"><strong>แสดงรายการ<\/strong>/)
})

test('UI-11A preserves full-dataset selection while UI-11C safely scopes bulk actions', async () => {
  const table = await read('src/app/organizations/[id]/products/live-sale/rapid-entry/rapid-entry-table.tsx')
  assert.match(table, /const selectedRows = rows\.filter\(\(row\) => row\.selected\)/)
  assert.match(table, /const bulkScopeCount = bulkTarget === 'all' \? rows\.length : selectedBulkRows\.length/)
  assert.match(table, /const selectedBulkRows = includeHiddenSelected \? selectedRows : visibleSelectedRows/)
  assert.doesNotMatch(table, /selectedRows = visibleRows/)
  assert.match(table, /data-rapid-row-index=\{row\.index\}/)
  assert.match(table, /live-sale-rapid-row-number">\{row\.index \+ 1\}/)
})

test('UI-11A uses the compact Design System segmented treatment and empty state', async () => {
  const table = await read('src/app/organizations/[id]/products/live-sale/rapid-entry/rapid-entry-table.tsx')
  const styles = await read('src/app/globals.css')
  const design = await read('../docs/AVENZO_ONE_Design_System_and_UIUX_Standards_V1.md')
  assert.match(styles, /\.live-sale-rapid-status-filter button \{[^}]*height: 32px;[^}]*min-height: 32px;/)
  assert.match(styles, /\.live-sale-rapid-status-filter button\.is-active \{[^}]*color: #fff;[^}]*background: #080b0e;/)
  assert.match(styles, /\.live-sale-rapid-status-filter button:focus-visible/)
  assert.match(styles, /\.live-sale-rapid-table \{[^}]*min-width: max\(100%, 868px\)/)
  assert.match(table, /ไม่มีรายการในสถานะนี้/)
  assert.match(design, /Data Table Status Filter Bar/)
})

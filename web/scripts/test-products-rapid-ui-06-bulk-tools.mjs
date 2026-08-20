import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import test from 'node:test'

const root = new URL('../', import.meta.url)
const read = (path) => readFile(new URL(path, root), 'utf8')

test('Rapid-UI-06 enables row selection with the permission boundary intact', async () => {
  const setup = await read('src/app/organizations/[id]/products/live-sale/rapid-entry/rapid-entry-setup-workspace.tsx')
  const table = await read('src/app/organizations/[id]/products/live-sale/rapid-entry/rapid-entry-table.tsx')
  assert.match(setup, /canManage=\{canManage\}/)
  assert.match(table, /checked=\{row\.selected\}/)
  assert.match(table, /toggleRow\(row\.index, event\.target\.checked\)/)
  assert.match(table, /disabled=\{!canManage\}/)
})

test('Rapid-UI-06 provides approved searchable Unit and authorized Branch options', async () => {
  const table = await read('src/app/organizations/[id]/products/live-sale/rapid-entry/rapid-entry-table.tsx')
  for (const unit of ['ชิ้น', 'คู่', 'ใบ', 'ขวด', 'แพ็ค', 'ชุด', 'กล่อง', 'กิโลกรัม']) assert.match(table, new RegExp(unit))
  assert.match(table, /list=\{field === 'unit' \? 'rapidUnitOptions'/)
  assert.match(table, /const BRANCH_OPTIONS = \['BKK-01'\]/)
  assert.match(table, /กรุณาเลือกหน่วยที่กำหนด/)
})

test('Rapid-UI-06 bulk toolbar covers approved selected-row actions', async () => {
  const table = await read('src/app/organizations/[id]/products/live-sale/rapid-entry/rapid-entry-table.tsx')
  for (const action of ['price', 'stock', 'unit', 'branch', 'restore-name']) assert.match(table, new RegExp(`value="${action}"`))
  assert.match(table, /useState<BulkTarget>\('selected'\)/)
  assert.match(table, /รายการที่เลือก \(\{selectedCount\}\)/)
  assert.match(table, /คืนชื่อจาก Template/)
})

test('Rapid-UI-06 requires impact confirmation and explicit all-50 choice', async () => {
  const table = await read('src/app/organizations/[id]/products/live-sale/rapid-entry/rapid-entry-table.tsx')
  assert.match(table, /affectedCount: number/)
  assert.match(table, /ทุก 50 รายการ/)
  assert.match(table, /role="dialog" aria-modal="true"/)
  assert.match(table, /ใช้ค่ากับ \{pendingBulk\.affectedCount\} รายการ/)
  assert.match(table, /คุณเลือกให้เปลี่ยนทุก 50 รายการ/)
})

test('Rapid-UI-06 snapshots the latest bulk operation for Undo without backend writes', async () => {
  const table = await read('src/app/organizations/[id]/products/live-sale/rapid-entry/rapid-entry-table.tsx')
  assert.match(table, /setUndoSnapshot\(rows\.map\(\(row\) => \(\{ \.\.\.row \}\)\)\)/)
  assert.match(table, /setRows\(undoSnapshot\.map/)
  assert.match(table, /ย้อนกลับคำสั่งแบบกลุ่มล่าสุดแล้ว/)
  assert.doesNotMatch(table, /fetch\(|supabase|executeFoundationCommandAction|\.insert\(|\.update\(/)
})

test('Rapid-UI-06 uses bounded Design System controls and selected-row state', async () => {
  const styles = await read('src/app/globals.css')
  assert.match(styles, /\.live-sale-rapid-bulk-controls select, \.live-sale-rapid-bulk-controls input \{[^}]*height: 38px;[^}]*min-height: 38px;/)
  assert.match(styles, /\.live-sale-rapid-table tbody tr\.is-selected td/)
  assert.match(styles, /\.live-sale-rapid-bulk-dialog-backdrop \{[^}]*position: fixed;[^}]*z-index: 1200;/)
})

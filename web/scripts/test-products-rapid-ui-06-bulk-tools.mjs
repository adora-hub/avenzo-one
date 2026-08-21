import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import test from 'node:test'

const root = new URL('../', import.meta.url)
const read = (path) => readFile(new URL(path, root), 'utf8')

test('Rapid-UI-06 enables row selection with the permission boundary intact', async () => {
  const setup = await read('src/app/organizations/[id]/products/live-sale/rapid-entry/rapid-entry-setup-workspace.tsx')
  const table = await read('src/app/organizations/[id]/products/live-sale/rapid-entry/rapid-entry-table.tsx')
  assert.match(setup, /canManage=\{editorEnabled\}/)
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
  for (const action of ['price', 'stock', 'unit', 'branch', 'restore-name']) assert.match(table, new RegExp(`value: '${action}'`))
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

test('Rapid-UI-10D correction explains scope with an equal-height segmented control', async () => {
  const table = await read('src/app/organizations/[id]/products/live-sale/rapid-entry/rapid-entry-table.tsx')
  const styles = await read('src/app/globals.css')
  assert.match(table, /นำค่าไปใช้กับ/)
  assert.match(table, /เฉพาะรายการที่เลือก \(\{selectedCount\}\)/)
  assert.match(table, /disabled=\{!canManage \|\| !selectedCount\}/)
  assert.match(table, /กรุณาเลือกรายการก่อน หรือเลือกทุก 50 รายการ/)
  assert.match(table, /bulkScopeLabel\[bulkAction\][\s\S]*bulkScopeCount/)
  assert.match(table, /live-sale-rapid-bulk-review-button[\s\S]*bulkScopeUnavailable/)
  assert.match(styles, /\.live-sale-rapid-bulk-scope-group \{[^}]*height: 38px;/)
  assert.match(styles, /\.live-sale-rapid-bulk-scope-group > button\.is-active \{[^}]*color: #fff;[^}]*background: #111217;/)
  assert.match(styles, /\.live-sale-rapid-bulk-controls \{[^}]*align-items: end;[^}]*padding-bottom: 16px;/)
  assert.match(styles, /\.live-sale-rapid-bulk-scope > small \{[^}]*position: absolute;[^}]*top: calc\(100% \+ 3px\);/)
})

test('Rapid-UI-06 snapshots the latest bulk operation for Undo without backend writes', async () => {
  const table = await read('src/app/organizations/[id]/products/live-sale/rapid-entry/rapid-entry-table.tsx')
  assert.match(table, /setUndoSnapshot\(rows\.map\(\(row\) => \(\{ \.\.\.row \}\)\)\)/)
  assert.match(table, /setRows\(undoSnapshot\.map/)
  assert.match(table, /ย้อนกลับคำสั่งแบบกลุ่มล่าสุดแล้ว/)
  assert.doesNotMatch(table, /fetch\(|supabase|executeFoundationCommandAction|\.insert\(|\.update\(/)
})

test('Rapid-UI-06 uses bounded Design System controls and selected-row state', async () => {
  const table = await read('src/app/organizations/[id]/products/live-sale/rapid-entry/rapid-entry-table.tsx')
  const styles = await read('src/app/globals.css')
  assert.match(table, /live-sale-rapid-tools-switch[\s\S]*is-off">ปิด<[\s\S]*is-on">เปิด</)
  assert.match(table, /<RapidSelectCombobox id="rapidBulkAction"/)
  assert.match(table, /<RapidSelectCombobox id="rapidBulkUnit"/)
  assert.match(table, /<RapidSelectCombobox id="rapidBulkCategory"/)
  assert.match(table, /<RapidSelectCombobox id="rapidBulkBranch"/)
  assert.match(styles, /\.live-sale-rapid-bulk-controls \.rapid-select-combobox-trigger \{[^}]*height: 38px;[^}]*min-height: 38px;/)
  assert.match(styles, /\.live-sale-rapid-table tbody tr\.is-selected td/)
  assert.match(styles, /\.live-sale-rapid-bulk-dialog-backdrop \{[^}]*position: fixed;[^}]*z-index: 1200;/)
  assert.match(styles, /\.live-sale-rapid-tools-switch \{[^}]*width: 62px;[^}]*height: 28px;/)
  assert.match(styles, /\.live-sale-rapid-tools-disclosure\[open\] \.live-sale-rapid-tools-switch \{[^}]*background: #aae600;/)
})

test('Rapid-UI-10D keeps Step 3 compact without removing bulk actions', async () => {
  const table = await read('src/app/organizations/[id]/products/live-sale/rapid-entry/rapid-entry-table.tsx')
  const styles = await read('src/app/globals.css')
  assert.match(table, /live-sale-rapid-step-three-header[\s\S]*เตรียมข้อมูลสินค้า 50 รายการ <small>\(คลิกชื่อ ราคา หรือสต็อกเพื่อแก้ไข/)
  assert.match(table, /bulkAction === 'category'[\s\S]*จัดการหมวดหมู่/)
  assert.match(table, /live-sale-rapid-bulk-secondary-actions[\s\S]*เลือกทั้งหมด[\s\S]*ล้างการเลือก/)
  assert.match(table, /undoSnapshot \? <button className="live-sale-rapid-bulk-undo"[\s\S]*ย้อนกลับการแก้ไขล่าสุด/)
  assert.match(styles, /\.live-sale-rapid-step-three-header \{[^}]*min-height: 62px;/)
  assert.match(styles, /\.live-sale-rapid-bulk-secondary-actions button \{[^}]*border: 0;/)
})

test('Rapid-UI secondary action row uses icons, top tooltips, conditional Undo and top-center success Toast', async () => {
  const table = await read('src/app/organizations/[id]/products/live-sale/rapid-entry/rapid-entry-table.tsx')
  const styles = await read('src/app/globals.css')
  assert.match(table, /SelectAllIcon[\s\S]*data-tooltip="เลือกสินค้าทั้ง 50 รายการ"/)
  assert.match(table, /ClearSelectionIcon[\s\S]*data-tooltip="ล้างรายการที่เลือกทั้งหมด"/)
  assert.match(table, /undoSnapshot \? <button[\s\S]*data-tooltip="ย้อนกลับการแก้ไขแบบกลุ่มครั้งล่าสุด"/)
  assert.match(table, /bulkNoticeTone === 'success'[\s\S]*live-sale-rapid-bulk-toast/)
  assert.match(table, /bulkNoticeTone === 'error'[\s\S]*live-sale-rapid-bulk-inline-error/)
  assert.match(styles, /\.live-sale-rapid-bulk-toolbar > footer \{[^}]*min-height: 47px;[^}]*border-top: 1px solid var\(--border-default\);[^}]*background: var\(--surface-subtle\);/)
  assert.match(styles, /\.live-sale-rapid-bulk-toolbar > footer button \{[^}]*height: 34px;[^}]*font-size: 12px;/)
  assert.match(styles, /\.live-sale-rapid-bulk-toolbar > footer \.live-sale-rapid-bulk-secondary-actions \{[^}]*background: transparent;/)
  assert.match(styles, /button\[data-tooltip\]::after \{[^}]*bottom: calc\(100% \+ 7px\);/)
  assert.match(styles, /\.live-sale-rapid-bulk-toast \{[^}]*position: fixed;[^}]*top: 18px;[^}]*left: 50%;/)
})

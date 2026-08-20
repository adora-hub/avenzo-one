import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import test from 'node:test'

const root = new URL('../', import.meta.url)
const read = (path) => readFile(new URL(path, root), 'utf8')

test('Rapid-UI-04 connects the approved range and naming template to the table', async () => {
  const setup = await read('src/app/organizations/[id]/products/live-sale/rapid-entry/rapid-entry-setup-workspace.tsx')
  const naming = await read('src/app/organizations/[id]/products/live-sale/rapid-entry/rapid-naming-template-builder.tsx')
  assert.match(setup, /useState\('PayDay-\{code\}'\)/)
  assert.match(setup, /onTemplateChange=\{setNamingTemplate\}/)
  assert.match(setup, /<RapidEntryTable selectedRange=\{selectedRange\} namingTemplate=\{namingTemplate\}/)
  assert.match(naming, /onTemplateChange\?\.\(normalizedTemplate\)/)
})

test('Rapid-UI-04 creates exactly 50 display rows and all approved columns', async () => {
  const table = await read('src/app/organizations/[id]/products/live-sale/rapid-entry/rapid-entry-table.tsx')
  assert.match(table, /const ROW_COUNT = 50/)
  assert.match(table, /Array\.from\(\{ length: ROW_COUNT \}/)
  for (const heading of ['รหัสขาย', 'รูปภาพ', 'ชื่อสินค้า', 'หมวดหมู่', 'ราคาขาย', 'สต็อกเริ่มต้น', 'หน่วย', 'สาขา', 'สถานะ']) {
    assert.match(table, new RegExp(heading))
  }
  assert.match(table, /แสดง 50 จาก 50 รายการ/)
})

test('Rapid-UI-04 preserves the table structure while later approved parts add row actions', async () => {
  const table = await read('src/app/organizations/[id]/products/live-sale/rapid-entry/rapid-entry-table.tsx')
  assert.match(table, /type="checkbox"/)
  assert.match(table, /is-pinned-select/)
  assert.doesNotMatch(table, /fetch\(|supabase|executeFoundationCommandAction/)
})

test('Rapid-UI-04 provides sticky header, pinned identity and internal two-axis scroll', async () => {
  const table = await read('src/app/organizations/[id]/products/live-sale/rapid-entry/rapid-entry-table.tsx')
  const styles = await read('src/app/globals.css')
  assert.match(table, /live-sale-rapid-table-scroll/)
  assert.match(table, /is-pinned-select/)
  assert.match(table, /is-pinned-code/)
  assert.match(styles, /\.live-sale-rapid-table-scroll \{[^}]*max-height: 520px;[^}]*overflow: auto;/)
  assert.match(styles, /\.live-sale-rapid-table \{[^}]*min-width: 868px;/)
  assert.match(styles, /\.live-sale-rapid-table thead th \{[^}]*position: sticky;[^}]*top: 0;/)
  assert.match(styles, /\.live-sale-rapid-table \.is-pinned-row \{[^}]*position: sticky;[^}]*left: 0;/)
  assert.match(styles, /\.live-sale-rapid-table \.is-pinned-code \{[^}]*position: sticky;[^}]*left: 84px;[^}]*box-shadow:/)
})

test('Rapid-UI-04 labels the scroll region and empty state accessibly', async () => {
  const table = await read('src/app/organizations/[id]/products/live-sale/rapid-entry/rapid-entry-table.tsx')
  assert.match(table, /aria-labelledby="rapidEntryTableTitle"/)
  assert.match(table, /tabIndex=\{0\} role="region"/)
  assert.match(table, /เลื่อนได้ทั้งแนวตั้งและแนวนอน/)
  assert.match(table, /role="status"/)
})

test('Rapid table correction supports drag resize and double-click Auto-fit with five-pixel gutters', async () => {
  const table = await read('src/app/organizations/[id]/products/live-sale/rapid-entry/rapid-entry-table.tsx')
  const styles = await read('src/app/globals.css')
  assert.match(table, /function beginColumnResize/)
  assert.match(table, /window\.addEventListener\('pointermove', handleMove\)/)
  assert.match(table, /function autoFitColumn/)
  assert.match(table, /context\?\.measureText\(value\)\.width/)
  assert.match(table, /const horizontalCellPadding = 10 \/\/ 5px ซ้าย \+ 5px ขวา/)
  assert.match(table, /onDoubleClick=/)
  assert.match(table, /style=\{\{ width: tableWidth \}\}/)
  assert.match(styles, /\.live-sale-rapid-column-resizer \{[^}]*cursor: col-resize;/)
})

test('Rapid table correction centers every column and pins Status to the right edge', async () => {
  const table = await read('src/app/organizations/[id]/products/live-sale/rapid-entry/rapid-entry-table.tsx')
  const styles = await read('src/app/globals.css')
  assert.match(table, /resizableHeader\('status', 'is-pinned-status'\)/)
  assert.match(table, /<td className="is-pinned-status">/)
  assert.match(styles, /\.live-sale-rapid-table th, \.live-sale-rapid-table td \{[^}]*text-align: center;/)
  assert.match(styles, /\.live-sale-rapid-table \.is-pinned-status \{[^}]*position: sticky;[^}]*right: 0;/)
  assert.match(styles, /\.live-sale-rapid-table \.live-sale-rapid-editor input \{[^}]*text-align: center;/)
  assert.match(styles, /\.live-sale-rapid-table \.is-pinned-row \{[^}]*text-align: center;/)
  assert.match(styles, /\.live-sale-rapid-image-placeholder, \.live-sale-rapid-image-preview-trigger \{[^}]*margin-inline: auto;/)
  assert.match(styles, /\.live-sale-rapid-table input\[type="checkbox"\] \{[^}]*display: block;[^}]*margin: auto;[^}]*vertical-align: middle;/)
  assert.match(table, /status: \{ label: 'สถานะ', width: 100, min: 88, max: 180 \}/)
})

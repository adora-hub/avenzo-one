import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import test from 'node:test'

const root = new URL('../', import.meta.url)
const read = (path) => readFile(new URL(path, root), 'utf8')

test('Rapid-UI-05 edits only product name, price and initial stock inline', async () => {
  const table = await read('src/app/organizations/[id]/products/live-sale/rapid-entry/rapid-entry-table.tsx')
  assert.match(table, /type EditableField = 'productName' \| 'category' \| 'price' \| 'stock' \| 'unit' \| 'branch'/)
  assert.match(table, /onClick=\{\(\) => beginEditing\(row\.index, field\)\}/)
  assert.match(table, /activeInputRef\.current\?\.focus\(\)/)
  assert.doesNotMatch(table, /fetch\(|supabase|executeFoundationCommandAction/)
})

test('Rapid-UI-05 supports Enter, Tab, Shift+Tab and Escape spreadsheet navigation', async () => {
  const table = await read('src/app/organizations/[id]/products/live-sale/rapid-entry/rapid-entry-table.tsx')
  assert.match(table, /event\.key === 'Escape'/)
  assert.match(table, /event\.key === 'Enter'/)
  assert.match(table, /event\.key === 'Tab'/)
  assert.match(table, /event\.shiftKey \? 'previous' : 'next'/)
  assert.match(table, /moveEditing\(rowIndex, field, 'down'\)/)
})

test('Rapid-UI-05 cancels to the original value and preserves manually overridden names', async () => {
  const table = await read('src/app/organizations/[id]/products/live-sale/rapid-entry/rapid-entry-table.tsx')
  assert.match(table, /originalValue: row\[field\]/)
  assert.match(table, /\[editingCell\.field\]: editingCell\.originalValue/)
  assert.match(table, /nameOverridden: editingCell\.originalNameOverridden/)
  assert.match(table, /!row\.nameOverridden \? \{ productName: generated\[index\]\.productName \} : \{\}/)
  assert.match(table, /แก้ไขเฉพาะรายการ/)
})

test('Rapid-UI-05 validates each scalar cell locally without backend writes', async () => {
  const table = await read('src/app/organizations/[id]/products/live-sale/rapid-entry/rapid-entry-table.tsx')
  assert.match(table, /ชื่อสินค้าไม่เกิน 120 ตัวอักษร/)
  assert.match(table, /ราคาไม่ถูกต้อง/)
  assert.match(table, /จำนวนต้องเป็น 0–999,999/)
  assert.match(table, /aria-invalid=\{Boolean\(error\)\}/)
  assert.doesNotMatch(table, /fetch\(|supabase|executeFoundationCommandAction|\.insert\(|\.update\(/)
})

test('Rapid-UI-05 keeps cell height stable and focus visible', async () => {
  const styles = await read('src/app/globals.css')
  assert.match(styles, /\.live-sale-rapid-editable-cell \{[^}]*min-height: 36px;/)
  assert.match(styles, /\.live-sale-rapid-editable-cell:focus-visible \{[^}]*outline: 2px solid/)
  assert.match(styles, /\.live-sale-rapid-editor input \{[^}]*height: 34px;[^}]*min-height: 34px;/)
  assert.match(styles, /\.live-sale-rapid-editor > small \{[^}]*position: absolute;/)
})

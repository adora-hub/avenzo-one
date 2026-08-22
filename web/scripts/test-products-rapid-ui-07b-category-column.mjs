import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import test from 'node:test'

const tablePath = new URL('../src/app/organizations/[id]/products/live-sale/rapid-entry/rapid-entry-table.tsx', import.meta.url)
const stylesPath = new URL('../src/app/globals.css', import.meta.url)

test('Rapid-UI-07B places Category after Product name and before Price', async () => {
  const source = await readFile(tablePath, 'utf8')
  assert.match(source, /resizableHeader\('image'\)\}\{resizableHeader\('name'\)\}\{resizableHeader\('category'\)\}\{resizableHeader\('price'/)
  assert.match(source, /editableCell\(row, 'productName'\)\}<\/td><td>\{editableCell\(row, 'category'\)\}/)
})

test('Rapid-UI-07B defaults safely to an optional uncategorized value', async () => {
  const source = await readFile(tablePath, 'utf8')
  assert.match(source, /category: 'ไม่ระบุหมวดหมู่'/)
  assert.match(source, /category: row\.category \|\| 'ไม่ระบุหมวดหมู่'/)
  assert.match(source, /const value = row\[field\] \?\? ''/)
  assert.match(source, /originalValue: row\[field\] \?\? ''/)
  assert.match(source, /CATEGORY_OPTIONS = \['ไม่ระบุหมวดหมู่'/)
  assert.doesNotMatch(source, /if \(!row\.category\)/)
})

test('Rapid-UI-07B uses a searchable category combobox per row', async () => {
  const source = await readFile(tablePath, 'utf8')
  assert.match(source, /<datalist id="rapidCategoryOptions">/)
  assert.match(source, /field === 'category' \? 'rapidCategoryOptions'/)
  assert.match(source, /กรุณาเลือกหมวดหมู่ที่กำหนด/)
})

test('Rapid-UI-07B bulk-applies Category to selected or all rows', async () => {
  const source = await readFile(tablePath, 'utf8')
  assert.match(source, /<RapidSelectCombobox[\s\S]{0,500}\{ value: 'category', label: 'หมวดหมู่' \}/)
  assert.match(source, /bulkAction === 'category'/)
  assert.match(source, /categoryOptions\.includes\(value\)/)
  assert.match(source, /\[pendingBulk\.action\]: pendingBulk\.value/)
})

test('Rapid-UI-07B keeps Category resizable without backend writes', async () => {
  const source = await readFile(tablePath, 'utf8')
  const styles = await readFile(stylesPath, 'utf8')
  assert.match(source, /category: \{ label: 'หมวดหมู่', width: 150, min: 110, max: 280 \}/)
  assert.match(source, /column === 'category'/)
  assert.match(styles, /\.live-sale-rapid-table \.category-column \{ width: 150px; \}/)
  assert.doesNotMatch(source, /fetch\(|supabase|executeFoundationCommandAction|\.insert\(|\.update\(/)
})

test('Rapid-UI-07B opens a local Master Data Manager and adds unique categories', async () => {
  const source = await readFile(tablePath, 'utf8')
  const styles = await readFile(stylesPath, 'utf8')
  assert.match(source, /＋ จัดการหมวดหมู่/)
  assert.match(source, /Master Data Manager/)
  assert.match(source, /function addCategory\(/)
  assert.match(source, /มีหมวดหมู่นี้อยู่แล้ว/)
  assert.match(source, /setCategoryOptions\(\(current\) => \[\.\.\.current, normalized\]\)/)
  assert.match(source, /หมวดหมู่ที่เพิ่มจะใช้กับงานชุดนี้เท่านั้น/)
  assert.match(styles, /\.live-sale-category-manager-dialog \{[^}]*width: min\(560px, 100%\);/)
})

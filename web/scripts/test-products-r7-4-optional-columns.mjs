import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import test from 'node:test'
import { PRODUCT_GRID_DEFAULT_COLUMNS, normalizeProductGridColumns } from '../src/app/organizations/[id]/products/product-grid-preferences.ts'

const grid = await readFile(new URL('../src/app/organizations/[id]/products/products-data-grid.tsx', import.meta.url), 'utf8')
const styles = await readFile(new URL('../src/app/globals.css', import.meta.url), 'utf8')
const workspace = await readFile(new URL('../src/app/organizations/[id]/products/product-sku-workspace.tsx', import.meta.url), 'utf8')
const page = await readFile(new URL('../src/app/organizations/[id]/products/page.tsx', import.meta.url), 'utf8')

const optionalKeys = [
  'category', 'brand', 'tags', 'barcode', 'quantityBehavior', 'tax',
  'safetyStock', 'reorder', 'branches', 'createdAt', 'createdBy', 'cost',
]

test('R7.4.4 registers every approved optional column as hidden by default', () => {
  for (const key of optionalKeys) {
    const column = PRODUCT_GRID_DEFAULT_COLUMNS.find((candidate) => candidate.key === key)
    assert.ok(column, `missing optional column ${key}`)
    assert.equal(column.visible, false, `${key} must remain optional`)
  }
})

test('R7.4.4 Customize can show, size, order and pin optional columns with F5 persistence', () => {
  const customized = normalizeProductGridColumns(PRODUCT_GRID_DEFAULT_COLUMNS.map((column) => ({
    ...column,
    visible: column.key === 'category' ? true : column.visible,
    width: column.key === 'category' ? 244 : column.width,
    pinned: ['product', 'category'].includes(column.key),
  })))
  assert.equal(customized.find((column) => column.key === 'category')?.visible, true)
  assert.equal(customized.find((column) => column.key === 'category')?.width, 244)
  assert.equal(customized.filter((column) => column.pinned).length, 2)
  assert.match(grid, /localStorage\.setItem\(storageKey, JSON\.stringify\(normalized\)\)/)
  assert.match(grid, /function reorderCustomizeDraft/)
  assert.match(grid, /function moveCustomizeDraft/)
  assert.match(grid, /draggable/)
  assert.match(grid, /onDragStart=\{\(event\) => startCustomizeDrag\(event, column\.key\)\}/)
  assert.match(grid, /onDrop=\{\(event\) => dropCustomizeDrag\(event, column\.key\)\}/)
  assert.match(grid, /event\.key !== 'ArrowUp' && event\.key !== 'ArrowDown'/)
  assert.match(grid, /function showOrderTooltip/)
  assert.match(grid, /id="product-grid-order-tooltip"/)
  assert.match(styles, /\.product-grid-order-tooltip \{[^}]*position: fixed[^}]*transform: translateY\(-50%\)/)
  assert.match(styles, /\.product-grid-order-tooltip::before \{[^}]*right: 100%[^}]*border-right-color: #111/)
})

test('R7.4.4 pinning keeps the selection column fixed and offsets pinned columns after it', () => {
  assert.match(grid, /const PRODUCT_GRID_SELECTION_WIDTH = 52/)
  assert.match(grid, /return \[\.\.\.visible\.filter\(\(column\) => column\.pinned\), \.\.\.visible\.filter\(\(column\) => !column\.pinned\)\]/)
  assert.match(grid, /let left = PRODUCT_GRID_SELECTION_WIDTH/)
  assert.match(grid, /product-grid-selection product-grid-selection-pinned/)
  assert.match(grid, /product-grid-pinned-boundary/)
  assert.match(grid, /function ProductGridPinIcon\(\)/)
  assert.match(grid, /transform="rotate\(45 12 12\)"/)
  assert.match(grid, /<span>ปักหมุด<\/span><ProductGridPinIcon \/>/)
  assert.match(grid, /className="product-grid-header-pin" title="ปักหมุดแล้ว"/)
  assert.match(styles, /\.product-grid-header-pin \{[^}]*position: absolute[^}]*right: 8px[^}]*transform: translateY\(-50%\)/)
  assert.match(styles, /th:has\(\.product-grid-header-pin\) \.product-grid-sort/)
})

test('R7.4.4 renders optional values from the real row contract', () => {
  for (const expression of [
    'row.category?.name', 'row.brand?.name', 'row.tags.length', 'firstSku?.barcode',
    'row.quantityBehavior', 'row.taxCategory', 'row.safetyStock', 'row.reorderMin',
    'row.stock.branchCodes', 'row.createdAt', 'row.createdByDisplayName', 'row.cost',
  ]) assert.ok(grid.includes(expression), `missing renderer ${expression}`)
})

test('R7.4.4 keeps cost out of the Browser contract unless the server grants product.cost.read', () => {
  assert.match(page, /const canReadCost = permissions\.has\('product\.cost\.read'\)/)
  assert.match(page, /includeCost: canReadCost/)
  assert.match(page, /canReadCost=\{canReadCost\}/)
  assert.match(workspace, /canReadCost=\{canReadCost\}/)
  assert.match(grid, /columns\.filter\(\(column\) => canReadCost \|\| column\.key !== 'cost'\)/)
  assert.match(grid, /customizeDraft\.filter\(\(column\) => canReadCost \|\| column\.key !== 'cost'\)/)
})

test('R7.4.4 does not expose internal note or mutate business data from Customize', () => {
  const customizeFlow = grid.slice(grid.indexOf('function openCustomizeColumns'), grid.indexOf('function startColumnResize'))
  assert.doesNotMatch(grid, /internalNote/)
  assert.doesNotMatch(customizeFlow, /executeFoundationCommandAction/)
  assert.match(grid, /commitColumns\(customizeDraft\)/)
  assert.match(grid, /executeFoundationCommandAction\(command\)/)
})

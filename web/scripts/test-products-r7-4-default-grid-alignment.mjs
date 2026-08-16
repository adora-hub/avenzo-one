import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import test from 'node:test'
import { PRODUCT_GRID_DEFAULT_COLUMNS, normalizeProductGridColumns } from '../src/app/organizations/[id]/products/product-grid-preferences.ts'

const grid = await readFile(new URL('../src/app/organizations/[id]/products/products-data-grid.tsx', import.meta.url), 'utf8')
const css = await readFile(new URL('../src/app/globals.css', import.meta.url), 'utf8')

test('R7.4.3 default columns match the approved mockup order', () => {
  assert.deepEqual(PRODUCT_GRID_DEFAULT_COLUMNS.filter((column) => column.visible).map((column) => column.key), [
    'product', 'salesCode', 'sku', 'stock', 'baseUnit', 'price', 'status', 'updatedAt',
  ])
  assert.equal(PRODUCT_GRID_DEFAULT_COLUMNS.find((column) => column.key === 'price')?.visible, true)
})

test('R7.4.3 safely migrates stored preferences to include the new price column', () => {
  const restored = normalizeProductGridColumns(PRODUCT_GRID_DEFAULT_COLUMNS.filter((column) => column.key !== 'price'))
  assert.equal(restored.filter((column) => column.key === 'price').length, 1)
  assert.equal(restored.find((column) => column.key === 'price')?.width, 140)
  assert.equal(restored.findIndex((column) => column.key === 'price'), restored.findIndex((column) => column.key === 'baseUnit') + 1)
})

test('R7.4.3 renders price from the read-model summary without fake defaults', () => {
  assert.match(grid, /function formatPrice\(row: ProductWorkspaceRow\)/)
  assert.match(grid, /row\.price\.mode === 'mixed-currency'/)
  assert.match(grid, /row\.price\.mode === 'not-set'/)
  assert.match(grid, /Intl\.NumberFormat\('th-TH'/)
  assert.match(grid, /if \(key === 'price'\)/)
  assert.doesNotMatch(grid, /row\.skuPreview\[0\].*salePrice/)
  assert.doesNotMatch(grid, /costPrice/)
})

test('R7.4.3 keeps approved stock and status semantics beside price', () => {
  assert.match(grid, /row\.stock\.mode === 'mixed-units'/)
  assert.match(grid, /Available \$\{row\.stock\.available\}/)
  assert.match(grid, /className={`product-grid-status-select-shell \$\{row\.status\}`}/)
  assert.match(css, /\.product-grid-table th \{[\s\S]*?background: #0b0d10; color: #fff;/)
})

test('R7.4.3 retains width persistence and keyboard resizing after adding price', () => {
  assert.match(grid, /localStorage\.setItem\(storageKey, JSON\.stringify\(normalized\)\)/)
  assert.match(grid, /data-column-resizer=\{column\.key\}/)
  assert.match(grid, /event\.key === 'ArrowRight'/)
  assert.match(grid, /aria-valuenow=\{column\.width\}/)
})

test('product rows keep primary and secondary values on shared vertical tiers', () => {
  assert.match(grid, /const stack = \(primary: ReactNode, secondary\?: ReactNode\)/)
  assert.match(grid, /className="product-grid-cell-primary"/)
  assert.match(grid, /className="product-grid-cell-secondary"/)
  assert.match(css, /\.product-grid-cell-stack \{[^}]*height: 44px[^}]*grid-template-rows: 30px 14px/)
  assert.match(css, /\.product-grid-cell-primary \{[^}]*align-items: center/)
  assert.match(css, /\.product-grid-cell-secondary \{[^}]*line-height: 14px/)
})

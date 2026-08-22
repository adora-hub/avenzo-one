import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import test from 'node:test'
import { PRODUCT_GRID_DEFAULT_COLUMNS, normalizeProductGridColumns } from '../src/app/organizations/[id]/products/product-grid-preferences.ts'
import { formatProductUnit } from '../src/app/organizations/[id]/products/product-unit-labels.ts'

const grid = await readFile(new URL('../src/app/organizations/[id]/products/products-data-grid.tsx', import.meta.url), 'utf8')
const css = await readFile(new URL('../src/app/globals.css', import.meta.url), 'utf8')

test('R7.4.3 default columns match the approved mockup order', () => {
  assert.deepEqual(PRODUCT_GRID_DEFAULT_COLUMNS.filter((column) => column.visible).map((column) => column.key), [
    'product', 'salesCode', 'sku', 'stock', 'stockStatus', 'baseUnit', 'price', 'status', 'updatedAt',
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
  const priceRenderer = grid.slice(grid.indexOf("if (key === 'price')"), grid.indexOf("if (key === 'category')"))
  assert.doesNotMatch(priceRenderer, /costPrice/)
})

test('R7.4.3 keeps approved stock and status semantics beside price', () => {
  assert.match(grid, /row\.stock\.mode === 'mixed-units'/)
  assert.match(grid, /Available \$\{row\.stock\.available\}/)
  assert.match(grid, /className={`product-grid-status-select-shell \$\{row\.status\}`}/)
  assert.match(css, /\.product-grid-table th \{[\s\S]*?background: #0b0d10; color: #fff;/)
})

test('Products displays base units in Thai without changing stored codes', () => {
  assert.equal(formatProductUnit('piece'), 'ชิ้น')
  assert.equal(formatProductUnit('pair'), 'คู่')
  assert.equal(formatProductUnit('pack'), 'แพ็ค')
  assert.equal(formatProductUnit('custom_unit'), 'custom_unit')
  assert.match(grid, /formatProductUnit\(row\.stock\.baseUnitCode\)/)
  assert.match(grid, /formatProductUnit\(sku\.baseUnitCode\)/)
})

test('R7.4.3 retains width persistence and keyboard resizing after adding price', () => {
  assert.match(grid, /localStorage\.setItem\(storageKey, JSON\.stringify\(normalized\)\)/)
  assert.match(grid, /data-column-resizer=\{column\.key\}/)
  assert.match(grid, /event\.key === 'ArrowRight'/)
  assert.match(grid, /aria-valuenow=\{column\.width\}/)
})

test('column boundaries auto-fit visible header and cell content like Excel', () => {
  assert.match(grid, /function autoFitColumn\(column: ProductGridColumnPreference\)/)
  assert.match(grid, /tbody > tr:not\(\.product-grid-variant-expanded-row\) > td:nth-child/)
  assert.match(grid, /context\.measureText\(line\.trim\(\)\)\.width/)
  assert.match(grid, /productMediaWidth/)
  assert.match(grid, /Math\.min\(Math\.max\(Math\.ceil\(preferredWidth \+ 10\), 96\), 520\)/)
  assert.match(grid, /onDoubleClick=\{\(\) => autoFitColumn\(column\)\}/)
  assert.match(grid, /if \(event\.detail > 1\) \{[\s\S]*?autoFitColumn\(column\)/)
  assert.match(grid, /event\.key === 'Enter'/)
  assert.match(grid, /ดับเบิลคลิกเพื่อปรับให้พอดีกับข้อมูล/)
})

test('product rows keep primary and secondary values on shared vertical tiers', () => {
  assert.match(grid, /const stack = \(primary: ReactNode, secondary\?: ReactNode\)/)
  assert.match(grid, /className="product-grid-cell-primary"/)
  assert.match(grid, /className="product-grid-cell-secondary"/)
  assert.match(css, /\.product-grid-cell-stack \{[^}]*height: 44px[^}]*grid-template-rows: 30px 14px/)
  assert.match(css, /\.product-grid-cell-primary \{[^}]*align-items: center/)
  assert.match(css, /\.product-grid-cell-secondary \{[^}]*line-height: 14px/)
})

test('products with multiple SKUs expand into an accessible real-system variant card', () => {
  assert.match(grid, /const \[expandedRows, setExpandedRows\] = useState<Set<string>>/)
  assert.match(grid, /aria-controls={`product-grid-variants-\$\{row\.id\}-desktop`}/)
  assert.match(grid, /SKU \/ ตัวเลือกทั้งหมด/)
  assert.match(grid, /รหัสขาย \/ CF/)
  assert.match(grid, /formatSkuPrice\(sku\)/)
  assert.match(grid, /expandedRows\.has\(row\.id\) && row\.skuCount > 1/)
  assert.match(css, /\.product-grid-variant-card \{[^}]*border: 1px solid var\(--border-default\)/)
  assert.match(css, /\.product-grid-variant-table-head, \.product-grid-variant-table-row \{[^}]*grid-template-columns:/)
  assert.match(css, /\.product-grid-table \.product-grid-pinned-boundary \{[^}]*overflow: visible[^}]*box-shadow: none/)
  assert.match(css, /\.product-grid-table \.product-grid-pinned-boundary::after \{[^}]*left: 100%[^}]*width: 18px[^}]*linear-gradient/)
  assert.doesNotMatch(css, /\.product-grid-table \.product-grid-pinned-boundary \{[^}]*border-right:/)
})

test('every Products code uses the shared Copy icon with a top tooltip', () => {
  assert.match(grid, /function copyButton\(value: string, key: string, tooltip: string\)/)
  assert.equal((grid.match(/copyButton\(/g) ?? []).length, 7)
  assert.match(grid, /onMouseEnter=\{\(event\) => showCopyTooltip\(event\.currentTarget, key, tooltip\)\}/)
  assert.match(grid, /onFocus=\{\(event\) => showCopyTooltip\(event\.currentTarget, key, tooltip\)\}/)
  assert.doesNotMatch(grid, /'คัดลอกแล้ว' : 'คัดลอก'/)
  assert.match(css, /\.product-grid-code-line \.product-grid-copy-button, \.product-grid-variant-code \.product-grid-copy-button/)
  assert.match(css, /\.product-grid-copy-tooltip \{[^}]*position: fixed[^}]*transform: translate\(-50%, -100%\)/)
})

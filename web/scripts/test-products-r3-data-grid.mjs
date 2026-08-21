import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import test from 'node:test'
import {
  normalizeProductGridColumns,
  PRODUCT_GRID_DEFAULT_COLUMNS,
} from '../src/app/organizations/[id]/products/product-grid-preferences.ts'

const grid = await readFile(new URL('../src/app/organizations/[id]/products/products-data-grid.tsx', import.meta.url), 'utf8')
const workspace = await readFile(new URL('../src/app/organizations/[id]/products/product-sku-workspace.tsx', import.meta.url), 'utf8')
const css = await readFile(new URL('../src/app/globals.css', import.meta.url), 'utf8')

test('R3 preference normalization rejects unknown, duplicate and unsafe widths', () => {
  const normalized = normalizeProductGridColumns([
    { key: 'product', visible: true, width: 9999, pinned: true },
    { key: 'product', visible: false, width: 10, pinned: false },
    { key: 'unknown', visible: true, width: 120, pinned: true },
  ])
  assert.equal(normalized.length, PRODUCT_GRID_DEFAULT_COLUMNS.length)
  assert.equal(normalized[0].key, 'product')
  assert.equal(normalized[0].width, 520)
})

test('R3 enforces a maximum of three pinned columns', () => {
  const normalized = normalizeProductGridColumns(PRODUCT_GRID_DEFAULT_COLUMNS.map((column) => ({
    ...column, pinned: true,
  })))
  assert.equal(normalized.filter((column) => column.pinned).length, 3)
})

test('R3 preserves a valid resized width for restoration after refresh', () => {
  const normalized = normalizeProductGridColumns(PRODUCT_GRID_DEFAULT_COLUMNS.map((column) => ({
    ...column, width: column.key === 'product' ? 318 : column.width,
  })))
  assert.equal(normalized.find((column) => column.key === 'product')?.width, 318)
})

test('R3 renders the approved real-data default columns, price model and Cost Quick Edit', () => {
  for (const label of ['สินค้า', 'รหัส CF', 'SKU / ตัวเลือก', 'สต็อก', 'หน่วยนับ', 'ราคาขาย', 'สถานะ', 'แก้ไขล่าสุด']) {
    assert.match(grid, new RegExp(label.replace('/', '\\/')))
  }
  assert.match(grid, /costPrice/)
  assert.match(grid, /formatSkuCost/)
  assert.match(grid, /row\.price\.mode/)
  assert.match(grid, /product-grid-placeholder/)
})

test('R3 provides copy, column customization, persistent preferences and safe stock wording', () => {
  assert.match(grid, /navigator\.clipboard\.writeText/)
  assert.match(grid, /localStorage\.setItem/)
  assert.match(grid, /function commitColumns/)
  assert.doesNotMatch(grid, /function commitColumns[\s\S]*?if \(!ready\) return[\s\S]*?localStorage\.setItem\(storageKey, JSON\.stringify\(normalized\)\)/)
  assert.match(grid, /localStorage\.setItem\(storageKey, JSON\.stringify\(normalized\)\)/)
  assert.match(grid, /normalizeProductGridColumns/)
  assert.match(grid, /data-column-resizer=\{column\.key\}/)
  assert.match(grid, /setPointerCapture\(event\.pointerId\)/)
  assert.match(grid, /role="separator"/)
  assert.match(grid, /aria-valuenow=\{column\.width\}/)
  assert.match(grid, /aria-label="เลือกสินค้าทั้งหมด"/)
  assert.match(grid, /function toggleSort/)
  assert.match(grid, /จัดเรียงตาม\$\{labels\[column\.key\]\}/)
  assert.match(grid, /ไม่รวมยอดข้ามหน่วย/)
  assert.match(grid, /copyButton\(firstSku\.salesCode, `\$\{row\.id\}:sales`, 'คัดลอกรหัส CF'\)/)
  assert.match(grid, /copyButton\(firstSku\.skuCode, `\$\{row\.id\}:sku`, 'คัดลอก SKU'\)/)
})

test('R3 keeps URL search, keyboard search and responsive table semantics', () => {
  assert.match(workspace, /method="get"/)
  assert.match(workspace, /event\.ctrlKey/)
  assert.match(workspace, /ProductWorkspaceRows|productWorkspaceRows/)
  assert.match(grid, /<table className="product-data-table product-grid-table">/)
  assert.match(grid, /role="list" aria-label="รายการ Product"/)
  assert.match(grid, /className="product-grid-sort"/)
  assert.match(grid, /updated_desc.*updated_asc|updated_asc.*updated_desc/s)
  assert.match(css, /\.product-grid-table th \{[\s\S]*?background: #0b0d10; color: #fff;/)
  assert.match(css, /html\[data-theme="dark"\] \.product-grid-table th/)
})

test('R3 keeps the actions column visible at the right edge', () => {
  assert.match(grid, /product-grid-actions-column product-grid-actions-column-header/)
  assert.match(grid, /<span className="sr-only">การดำเนินการ<\/span>/)
  assert.match(grid, /<td className="product-grid-actions-column"><button className="product-grid-row-action"/)
  assert.match(css, /\.product-grid-table \.product-grid-actions-column \{[\s\S]*position: sticky;[\s\S]*right: 0;/)
  assert.match(grid, /showCopyTooltip\(event\.currentTarget, `\$\{row\.id\}:actions`, 'การดำเนินการ'\)/)
  assert.match(css, /\.product-grid-row-action:hover \{[^}]*background: transparent;[^}]*outline: 0;/)
})

test('R3 keeps the native horizontal scrollbar at the bottom of the visible table workspace', () => {
  assert.doesNotMatch(grid, /product-grid-sticky-scrollbar/)
  assert.match(grid, /ref=\{productTableViewportRef\}/)
  assert.match(grid, /ref=\{productPaginationFooterRef\}/)
  assert.match(grid, /window\.innerHeight - tableTop - footerHeight/)
  assert.match(css, /\.product-grid-wrap\s*\{[^}]*max-height:\s*var\(--product-grid-viewport-height,[^;]+\);[^}]*overflow:\s*auto;/)
  assert.match(css, /\.product-grid-table th\s*\{[^}]*position:\s*sticky;[^}]*top:\s*0;/)
})

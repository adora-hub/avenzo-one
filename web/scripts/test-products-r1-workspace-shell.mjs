import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import test from 'node:test'

const page = await readFile(new URL('../src/app/organizations/[id]/products/page.tsx', import.meta.url), 'utf8')
const workspace = await readFile(new URL('../src/app/organizations/[id]/products/product-sku-workspace.tsx', import.meta.url), 'utf8')
const breadcrumb = await readFile(new URL('../src/app/components/product-header-breadcrumb.tsx', import.meta.url), 'utf8')
const css = await readFile(new URL('../src/app/globals.css', import.meta.url), 'utf8')

test('R1 uses the production route, shell and permission boundary', () => {
  assert.match(page, /<ApplicationShell/)
  assert.match(page, /permissions\.has\('product\.read'\)/)
  assert.match(page, /permissions\.has\('product\.manage'\)/)
  assert.match(page, /className="content product-workspace-page"/)
})

test('R1 adds the approved breadcrumb and truthful page-count badge', () => {
  assert.match(page, /headerBreadcrumb=\{<ProductHeaderBreadcrumb organizationId=\{organizationId\} \/>\}/)
  assert.match(breadcrumb, /<nav className="product-header-breadcrumb"/)
  assert.match(breadcrumb, /<svg[\s\S]*?aria-current="page"/)
  assert.match(workspace, /className="product-modern-heading"/)
  assert.match(workspace, /className="product-count-badge"/)
  assert.match(page, /skuCount=\{view === 'products' \? productWorkspaceRows\.reduce/)
  assert.match(workspace, /view === 'products' \? 'สินค้า' : 'รหัสสินค้า \(SKU\)'/)
  assert.match(workspace, /จัดการสินค้า รหัสสินค้า \(SKU\) รหัสขาย \/ รหัส CF และบาร์โค้ด/)
  assert.doesNotMatch(workspace, /view === 'products' \? 'Products'/)
  assert.doesNotMatch(workspace, /จัดการสินค้า รหัส SKU, Sales Code และ Barcode/)
  assert.match(workspace, /\{skuCount\} SKU/)
  assert.doesNotMatch(page, /OperationsSummaryCard/)
})

test('R1 applies full-width responsive gutters without prototype controls', () => {
  assert.match(css, /\.app-shell-main \.content\.product-workspace-page \{ width: 100%; max-width: 1920px; padding-right: 32px; padding-left: 32px; \}/)
  assert.match(css, /@media \(min-width: 1600px\)[\s\S]*?padding-right: 48px; padding-left: 48px;/)
  assert.match(css, /@media \(min-width: 761px\) and \(max-width: 1279px\)[\s\S]*?padding-right: 24px; padding-left: 24px;/)
  assert.match(css, /@media \(max-width: 760px\)[\s\S]*?padding-right: 14px; padding-left: 14px;/)
  assert.doesNotMatch(page + workspace, /themeButton|resetPrototypeButton|UI Prototype/)
})

test('R1 preserves existing commands and SKU/product-option reads as later parts evolve', () => {
  assert.match(page, /repository\.listProductWorkspaceRows/)
  assert.match(page, /repository\.listProducts\(\{ organizationId, pageSize: 100 \}\)/)
  assert.match(page, /repository\.listSkus/)
  assert.match(workspace, /executeFoundationCommandAction/)
})

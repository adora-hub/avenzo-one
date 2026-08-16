import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import test from 'node:test'

const grid = await readFile(new URL('../src/app/organizations/[id]/products/products-data-grid.tsx', import.meta.url), 'utf8')
const workspace = await readFile(new URL('../src/app/organizations/[id]/products/product-sku-workspace.tsx', import.meta.url), 'utf8')
const page = await readFile(new URL('../src/app/organizations/[id]/products/page.tsx', import.meta.url), 'utf8')
const repository = await readFile(new URL('../src/lib/foundation/supabase-repository.ts', import.meta.url), 'utf8')

test('Products pagination exposes the approved rows-per-page choices', () => {
  assert.match(grid, /const PRODUCT_GRID_PAGE_SIZES = \[10, 25, 50, 100, 300, 400\] as const/)
  assert.match(page, /const productPageSizes = new Set\(\[10, 25, 50, 100, 300, 400\]\)/)
  assert.match(grid, /aria-label="จำนวนแถวต่อหน้า"/)
})

test('Products pagination renders range info and first previous next last icon controls', () => {
  assert.match(grid, /\{rangeStart\}–\{rangeEnd\} of \{totalCount\}/)
  for (const direction of ['first', 'previous', 'next', 'last']) {
    assert.ok(grid.includes(`direction="${direction}"`), `missing ${direction} pagination icon`)
  }
  assert.match(grid, /aria-label="หน้าแรก"/)
  assert.match(grid, /aria-label="หน้าก่อนหน้า"/)
  assert.match(grid, /aria-label="หน้าถัดไป"/)
  assert.match(grid, /aria-label="หน้าสุดท้าย"/)
})

test('Products pagination is backed by exact tenant-scoped server ranges up to 400 rows', () => {
  assert.match(repository, /const PRODUCT_WORKSPACE_PAGE_SIZES = new Set\(\[10, 25, 50, 100, 300, 400\]\)/)
  assert.match(repository, /useOffsetPagination \? \{ count: 'exact' \} : undefined/)
  assert.match(repository, /productQuery\.range\(\(page - 1\) \* pageSize, page \* pageSize - 1\)/)
  assert.match(repository, /totalCount: useOffsetPagination \? productCount \?\? 0 : undefined/)
  assert.match(repository, /\.eq\('organization_id', input\.organizationId\)/)
})

test('Products pagination keeps filters and page size while resetting filter results to page one', () => {
  assert.match(workspace, /page_size: view === 'products' \? String\(productPageSize\) : undefined/)
  assert.match(grid, /if \(search\) params\.set\('q', search\)/)
  assert.match(grid, /if \(status\) params\.set\('status', status\)/)
  assert.match(grid, /paginationHref\(1, Number\(event\.target\.value\)\)/)
  assert.match(page, /if \(view === 'products' && productPage > productTotalPages\)/)
})

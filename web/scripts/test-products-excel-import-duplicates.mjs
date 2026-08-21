import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import test from 'node:test'
import { findProductImportFileDuplicates } from '../src/app/organizations/[id]/products/product-excel-import-duplicates.ts'

const row = (sourceRow, skuCode, salesCode, barcode) => ({
  sourceRow, productName: `Product ${sourceRow}`, categoryName: 'Category', brandName: null,
  skuCode, salesCode, barcode, baseUnitCode: 'piece', quantityBehavior: 'discrete',
  salePrice: 100, taxCategory: 'standard', taxRate: 7, tags: [], branches: ['BKK-01'], status: 'draft',
})

test('same identifier may be reused by fields that belong to one SKU', () => {
  assert.deepEqual(findProductImportFileDuplicates([row(2, 'A001', 'A001', 'A001')]), [])
})

test('same identifier in different source rows is reported for every occurrence', () => {
  const issues = findProductImportFileDuplicates([
    row(2, 'SKU-001', 'A001', null),
    row(3, 'SKU-002', 'A001', '885000000001'),
  ])
  assert.equal(issues.length, 2)
  assert.deepEqual(issues.map((issue) => issue.sourceRow), [2, 3])
  assert.ok(issues.every((issue) => issue.code === 'duplicate_file'))
})

test('organization duplicate checker is permissioned, tenant scoped and batched', async () => {
  const source = await readFile(new URL('../src/lib/foundation/product-import-check.server.ts', import.meta.url), 'utf8')
  assert.match(source, /requireFoundationPermission\(actor, 'product\.create'\)/)
  assert.match(source, /requireFoundationPermission\(actor, 'sku\.create'\)/)
  assert.match(source, /\.eq\('organization_id', organizationId\)/)
  assert.match(source, /index \+= 100/)
  assert.match(source, /grandfatheredSalesCodes/)
  assert.match(source, /conflictingSalesCodes/)
})

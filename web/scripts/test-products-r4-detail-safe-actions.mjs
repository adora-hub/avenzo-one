import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import test from 'node:test'

import {
  buildProductWorkspaceDetail,
  skuCanArchive,
} from '../src/lib/foundation/product-detail-read-model.ts'

const workspaceSource = await readFile(new URL('../src/app/organizations/[id]/products/product-sku-workspace.tsx', import.meta.url), 'utf8')
const detailSource = await readFile(new URL('../src/app/organizations/[id]/products/product-detail-sheet.tsx', import.meta.url), 'utf8')
const repositorySource = await readFile(new URL('../src/lib/foundation/supabase-repository.ts', import.meta.url), 'utf8')
const errorsSource = await readFile(new URL('../src/lib/foundation/errors.ts', import.meta.url), 'utf8')

const product = {
  id: 'product-1', organizationId: 'org-1', name: 'ต่างหู Dior สีทอง',
  description: 'ตัวอย่าง', status: 'active', version: 3,
  createdAt: '2026-08-14T01:00:00Z', createdByUserId: 'user-1', updatedAt: '2026-08-15T01:00:00Z',
}
const sku = {
  id: 'sku-1', productId: 'product-1', skuCode: 'JWL-DIOR-001', name: 'สีทอง',
  barcode: '885000000001', salesCode: 'B001', baseUnitCode: 'pair', status: 'active',
  version: 2, updatedAt: '2026-08-15T01:00:00Z',
}

test('builds product detail with SKU identifiers and per-SKU inventory', () => {
  const detail = buildProductWorkspaceDetail({
    product,
    skus: [sku],
    balances: [
      { skuId: sku.id, onHand: 6, allocated: 1, available: 5, branchCode: 'BKK-01' },
      { skuId: sku.id, onHand: 2, allocated: 0, available: 2, branchCode: 'PKT-01' },
    ],
    includeInventory: true,
  })
  assert.equal(detail.skuCount, 1)
  assert.equal(detail.skus[0].salesCode, 'B001')
  assert.equal(detail.skus[0].stock.onHand, 8)
  assert.deepEqual(detail.skus[0].stock.branchCodes, ['BKK-01', 'PKT-01'])
})

test('does not expose stock totals without inventory.read', () => {
  const detail = buildProductWorkspaceDetail({
    product, skus: [sku], balances: [], includeInventory: false,
  })
  assert.equal(detail.stock.mode, 'not-authorized')
  assert.equal(detail.skus[0].stock.onHand, null)
})

test('archive guard blocks a SKU with nonzero on-hand stock', () => {
  assert.equal(skuCanArchive({ mode: 'single-unit', baseUnitCode: 'pair', onHand: 1, allocated: 0, available: 1, branchCodes: [] }), false)
  assert.equal(skuCanArchive({ mode: 'single-unit', baseUnitCode: 'pair', onHand: 0, allocated: 0, available: 0, branchCodes: [] }), true)
  assert.equal(skuCanArchive({ mode: 'not-authorized', baseUnitCode: 'pair', onHand: null, allocated: null, available: null, branchCodes: [] }), false)
})

test('repository detail queries are tenant scoped and bounded', () => {
  const section = repositorySource.slice(
    repositorySource.indexOf('async getProductWorkspaceDetail'),
    repositorySource.indexOf('async listProducts'),
  )
  assert.match(section, /\.eq\('organization_id', input\.organizationId\)/)
  assert.match(section, /\.eq\('product_id', input\.productId\)/)
  assert.match(section, /PRODUCT_DETAIL_SKU_LIMIT \+ 1/)
  assert.match(section, /PRODUCT_WORKSPACE_BALANCE_AGGREGATE_LIMIT \+ 1/)
  assert.doesNotMatch(section, /service_role|serviceRole/)
})

test('safe action UI protects immutable identifiers and version conflicts', () => {
  assert.match(workspaceSource, /selectedSku\.salesCode \?\? String\(data\.get\('salesCode'\)/)
  assert.match(workspaceSource, /บันทึกถาวรแล้ว เปลี่ยนไม่ได้/)
  assert.match(workspaceSource, /SKU Code[\s\S]*Base Unit[\s\S]*แก้ไขไม่ได้/)
  assert.match(workspaceSource, /feedback\.code === 'version_conflict'/)
  assert.match(workspaceSource, /role="alertdialog"/)
  assert.doesNotMatch(workspaceSource, /window\.confirm/)
  assert.doesNotMatch(detailSource, /product-detail-actions/)
  assert.doesNotMatch(detailSource, /requestLifecycle/)
  assert.doesNotMatch(detailSource, /openEditor/)
})

test('database permanence errors map to a specific safe UI error', () => {
  assert.match(errorsSource, /\['sku_sales_code_is_permanent', 'immutable_identifier', 409\]/)
  assert.match(errorsSource, /\['sku_base_unit_is_immutable', 'immutable_identifier', 409\]/)
})

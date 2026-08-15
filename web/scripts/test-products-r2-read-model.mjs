import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import test from 'node:test'
import {
  buildProductWorkspaceRows,
  PRODUCT_WORKSPACE_SKU_PREVIEW_LIMIT,
} from '../src/lib/foundation/product-workspace-read-model.ts'

const repository = await readFile(new URL('../src/lib/foundation/supabase-repository.ts', import.meta.url), 'utf8')
const page = await readFile(new URL('../src/app/organizations/[id]/products/page.tsx', import.meta.url), 'utf8')

const product = {
  id: 'p1', organizationId: 'o1', name: 'ต่างหู Dior', description: null,
  status: 'active', version: 1, createdAt: '2026-08-01T00:00:00Z',
  createdByUserId: 'u1', updatedAt: '2026-08-15T00:00:00Z',
}

function sku(id, baseUnitCode = 'pair') {
  return {
    id, productId: 'p1', skuCode: `SKU-${id}`, name: `ตัวเลือก ${id}`,
    barcode: null, salesCode: `B${id}`, baseUnitCode, status: 'active',
  }
}

test('R2 sums stock only when every SKU uses one base unit', () => {
  const [row] = buildProductWorkspaceRows({
    products: [product], skus: [sku('001'), sku('002')], includeInventory: true,
    balances: [
      { skuId: '001', onHand: 4, allocated: 1, available: 3, branchCode: 'BKK-01' },
      { skuId: '002', onHand: 6, allocated: 2, available: 4, branchCode: 'BKK-01' },
    ],
  })
  assert.equal(row.stock.mode, 'single-unit')
  assert.deepEqual(
    { onHand: row.stock.onHand, allocated: row.stock.allocated, available: row.stock.available },
    { onHand: 10, allocated: 3, available: 7 },
  )
  assert.deepEqual(row.stock.branchCodes, ['BKK-01'])
})

test('R2 never sums mixed base units', () => {
  const [row] = buildProductWorkspaceRows({
    products: [product], skus: [sku('001', 'pair'), sku('002', 'pack')], includeInventory: true,
    balances: [
      { skuId: '001', onHand: 4, allocated: 0, available: 4, branchCode: 'BKK-01' },
      { skuId: '002', onHand: 6, allocated: 0, available: 6, branchCode: 'PKT-01' },
    ],
  })
  assert.equal(row.stock.mode, 'mixed-units')
  assert.equal(row.stock.onHand, null)
  assert.equal(row.stock.available, null)
  assert.equal(row.stock.baseUnitCode, null)
})

test('R2 distinguishes no balance from no inventory permission', () => {
  const [empty] = buildProductWorkspaceRows({
    products: [product], skus: [sku('001')], balances: [], includeInventory: true,
  })
  const [denied] = buildProductWorkspaceRows({
    products: [product], skus: [sku('001')], balances: [], includeInventory: false,
  })
  assert.equal(empty.stock.mode, 'no-balance')
  assert.equal(denied.stock.mode, 'not-authorized')
})

test('R2 returns an exact count and a bounded SKU preview', () => {
  const skus = Array.from({ length: 8 }, (_, index) => sku(String(index + 1).padStart(3, '0')))
  const [row] = buildProductWorkspaceRows({
    products: [product], skus, balances: [], includeInventory: true,
  })
  assert.equal(row.skuCount, 8)
  assert.equal(row.skuPreview.length, PRODUCT_WORKSPACE_SKU_PREVIEW_LIMIT)
})

test('R2 repository uses bounded batch queries and the page enforces inventory.read', () => {
  assert.match(repository, /async listProductWorkspaceRows/)
  assert.match(repository, /\.in\('product_id', productIds\)/)
  assert.match(repository, /\.in\('sku_id', skuIds\)/)
  assert.match(repository, /PRODUCT_WORKSPACE_SKU_AGGREGATE_LIMIT/)
  assert.match(repository, /PRODUCT_WORKSPACE_BALANCE_AGGREGATE_LIMIT/)
  assert.match(page, /permissions\.has\('inventory\.read'\)/)
  assert.match(page, /includeInventory: canReadInventory/)
})

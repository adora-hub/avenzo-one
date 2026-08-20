import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import test from 'node:test'
import { buildProductWorkspaceRows } from '../src/lib/foundation/product-workspace-read-model.ts'

const repository = await readFile(new URL('../src/lib/foundation/supabase-repository.ts', import.meta.url), 'utf8')
const page = await readFile(new URL('../src/app/organizations/[id]/products/page.tsx', import.meta.url), 'utf8')
const detailBuilder = await readFile(new URL('../src/lib/foundation/product-detail-read-model.ts', import.meta.url), 'utf8')

const product = {
  id: 'p1', organizationId: 'o1', name: 'ต่างหู Dior', description: 'สีทอง',
  category: { id: 'c1', name: 'เครื่องประดับ' }, brand: { id: 'b1', name: 'Dior' },
  structureType: 'variant', internalNote: 'ภายในเท่านั้น', tags: [{ id: 't1', name: 'งานใหม่' }],
  status: 'active', version: 2, createdAt: '2026-08-01T00:00:00Z',
  createdByUserId: 'u1', createdByDisplayName: 'Tanya', updatedAt: '2026-08-15T00:00:00Z',
}

function sku(id, price, currencyCode = 'THB') {
  return {
    id, productId: 'p1', skuCode: `SKU-${id}`, name: `ตัวเลือก ${id}`,
    barcode: null, salesCode: `B${id}`, baseUnitCode: 'pair', status: 'active',
    profile: {
      quantityBehavior: 'discrete', salePrice: price, currencyCode,
      taxCategory: 'standard', taxRate: 7,
      productWeightKg: 0.1, productLengthCm: 2, productWidthCm: 1, productHeightCm: 1,
      packageWeightKg: 0.2, packageLengthCm: 8, packageWidthCm: 6, packageHeightCm: 3,
      safetyStock: 2, reorderMin: 5, reorderMax: 20,
    },
    cost: { mode: 'authorized', costPrice: 100, currencyCode: 'THB' },
  }
}

test('R7.4.2 exposes Product master data and creator display name as serializable fields', () => {
  const [row] = buildProductWorkspaceRows({ products: [product], skus: [sku('001', 550)], balances: [], includeInventory: true })
  assert.deepEqual(row.category, product.category)
  assert.deepEqual(row.brand, product.brand)
  assert.deepEqual(row.tags, product.tags)
  assert.equal(row.createdByDisplayName, 'Tanya')
  assert.equal(row.structureType, 'variant')
})

test('R7.4.2 summarizes one price and a same-currency price range without inventing currency', () => {
  const [single] = buildProductWorkspaceRows({ products: [product], skus: [sku('001', 550)], balances: [], includeInventory: true })
  const [range] = buildProductWorkspaceRows({ products: [product], skus: [sku('001', 550), sku('002', 650)], balances: [], includeInventory: true })
  assert.deepEqual(single.price, { mode: 'single', currencyCode: 'THB', minimum: 550, maximum: 550 })
  assert.deepEqual(range.price, { mode: 'range', currencyCode: 'THB', minimum: 550, maximum: 650 })
})

test('R7.4.2 reports mixed currencies instead of converting or summing them', () => {
  const [row] = buildProductWorkspaceRows({ products: [product], skus: [sku('001', 550), sku('002', 20, 'USD')], balances: [], includeInventory: true })
  assert.deepEqual(row.price, { mode: 'mixed-currency', currencyCode: null, minimum: null, maximum: null })
})

test('R7.4.2 keeps per-SKU physical, sell-unit and bundle detail', () => {
  assert.match(detailBuilder, /internalNote: input\.product\.internalNote \?\? null/)
  assert.match(detailBuilder, /profile: sku\.profile \?\? null/)
  assert.match(detailBuilder, /sellUnits: \[\.\.\.\(sku\.sellUnits \?\? \[\]\)\]/)
  assert.match(detailBuilder, /bundleComponents: \[\.\.\.\(sku\.bundleComponents \?\? \[\]\)\]/)
  assert.match(repository, /componentSkuCode: String\(componentSku\.sku_code\)/)
})

test('R7.4.2 enforces the cost permission before querying cost profiles', () => {
  assert.match(page, /permissions\.has\('product\.cost\.read'\)/)
  assert.match(page, /includeCost: canReadCost/)
  assert.match(repository, /input\.includeCost && skuIds\.length > 0\s*\? this\.client\.from\('sku_cost_profiles'\)/)
  assert.match(repository, /mapSkuCost\(costBySku\.get\(String\(row\.id\)\), Boolean\(input\.includeCost\)\)/)
})

test('R7.4.2 uses bounded batch reads and does not query extended data per row', () => {
  for (const table of ['product_categories', 'product_brands', 'product_tag_assignments', 'product_tags', 'sku_product_profiles', 'sku_sell_units', 'sku_bundle_components']) {
    assert.ok(repository.includes(`from('${table}')`), `missing ${table} batch read`)
  }
  assert.match(repository, /Promise\.all\(\[/)
  assert.match(repository, /PRODUCT_WORKSPACE_TAG_AGGREGATE_LIMIT/)
  assert.doesNotMatch(repository, /for \([^)]*product[^)]*\) \{[\s\S]{0,300}await this\.client\.from/)
})

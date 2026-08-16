import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import test from 'node:test'

const read = (path) => readFile(new URL(path, import.meta.url), 'utf8')
const contractPath = '../../docs/AVENZO_ONE_Phase_2.1.R7.4.1_Product_Field_Contract_Freeze.md'
const formPath = '../src/app/organizations/[id]/products/new/unified-product-creation-form.tsx'
const atomicMigrationPath = '../../supabase/migrations/20260815103024_phase_2_1_r7_1_atomic_product_creation.sql'
const productDomainMigrationPath = '../../supabase/migrations/20260815083258_phase_2_1_r5_product_domain_extension.sql'

test('R7.4.1 retains the approved contract after its sequential gate passed', async () => {
  const contract = await read(contractPath)
  assert.match(contract, /Completed \/ Owner approved.*Sequential gate passed/)
  assert.match(contract, /ห้ามทำ Part พร้อมกัน/)
  assert.match(contract, /ไม่มี Migration, UI\/TSX, Database write หรือ Supabase Production apply/)
})

test('R7.4.1 maps Product and SKU identity fields to their database authorities', async () => {
  const contract = await read(contractPath)
  for (const authority of [
    'products.name', 'products.category_id', 'products.brand_id',
    'skus.sku_code', 'skus.sales_code', 'skus.barcode', 'skus.base_unit_code',
  ]) assert.ok(contract.includes(authority), `missing authority ${authority}`)
})

test('R7.4.1 maps persisted extended fields that the read model must load next', async () => {
  const contract = await read(contractPath)
  for (const authority of [
    'product_tag_assignments', 'sku_product_profiles', 'sku_cost_profiles',
    'sku_sell_units', 'sku_bundle_components', 'product_images',
  ]) assert.ok(contract.includes(authority), `missing extended authority ${authority}`)
  assert.match(contract, /PERSISTED_NOT_READ/)
})

test('R7.4.1 locks the approved default and optional grid contracts', async () => {
  const contract = await read(contractPath)
  assert.match(contract, /Default columns — ต้องตรง Approved Mockup/)
  assert.match(contract, /6\. ราคาขาย/)
  assert.match(contract, /Optional columns — ผ่าน Customize เท่านั้น/)
  assert.match(contract, /ราคาต้นทุนเฉพาะผู้มี `product\.cost\.read`/)
})

test('R7.4.1 keeps stock derived from inventory and outside Product creation', async () => {
  const contract = await read(contractPath)
  const atomicMigration = await read(atomicMigrationPath)
  assert.match(contract, /Stock ต้องผ่าน Inventory command แยก/)
  assert.match(contract, /Available.*DERIVED/s)
  assert.match(atomicMigration, /'inventory_posted', false/)
  assert.doesNotMatch(atomicMigration, /insert into public\.inventory_balances/)
})

test('R7.4.1 preserves the cost permission boundary at database and UI contracts', async () => {
  const contract = await read(contractPath)
  const migration = await read(productDomainMigrationPath)
  assert.match(migration, /'product\.cost\.read'/)
  assert.match(migration, /create policy sku_cost_profiles_read/)
  assert.match(contract, /ผู้ไม่มีสิทธิ์ต้องไม่ได้รับข้อมูลตั้งแต่ Server/)
})

test('R7.4.1 records truthful branch and multi-SKU deferred boundaries', async () => {
  const contract = await read(contractPath)
  const form = await read(formPath)
  assert.match(contract, /selectedBranchIds.*UI_DRAFT_ONLY/)
  assert.match(contract, /R7\.5 Branch Sales Scope/)
  assert.match(contract, /R7\.1 Atomic command บันทึกเฉพาะ `skuDrafts\[0\]`/)
  assert.match(contract, /Form ต้องป้องกัน submit หลาย SKUต่อไป|Form ต้องป้องกัน submit หลาย SKU ต่อไป/)
  assert.match(form, /const initialSku = skuDrafts\[0\]/)
})

test('R7.4.1 verifies the form payload and atomic inserts use the same field families', async () => {
  const form = await read(formPath)
  const migration = await read(atomicMigrationPath)
  for (const payloadField of [
    'category_id', 'brand_id', 'tag_ids', 'sale_price', 'cost_price',
    'tax_category', 'product_weight_kg', 'package_weight_kg',
    'safety_stock', 'reorder_min', 'reorder_max', 'sell_units', 'bundle_components',
  ]) assert.ok(form.includes(payloadField), `form missing ${payloadField}`)
  for (const table of [
    'public.products', 'public.skus', 'public.product_tag_assignments',
    'public.sku_product_profiles', 'public.sku_cost_profiles',
    'public.sku_sell_units', 'public.sku_bundle_components',
  ]) assert.ok(migration.includes(`insert into ${table}`), `atomic migration missing ${table}`)
})

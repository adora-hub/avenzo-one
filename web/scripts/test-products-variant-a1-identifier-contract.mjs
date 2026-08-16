import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import test from 'node:test'

const read = (path) => readFile(new URL(path, import.meta.url), 'utf8')
const contractPath = '../../docs/AVENZO_ONE_Product_Variant_A1_Identifier_Contract_Freeze.md'
const guidePath = '../../docs/AVENZO_ONE_Product_Variant_Sales_Code_and_Live_CF_Development_Guide_V1.md'
const skuSchemaPath = '../../supabase/migrations/20260813124837_phase_2_0_3_2_product_sku_schema.sql'
const foundationPath = '../../supabase/migrations/20260813135745_phase_2_0_4_server_application_foundation.sql'

test('A1 closes the sequential identifier contract gate without schema or UI changes', async () => {
  const contract = await read(contractPath)
  assert.match(contract, /Completed locally \/ Sequential gate passed/)
  assert.match(contract, /ไม่มี Migration, UI\/TSX, Database write, Supabase apply, Commit, Push หรือ Deploy/)
  assert.match(contract, /ขั้นถัดไปคือ Part A2 Variant UX Mockup เท่านั้น/)
})

test('A1 defines every permanent and live identifier with explicit scope', async () => {
  const contract = await read(contractPath)
  for (const value of [
    'SKU Code', 'Sales Code / รหัส CF ประจำสินค้า', 'Barcode', 'Live Code',
    '(organization_id, sku_code)', '(organization_id, sales_code)',
    '(organization_id, barcode)', '(organization_id, live_session_id, live_code)',
  ]) assert.ok(contract.includes(value), `missing identifier contract: ${value}`)
})

test('A1 preserves current database normalization, uniqueness and set-once sales code behavior', async () => {
  const schema = await read(skuSchemaPath)
  assert.match(schema, /new\.sku_code := upper\(btrim\(new\.sku_code\)\)/)
  assert.match(schema, /new\.sales_code := nullif\(upper\(btrim\(new\.sales_code\)\), ''\)/)
  assert.match(schema, /unique \(organization_id, sku_code\)/)
  assert.match(schema, /on public\.skus \(organization_id, barcode\)/)
  assert.match(schema, /on public\.skus \(organization_id, sales_code\)/)
  assert.match(schema, /old\.sales_code is not null[\s\S]*sku_sales_code_is_permanent/)
})

test('A1 freezes cross-field resolution to one SKU and records the current enforcement gap', async () => {
  const contract = await read(contractPath)
  assert.match(contract, /ข้อความรหัสถาวรเดียวกันห้ามชี้ไปยัง SKU คนละรายการ/)
  assert.match(contract, /Cross-field collision/)
  assert.match(contract, /Permanent Identifier Registry/)
  assert.match(contract, /หยุดหากพบ Cross-field collision ห้ามเลือกผู้ชนะเอง/)
})

test('A1 keeps SKU Code and Base Unit out of the current update command', async () => {
  const foundation = await read(foundationPath)
  const updateBlock = foundation.match(/elsif p_command_type in \('sku\.update', 'sku\.activate', 'sku\.archive'\)[\s\S]*?elsif p_command_type = 'warehouse\.create'/)?.[0] ?? ''
  assert.ok(updateBlock)
  assert.doesNotMatch(updateBlock, /sku_code\s*=/)
  assert.doesNotMatch(updateBlock, /base_unit_code\s*=/)
  assert.match(updateBlock, /sales_code\s*=/)
  assert.match(updateBlock, /barcode\s*=/)
})

test('A1 distinguishes live code resolution from permanent identifiers', async () => {
  const contract = await read(contractPath)
  assert.match(contract, /ไม่ใช่ Permanent Sales Code/)
  assert.match(contract, /Session ต่างกันใช้ `B001` ซ้ำได้/)
  assert.match(contract, /`B001 สีฟ้า S`/)
  assert.match(contract, /ต้องเหลือ `sku_id` เดียว/)
})

test('A1 requires atomic reservation, tenant authorization and audit evidence', async () => {
  const contract = await read(contractPath)
  for (const value of [
    'available → reserved → assigned', 'Concurrent callers', 'idempotent',
    'product.manage', 'Organization predicate', 'search_path = \'\'',
    'Audit/Event evidence',
  ]) assert.ok(contract.includes(value), `missing safety rule: ${value}`)
})

test('the canonical guide still enforces sequential work and SKU resolution', async () => {
  const guide = await read(guidePath)
  assert.match(guide, /ทำงาน \*\*ทีละ Part เท่านั้น\*\*/)
  assert.match(guide, /resolve เป็น `sku_id` ก่อนเสมอ/)
  assert.match(guide, /Part 1 — Identifier Contract Freeze/)
})

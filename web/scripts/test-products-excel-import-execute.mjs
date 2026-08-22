import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import test from 'node:test'

const source = await readFile(new URL('../src/lib/foundation/product-import-execute.server.ts', import.meta.url), 'utf8')

test('GSC-07 enforces granular create permissions and organization-scoped master resolution', () => {
  assert.match(source, /requireFoundationPermission\(actor, 'product\.create'\)/)
  assert.match(source, /requireFoundationPermission\(actor, 'sku\.create'\)/)
  assert.match(source, /\.eq\('organization_id', parsed\.organizationId\)/)
  assert.match(source, /product_categories/)
  assert.match(source, /product_brands/)
  assert.match(source, /product_tags/)
  assert.match(source, /branches/)
})

test('GSC-07 reuses one all-or-nothing Global Sales Code creation command', () => {
  assert.match(source, /product\.create_with_initial_sku/)
  assert.match(source, /executeGlobalSalesCodeCreation/)
  assert.match(source, /batchCommandId/)
  assert.match(source, /flow: 'rapid'/)
  assert.match(source, /sales_code_mode: 'manual'/)
  assert.match(source, /previewGlobalSalesCodeRangeServer/)
  assert.match(source, /validateGlobalSalesCode/)
})

test('Part 2.5 never posts inventory or writes Stock', () => {
  assert.doesNotMatch(source, /commandType:\s*['"](?:receive|adjustment_in|adjustment_out|transfer)['"]/)
  assert.doesNotMatch(source, /inventory_movements|inventory_balances|server_post_inventory_command/)
  assert.match(source, /นำเข้าเป็นฉบับร่าง/)
})

import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import test from 'node:test'

const root = new URL('../', import.meta.url)
const read = (path) => readFile(new URL(path, root), 'utf8')

test('GSC-07 Excel validation uses the shared canonical Sales Code contract', async () => {
  const validation = await read('src/app/organizations/[id]/products/product-excel-import-validation.ts')
  assert.match(validation, /validateGlobalSalesCode/)
  assert.match(validation, /globalSalesCodeValidationMessage/)
  assert.doesNotMatch(validation, /const SALES_CODE_PATTERN/)
})

test('GSC-07 dry-run is granular-permissioned and tenant scoped without owner disclosure', async () => {
  const check = await read('src/lib/foundation/product-import-check.server.ts')
  assert.match(check, /requireFoundationPermission\(actor, 'product\.create'\)/)
  assert.match(check, /requireFoundationPermission\(actor, 'sku\.create'\)/)
  assert.match(check, /\.eq\('organization_id', organizationId\)/)
  assert.match(check, /server_preview_global_sales_code_range/)
  assert.match(check, /conflictingSalesCodes/)
  assert.match(check, /grandfatheredSalesCodes/)
  assert.doesNotMatch(check, /select\([^)]*\b(?:product_id|sku_id|owner_id)\b[^)]*\)/)
})

test('GSC-07 import API validates supplied codes and fills blank codes before the trusted command', async () => {
  const execute = await read('src/lib/foundation/product-import-execute.server.ts')
  assert.match(execute, /validateGlobalSalesCode\(salesCode\)/)
  assert.match(execute, /previewGlobalSalesCodeRangeServer/)
  assert.match(execute, /formatGlobalSalesCode/)
  assert.match(execute, /executeGlobalSalesCodeCreation/)
  assert.match(execute, /value\.rows\.length > 50/)
})

test('GSC-07 sends one stable outer command with no per-row execution fallback', async () => {
  const execute = await read('src/lib/foundation/product-import-execute.server.ts')
  assert.match(execute, /commandId: parsed\.batchCommandId/)
  assert.match(execute, /flow: 'rapid'/)
  assert.match(execute, /sales_code_mode: 'manual'/)
  assert.doesNotMatch(execute, /executeFoundationServerCommand/)
  assert.doesNotMatch(execute, /status: 'skipped'/)
})

test('GSC-07 UI blocks known conflicts and explains automatic assignment and rollback', async () => {
  const dialog = await read('src/app/organizations/[id]/products/product-excel-import-dialog-live.tsx')
  assert.match(dialog, /existingRows\.length > 0/)
  assert.match(dialog, /Sales Code ว่างจะได้รับรหัสมาตรฐานอัตโนมัติ/)
  assert.match(dialog, /proposedSalesCodeRange/)
  assert.match(dialog, /ชุดที่ไม่สำเร็จถูกย้อนกลับทั้งหมด/)
  assert.match(dialog, /batchCommandIds/)
})

test('GSC-07 does not mutate inventory or historical identifier values', async () => {
  const execute = await read('src/lib/foundation/product-import-execute.server.ts')
  assert.doesNotMatch(execute, /inventory_balances|stock_movements|server_post_inventory_command/)
  assert.doesNotMatch(execute, /update[\s\S]+sales_code/i)
})

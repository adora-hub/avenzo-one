import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import test from 'node:test'

const root = new URL('../', import.meta.url)
const read = (path) => readFile(new URL(path, root), 'utf8')

test('Excel import keeps stable command IDs and exposes a safe retry path', async () => {
  const source = await read('src/app/organizations/[id]/products/product-excel-import-dialog-live.tsx')

  assert.match(source, /commandIds: Object\.fromEntries\(validation\.rows\.map\(\(row\) => \[row\.sourceRow, crypto\.randomUUID\(\)\]\)\)/)
  assert.match(source, /commandId: preview\.commandIds\[row\.sourceRow\]/)
  assert.match(source, /ลองนำเข้าอีกครั้ง/)
  assert.match(source, /onClick=\{importRows\}/)
  assert.match(source, /ไม่สร้างรายการซ้ำ/)
})

test('server boundary is permissioned, tenant-scoped, bounded, and never posts Stock', async () => {
  const source = await read('src/lib/foundation/product-import-execute.server.ts')

  assert.match(source, /requireFoundationPermission\(actor, 'product\.manage'\)/)
  assert.match(source, /\.eq\('organization_id', parsed\.organizationId\)/)
  assert.match(source, /value\.rows\.length > 25/)
  assert.match(source, /commandType: 'product\.create_with_initial_sku'/)
  assert.doesNotMatch(source, /inventory\.(receive|adjust|transfer)|stock_movement|service_role/i)
})

test('atomic database command enforces permission, audit, idempotency, and no inventory write', async () => {
  const source = await read('../supabase/migrations/20260815103024_phase_2_1_r7_1_atomic_product_creation.sql')

  assert.match(source, /security definer/i)
  assert.match(source, /set search_path = ''/i)
  assert.match(source, /server_actor_has_org_permission[\s\S]*'product\.manage'/i)
  assert.match(source, /on conflict \(id\) do nothing/i)
  assert.match(source, /if v_command\.status = 'completed' then[\s\S]*return v_command\.result/i)
  assert.match(source, /append_organization_audit_log/i)
  assert.match(source, /'inventory_posted', false/i)
  assert.match(source, /revoke all[\s\S]*authenticated, service_role/i)
  assert.match(source, /grant execute[\s\S]*to service_role/i)
})

test('Products grid uses the live import dialog', async () => {
  const source = await read('src/app/organizations/[id]/products/products-data-grid.tsx')

  assert.match(source, /import \{ ProductExcelImportDialogLive \}/)
  assert.match(source, /<ProductExcelImportDialogLive/)
})

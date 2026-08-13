import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import test from 'node:test'

const inventoryPage = await readFile(new URL('../src/app/organizations/[id]/inventory/page.tsx', import.meta.url), 'utf8')
const inventoryWorkspace = await readFile(new URL('../src/app/organizations/[id]/inventory/inventory-workspace.tsx', import.meta.url), 'utf8')
const productPage = await readFile(new URL('../src/app/organizations/[id]/products/page.tsx', import.meta.url), 'utf8')
const productWorkspace = await readFile(new URL('../src/app/organizations/[id]/products/product-sku-workspace.tsx', import.meta.url), 'utf8')
const action = await readFile(new URL('../src/app/actions/foundation.ts', import.meta.url), 'utf8')
const serverService = await readFile(new URL('../src/lib/foundation/server-service.ts', import.meta.url), 'utf8')
const repository = await readFile(new URL('../src/lib/foundation/supabase-repository.ts', import.meta.url), 'utf8')
const inventoryMigration = await readFile(new URL('../../supabase/migrations/20260813162443_phase_2_0_6_warehouse_command_trigger_security.sql', import.meta.url), 'utf8')
const releaseHarness = await readFile(new URL('../../supabase/verification/phase-2-0-release-gate-local.ps1', import.meta.url), 'utf8')

test('Foundation flow preserves the authenticated RLS read and authorized command boundaries', () => {
  for (const page of [inventoryPage, productPage]) {
    assert.doesNotMatch(page, /createAdminClient|service_role/)
  }
  assert.match(action, /executeFoundationServerCommand/)
  assert.match(serverService, /getFoundationActor/)
  assert.match(serverService, /executeFoundationCommand/)
  assert.match(repository, /this\.client\.from\('inventory_balances'\)/)
  assert.doesNotMatch(repository, /this\.admin\.from\('(?:products|skus|warehouses|locations|inventory_balances|stock_movements)'\)/)
})

test('Product and Inventory workspaces expose keyboard and screen-reader contracts', () => {
  for (const workspace of [productWorkspace, inventoryWorkspace]) {
    assert.match(workspace, /role="dialog"/)
    assert.match(workspace, /aria-modal="true"/)
    assert.match(workspace, /aria-labelledby=/)
    assert.match(workspace, /event\.key === 'Escape'/)
    assert.match(workspace, /\.current\?\.focus\(\)/)
    assert.match(workspace, /role="alert"/)
  }
  assert.match(inventoryWorkspace, /<th>/)
  assert.match(inventoryWorkspace, /role="list"/)
  assert.match(inventoryWorkspace, /role="listitem"/)
  assert.match(inventoryWorkspace, /aria-label="[^"]+"/)
})

test('Release database boundary is fail-closed and produces immutable audit evidence', () => {
  assert.match(inventoryMigration, /security definer[\s\S]*set search_path = ''/)
  assert.match(inventoryMigration, /revoke all on function public\.server_resolve_foundation_branch_ids[\s\S]*authenticated/)
  assert.match(inventoryMigration, /after insert on public\.inventory_domain_events/)
  assert.match(inventoryMigration, /append_organization_audit_log/)
  assert.match(releaseHarness, /Refusing non-isolated container/)
  assert.match(releaseHarness, /TRANSACTIONAL_ROLLBACK_REHEARSAL_PASSED/)
  assert.match(releaseHarness, /FOUNDATION_RELEASE_GATE_PASSED/)
})

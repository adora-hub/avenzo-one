import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import test from 'node:test'

const page = await readFile(new URL('../src/app/organizations/[id]/inventory/page.tsx', import.meta.url), 'utf8')
const workspace = await readFile(new URL('../src/app/organizations/[id]/inventory/inventory-workspace.tsx', import.meta.url), 'utf8')
const repository = await readFile(new URL('../src/lib/foundation/supabase-repository.ts', import.meta.url), 'utf8')
const migration = await readFile(new URL('../../supabase/migrations/20260813162443_phase_2_0_6_warehouse_command_trigger_security.sql', import.meta.url), 'utf8')
const shell = await readFile(new URL('../src/app/components/application-shell.tsx', import.meta.url), 'utf8')
const css = await readFile(new URL('../src/app/globals.css', import.meta.url), 'utf8')

test('Warehouse, Location, Balance and Ledger reads stay on the user-scoped RLS repository', () => {
  for (const method of ['listWarehouses', 'getWarehouse', 'listLocations', 'listInventoryBalances', 'listStockMovements']) {
    assert.match(page, new RegExp(`repository\\.${method}`))
  }
  assert.match(repository, /this\.client\.from\('inventory_balances'\)/)
  assert.match(repository, /this\.client\.from\('stock_movements'\)/)
  assert.doesNotMatch(page, /createAdminClient|service_role/)
  assert.match(repository, /rpc\('server_resolve_foundation_branch_ids'/)
  assert.doesNotMatch(repository, /this\.admin\.from\('(?:warehouses|locations)'\)/)
  assert.match(migration, /security definer[\s\S]*set search_path = ''/)
  assert.match(migration, /revoke all on function public\.server_resolve_foundation_branch_ids[\s\S]*authenticated/)
})

test('all Warehouse and Inventory mutations use the authorized Foundation Server Action', () => {
  assert.match(workspace, /executeFoundationCommandAction/)
  for (const command of ['warehouse.create', 'warehouse.update', 'warehouse.inactivate', 'warehouse.archive', 'location.create', 'receive', 'adjustment_in', 'adjustment_out', 'transfer']) {
    assert.match(workspace, new RegExp(command.replace('.', '\\.')))
  }
  assert.doesNotMatch(workspace, /\.from\(['"](?:warehouses|locations|inventory_balances|stock_movements)['"]\)\.(?:insert|update|delete|upsert)/)
})

test('stock UX includes filters, immutable ledger, negative-stock feedback and responsive cards', () => {
  for (const token of ['Movement Ledger', 'insufficient_stock', 'Allocated = 0', 'ใกล้หมด', 'หมด', 'activeLocations']) assert.match(`${page}\n${workspace}`, new RegExp(token))
  assert.match(css, /\.inventory-mobile-list\s*\{\s*display:\s*none/)
  assert.match(css, /@media \(max-width: 760px\)[\s\S]*\.inventory-mobile-list\s*\{\s*display:\s*grid/)
  assert.match(workspace, /role="alert"/)
})

test('Warehouse and Stock workspace is reachable from organization navigation', () => {
  assert.match(shell, /\/inventory`.*, label: 'Warehouse & Stock'/)
  assert.match(page, /inventory\.read, warehouse\.read และ product\.read/)
})

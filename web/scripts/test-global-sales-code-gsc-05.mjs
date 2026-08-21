import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import test from 'node:test'

const root = new URL('../../', import.meta.url)
const migration = await readFile(new URL(
  'supabase/migrations/20260821143000_phase_gsc_05_atomic_creation_integration.sql',
  root,
), 'utf8')
const behavior = await readFile(new URL(
  'supabase/tests/phase_gsc_05_atomic_creation_integration.sql',
  root,
), 'utf8')
const serverBoundary = await readFile(new URL(
  'web/src/lib/foundation/global-sales-code-creation.server.ts', root,
), 'utf8')
const actions = await readFile(new URL(
  'web/src/app/actions/foundation.ts', root,
), 'utf8')

test('GSC-05 exposes one trusted all-or-nothing creation boundary', () => {
  assert.match(migration, /server_execute_global_sales_code_creation/)
  assert.match(migration, /server_reserve_global_sales_code_range/)
  assert.match(migration, /server_execute_product_creation_command/)
  assert.match(migration, /server_execute_variant_sku_sequence_command/)
  assert.match(migration, /confirm_global_sales_code_reservation/)
  assert.doesNotMatch(migration, /exception[\s\S]{0,200}partial/i)
})

test('GSC-05 supports Normal, Variant and Rapid 1-50 without stock writes', () => {
  assert.match(migration, /p_flow not in \('normal', 'variant', 'rapid'\)/)
  assert.match(migration, /jsonb_array_length\(v_items\) > 50/)
  assert.match(migration, /v_target_count > 50/)
  assert.match(migration, /'inventory_posted', false/)
  assert.match(migration, /'initial_stock_boundary', 't5-pending'/)
  assert.doesNotMatch(migration, /insert into public\.inventory_balances/i)
  assert.doesNotMatch(migration, /insert into public\.stock_movements/i)
  assert.match(behavior, /gsc05_normal_or_replay_failed/)
  assert.match(behavior, /gsc05_variant_failed/)
  assert.match(behavior, /gsc05_rapid_50_failed/)
})

test('GSC-05 preserves stable commands and complete rollback', () => {
  assert.match(migration, /global_sales_code_creation_commands/)
  assert.match(migration, /command_payload_conflict/)
  assert.match(migration, /status = 'completed'/)
  assert.match(behavior, /gsc05_partial_rollback_detected/)
  assert.match(behavior, /GSC05 Rollback One/)
  assert.match(behavior, /GSC05 Rollback Two/)
})

test('GSC-05 keeps command data private and RPC service-only', () => {
  assert.match(migration, /enable row level security/)
  assert.match(migration, /force row level security/)
  assert.match(migration, /revoke all on table public\.global_sales_code_creation_commands/)
  assert.match(migration, /'product\.create'/)
  assert.match(migration, /revoke all on function public\.server_execute_global_sales_code_creation/)
  assert.match(migration, /grant execute[\s\S]*to service_role/)
  assert.match(behavior, /gsc05_security_surface_failed/)
})

test('GSC-05 provides an authenticated server action for later GSC-06 UI wiring', () => {
  assert.match(serverBoundary, /getFoundationActor/)
  assert.match(serverBoundary, /requireFoundationPermission\(actor, 'product\.create'\)/)
  assert.match(serverBoundary, /server_execute_global_sales_code_creation/)
  assert.match(serverBoundary, /items\.length > 50/)
  assert.match(actions, /executeGlobalSalesCodeCreationAction/)
})

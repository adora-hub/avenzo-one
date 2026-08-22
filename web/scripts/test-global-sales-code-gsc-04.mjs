import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import test from 'node:test'

const root = new URL('../../', import.meta.url)
const migration = await readFile(new URL(
  'supabase/migrations/20260821115026_phase_gsc_04_global_allocator_range_rollover.sql',
  root,
), 'utf8')
const behavior = await readFile(new URL(
  'supabase/tests/phase_gsc_04_global_allocator_range_rollover.sql',
  root,
), 'utf8')

test('GSC-04 extends A4 instead of creating parallel allocator tables', () => {
  assert.doesNotMatch(migration, /create table/i)
  assert.match(migration, /alter table public\.sales_code_sequences/)
  assert.match(migration, /alter table public\.sales_code_reservations/)
  assert.match(migration, /global_v1\.range\.reserve/)
  assert.match(migration, /sales_code_allocator_commands/)
  assert.match(migration, /sales_code_allocator_events/)
  assert.match(migration, /append_organization_audit_log/)
})

test('GSC-04 owns Prefix rollover and bounded contiguous ranges', () => {
  assert.match(migration, /next_global_sales_code_prefix/)
  assert.match(migration, /find_global_sales_code_range/)
  assert.match(migration, /p_quantity not between 1 and 50/)
  assert.match(migration, /moved_to_next_prefix/)
  assert.match(migration, /global_sales_code_prefix_exhausted/)
  assert.match(behavior, /A120/)
  assert.match(behavior, /H001/)
  assert.match(behavior, /AA001/)
  assert.match(behavior, /ZZZ999/)
})

test('GSC-04 preserves locking, idempotency, expiry and reusable never-assigned codes', () => {
  assert.match(migration, /pg_advisory_xact_lock/)
  assert.match(migration, /for update/)
  assert.match(migration, /command_payload_conflict/)
  assert.match(migration, /interval '3 hours'/)
  assert.match(migration, /status in \('reserved', 'assigned'\)/)
  assert.match(migration, /expire_global_sales_code_reservations/)
  assert.match(behavior, /gsc04_idempotent_replay_failed/)
  assert.match(behavior, /gsc04_expired_pool_reuse_failed/)
})

test('GSC-04 keeps previews server-only and enforces granular product.create', () => {
  assert.match(migration, /server_preview_global_sales_code_range/)
  assert.match(migration, /server_reserve_global_sales_code_range/)
  assert.match(migration, /'product\.create'/)
  assert.match(migration, /insert into public\.permissions \(code, resource, action, description, scope_kind\)/)
  assert.match(migration, /values \('product\.create', 'product', 'create',[^\n]+, 'organization'\)/)
  assert.match(migration, /scope_kind = excluded\.scope_kind/)
  assert.doesNotMatch(migration, /create or replace function private\.seed_foundation_domain_role_permissions/i)
  assert.doesNotMatch(migration, /revoke all on function private\.seed_foundation_domain_role_permissions/i)
  assert.match(migration, /revoke all on function public\.server_preview_global_sales_code_range/)
  assert.match(migration, /revoke all on function public\.server_reserve_global_sales_code_range/)
  assert.match(migration, /grant execute[\s\S]*to service_role/)
  assert.match(behavior, /gsc04_browser_function_surface_open/)
  assert.match(behavior, /gsc04_expected_permission_denial/)
})

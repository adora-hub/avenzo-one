import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import test from 'node:test'

const migration = await readFile(new URL(
  '../../supabase/migrations/20260821112527_phase_gsc_03_global_sales_code_compatibility.sql',
  import.meta.url,
), 'utf8')
const behavior = await readFile(new URL(
  '../../supabase/tests/phase_gsc_03_global_sales_code_compatibility.sql',
  import.meta.url,
), 'utf8')

test('GSC-03 marks historical sequence definitions legacy without rewriting Sales Codes', () => {
  assert.match(migration, /add column standard_version text not null default 'legacy'/)
  assert.match(migration, /alter column standard_version set default 'global_v1'/)
  assert.match(migration, /sales_code_legacy_sequence_read_only/)
  assert.doesNotMatch(migration, /update public\.skus\s+set sales_code/i)
})

test('GSC-03 enforces one shared Global V1 predicate at the database authority', () => {
  assert.match(migration, /\^\[A-Z\]\{1,3\}\[0-9\]\{3\}\$/)
  assert.match(migration, /right\(p_value, 3\) <> '000'/)
  assert.match(migration, /zz_gsc03_enforce_global_sales_code_sku_v1/)
  assert.match(migration, /zz_gsc03_enforce_global_sales_code_reservation_v1/)
  assert.match(migration, /zz_gsc03_enforce_global_sales_code_sequence_v1/)
})

test('GSC-03 preserves the A4 registry and trusted command boundary', () => {
  assert.doesNotMatch(migration, /create table public\.sku_identifier_registry/)
  assert.doesNotMatch(migration, /drop table|drop function|drop trigger/i)
  assert.match(migration, /from public, anon, authenticated/)
  assert.match(migration, /to service_role/)
  assert.match(migration, /enable row level security|RLS protects reads/i)
})

test('GSC-03 behavior covers legacy, Manual, Same-as-SKU, Sequence and Browser denial', () => {
  for (const token of [
    'CF-LEGACY-01',
    'A000',
    'ก001',
    'SAME-INVALID',
    'C001',
    'ZZZ999',
    'D001',
    'E001',
    'gsc03_browser_allocator_write_surface_open',
  ]) assert.match(behavior, new RegExp(token))
  assert.match(behavior, /PHASE_GSC_03_GLOBAL_SALES_CODE_COMPATIBILITY_OK/)
})

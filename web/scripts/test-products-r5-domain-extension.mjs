import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import test from 'node:test'

const read = (path) => readFile(new URL(path, import.meta.url), 'utf8')
const migrationPath = '../../supabase/migrations/20260815083258_phase_2_1_r5_product_domain_extension.sql'

test('R5 migration models masters, SKU metadata, units, bundles and isolated cost', async () => {
  const migration = await read(migrationPath)
  for (const table of [
    'product_categories', 'product_brands', 'product_tags', 'product_tag_assignments',
    'sku_product_profiles', 'sku_cost_profiles', 'sku_sell_units',
    'sku_bundle_components', 'product_domain_commands', 'product_domain_events',
  ]) {
    assert.match(migration, new RegExp(`create table public\\.${table}`, 'i'))
    assert.match(migration, new RegExp(`alter table public\\.${table} enable row level security`, 'i'))
  }
  assert.match(migration, /product\.cost\.read/)
  assert.match(migration, /sku_cost_profiles_read[\s\S]*product\.cost\.read/)
  assert.match(migration, /base_quantity numeric\(20,6\) not null/)
  assert.match(migration, /bundle_cycle_forbidden/)
  assert.match(migration, /bundle_sku_requires_bundle_product/)
})

test('R5 command boundary is idempotent, service-only and audited', async () => {
  const migration = await read(migrationPath)
  assert.match(migration, /create or replace function public\.server_execute_product_domain_command/)
  assert.match(migration, /on conflict \(id\) do nothing/)
  assert.match(migration, /command_payload_conflict/)
  assert.match(migration, /server_actor_has_org_permission[\s\S]*product\.manage/)
  assert.match(migration, /append_organization_audit_log/)
  assert.match(migration, /prevent_product_domain_history_mutation/)
  assert.match(migration, /revoke all on function public\.server_execute_product_domain_command[\s\S]*from public, anon, authenticated/)
  assert.match(migration, /grant execute on function public\.server_execute_product_domain_command[\s\S]*to service_role/)
})

test('R5 browser reads are explicit while writes remain server-command-only', async () => {
  const [migration, contracts, repository] = await Promise.all([
    read(migrationPath),
    read('../src/lib/foundation/contracts.ts'),
    read('../src/lib/foundation/supabase-repository.ts'),
  ])
  assert.match(migration, /revoke all privileges on table[\s\S]*from public, anon, authenticated/)
  assert.match(migration, /grant select on table[\s\S]*to authenticated/)
  assert.doesNotMatch(migration, /grant (?:insert|update|delete|all)[\s\S]*to authenticated/i)
  for (const command of [
    'product.master.upsert', 'product.metadata.update', 'sku.profile.upsert',
    'sku.cost.upsert', 'sku.sell_units.replace', 'sku.bundle.replace',
  ]) {
    assert.match(contracts, new RegExp(command.replaceAll('.', '\\.')))
  }
  assert.match(repository, /server_execute_product_domain_command/)
  assert.match(repository, /productDomainCommandTypes/)
})

test('R5 preserves inventory authority and immutable SKU base unit', async () => {
  const [migration, originalSchema] = await Promise.all([
    read(migrationPath),
    read('../../supabase/migrations/20260813124837_phase_2_0_3_2_product_sku_schema.sql'),
  ])
  assert.match(migration, /never a stock balance/i)
  assert.match(migration, /converted to the immutable SKU base unit/i)
  assert.match(migration, /Stock commands must resolve and post component sku_id quantities/i)
  assert.doesNotMatch(migration, /update public\.inventory_balances/i)
  assert.match(originalSchema, /sku_base_unit_is_immutable/)
})

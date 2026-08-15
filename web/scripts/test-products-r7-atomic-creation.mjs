import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import test from 'node:test'

const read = (path) => readFile(new URL(path, import.meta.url), 'utf8')
const migrationPath = '../../supabase/migrations/20260815103024_phase_2_1_r7_1_atomic_product_creation.sql'

test('R7.1 exposes one explicit atomic creation command and repository route', async () => {
  const [migration, contracts, repository] = await Promise.all([
    read(migrationPath),
    read('../src/lib/foundation/contracts.ts'),
    read('../src/lib/foundation/supabase-repository.ts'),
  ])
  assert.match(migration, /product\.create_with_initial_sku/)
  assert.match(migration, /create or replace function public\.server_execute_product_creation_command/)
  assert.match(contracts, /productCreationCommandTypes[\s\S]*product\.create_with_initial_sku/)
  assert.match(repository, /productCreationCommandTypes[\s\S]*server_execute_product_creation_command/)
})

test('R7.1 creates Product, first SKU and approved domain metadata in one transaction', async () => {
  const migration = await read(migrationPath)
  for (const statement of [
    'insert into public.products',
    'insert into public.skus',
    'insert into public.product_tag_assignments',
    'insert into public.sku_product_profiles',
    'insert into public.sku_cost_profiles',
    'insert into public.sku_sell_units',
    'insert into public.sku_bundle_components',
  ]) assert.match(migration, new RegExp(statement.replaceAll('.', '\\.')))
  assert.match(migration, /'product_status', v_product\.status/)
  assert.match(migration, /'sku_status', v_sku\.status/)
  assert.match(migration, /'draft', p_actor_user_id, p_actor_user_id/)
})

test('R7.1 is idempotent, audited and restricted to service role', async () => {
  const migration = await read(migrationPath)
  assert.match(migration, /on conflict \(id\) do nothing/)
  assert.match(migration, /command_payload_conflict/)
  assert.match(migration, /product\.created_with_initial_sku/)
  assert.match(migration, /append_organization_audit_log/)
  assert.match(migration, /revoke all on function public\.server_execute_product_creation_command[\s\S]*from public, anon, authenticated, service_role/)
  assert.match(migration, /grant execute on function public\.server_execute_product_creation_command[\s\S]*to service_role/)
})

test('R7.1 keeps images and inventory behind their governed workflows', async () => {
  const migration = await read(migrationPath)
  assert.match(migration, /image_upload_required', true/)
  assert.match(migration, /inventory_posted', false/)
  assert.doesNotMatch(migration, /insert into storage\.objects/i)
  assert.doesNotMatch(migration, /(?:insert|update) (?:into )?public\.inventory_balances/i)
  assert.doesNotMatch(migration, /insert into public\.stock_movements/i)
})

test('R7.1 validates tenant masters, bounded collections and duplicate identifiers', async () => {
  const [migration, contracts, errors] = await Promise.all([
    read(migrationPath),
    read('../src/lib/foundation/contracts.ts'),
    read('../src/lib/foundation/errors.ts'),
  ])
  assert.match(migration, /product_category_not_found_or_inactive/)
  assert.match(migration, /product_brand_not_found_or_inactive/)
  assert.match(migration, /product_tag_not_found_or_inactive/)
  assert.match(migration, /product_creation_tag_limit_exceeded/)
  assert.match(migration, /product_creation_sell_unit_limit_exceeded/)
  assert.match(migration, /product_creation_bundle_component_limit_exceeded/)
  assert.match(contracts, /payload\.tag_ids\.length > 12/)
  assert.match(contracts, /structureType !== 'bundle'/)
  assert.match(errors, /skus_organization_sales_code_unique[\s\S]*duplicate_sales_code/)
})

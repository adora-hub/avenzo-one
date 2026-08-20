import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import test from 'node:test'

const root = new URL('../', import.meta.url)
const read = (path) => readFile(new URL(path, root), 'utf8')

test('SKU-04 adds a service-only organization and Prefix sequence boundary', async () => {
  const sql = await read('../supabase/migrations/20260820134813_phase_2_1_sku_04_product_sequence_allocator.sql')
  assert.match(sql, /create table public\.sku_product_sequences/)
  assert.match(sql, /primary key \(organization_id, prefix\)/)
  assert.match(sql, /server_preview_variant_sku_sequence/)
  assert.match(sql, /server_execute_variant_sku_sequence_command/)
  assert.match(sql, /pg_advisory_xact_lock/)
  assert.match(sql, /greatest\(v_tracked\.last_sequence, v_existing\) \+ 1/)
  assert.match(sql, /sku_product_sequence_conflict/)
  assert.match(sql, /server_execute_variant_creation_command/)
  assert.match(sql, /grant execute on function public\.server_preview_variant_sku_sequence[\s\S]+to service_role/i)
  assert.match(sql, /grant execute on function public\.server_execute_variant_sku_sequence_command[\s\S]+to service_role/i)
  assert.doesNotMatch(sql, /grant\s+(select|insert|update|delete|all)[\s\S]+sku_product_sequences[\s\S]+to (anon|authenticated)/i)
})

test('SKU-04 UI previews the database next sequence without reserving it', async () => {
  const [builder, actions, service] = await Promise.all([
    read('src/app/organizations/[id]/products/new/variant-creation-builder.tsx'),
    read('src/app/actions/foundation.ts'),
    read('src/lib/foundation/variant-sku-sequence.server.ts'),
  ])
  assert.match(builder, /previewVariantSkuSequenceAction/)
  assert.match(builder, /ฐานข้อมูลแนะนำเลขที่ว่างถัดไป · ยังไม่จองจนกดสร้าง/)
  assert.match(builder, /setSkuProductSequence\(recommendedProductSequence\)/)
  assert.match(actions, /previewVariantSkuSequenceAction/)
  assert.match(service, /requireFoundationPermission\(actor, 'product\.manage'\)/)
  assert.match(service, /server_preview_variant_sku_sequence/)
})

test('SKU-04 submits allocation metadata and routes creation to the atomic wrapper only', async () => {
  const [form, repository, errors, contracts] = await Promise.all([
    read('src/app/organizations/[id]/products/new/unified-product-creation-form.tsx'),
    read('src/lib/foundation/supabase-repository.ts'),
    read('src/lib/foundation/errors.ts'),
    read('src/lib/foundation/contracts.ts'),
  ])
  assert.match(form, /sku_prefix: variantSkuSequence\.prefix/)
  assert.match(form, /sku_product_sequence: variantSkuSequence\.sequence/)
  assert.match(form, /sku_sequence_digits: variantSkuSequence\.digits/)
  assert.match(repository, /command\.commandType === 'product\.create_with_variants'[\s\S]+server_execute_variant_sku_sequence_command/)
  assert.match(repository, /server_execute_variant_creation_command/)
  assert.match(repository, /error\.code === 'PGRST202' \|\| error\.code === '42883'/)
  assert.match(errors, /sku_product_sequence_conflict', 'sku_sequence_conflict', 409/)
  assert.match(contracts, /'sku_prefix', 'sku_product_sequence'/)
  assert.match(contracts, /'sku_sequence_digits', 'option_groups'/)
  assert.match(contracts, /\^\[A-Z0-9\]\{2,12\}\$/)
  assert.match(contracts, /Number\.isInteger\(payload\.sku_product_sequence\)/)
  assert.match(contracts, /Number\.isInteger\(payload\.sku_sequence_digits\)/)
})

test('SKU-04 has an executable SQL behavior suite', async () => {
  const sql = await read('../supabase/tests/phase_2_1_sku_04_product_sequence_allocator.sql')
  for (const behavior of [
    'preview did not start at one',
    'atomic create result mismatch',
    'idempotent replay changed result',
    'conflict did not roll back the Product',
    'failed create advanced the sequence',
    'gap policy did not keep the high-water mark',
    'function privilege boundary is incorrect',
  ]) assert.match(sql, new RegExp(behavior))
})

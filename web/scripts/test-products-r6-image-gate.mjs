import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import test from 'node:test'

const read = (path) => readFile(new URL(path, import.meta.url), 'utf8')
const migrationPath = '../../supabase/migrations/20260815090201_phase_2_1_r6_product_image_gate.sql'
const advisorMigrationPath = '../../supabase/migrations/20260815093810_phase_2_1_r6_product_image_advisor_indexes.sql'

test('R6 creates a private constrained product image bucket and immutable metadata', async () => {
  const migration = await read(migrationPath)
  assert.match(migration, /'product-images'[\s\S]*false,[\s\S]*5242880/)
  assert.match(migration, /array\['image\/jpeg', 'image\/png', 'image\/webp'\]/)
  assert.match(migration, /create table public\.product_images/)
  assert.match(migration, /sort_order between 1 and 9/)
  assert.match(migration, /product_image_limit_exceeded/)
  assert.match(migration, /storage_path = organization_id::text[\s\S]*product_id::text[\s\S]*id::text/)
  assert.doesNotMatch(migration, /(?:insert|update|delete)\s+(?:into\s+|from\s+)?storage\.objects/i)
})

test('R6 lifecycle is idempotent, service-only, tenant scoped and compensatable', async () => {
  const [migration, cleanup] = await Promise.all([
    read(migrationPath),
    read('../src/lib/foundation/product-image-cleanup.server.ts'),
  ])
  assert.match(migration, /create or replace function public\.server_execute_product_image_command/)
  assert.match(migration, /on conflict \(id\) do nothing/)
  assert.match(migration, /server_actor_has_org_permission[\s\S]*product\.manage/)
  assert.match(migration, /product_image_object_missing/)
  assert.match(migration, /product_image_object_cleanup_required/)
  assert.match(migration, /grant execute on function public\.server_execute_product_image_command[\s\S]*to service_role/)
  assert.match(migration, /grant select on table public\.product_images to service_role/)
  assert.match(migration, /notify pgrst, 'reload schema'/)
  assert.match(migration, /product managers can upload prepared product images/)
  assert.match(migration, /authorized users can read ready product images/)
  assert.match(cleanup, /\.storage[\s\S]*\.remove\(\[image\.storage_path\]\)/)
  assert.match(cleanup, /executeFoundationServerCommand\(command\)/)
  assert.match(cleanup, /requireFoundationPermission\(actor, 'product\.create'\)/)
  assert.doesNotMatch(cleanup, /requireFoundationPermission\(actor, 'product\.manage'\)/)
})

test('R6 upload helper rejects unsafe input and never overwrites immutable paths', async () => {
  const upload = await read('../src/lib/foundation/product-image-upload.ts')
  assert.match(upload, /PRODUCT_IMAGE_MAX_BYTES = 5_242_880/)
  assert.match(upload, /PRODUCT_IMAGE_MAX_FILES = 9/)
  assert.match(upload, /image\/jpeg.*image\/png.*image\/webp/s)
  assert.match(upload, /upsert: false/)
  assert.match(upload, /cacheControl: reservation\.upload_contract\.cache_control/)
})

test('R6 read model signs private cover images and renders them safely with next image', async () => {
  const [repository, grid, config, model] = await Promise.all([
    read('../src/lib/foundation/supabase-repository.ts'),
    read('../src/app/organizations/[id]/products/products-data-grid.tsx'),
    read('../next.config.ts'),
    read('../src/lib/foundation/repositories.ts'),
  ])
  assert.match(repository, /from\('product_images'\)/)
  assert.match(repository, /createSignedUrls\([\s\S]*600\)/)
  assert.match(repository, /eq\('status', 'ready'\)/)
  assert.match(repository, /code === 'PGRST205'/)
  assert.match(repository, /code === '42P01'/)
  assert.match(repository, /productImageRowsOrFallback\(imageData, imageError\)/)
  assert.match(repository, /Product images are not available in this environment; using placeholders/)
  assert.match(model, /coverImage: ProductImageReadModel \| null/)
  assert.match(model, /images: ProductImageReadModel\[\]/)
  assert.match(grid, /import Image from 'next\/image'/)
  assert.match(grid, /row\.coverImage[\s\S]*unoptimized/)
  assert.match(config, /storage\/v1\/object\/sign\/product-images\/\*\*/)
})

test('R6 command contract validates all image lifecycle payloads', async () => {
  const [contracts, repository] = await Promise.all([
    read('../src/lib/foundation/contracts.ts'),
    read('../src/lib/foundation/supabase-repository.ts'),
  ])
  for (const command of [
    'product.image.prepare', 'product.image.finalize', 'product.image.fail',
    'product.image.archive', 'product.images.reorder',
  ]) assert.match(contracts, new RegExp(command.replaceAll('.', '\\.')))
  assert.match(repository, /server_execute_product_image_command/)
  assert.match(repository, /productImageCommandTypes/)
})

test('R6 advisor follow-up covers image foreign keys without broadening access', async () => {
  const [migration, advisorMigration] = await Promise.all([
    read(migrationPath),
    read(advisorMigrationPath),
  ])
  for (const indexName of [
    'product_images_updated_by_idx',
    'product_image_commands_actor_user_id_idx',
    'product_image_events_actor_user_id_idx',
    'product_image_events_image_fk_idx',
  ]) {
    assert.match(migration, new RegExp(indexName))
    assert.match(advisorMigration, new RegExp(indexName))
  }
  assert.doesNotMatch(advisorMigration, /grant|create policy|alter table/i)
})

import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import test from 'node:test'

const read = (path) => readFile(new URL(path, import.meta.url), 'utf8')
const formPath = '../src/app/organizations/[id]/products/new/unified-product-creation-form.tsx'
const migrationPath = '../../supabase/migrations/20260815103024_phase_2_1_r7_1_atomic_product_creation.sql'
const storageHelperPath = './run-products-r7-preview-storage.mjs'

test('R7.3 accepts only bounded, recent pending-recovery records', async () => {
  const form = await read(formPath)
  assert.match(form, /const PENDING_DRAFT_MAX_AGE_MS = 24 \* 60 \* 60 \* 1000/)
  assert.match(form, /UUID_PATTERN\.test\(productId\)/)
  assert.match(form, /UUID_PATTERN\.test\(skuId\)/)
  assert.match(form, /savedAtTimestamp > Date\.now\(\) \+ 60_000/)
  assert.match(form, /Date\.now\(\) - savedAtTimestamp > PENDING_DRAFT_MAX_AGE_MS/)
})

test('R7.3 restores valid recovery state and removes an unsafe record', async () => {
  const form = await read(formPath)
  assert.match(form, /const restored = sanitizePendingDraft\(JSON\.parse\(pendingRaw\)\)/)
  assert.match(form, /if \(restored\) setPendingDraft\(restored\)/)
  assert.match(form, /else window\.localStorage\.removeItem\(pendingDraftKey\)/)
})

test('R7.3 retries image recovery without repeating atomic Product creation', async () => {
  const form = await read(formPath)
  assert.match(form, /let recovery = pendingDraft/)
  assert.match(form, /if \(!recovery\) \{[\s\S]*const isVariantCreation = creationStructure === 'variant'/)
  assert.match(form, /commandType: isVariantCreation \? 'product\.create_with_variants' : 'product\.create_with_initial_sku'/)
  assert.match(form, /uploadImages\(recovery\.productId, recovery\.productName, recovery\.readyImageIdsByClientId\)/)
})

test('R7.3 persists one command id until the full image pipeline succeeds', async () => {
  const form = await read(formPath)
  assert.match(form, /const commandIdKey = `\$\{localDraftKey\}:command-id`/)
  assert.match(form, /window\.localStorage\.getItem\(commandIdKey\) \?\? crypto\.randomUUID\(\)/)
  assert.ok(form.indexOf('if (failedCount > 0)') < form.indexOf('window.localStorage.removeItem(`${localDraftKey}:command-id`)'))
})

test('R7.3 opens success only after every selected image finishes', async () => {
  const form = await read(formPath)
  assert.ok(form.indexOf('if (failedCount > 0)') < form.indexOf('setCreationSuccess({'))
  assert.match(form, /setPendingDraft\(null\)/)
  assert.match(form, /setCreationSuccess\(\{\s*productId: recovery\.productId,\s*productName: recovery\.productName,\s*skuCount: createdSkuCount,\s*stockStatus,\s*imageCount: completedImageCount,\s*\}\)/)
})

test('R7.3 keeps the success dialog accessible and truthful about stock', async () => {
  const form = await read(formPath)
  assert.match(form, /function handleSuccessDialogKeyDown/)
  assert.match(form, /event\.key === 'Escape'/)
  assert.match(form, /event\.key !== 'Tab'/)
  assert.match(form, /role="dialog" aria-modal="true"/)
  assert.match(form, /ยังไม่เพิ่ม Stock/)
  assert.doesNotMatch(form, /commandType: 'inventory\./)
})

test('R7.3 atomic migration uses an idempotent command envelope', async () => {
  const migration = await read(migrationPath)
  assert.match(migration, /insert into public\.foundation_commands/)
  assert.match(migration, /on conflict \(id\) do nothing/)
  assert.match(migration, /v_command\.request_hash <> p_request_hash/)
  assert.match(migration, /insert into public\.products/)
  assert.match(migration, /insert into public\.skus/)
})

test('R7.3 atomic migration records one domain event and audit outcome', async () => {
  const migration = await read(migrationPath)
  assert.match(migration, /product\.created_with_initial_sku/)
  assert.match(migration, /private\.append_organization_audit_log/)
  assert.match(migration, /'inventory_posted', false/)
})

test('R7.3 Storage helper is hard-guarded to AVENZO ONE PREVIEW', async () => {
  const helper = await read(storageHelperPath)
  assert.match(helper, /EXPECTED_PREVIEW_REF = 'kenhlerbirchcpzgnfsh'/)
  assert.match(helper, /if \(projectRef !== EXPECTED_PREVIEW_REF\) throw new Error\('preview_project_guard_failed'\)/)
  assert.match(helper, /const BUCKET = 'product-images'/)
})

test('R7.3 Storage helper forbids overwrite and supports exact compensation', async () => {
  const helper = await read(storageHelperPath)
  assert.match(helper, /upsert: false/)
  assert.match(helper, /\.remove\(\[storagePath\]\)/)
  assert.doesNotMatch(helper, /NEXT_PUBLIC_SUPABASE_ANON_KEY/)
})

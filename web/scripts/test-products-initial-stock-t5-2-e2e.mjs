import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import test from 'node:test'

const read = (path) => readFile(new URL(path, import.meta.url), 'utf8')
const paths = {
  action: '../src/app/actions/foundation.ts',
  form: '../src/app/organizations/[id]/products/new/unified-product-creation-form.tsx',
  page: '../src/app/organizations/[id]/products/new/page.tsx',
  workflow: '../src/lib/foundation/initial-stock-workflow.ts',
  service: '../src/lib/foundation/server-service.ts',
  core: '../src/lib/foundation/service-core.ts',
  repository: '../src/lib/foundation/supabase-repository.ts',
  identifierCheck: '../src/lib/foundation/product-identifier-check.server.ts',
  imageCleanup: '../src/lib/foundation/product-image-cleanup.server.ts',
  migration: '../../supabase/migrations/20260821000304_phase_t4_4b_atomic_batch_receive.sql',
}

test('E01 Product creation page requires granular create and update permissions', async () => {
  const [page, identifierCheck, imageCleanup] = await Promise.all([
    read(paths.page), read(paths.identifierCheck), read(paths.imageCleanup),
  ])
  assert.match(page, /permissions\.has\('product\.create'\) && permissions\.has\('product\.update'\)/)
  assert.doesNotMatch(page, /permissions\.has\('product\.manage'\)/)
  assert.match(identifierCheck, /requireFoundationPermission\(actor, 'product\.create'\)/)
  assert.doesNotMatch(identifierCheck, /requireFoundationPermission\(actor, 'product\.manage'\)/)
  assert.match(imageCleanup, /requireFoundationPermission\(actor, 'product\.update'\)/)
})

test('E02 Warehouse and Location selector requires read plus receive authorities', async () => {
  const [page, action] = await Promise.all([read(paths.page), read(paths.action)])
  for (const permission of ['warehouse.read', 'location.read', 'inventory.receive']) {
    assert.match(page, new RegExp(`permissions\\.has\\('${permission.replace('.', '\\.')}\\'\\)`))
    assert.match(action, new RegExp(`actor\\.permissions\\.includes\\('${permission.replace('.', '\\.')}\\'\\)`))
  }
})

test('E03 Browser calls a Server Action and never imports the admin client', async () => {
  const [form, action] = await Promise.all([read(paths.form), read(paths.action)])
  assert.match(form, /executeInitialStockWorkflowAction/)
  assert.match(action, /^'use server'/)
  assert.doesNotMatch(form, /createAdminClient|SUPABASE_SECRET_KEY|service_role/)
})

test('E04 trusted service derives actor and enforces Product update plus branch receive', async () => {
  const service = await read(paths.service)
  assert.match(service, /getFoundationActor\(input\.organizationId\)/)
  assert.match(service, /requireFoundationPermission\(actor, 'product\.update'\)/)
  assert.match(service, /requireFoundationPermission\(actor, 'inventory\.receive', \[input\.receive\.branchId\]\)/)
})

test('E05 repository calls only the approved atomic Batch RPC for Initial Stock', async () => {
  const repository = await read(paths.repository)
  assert.match(repository, /receiveInitialStockBatch[\s\S]*server_receive_inventory_batch/)
  assert.match(repository, /p_request:\s*request[\s\S]*p_actor_user_id:\s*actorUserId/)
})

test('E06 workflow activates all SKUs before Product and then invokes one Batch boundary', async () => {
  const workflow = await read(paths.workflow)
  const skuActivation = workflow.indexOf("commandType: 'sku.activate'")
  const productActivation = workflow.indexOf("commandType: 'product.activate'")
  const batchReceive = workflow.indexOf('dependencies.receiveBatch(request)')
  assert.ok(skuActivation >= 0 && skuActivation < productActivation && productActivation < batchReceive)
})

test('E07 Initial Stock enabled requires at least one positive quantity', async () => {
  const form = await read(paths.form)
  assert.match(form, /initialStockTotal <= 0/)
  assert.match(form, /ต้องมีอย่างน้อย 1 SKU ที่มีจำนวนมากกว่า 0/)
  assert.match(form, /stockIntent\?\.enabled \? stockIntent\.rows\.flatMap/)
})

test('E08 disabled Initial Stock explicitly passes receive null and skips Stock mutation', async () => {
  const [form, workflow] = await Promise.all([read(paths.form), read(paths.workflow)])
  assert.match(form, /receive:\s*stockIntent\.enabled \?/)
  assert.match(form, /:\s*null,\s*\n\s*}\s*:\s*undefined/)
  assert.match(workflow, /if \(!request\)[\s\S]*stockStatus:\s*'not_requested'/)
})

test('E09 recovery persists stable Workflow, activation Command and Batch keys', async () => {
  const form = await read(paths.form)
  assert.match(form, /initialStockWorkflow/)
  assert.match(form, /activationCommandId:\s*crypto\.randomUUID\(\)/)
  assert.match(form, /idempotencyKey:\s*crypto\.randomUUID\(\)/)
  assert.match(form, /localStorage\.setItem\(pendingDraftKey, JSON\.stringify\(recovery\)\)/)
})

test('E10 Standard and Variant rows both map returned SKU IDs into the same workflow DTO', async () => {
  const form = await read(paths.form)
  assert.match(form, /const skuMappings = isVariantCreation/)
  assert.match(form, /key:\s*'standard'/)
  assert.match(form, /resultVariants/)
  assert.match(form, /skuMappings\.map/)
})

test('E11 UI simulation trigger is retired without enabling Bundle backend', async () => {
  const form = await read(paths.form)
  assert.doesNotMatch(form, /data-ui-only="true"|T2 · อ่านข้อมูลจริง|ยังไม่บันทึกสต็อกจริง/)
  assert.match(form, /structure === 'bundle' \? 'UI ทดลอง' : 'T5\.2 · Atomic Backend'/)
  assert.match(form, /creationStructure === 'bundle' \? null/)
})

test('E12 T4.4B remains service-role-only, atomic and free of Browser execution grants', async () => {
  const migration = await read(paths.migration)
  assert.match(migration, /create or replace function public\.server_receive_inventory_batch/)
  assert.match(migration, /grant execute on function public\.server_receive_inventory_batch\(jsonb, uuid\)[\s\S]*to service_role/i)
  assert.match(migration, /revoke all on function public\.server_receive_inventory_batch\(jsonb, uuid\)[\s\S]*from public, anon, authenticated, service_role/i)
  assert.match(migration, /batch_receive_incomplete_state/)
})

import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import test from 'node:test'

import { runRapidEntryImagePipelineCore } from '../src/app/organizations/[id]/products/live-sale/rapid-entry/rapid-entry-image-pipeline-core.ts'

const pipelinePath = new URL('../src/app/organizations/[id]/products/live-sale/rapid-entry/rapid-entry-image-pipeline.ts', import.meta.url)
const corePath = new URL('../src/app/organizations/[id]/products/live-sale/rapid-entry/rapid-entry-image-pipeline-core.ts', import.meta.url)
const rapidTablePath = new URL('../src/app/organizations/[id]/products/live-sale/rapid-entry/rapid-entry-table.tsx', import.meta.url)
const r6MigrationPath = new URL('../../supabase/migrations/20260815090201_phase_2_1_r6_product_image_gate.sql', import.meta.url)

function scenario(overrides = {}) {
  let command = 0
  const calls = { prepare: [], upload: [], finalize: [], reorder: [], cleanup: [] }
  const dependencies = {
    validate(file) {
      if (file.size > 5 * 1024 * 1024) throw new Error('too_large')
    },
    async prepare(input) {
      calls.prepare.push(input)
      return { entity_id: `image-${input.product.clientRowId}`, version: 1 }
    },
    async upload(reservation, file) {
      calls.upload.push({ reservation, file })
    },
    async finalize(input) {
      calls.finalize.push(input)
      return { ok: true }
    },
    async reorder(input) {
      calls.reorder.push(input)
      return { ok: true }
    },
    async cleanup(input) {
      calls.cleanup.push(input)
      return { ok: true }
    },
    newCommandId() {
      command += 1
      return `command-${command}`
    },
    ...overrides,
  }
  return { calls, dependencies }
}

const createdProducts = [
  { clientRowId: 'row-1', productId: 'product-1', productName: 'สินค้า 1' },
  { clientRowId: 'row-2', productId: 'product-2', productName: 'สินค้า 2' },
]
const images = [
  { clientRowId: 'row-1', file: { name: '1.png', type: 'image/png', size: 100 } },
  { clientRowId: 'row-2', file: { name: '2.png', type: 'image/png', size: 100 } },
]

test('Rapid-BE-04 completes prepare, upload, finalize and cover order for every image', async () => {
  const { calls, dependencies } = scenario()
  const result = await runRapidEntryImagePipelineCore({ organizationId: 'org-1', createdProducts, images }, dependencies)
  assert.equal(result.status, 'succeeded')
  assert.equal(result.readyCount, 2)
  assert.equal(calls.prepare.length, 2)
  assert.equal(calls.upload.length, 2)
  assert.equal(calls.finalize.length, 2)
  assert.equal(calls.reorder.length, 2)
  assert.equal(calls.cleanup.length, 0)
})

test('Rapid-BE-04 retries an ambiguous finalize using the exact same command id', async () => {
  let attempts = 0
  const { calls, dependencies } = scenario({
    async finalize(input) {
      calls.finalize.push(input)
      attempts += 1
      return attempts === 1 ? { ok: false, retryable: true, error: 'timeout' } : { ok: true }
    },
  })
  const result = await runRapidEntryImagePipelineCore({ organizationId: 'org-1', createdProducts: createdProducts.slice(0, 1), images: images.slice(0, 1) }, dependencies)
  assert.equal(result.status, 'succeeded')
  assert.equal(calls.finalize.length, 2)
  assert.equal(calls.finalize[0].commandId, calls.finalize[1].commandId)
})

test('Rapid-BE-04 compensates a failed upload and reports no ready image', async () => {
  const { calls, dependencies } = scenario({
    async upload(reservation, file) {
      calls.upload.push({ reservation, file })
      throw new Error('storage_failed')
    },
  })
  const result = await runRapidEntryImagePipelineCore({ organizationId: 'org-1', createdProducts: createdProducts.slice(0, 1), images: images.slice(0, 1) }, dependencies)
  assert.equal(result.status, 'failed')
  assert.equal(result.readyCount, 0)
  assert.equal(result.failedCount, 1)
  assert.equal(calls.cleanup.length, 1)
  assert.equal(result.items[0].stage, 'failed')
})

test('Rapid-BE-04 exposes compensation_pending when cleanup cannot finish', async () => {
  const { dependencies } = scenario({
    async upload() { throw new Error('storage_failed') },
    async cleanup() { return { ok: false } },
  })
  const result = await runRapidEntryImagePipelineCore({ organizationId: 'org-1', createdProducts: createdProducts.slice(0, 1), images: images.slice(0, 1) }, dependencies)
  assert.equal(result.status, 'failed')
  assert.equal(result.compensationPendingCount, 1)
  assert.equal(result.items[0].stage, 'compensation_pending')
})

test('Rapid-BE-04 partial retry skips a ready image and processes only failed work', async () => {
  const { calls, dependencies } = scenario()
  const previousItems = [{ clientRowId: 'row-1', productId: 'product-1', imageId: 'image-row-1', stage: 'ready' }]
  const result = await runRapidEntryImagePipelineCore({ organizationId: 'org-1', createdProducts, images, previousItems }, dependencies)
  assert.equal(result.status, 'succeeded')
  assert.equal(result.readyCount, 2)
  assert.equal(calls.prepare.length, 1)
  assert.equal(calls.prepare[0].product.clientRowId, 'row-2')
})

test('Rapid-BE-04 rejects duplicate or unmapped row/image input before side effects', async () => {
  const { calls, dependencies } = scenario()
  await assert.rejects(() => runRapidEntryImagePipelineCore({ organizationId: 'org-1', createdProducts: createdProducts.slice(0, 1), images: [images[0], images[0]] }, dependencies), /rapid_image_mapping_invalid/)
  assert.equal(calls.prepare.length, 0)
})

test('Rapid-BE-04 runtime adapter reuses the approved private R6 image lifecycle', async () => {
  const [source, core, migration] = await Promise.all([readFile(pipelinePath, 'utf8'), readFile(corePath, 'utf8'), readFile(r6MigrationPath, 'utf8')])
  assert.match(source, /commandType: 'product\.image\.prepare'/)
  assert.match(source, /commandType: 'product\.image\.finalize'/)
  assert.match(source, /commandType: 'product\.images\.reorder'/)
  assert.match(source, /commandType: 'product\.image\.fail'/)
  assert.match(core, /previous\?\.stage === 'ready'/)
  assert.match(migration, /insert into storage\.buckets/)
  assert.match(migration, /product-images/)
  assert.match(migration, /enable row level security/i)
})

test('Rapid table keeps image staging while BE-06 uses the authenticated local backend', async () => {
  const table = await readFile(rapidTablePath, 'utf8')
  assert.match(table, /URL\.createObjectURL\(file\)/)
  assert.match(table, /onDrop=\{\(event\) => dropRowImage\(event, row\.index\)\}/)
  assert.match(table, /runRapidEntryImagePipeline/)
  assert.match(table, /executeGlobalSalesCodeCreationAction/)
})

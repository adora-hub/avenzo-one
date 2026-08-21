import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import test from 'node:test'

const read = (path) => readFile(new URL(path, import.meta.url), 'utf8')

test('T3 legacy partial workflow has been retired in favor of T4.4B atomic receive', async () => {
  const workflow = await read('../src/lib/foundation/initial-stock-workflow.ts')
  assert.doesNotMatch(workflow, /status:\s*'partial'|completedCount|receiveCommandId/)
  assert.doesNotMatch(workflow, /commandType:\s*'receive'/)
  assert.match(workflow, /dependencies\.receiveBatch\(request\)/)
})

test('T3 compatibility gate preserves SKU-first and Product-last activation', async () => {
  const workflow = await read('../src/lib/foundation/initial-stock-workflow.ts')
  assert.ok(workflow.indexOf("commandType: 'sku.activate'") < workflow.indexOf("commandType: 'product.activate'"))
})

test('T3 compatibility gate preserves workflow, command and Batch idempotency identifiers', async () => {
  const workflow = await read('../src/lib/foundation/initial-stock-workflow.ts')
  for (const field of ['workflowId', 'activationCommandId', 'idempotencyKey']) assert.match(workflow, new RegExp(field))
  assert.match(workflow, /idempotency_key:\s*input\.receive\.idempotencyKey/)
})

test('T3 action validates input behind authenticated trusted server boundary', async () => {
  const [action, service] = await Promise.all([
    read('../src/app/actions/foundation.ts'),
    read('../src/lib/foundation/server-service.ts'),
  ])
  assert.match(action, /parseInitialStockWorkflowInput/)
  assert.match(action, /executeInitialStockServerWorkflow/)
  assert.doesNotMatch(action, /createAdminClient|SUPABASE_SECRET_KEY/)
  assert.match(service, /getFoundationActor/)
})

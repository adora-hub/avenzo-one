import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import test from 'node:test'
import { executeInitialStockWorkflow } from '../src/lib/foundation/initial-stock-workflow.ts'

const ids = {
  workflow: '00000000-0000-4000-8000-000000000301', organization: '00000000-0000-4000-8000-000000000302',
  product: '00000000-0000-4000-8000-000000000303', productActivation: '00000000-0000-4000-8000-000000000304',
  location: '00000000-0000-4000-8000-000000000305', skuA: '00000000-0000-4000-8000-000000000306',
  skuB: '00000000-0000-4000-8000-000000000307', skuActivationA: '00000000-0000-4000-8000-000000000308',
  skuActivationB: '00000000-0000-4000-8000-000000000309', receiveA: '00000000-0000-4000-8000-000000000310',
  receiveB: '00000000-0000-4000-8000-000000000311',
}
const input = {
  workflowId: ids.workflow, organizationId: ids.organization, productId: ids.product,
  productExpectedVersion: 1, productActivationCommandId: ids.productActivation, destinationLocationId: ids.location,
  items: [
    { key: 'blue-s', skuId: ids.skuA, expectedVersion: 1, quantity: 5, activationCommandId: ids.skuActivationA, receiveCommandId: ids.receiveA },
    { key: 'blue-m', skuId: ids.skuB, expectedVersion: 1, quantity: 7, activationCommandId: ids.skuActivationB, receiveCommandId: ids.receiveB },
  ],
}

test('T3 activates Product before each SKU and posts opening balance receive commands', async () => {
  const commands = []
  const result = await executeInitialStockWorkflow(input, async (command) => {
    commands.push(command)
    return command.kind === 'inventory' ? { movement_ids: ['movement-' + command.skuId] } : { status: 'active' }
  }, () => 'foundation_command_failed')
  assert.equal(result.status, 'completed')
  assert.deepEqual(commands.map((command) => command.commandType), ['product.activate', 'sku.activate', 'receive', 'sku.activate', 'receive'])
  const receives = commands.filter((command) => command.kind === 'inventory')
  assert.ok(receives.every((command) => command.destinationLocationId === ids.location && command.reasonCode === 'opening_balance'))
  assert.deepEqual(receives.map((command) => command.quantity), [5, 7])
})

test('T3 isolates a failed SKU and reports partial recovery', async () => {
  const result = await executeInitialStockWorkflow(input, async (command) => {
    if (command.kind === 'inventory' && command.skuId === ids.skuB) throw new Error('temporary_receive_failure')
    return command.kind === 'inventory' ? { movement_ids: ['movement-a'] } : { status: 'active' }
  }, () => 'foundation_command_failed')
  assert.equal(result.productStatus, 'active')
  assert.equal(result.status, 'partial')
  assert.deepEqual(result.items.map((item) => [item.key, item.status, item.stage]), [
    ['blue-s', 'completed', 'completed'], ['blue-m', 'failed', 'inventory_receive'],
  ])
  assert.equal(result.items[1].receiveCommandId, ids.receiveB)
})

test('T3 preserves command ids so retry uses the same idempotency keys', async () => {
  const attempts = []
  const execute = async (command) => { attempts.push(command.commandId); return command.kind === 'inventory' ? { movement_ids: ['movement-existing'] } : { status: 'active' } }
  await executeInitialStockWorkflow(input, execute, () => 'foundation_command_failed')
  await executeInitialStockWorkflow(input, execute, () => 'foundation_command_failed')
  assert.deepEqual(attempts.slice(0, 5), attempts.slice(5))
})

test('T3 action validates input behind the authenticated command boundary', async () => {
  const action = await readFile(new URL('../src/app/actions/foundation.ts', import.meta.url), 'utf8')
  assert.match(action, /executeInitialStockWorkflowAction/)
  assert.match(action, /executeFoundationServerCommand/)
  assert.match(action, /items\.length > 100/)
  assert.doesNotMatch(action, /createAdminClient|SUPABASE_SECRET_KEY/)
})

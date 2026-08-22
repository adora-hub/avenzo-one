import assert from 'node:assert/strict'
import test from 'node:test'

import {
  executeRapidInitialStockWorkflow,
  parseRapidInitialStockInput,
} from '../src/lib/foundation/rapid-initial-stock-workflow.ts'

const ids = Array.from({ length: 20 }, (_, index) => `00000000-0000-4000-8000-${String(index + 1).padStart(12, '0')}`)
const input = {
  contractVersion: 1,
  workflowId: ids[0],
  organizationId: ids[1],
  branchId: ids[2],
  idempotencyKey: ids[3],
  reference: 'rapid:test',
  items: [0, 1].map((index) => ({
    clientRowId: `row-${index + 1}`,
    productId: ids[4 + index],
    productVersion: 1,
    productActivationCommandId: ids[6 + index],
    skuId: ids[8 + index],
    skuVersion: 1,
    skuActivationCommandId: ids[10 + index],
    locationId: ids[12],
    quantity: index + 2,
    unitCode: 'piece',
  })),
}

function dependencies(overrides = {}) {
  const calls = { activate: [], receive: [] }
  return {
    calls,
    value: {
      async activate(workflow) {
        calls.activate.push(workflow)
        return { status: 'completed', activatedSkuIds: [workflow.skus[0].skuId], productStatus: 'active', retryable: false }
      },
      async receive(request) {
        calls.receive.push(request)
        return { contractVersion: 1, batchId: ids[14], batchType: 'initial_receive', organizationId: input.organizationId, branchId: input.branchId, idempotencyKey: input.idempotencyKey, requestHash: 'hash', status: 'completed', itemCount: 2, occurredAt: '2026-08-22T00:00:00Z', committedAt: '2026-08-22T00:00:00Z', items: [] }
      },
      newActivationWorkflowId(row) { return row === 'row-1' ? ids[15] : ids[16] },
      ...overrides,
    },
  }
}

test('Rapid-BE-05 validates 1-50 unique SKU/location items', () => {
  const parsed = parseRapidInitialStockInput(input)
  assert.equal(parsed.items.length, 2)
  assert.throws(() => parseRapidInitialStockInput({ ...input, items: [...input.items, input.items[0]] }), /initial_stock_duplicate_item/)
  assert.throws(() => parseRapidInitialStockInput({ ...input, items: [] }), /initial_stock_validation_failed/)
})

test('Rapid-BE-05 activates every Product/SKU then sends one atomic Batch', async () => {
  const { calls, value } = dependencies()
  const result = await executeRapidInitialStockWorkflow(parseRapidInitialStockInput(input), value)
  assert.equal(result.status, 'completed')
  assert.equal(calls.activate.length, 2)
  assert.equal(calls.receive.length, 1)
  assert.equal(calls.receive[0].items.length, 2)
  assert.equal(calls.receive[0].idempotency_key, input.idempotencyKey)
})

test('Rapid-BE-05 never posts stock when one activation fails', async () => {
  let count = 0
  const { calls, value } = dependencies({
    async activate(workflow) {
      calls.activate.push(workflow)
      count += 1
      return count === 2
        ? { status: 'failed', activatedSkuIds: [], productStatus: 'draft', error: 'activation_failed', retryable: false }
        : { status: 'completed', activatedSkuIds: [workflow.skus[0].skuId], productStatus: 'active', retryable: false }
    },
  })
  const result = await executeRapidInitialStockWorkflow(parseRapidInitialStockInput(input), value)
  assert.equal(result.status, 'activation_pending')
  assert.equal(calls.receive.length, 0)
  assert.equal(result.preserveIdempotencyKey, true)
})

test('Rapid-BE-05 preserves the Batch key after atomic receive rejection', async () => {
  const { calls, value } = dependencies({
    async receive(request) {
      calls.receive.push(request)
      throw { code: 'initial_stock_item_not_receivable', status: 409 }
    },
  })
  const result = await executeRapidInitialStockWorkflow(parseRapidInitialStockInput(input), value)
  assert.equal(result.status, 'stock_pending')
  assert.equal(result.preserveIdempotencyKey, true)
  assert.equal(calls.receive.length, 1)
})

test('Rapid-BE-05 marks ambiguous transport outcome and keeps the same retry key', async () => {
  const { value } = dependencies({ async receive() { throw { code: 'ETIMEDOUT', status: 504 } } })
  const result = await executeRapidInitialStockWorkflow(parseRapidInitialStockInput(input), value)
  assert.equal(result.status, 'unknown_outcome')
  assert.equal(result.retryable, true)
  assert.equal(result.preserveIdempotencyKey, true)
})

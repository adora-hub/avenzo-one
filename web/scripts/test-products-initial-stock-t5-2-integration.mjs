import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import test from 'node:test'
import {
  executeInitialStockWorkflow,
  InitialStockContractError,
  parseInitialStockBatchResult,
  parseInitialStockWorkflowInput,
} from '../src/lib/foundation/initial-stock-workflow.ts'

const id = (suffix) => `00000000-0000-4000-8000-${String(suffix).padStart(12, '0')}`

function rawInput({ skuCount = 2, receive = true } = {}) {
  const skus = Array.from({ length: skuCount }, (_, index) => ({
    key: `variant-${index + 1}`,
    skuId: id(100 + index),
    expectedVersion: 1,
    activationCommandId: id(200 + index),
  }))
  return {
    contractVersion: 1,
    workflowId: id(1),
    organizationId: id(2),
    product: { productId: id(3), expectedVersion: 1, activationCommandId: id(4) },
    skus,
    receive: receive ? {
      branchId: id(5),
      idempotencyKey: id(6),
      reference: 'product:initial-stock',
      reasonNote: 'Initial stock integration test',
      items: skus.map((sku, index) => ({
        skuId: sku.skuId,
        locationId: id(7),
        quantity: String(index + 1),
        unitCode: 'piece',
      })),
    } : null,
  }
}

function batchResult(input = parseInitialStockWorkflowInput(rawInput())) {
  return {
    contractVersion: 1,
    batchId: id(10),
    batchType: 'initial_receive',
    organizationId: input.organizationId,
    branchId: input.receive?.branchId ?? id(5),
    idempotencyKey: input.receive?.idempotencyKey ?? id(6),
    requestHash: 'a'.repeat(64),
    status: 'completed',
    itemCount: input.receive?.items.length ?? 0,
    occurredAt: '2026-08-21T10:00:00.000Z',
    committedAt: '2026-08-21T10:00:00.100Z',
    items: (input.receive?.items ?? []).map((item, index) => ({
      batchItemId: id(300 + index),
      skuId: item.skuId,
      warehouseId: id(8),
      locationId: item.locationId,
      quantity: item.quantity,
      baseUnitCode: item.unitCode,
      inventoryCommandId: id(400 + index),
      movementId: id(500 + index),
      balanceVersion: 1,
      onHand: item.quantity,
    })),
  }
}

function harness(input, overrides = {}) {
  const commands = []
  const batches = []
  const dependencies = {
    executeCommand: async (command) => {
      commands.push(structuredClone(command))
      return { status: 'active', version: 2 }
    },
    receiveBatch: async (request) => {
      batches.push(structuredClone(request))
      return batchResult(input)
    },
    ...overrides,
  }
  return { commands, batches, dependencies }
}

test('I01 parses a standard one-SKU receive request', () => {
  const parsed = parseInitialStockWorkflowInput(rawInput({ skuCount: 1 }))
  assert.equal(parsed.skus.length, 1)
  assert.equal(parsed.receive?.items.length, 1)
})

test('I02 parses a multi-SKU variant request', () => {
  const parsed = parseInitialStockWorkflowInput(rawInput({ skuCount: 4 }))
  assert.deepEqual(parsed.receive?.items.map((item) => item.quantity), [1, 2, 3, 4])
})

test('I03 rejects enabled Initial Stock with zero receive items', () => {
  const input = rawInput()
  input.receive.items = []
  assert.throws(() => parseInitialStockWorkflowInput(input), /initial_stock_validation_failed/)
})

test('I04 rejects more than 100 SKU activations', () => {
  assert.throws(() => parseInitialStockWorkflowInput(rawInput({ skuCount: 101 })), /initial_stock_validation_failed/)
})

test('I05 rejects non-allowlisted DTO keys', () => {
  assert.throws(() => parseInitialStockWorkflowInput({ ...rawInput(), actorUserId: id(999) }), /initial_stock_validation_failed/)
})

test('I06 rejects duplicate SKU activation identities', () => {
  const input = rawInput()
  input.skus[1].skuId = input.skus[0].skuId
  assert.throws(() => parseInitialStockWorkflowInput(input), /initial_stock_validation_failed/)
})

test('I07 rejects duplicate SKU and Location pairs', () => {
  const input = rawInput()
  input.receive.items[1].skuId = input.receive.items[0].skuId
  assert.throws(() => parseInitialStockWorkflowInput(input), /initial_stock_duplicate_item/)
})

test('I08 rejects zero and negative quantities', () => {
  for (const quantity of ['0', '-1']) {
    const input = rawInput()
    input.receive.items[0].quantity = quantity
    assert.throws(() => parseInitialStockWorkflowInput(input), /initial_stock_validation_failed/)
  }
})

test('I09 rejects quantity precision greater than six decimals', () => {
  const input = rawInput()
  input.receive.items[0].quantity = '1.0000001'
  assert.throws(() => parseInitialStockWorkflowInput(input), /initial_stock_validation_failed/)
})

test('I10 rejects invalid unit codes', () => {
  const input = rawInput()
  input.receive.items[0].unitCode = 'Piece!'
  assert.throws(() => parseInitialStockWorkflowInput(input), /initial_stock_validation_failed/)
})

test('I11 rejects occurredAt without timezone', () => {
  const input = rawInput()
  input.receive.occurredAt = '2026-08-21T10:00:00'
  assert.throws(() => parseInitialStockWorkflowInput(input), /initial_stock_validation_failed/)
})

test('I12 rejects receive items outside the activation set', () => {
  const input = rawInput()
  input.receive.items[0].skuId = id(999)
  assert.throws(() => parseInitialStockWorkflowInput(input), /initial_stock_validation_failed/)
})

test('I13 activates every SKU before Product and calls one Batch RPC', async () => {
  const input = parseInitialStockWorkflowInput(rawInput({ skuCount: 3 }))
  const { commands, batches, dependencies } = harness(input)
  const result = await executeInitialStockWorkflow(input, dependencies)
  assert.equal(result.status, 'completed')
  assert.deepEqual(commands.map((command) => command.commandType), ['sku.activate', 'sku.activate', 'sku.activate', 'product.activate'])
  assert.equal(batches.length, 1)
  assert.equal(batches[0].items.length, 3)
})

test('I14 activates SKU and Product but explicitly skips receive when disabled', async () => {
  const input = parseInitialStockWorkflowInput(rawInput({ skuCount: 1, receive: false }))
  const { commands, batches, dependencies } = harness(input)
  const result = await executeInitialStockWorkflow(input, dependencies)
  assert.equal(result.stockStatus, 'not_requested')
  assert.deepEqual(commands.map((command) => command.commandType), ['sku.activate', 'product.activate'])
  assert.equal(batches.length, 0)
})

test('I15 stops before Product and receive when a SKU activation fails', async () => {
  const input = parseInitialStockWorkflowInput(rawInput())
  const { commands, batches, dependencies } = harness(input, {
    executeCommand: async (command) => {
      commands.push(command)
      if (command.payload.sku_id === input.skus[1].skuId) throw new InitialStockContractError('version_conflict', 409)
      return { status: 'active' }
    },
  })
  const result = await executeInitialStockWorkflow(input, dependencies)
  assert.equal(result.stage, 'sku_activation')
  assert.equal(result.productStatus, 'draft')
  assert.equal(batches.length, 0)
})

test('I16 stops before receive when Product activation fails', async () => {
  const input = parseInitialStockWorkflowInput(rawInput())
  const { batches, dependencies } = harness(input, {
    executeCommand: async (command) => {
      if (command.commandType === 'product.activate') throw new InitialStockContractError('invalid_state_transition', 409)
      return { status: 'active' }
    },
  })
  const result = await executeInitialStockWorkflow(input, dependencies)
  assert.equal(result.stage, 'product_activation')
  assert.equal(result.productStatus, 'draft')
  assert.equal(batches.length, 0)
})

test('I17 returns Workflow-only stock_pending for a non-transient Batch rejection', async () => {
  const input = parseInitialStockWorkflowInput(rawInput())
  const { dependencies } = harness(input, {
    receiveBatch: async () => { throw new InitialStockContractError('initial_stock_item_not_receivable', 409) },
  })
  const result = await executeInitialStockWorkflow(input, dependencies)
  assert.equal(result.status, 'stock_pending')
  assert.equal(result.productStatus, 'active')
  assert.equal(result.stockStatus, 'pending')
})

test('I18 preserves Workflow, activation Command and Batch keys across refresh replay', async () => {
  const input = parseInitialStockWorkflowInput(rawInput())
  const first = harness(input)
  const second = harness(input)
  await executeInitialStockWorkflow(input, first.dependencies)
  await executeInitialStockWorkflow(input, second.dependencies)
  assert.deepEqual(first.commands.map((command) => command.commandId), second.commands.map((command) => command.commandId))
  assert.equal(first.batches[0].idempotency_key, second.batches[0].idempotency_key)
  assert.equal(input.workflowId, rawInput().workflowId)
})

test('I19 retries one quick transient receive with the identical payload and key', async () => {
  const input = parseInitialStockWorkflowInput(rawInput())
  const attempts = []
  let count = 0
  const { dependencies } = harness(input, {
    receiveBatch: async (request) => {
      attempts.push(structuredClone(request))
      count += 1
      if (count === 1) throw { code: 'PGRST000', status: 503 }
      return batchResult(input)
    },
    now: () => 0,
  })
  const result = await executeInitialStockWorkflow(input, dependencies)
  assert.equal(result.status, 'completed')
  assert.equal(attempts.length, 2)
  assert.deepEqual(attempts[0], attempts[1])
})

test('I20 returns unknown_outcome when remaining action budget cannot cover retry', async () => {
  const input = parseInitialStockWorkflowInput(rawInput())
  let nowCalls = 0
  let attempts = 0
  const { dependencies } = harness(input, {
    receiveBatch: async () => { attempts += 1; throw { code: 'PGRST000', status: 503 } },
    now: () => nowCalls++ === 0 ? 0 : 15_000,
  })
  const result = await executeInitialStockWorkflow(input, dependencies)
  assert.equal(result.status, 'unknown_outcome')
  assert.equal(attempts, 1)
  assert.equal(result.preserveIdempotencyKey, true)
})

test('I21 applies soft timeout and does not issue an unsafe second key', async () => {
  const input = parseInitialStockWorkflowInput(rawInput())
  let attempts = 0
  const { dependencies } = harness(input, {
    receiveBatch: async () => { attempts += 1; return new Promise(() => {}) },
    softTimeoutMs: 5,
    actionBudgetMs: 4,
    now: () => 0,
  })
  const result = await executeInitialStockWorkflow(input, dependencies)
  assert.equal(result.error, 'initial_stock_timeout_unknown')
  assert.equal(result.stockStatus, 'unknown_outcome')
  assert.equal(attempts, 1)
})

test('I22 parses the complete T4.4B response contract', () => {
  const input = parseInitialStockWorkflowInput(rawInput({ skuCount: 1 }))
  const expected = batchResult(input)
  const parsed = parseInitialStockBatchResult({
    contract_version: 1,
    batch_id: expected.batchId,
    batch_type: expected.batchType,
    organization_id: expected.organizationId,
    branch_id: expected.branchId,
    idempotency_key: expected.idempotencyKey,
    request_hash: expected.requestHash,
    status: expected.status,
    item_count: expected.itemCount,
    occurred_at: expected.occurredAt,
    committed_at: expected.committedAt,
    items: expected.items.map((item) => ({
      batch_item_id: item.batchItemId,
      sku_id: item.skuId,
      warehouse_id: item.warehouseId,
      location_id: item.locationId,
      quantity: item.quantity,
      base_unit_code: item.baseUnitCode,
      inventory_command_id: item.inventoryCommandId,
      movement_id: item.movementId,
      balance_version: item.balanceVersion,
      on_hand: item.onHand,
    })),
  })
  assert.deepEqual(parsed, expected)
})

test('I23 rejects an incomplete Batch response', () => {
  assert.throws(() => parseInitialStockBatchResult({ status: 'completed', items: [] }), /initial_stock_state_incomplete|initial_stock_validation_failed/)
})

test('I24 contains no legacy partial status or per-SKU receive fallback', async () => {
  const source = await readFile(new URL('../src/lib/foundation/initial-stock-workflow.ts', import.meta.url), 'utf8')
  assert.doesNotMatch(source, /status:\s*'partial'|commandType:\s*'receive'/)
  assert.match(source, /receiveBatch\(request\)/)
})

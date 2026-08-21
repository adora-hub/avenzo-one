import type { FoundationApplicationCommand, FoundationCommandOutcome } from './contracts'
import type { FoundationErrorCode } from './errors'

export const INITIAL_STOCK_SOFT_TIMEOUT_MS = 20_000
export const INITIAL_STOCK_ACTION_BUDGET_MS = 30_000

export type InitialStockActivationItem = {
  key: string
  skuId: string
  expectedVersion: number
  activationCommandId: string
}

export type InitialStockBatchItem = {
  skuId: string
  locationId: string
  quantity: number
  unitCode: string
}

export type InitialStockBatchRequest = {
  contract_version: 1
  organization_id: string
  branch_id: string
  idempotency_key: string
  reference?: string
  reason_code: 'initial_stock'
  reason_note?: string
  occurred_at?: string
  items: Array<{
    sku_id: string
    location_id: string
    quantity: number
    unit_code: string
  }>
}

export type InitialStockBatchResultItem = {
  batchItemId: string
  skuId: string
  warehouseId: string
  locationId: string
  quantity: number
  baseUnitCode: string
  inventoryCommandId: string
  movementId: string
  balanceVersion: number
  onHand: number
}

export type InitialStockBatchResult = {
  contractVersion: 1
  batchId: string
  batchType: 'initial_receive'
  organizationId: string
  branchId: string
  idempotencyKey: string
  requestHash: string
  status: 'completed'
  itemCount: number
  occurredAt: string
  committedAt: string
  items: InitialStockBatchResultItem[]
}

export type InitialStockReceiveIntent = {
  branchId: string
  idempotencyKey: string
  reference?: string
  reasonNote?: string
  occurredAt?: string
  items: InitialStockBatchItem[]
}

export type InitialStockWorkflowInput = {
  contractVersion: 1
  workflowId: string
  organizationId: string
  product: {
    productId: string
    expectedVersion: number
    activationCommandId: string
  }
  skus: InitialStockActivationItem[]
  receive: InitialStockReceiveIntent | null
}

export type InitialStockWorkflowResult = {
  workflowId: string
  productId: string
  status: 'completed' | 'stock_pending' | 'unknown_outcome' | 'failed'
  stage: 'completed' | 'sku_activation' | 'product_activation' | 'receive'
  productStatus: 'draft' | 'active'
  stockStatus: 'not_requested' | 'pending' | 'completed' | 'unknown_outcome'
  activatedSkuIds: string[]
  batch?: InitialStockBatchResult
  error?: FoundationErrorCode
  retryable: boolean
  preserveIdempotencyKey: boolean
}

type ExecuteCommand = (command: FoundationApplicationCommand) => Promise<FoundationCommandOutcome>
type ReceiveBatch = (request: InitialStockBatchRequest) => Promise<InitialStockBatchResult>
type NormalizedInitialStockError = { code: FoundationErrorCode; status: number }
type NormalizeError = (error: unknown) => NormalizedInitialStockError

export type InitialStockWorkflowDependencies = {
  executeCommand: ExecuteCommand
  receiveBatch: ReceiveBatch
  normalizeError?: NormalizeError
  now?: () => number
  softTimeoutMs?: number
  actionBudgetMs?: number
}

const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i
const unitCodePattern = /^[a-z][a-z0-9_]{0,31}$/
const decimalPattern = /^(?:0|[1-9][0-9]{0,8})(?:\.[0-9]{1,6})?$/
const controlCharacterPattern = /[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/

export class InitialStockContractError extends Error {
  readonly code: FoundationErrorCode
  readonly status: number

  constructor(code: FoundationErrorCode, status: number) {
    super(code)
    this.name = 'InitialStockContractError'
    this.code = code
    this.status = status
  }
}

function normalizeInitialStockError(error: unknown): NormalizedInitialStockError {
  const candidate = error as { code?: FoundationErrorCode; status?: number }
  return candidate?.code && Number.isFinite(candidate.status)
    ? { code: candidate.code, status: Number(candidate.status) }
    : { code: 'initial_stock_failed', status: 500 }
}

function requireRecord(value: unknown) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new InitialStockContractError('initial_stock_validation_failed', 400)
  }
  return value as Record<string, unknown>
}

function requireExactKeys(record: Record<string, unknown>, required: string[], optional: string[] = []) {
  const allowed = new Set([...required, ...optional])
  if (required.some((key) => !Object.prototype.hasOwnProperty.call(record, key))
    || Object.keys(record).some((key) => !allowed.has(key))) {
    throw new InitialStockContractError('initial_stock_validation_failed', 400)
  }
}

function requireUuid(value: unknown) {
  if (typeof value !== 'string' || !uuidPattern.test(value)) {
    throw new InitialStockContractError('initial_stock_validation_failed', 400)
  }
  return value
}

function requireResultUuid(value: unknown) {
  if (typeof value !== 'string' || !uuidPattern.test(value)) {
    throw new InitialStockContractError('initial_stock_state_incomplete', 500)
  }
  return value
}

function requireVersion(value: unknown) {
  if (!Number.isSafeInteger(value) || Number(value) < 1) {
    throw new InitialStockContractError('initial_stock_validation_failed', 400)
  }
  return Number(value)
}

function optionalText(value: unknown, maximum: number) {
  if (value === undefined || value === null) return undefined
  if (typeof value !== 'string') throw new InitialStockContractError('initial_stock_validation_failed', 400)
  const normalized = value.normalize('NFC').trim()
  if (!normalized) return undefined
  if (normalized.length > maximum || controlCharacterPattern.test(normalized)) {
    throw new InitialStockContractError('initial_stock_validation_failed', 400)
  }
  return normalized
}

function parseQuantity(value: unknown) {
  if (typeof value !== 'string' || !decimalPattern.test(value.trim())) {
    throw new InitialStockContractError('initial_stock_validation_failed', 400)
  }
  const quantity = Number(value)
  if (!Number.isFinite(quantity) || quantity <= 0 || quantity > 999_999_999) {
    throw new InitialStockContractError('initial_stock_validation_failed', 400)
  }
  return quantity
}

export function parseInitialStockWorkflowInput(value: unknown): InitialStockWorkflowInput {
  const input = requireRecord(value)
  requireExactKeys(input, ['contractVersion', 'workflowId', 'organizationId', 'product', 'skus', 'receive'])
  if (input.contractVersion !== 1) throw new InitialStockContractError('initial_stock_validation_failed', 400)

  const product = requireRecord(input.product)
  requireExactKeys(product, ['productId', 'expectedVersion', 'activationCommandId'])

  if (!Array.isArray(input.skus) || input.skus.length < 1 || input.skus.length > 100) {
    throw new InitialStockContractError('initial_stock_validation_failed', 400)
  }
  const skus = input.skus.map((value) => {
    const item = requireRecord(value)
    requireExactKeys(item, ['key', 'skuId', 'expectedVersion', 'activationCommandId'])
    const key = typeof item.key === 'string' ? item.key.normalize('NFC').trim().slice(0, 500) : ''
    if (!key || controlCharacterPattern.test(key)) {
    throw new InitialStockContractError('initial_stock_validation_failed', 400)
    }
    return {
      key,
      skuId: requireUuid(item.skuId),
      expectedVersion: requireVersion(item.expectedVersion),
      activationCommandId: requireUuid(item.activationCommandId),
    }
  })

  if (new Set(skus.map((item) => item.key)).size !== skus.length
    || new Set(skus.map((item) => item.skuId)).size !== skus.length
    || new Set(skus.map((item) => item.activationCommandId)).size !== skus.length) {
    throw new InitialStockContractError('initial_stock_validation_failed', 400)
  }

  let receive: InitialStockReceiveIntent | null = null
  if (input.receive !== null) {
    const receiveInput = requireRecord(input.receive)
    requireExactKeys(
      receiveInput,
      ['branchId', 'idempotencyKey', 'items'],
      ['reference', 'reasonNote', 'occurredAt'],
    )
    if (!Array.isArray(receiveInput.items)
      || receiveInput.items.length < 1 || receiveInput.items.length > 100) {
    throw new InitialStockContractError('initial_stock_validation_failed', 400)
    }
    const knownSkuIds = new Set(skus.map((item) => item.skuId))
    const items = receiveInput.items.map((value) => {
      const item = requireRecord(value)
      requireExactKeys(item, ['skuId', 'locationId', 'quantity', 'unitCode'])
      const skuId = requireUuid(item.skuId)
      const unitCode = typeof item.unitCode === 'string' ? item.unitCode.trim().toLowerCase() : ''
      if (!knownSkuIds.has(skuId) || !unitCodePattern.test(unitCode)) {
    throw new InitialStockContractError('initial_stock_validation_failed', 400)
      }
      return {
        skuId,
        locationId: requireUuid(item.locationId),
        quantity: parseQuantity(item.quantity),
        unitCode,
      }
    })
    const pairs = items.map((item) => `${item.skuId}:${item.locationId}`)
    if (new Set(pairs).size !== pairs.length) {
      throw new InitialStockContractError('initial_stock_duplicate_item', 400)
    }
    const occurredAt = optionalText(receiveInput.occurredAt, 64)
    if (occurredAt && !/T.*(?:Z|[+-][0-9]{2}:[0-9]{2})$/.test(occurredAt)) {
    throw new InitialStockContractError('initial_stock_validation_failed', 400)
    }
    receive = {
      branchId: requireUuid(receiveInput.branchId),
      idempotencyKey: requireUuid(receiveInput.idempotencyKey),
      reference: optionalText(receiveInput.reference, 255),
      reasonNote: optionalText(receiveInput.reasonNote, 1000),
      occurredAt,
      items,
    }
  }

  return {
    contractVersion: 1,
    workflowId: requireUuid(input.workflowId),
    organizationId: requireUuid(input.organizationId),
    product: {
      productId: requireUuid(product.productId),
      expectedVersion: requireVersion(product.expectedVersion),
      activationCommandId: requireUuid(product.activationCommandId),
    },
    skus,
    receive,
  }
}

function parseResultNumber(value: unknown) {
  const parsed = typeof value === 'number' ? value : Number(value)
  if (!Number.isFinite(parsed)) throw new InitialStockContractError('initial_stock_state_incomplete', 500)
  return parsed
}

export function parseInitialStockBatchResult(value: unknown): InitialStockBatchResult {
  const result = requireRecord(value)
  if (result.contract_version !== 1 || result.batch_type !== 'initial_receive'
    || result.status !== 'completed' || !Array.isArray(result.items)) {
    throw new InitialStockContractError('initial_stock_state_incomplete', 500)
  }
  const items = result.items.map((value) => {
    const item = requireRecord(value)
    return {
      batchItemId: requireResultUuid(item.batch_item_id),
      skuId: requireResultUuid(item.sku_id),
      warehouseId: requireResultUuid(item.warehouse_id),
      locationId: requireResultUuid(item.location_id),
      quantity: parseResultNumber(item.quantity),
      baseUnitCode: String(item.base_unit_code ?? ''),
      inventoryCommandId: requireResultUuid(item.inventory_command_id),
      movementId: requireResultUuid(item.movement_id),
      balanceVersion: parseResultNumber(item.balance_version),
      onHand: parseResultNumber(item.on_hand),
    }
  })
  const itemCount = parseResultNumber(result.item_count)
  if (!Number.isSafeInteger(itemCount) || itemCount !== items.length) {
    throw new InitialStockContractError('initial_stock_state_incomplete', 500)
  }
  return {
    contractVersion: 1,
    batchId: requireResultUuid(result.batch_id),
    batchType: 'initial_receive',
    organizationId: requireResultUuid(result.organization_id),
    branchId: requireResultUuid(result.branch_id),
    idempotencyKey: requireResultUuid(result.idempotency_key),
    requestHash: String(result.request_hash ?? ''),
    status: 'completed',
    itemCount,
    occurredAt: String(result.occurred_at ?? ''),
    committedAt: String(result.committed_at ?? ''),
    items,
  }
}

function batchRequest(input: InitialStockWorkflowInput): InitialStockBatchRequest | null {
  if (!input.receive) return null
  return {
    contract_version: 1,
    organization_id: input.organizationId,
    branch_id: input.receive.branchId,
    idempotency_key: input.receive.idempotencyKey,
    ...(input.receive.reference ? { reference: input.receive.reference } : {}),
    reason_code: 'initial_stock',
    ...(input.receive.reasonNote ? { reason_note: input.receive.reasonNote } : {}),
    ...(input.receive.occurredAt ? { occurred_at: input.receive.occurredAt } : {}),
    items: input.receive.items.map((item) => ({
      sku_id: item.skuId,
      location_id: item.locationId,
      quantity: item.quantity,
      unit_code: item.unitCode,
    })),
  }
}

class InitialStockSoftTimeoutError extends Error {
  constructor() {
    super('initial_stock_soft_timeout')
    this.name = 'InitialStockSoftTimeoutError'
  }
}

async function withSoftTimeout<T>(operation: Promise<T>, timeoutMs: number): Promise<T> {
  let timeoutId: ReturnType<typeof setTimeout> | undefined
  try {
    return await Promise.race([
      operation,
      new Promise<T>((_resolve, reject) => {
        timeoutId = setTimeout(() => reject(new InitialStockSoftTimeoutError()), timeoutMs)
      }),
    ])
  } finally {
    if (timeoutId) clearTimeout(timeoutId)
  }
}

function isTransientReceiveError(error: unknown, normalized: NormalizedInitialStockError) {
  if (error instanceof InitialStockSoftTimeoutError) return true
  if (normalized.status >= 500 && normalized.code !== 'initial_stock_state_incomplete') return true
  const candidate = error as { code?: string; status?: number }
  return Number(candidate?.status) >= 500
    || ['ECONNRESET', 'ECONNREFUSED', 'ETIMEDOUT', 'PGRST000', 'PGRST001', 'PGRST002'].includes(String(candidate?.code ?? '').toUpperCase())
}

function failedResult(
  input: InitialStockWorkflowInput,
  activatedSkuIds: string[],
  stage: 'sku_activation' | 'product_activation' | 'receive',
  error: NormalizedInitialStockError,
  productStatus: 'draft' | 'active',
  unknownOutcome = false,
): InitialStockWorkflowResult {
  const receivePending = input.receive !== null
  return {
    workflowId: input.workflowId,
    productId: input.product.productId,
    status: unknownOutcome ? 'unknown_outcome' : productStatus === 'active' && receivePending ? 'stock_pending' : 'failed',
    stage,
    productStatus,
    stockStatus: unknownOutcome ? 'unknown_outcome' : receivePending ? 'pending' : 'not_requested',
    activatedSkuIds,
    error: unknownOutcome ? 'initial_stock_timeout_unknown' : error.code,
    retryable: unknownOutcome || error.status >= 500,
    preserveIdempotencyKey: receivePending,
  }
}

export async function executeInitialStockWorkflow(
  input: InitialStockWorkflowInput,
  dependencies: InitialStockWorkflowDependencies,
): Promise<InitialStockWorkflowResult> {
  const normalizeError = dependencies.normalizeError ?? normalizeInitialStockError
  const now = dependencies.now ?? Date.now
  const softTimeoutMs = dependencies.softTimeoutMs ?? INITIAL_STOCK_SOFT_TIMEOUT_MS
  const actionBudgetMs = dependencies.actionBudgetMs ?? INITIAL_STOCK_ACTION_BUDGET_MS
  const startedAt = now()
  const activatedSkuIds: string[] = []

  for (const item of input.skus) {
    try {
      await dependencies.executeCommand({
        kind: 'entity',
        commandId: item.activationCommandId,
        organizationId: input.organizationId,
        commandType: 'sku.activate',
        payload: { sku_id: item.skuId, expected_version: item.expectedVersion },
      })
      activatedSkuIds.push(item.skuId)
    } catch (error) {
      return failedResult(input, activatedSkuIds, 'sku_activation', normalizeError(error), 'draft')
    }
  }

  try {
    await dependencies.executeCommand({
      kind: 'entity',
      commandId: input.product.activationCommandId,
      organizationId: input.organizationId,
      commandType: 'product.activate',
      payload: {
        product_id: input.product.productId,
        expected_version: input.product.expectedVersion,
      },
    })
  } catch (error) {
    return failedResult(input, activatedSkuIds, 'product_activation', normalizeError(error), 'draft')
  }

  const request = batchRequest(input)
  if (!request) {
    return {
      workflowId: input.workflowId,
      productId: input.product.productId,
      status: 'completed',
      stage: 'completed',
      productStatus: 'active',
      stockStatus: 'not_requested',
      activatedSkuIds,
      retryable: false,
      preserveIdempotencyKey: false,
    }
  }

  for (let attempt = 0; attempt < 2; attempt += 1) {
    try {
      const batch = await withSoftTimeout(dependencies.receiveBatch(request), softTimeoutMs)
      return {
        workflowId: input.workflowId,
        productId: input.product.productId,
        status: 'completed',
        stage: 'completed',
        productStatus: 'active',
        stockStatus: 'completed',
        activatedSkuIds,
        batch,
        retryable: false,
        preserveIdempotencyKey: true,
      }
    } catch (error) {
      const normalized = error instanceof InitialStockSoftTimeoutError
        ? new InitialStockContractError('initial_stock_timeout_unknown', 504)
        : normalizeError(error)
      const transient = isTransientReceiveError(error, normalized)
      const enoughBudgetForRetry = actionBudgetMs - (now() - startedAt) >= softTimeoutMs
      if (attempt === 0 && transient && enoughBudgetForRetry) continue
      return failedResult(input, activatedSkuIds, 'receive', normalized, 'active', transient)
    }
  }

  return failedResult(
    input,
    activatedSkuIds,
    'receive',
    new InitialStockContractError('initial_stock_failed', 500),
    'active',
    true,
  )
}

import type { InitialStockBatchResult, InitialStockWorkflowInput } from './initial-stock-workflow'

export type RapidInitialStockItem = {
  clientRowId: string
  productId: string
  productVersion: number
  productActivationCommandId: string
  skuId: string
  skuVersion: number
  skuActivationCommandId: string
  locationId: string
  quantity: number
  unitCode: string
}

export type RapidInitialStockInput = {
  contractVersion: 1
  workflowId: string
  organizationId: string
  branchId: string
  idempotencyKey: string
  reference?: string
  items: RapidInitialStockItem[]
}

export type RapidInitialStockResult = {
  workflowId: string
  status: 'completed' | 'activation_pending' | 'stock_pending' | 'unknown_outcome'
  activatedProductIds: string[]
  activatedSkuIds: string[]
  batch?: InitialStockBatchResult
  error?: string
  retryable: boolean
  preserveIdempotencyKey: true
}

type Dependencies = {
  activate: (workflow: InitialStockWorkflowInput) => Promise<{
    status: string
    activatedSkuIds: string[]
    productStatus: string
    error?: string
    retryable: boolean
  }>
  receive: (request: {
    contract_version: 1
    organization_id: string
    branch_id: string
    idempotency_key: string
    reference?: string
    reason_code: 'initial_stock'
    reason_note: string
    items: Array<{ sku_id: string; location_id: string; quantity: number; unit_code: string }>
  }) => Promise<InitialStockBatchResult>
  newActivationWorkflowId: (clientRowId: string) => string
}

const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i
const unitPattern = /^[a-z][a-z0-9_]{0,31}$/

export function parseRapidInitialStockInput(value: unknown): RapidInitialStockInput {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('initial_stock_validation_failed')
  const input = value as Record<string, unknown>
  const items = Array.isArray(input.items) ? input.items : []
  if (input.contractVersion !== 1 || !uuidPattern.test(String(input.workflowId ?? ''))
    || !uuidPattern.test(String(input.organizationId ?? '')) || !uuidPattern.test(String(input.branchId ?? ''))
    || !uuidPattern.test(String(input.idempotencyKey ?? '')) || items.length < 1 || items.length > 50) {
    throw new Error('initial_stock_validation_failed')
  }
  const parsed = items.map((raw) => {
    if (!raw || typeof raw !== 'object' || Array.isArray(raw)) throw new Error('initial_stock_validation_failed')
    const item = raw as Record<string, unknown>
    const quantity = Number(item.quantity)
    const unitCode = String(item.unitCode ?? '').trim().toLowerCase()
    const result: RapidInitialStockItem = {
      clientRowId: String(item.clientRowId ?? '').trim(),
      productId: String(item.productId ?? ''),
      productVersion: Number(item.productVersion),
      productActivationCommandId: String(item.productActivationCommandId ?? ''),
      skuId: String(item.skuId ?? ''),
      skuVersion: Number(item.skuVersion),
      skuActivationCommandId: String(item.skuActivationCommandId ?? ''),
      locationId: String(item.locationId ?? ''),
      quantity,
      unitCode,
    }
    if (!result.clientRowId || result.clientRowId.length > 128
      || ![result.productId, result.productActivationCommandId, result.skuId, result.skuActivationCommandId, result.locationId].every((id) => uuidPattern.test(id))
      || !Number.isSafeInteger(result.productVersion) || result.productVersion < 1
      || !Number.isSafeInteger(result.skuVersion) || result.skuVersion < 1
      || !Number.isFinite(quantity) || quantity < 0 || quantity > 999_999_999
      || !unitPattern.test(unitCode)) throw new Error('initial_stock_validation_failed')
    return result
  })
  for (const values of [
    parsed.map((item) => item.clientRowId), parsed.map((item) => item.productId),
    parsed.map((item) => item.skuId), parsed.map((item) => `${item.skuId}:${item.locationId}`),
    parsed.map((item) => item.productActivationCommandId), parsed.map((item) => item.skuActivationCommandId),
  ]) if (new Set(values).size !== values.length) throw new Error('initial_stock_duplicate_item')
  return {
    contractVersion: 1,
    workflowId: String(input.workflowId),
    organizationId: String(input.organizationId),
    branchId: String(input.branchId),
    idempotencyKey: String(input.idempotencyKey),
    ...(typeof input.reference === 'string' && input.reference.trim() ? { reference: input.reference.trim().slice(0, 255) } : {}),
    items: parsed,
  }
}

/** Activates every created Product/SKU, then posts one all-or-nothing stock Batch. */
export async function executeRapidInitialStockWorkflow(
  input: RapidInitialStockInput,
  dependencies: Dependencies,
): Promise<RapidInitialStockResult> {
  const activatedProductIds: string[] = []
  const activatedSkuIds: string[] = []
  for (const item of input.items) {
    const activation = await dependencies.activate({
      contractVersion: 1,
      workflowId: dependencies.newActivationWorkflowId(item.clientRowId),
      organizationId: input.organizationId,
      product: {
        productId: item.productId,
        expectedVersion: item.productVersion,
        activationCommandId: item.productActivationCommandId,
      },
      skus: [{ key: item.clientRowId, skuId: item.skuId, expectedVersion: item.skuVersion, activationCommandId: item.skuActivationCommandId }],
      receive: null,
    })
    if (activation.status !== 'completed') return {
      workflowId: input.workflowId, status: 'activation_pending', activatedProductIds, activatedSkuIds,
      error: activation.error, retryable: activation.retryable, preserveIdempotencyKey: true,
    }
    activatedProductIds.push(item.productId)
    activatedSkuIds.push(item.skuId)
  }
  const receiveItems = input.items.filter((item) => item.quantity > 0)
  if (!receiveItems.length) return {
    workflowId: input.workflowId,
    status: 'completed',
    activatedProductIds,
    activatedSkuIds,
    retryable: false,
    preserveIdempotencyKey: true,
  }
  try {
    const batch = await dependencies.receive({
      contract_version: 1,
      organization_id: input.organizationId,
      branch_id: input.branchId,
      idempotency_key: input.idempotencyKey,
      ...(input.reference ? { reference: input.reference } : {}),
      reason_code: 'initial_stock',
      reason_note: `Rapid Entry initial stock workflow ${input.workflowId}`,
      items: receiveItems.map((item) => ({
        sku_id: item.skuId, location_id: item.locationId, quantity: item.quantity, unit_code: item.unitCode,
      })),
    })
    return { workflowId: input.workflowId, status: 'completed', activatedProductIds, activatedSkuIds, batch, retryable: false, preserveIdempotencyKey: true }
  } catch (error) {
    const candidate = error as { code?: string; status?: number }
    const unknown = Number(candidate?.status) >= 500
    return {
      workflowId: input.workflowId,
      status: unknown ? 'unknown_outcome' : 'stock_pending',
      activatedProductIds,
      activatedSkuIds,
      error: String(candidate?.code ?? 'initial_stock_failed'),
      retryable: unknown,
      preserveIdempotencyKey: true,
    }
  }
}

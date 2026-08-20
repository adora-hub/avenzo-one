import type { FoundationApplicationCommand, FoundationCommandOutcome } from './contracts'
import type { FoundationErrorCode } from './errors'

export type InitialStockWorkflowItem = { key: string; skuId: string; expectedVersion: number; quantity: number; activationCommandId: string; receiveCommandId: string }
export type InitialStockWorkflowInput = { workflowId: string; organizationId: string; productId: string; productExpectedVersion: number; productActivationCommandId: string; destinationLocationId: string; items: InitialStockWorkflowItem[] }
export type InitialStockWorkflowItemResult = { key: string; skuId: string; status: 'completed' | 'failed'; stage: 'completed' | 'sku_activation' | 'inventory_receive'; activationCommandId: string; receiveCommandId: string; movementIds?: string[]; error?: FoundationErrorCode }
export type InitialStockWorkflowResult = { workflowId: string; productId: string; productStatus: 'active' | 'failed'; status: 'completed' | 'partial' | 'failed'; items: InitialStockWorkflowItemResult[]; error?: FoundationErrorCode }

type ExecuteCommand = (command: FoundationApplicationCommand) => Promise<FoundationCommandOutcome>
type NormalizeError = (error: unknown) => FoundationErrorCode

export async function executeInitialStockWorkflow(input: InitialStockWorkflowInput, executeCommand: ExecuteCommand, normalizeError: NormalizeError): Promise<InitialStockWorkflowResult> {
  try {
    await executeCommand({ kind: 'entity', commandId: input.productActivationCommandId, organizationId: input.organizationId, commandType: 'product.activate', payload: { product_id: input.productId, expected_version: input.productExpectedVersion } })
  } catch (error) {
    return { workflowId: input.workflowId, productId: input.productId, productStatus: 'failed', status: 'failed', error: normalizeError(error), items: input.items.map((item) => ({ key: item.key, skuId: item.skuId, status: 'failed', stage: 'sku_activation', activationCommandId: item.activationCommandId, receiveCommandId: item.receiveCommandId })) }
  }
  const results: InitialStockWorkflowItemResult[] = []
  for (const item of input.items) {
    try {
      await executeCommand({ kind: 'entity', commandId: item.activationCommandId, organizationId: input.organizationId, commandType: 'sku.activate', payload: { sku_id: item.skuId, expected_version: item.expectedVersion } })
    } catch (error) {
      results.push({ key: item.key, skuId: item.skuId, status: 'failed', stage: 'sku_activation', activationCommandId: item.activationCommandId, receiveCommandId: item.receiveCommandId, error: normalizeError(error) })
      continue
    }
    try {
      const outcome = await executeCommand({ kind: 'inventory', commandId: item.receiveCommandId, organizationId: input.organizationId, commandType: 'receive', skuId: item.skuId, sourceLocationId: null, destinationLocationId: input.destinationLocationId, quantity: item.quantity, reasonCode: 'opening_balance', reasonNote: 'Initial stock from product creation workflow ' + input.workflowId })
      results.push({ key: item.key, skuId: item.skuId, status: 'completed', stage: 'completed', activationCommandId: item.activationCommandId, receiveCommandId: item.receiveCommandId, movementIds: Array.isArray(outcome.movement_ids) ? outcome.movement_ids.map(String) : [] })
    } catch (error) {
      results.push({ key: item.key, skuId: item.skuId, status: 'failed', stage: 'inventory_receive', activationCommandId: item.activationCommandId, receiveCommandId: item.receiveCommandId, error: normalizeError(error) })
    }
  }
  const completedCount = results.filter((item) => item.status === 'completed').length
  return { workflowId: input.workflowId, productId: input.productId, productStatus: 'active', status: completedCount === results.length ? 'completed' : completedCount > 0 ? 'partial' : 'failed', items: results }
}

'use server'

import { parseFoundationCommand } from '@/lib/foundation/contracts'
import type { FoundationActionResult, FoundationErrorCode } from '@/lib/foundation/errors'
import { mapFoundationError } from '@/lib/foundation/errors'
import type { FoundationCommandOutcome } from '@/lib/foundation/contracts'
import { executeFoundationServerCommand } from '@/lib/foundation/server-service'
import { executeProductImageCleanupCommand } from '@/lib/foundation/product-image-cleanup.server'
import { createFoundationReadRepository } from '@/lib/foundation/server-read'
import { getFoundationActor } from '@/lib/foundation/server-context'
import type { ProductWorkspaceSkuDetail } from '@/lib/foundation/repositories'
import {
  executeInitialStockWorkflow,
  type InitialStockWorkflowInput,
  type InitialStockWorkflowResult,
} from '@/lib/foundation/initial-stock-workflow'
import {
  checkProductIdentifiers,
  checkVariantProductIdentifiers,
  type ProductIdentifierCheckResult,
  type VariantProductIdentifierCheckResult,
} from '@/lib/foundation/product-identifier-check.server'
import {
  previewVariantSkuSequence,
  type VariantSkuSequencePreview,
} from '@/lib/foundation/variant-sku-sequence.server'
import {
  executeGlobalSalesCodeCreation,
  type GlobalSalesCodeCreationResult,
} from '@/lib/foundation/global-sales-code-creation.server'

export type ProductIdentifierCheckActionResult =
  | { ok: true; data: ProductIdentifierCheckResult }
  | { ok: false; error: FoundationErrorCode; status: number }

export type VariantProductIdentifierCheckActionResult =
  | { ok: true; data: VariantProductIdentifierCheckResult }
  | { ok: false; error: FoundationErrorCode; status: number }

export type VariantSkuSequencePreviewActionResult =
  | { ok: true; data: VariantSkuSequencePreview }
  | { ok: false; error: FoundationErrorCode; status: number }

export type ProductsBulkEditContextActionResult =
  | { ok: true; data: { products: Array<{ id: string; name: string; skus: ProductWorkspaceSkuDetail[] }> } }
  | { ok: false; error: FoundationErrorCode; status: number }

export type InitialStockDestinationActionResult =
  | { ok: true; data: {
    warehouses: Array<{ id: string; branchId: string; code: string; name: string }>
    locations: Array<{ id: string; branchId: string; warehouseId: string; code: string; name: string; isDefault: boolean }>
  } }
  | { ok: false; error: FoundationErrorCode; status: number }

export type InitialStockWorkflowActionResult =
  | { ok: true; data: InitialStockWorkflowResult }
  | { ok: false; error: FoundationErrorCode; status: number }

export type GlobalSalesCodeCreationActionResult =
  | { ok: true; data: GlobalSalesCodeCreationResult }
  | { ok: false; error: FoundationErrorCode; status: number }

export async function executeGlobalSalesCodeCreationAction(
  input: unknown,
): Promise<GlobalSalesCodeCreationActionResult> {
  try {
    return { ok: true, data: await executeGlobalSalesCodeCreation(input) }
  } catch (error) {
    const safeError = mapFoundationError(error)
    return { ok: false, error: safeError.code, status: safeError.status }
  }
}

const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i

function parseInitialStockWorkflowInput(input: unknown): InitialStockWorkflowInput {
  if (!input || typeof input !== 'object' || Array.isArray(input)) throw new Error('validation_failed')
  const value = input as Record<string, unknown>
  const items = Array.isArray(value.items) ? value.items : []
  const parsed: InitialStockWorkflowInput = {
    workflowId: String(value.workflowId ?? ''), organizationId: String(value.organizationId ?? ''),
    productId: String(value.productId ?? ''), productExpectedVersion: Number(value.productExpectedVersion),
    productActivationCommandId: String(value.productActivationCommandId ?? ''),
    destinationLocationId: String(value.destinationLocationId ?? ''),
    items: items.map((entry) => {
      if (!entry || typeof entry !== 'object' || Array.isArray(entry)) throw new Error('validation_failed')
      const item = entry as Record<string, unknown>
      return { key: String(item.key ?? '').trim().slice(0, 500), skuId: String(item.skuId ?? ''),
        expectedVersion: Number(item.expectedVersion), quantity: Number(item.quantity),
        activationCommandId: String(item.activationCommandId ?? ''), receiveCommandId: String(item.receiveCommandId ?? '') }
    }),
  }
  const identifiers = [parsed.workflowId, parsed.organizationId, parsed.productId, parsed.productActivationCommandId,
    parsed.destinationLocationId, ...parsed.items.flatMap((item) => [item.skuId, item.activationCommandId, item.receiveCommandId])]
  if (identifiers.some((id) => !uuidPattern.test(id))
    || !Number.isInteger(parsed.productExpectedVersion) || parsed.productExpectedVersion < 1
    || parsed.items.length < 1 || parsed.items.length > 100
    || parsed.items.some((item) => !item.key || !Number.isInteger(item.expectedVersion) || item.expectedVersion < 1
      || !Number.isFinite(item.quantity) || item.quantity <= 0 || item.quantity > 99_999_999_999_999.999999
      || !Number.isInteger(item.quantity * 1_000_000))
    || new Set(parsed.items.map((item) => item.skuId)).size !== parsed.items.length
    || new Set(parsed.items.map((item) => item.receiveCommandId)).size !== parsed.items.length) throw new Error('validation_failed')
  return parsed
}

export async function executeInitialStockWorkflowAction(input: unknown): Promise<InitialStockWorkflowActionResult> {
  try {
    const command = parseInitialStockWorkflowInput(input)
    const data = await executeInitialStockWorkflow(command, executeFoundationServerCommand, (error) => mapFoundationError(error).code)
    return { ok: true, data }
  } catch (error) {
    const safeError = mapFoundationError(error)
    return { ok: false, error: safeError.code, status: safeError.status }
  }
}
export async function loadInitialStockDestinationsAction(input: unknown): Promise<InitialStockDestinationActionResult> {
  try {
    if (!input || typeof input !== 'object' || Array.isArray(input)) throw new Error('validation_failed')
    const organizationId = String((input as Record<string, unknown>).organizationId ?? '')
    if (!/^[0-9a-f-]{36}$/i.test(organizationId)) throw new Error('validation_failed')
    const actor = await getFoundationActor(organizationId)
    if (!actor.permissions.includes('warehouse.read') || !actor.permissions.includes('inventory.receive')) {
      throw new Error('permission_denied')
    }
    const repository = await createFoundationReadRepository()
    const [warehousePage, locations] = await Promise.all([
      repository.listWarehouses({ organizationId, status: 'active', pageSize: 100 }),
      repository.listLocations({ organizationId, status: 'active', pageSize: 100 }),
    ])
    const warehouseIds = new Set(warehousePage.items.map((warehouse) => warehouse.id))
    return {
      ok: true,
      data: {
        warehouses: warehousePage.items.map((warehouse) => ({
          id: warehouse.id, branchId: warehouse.branchId, code: warehouse.code, name: warehouse.name,
        })),
        locations: locations.filter((location) => warehouseIds.has(location.warehouseId)).map((location) => ({
          id: location.id, branchId: location.branchId, warehouseId: location.warehouseId,
          code: location.code, name: location.name, isDefault: location.isDefault,
        })),
      },
    }
  } catch (error) {
    const safeError = mapFoundationError(error)
    return { ok: false, error: safeError.code, status: safeError.status }
  }
}
export async function loadProductsBulkEditContextAction(input: unknown): Promise<ProductsBulkEditContextActionResult> {
  try {
    if (!input || typeof input !== 'object' || Array.isArray(input)) throw new Error('validation_failed')
    const values = input as Record<string, unknown>
    const organizationId = String(values.organizationId ?? '')
    const productIds = Array.isArray(values.productIds) ? values.productIds.map(String) : []
    if (!/^[0-9a-f-]{36}$/i.test(organizationId) || !productIds.length || productIds.length > 50 || productIds.some((id) => !/^[0-9a-f-]{36}$/i.test(id))) {
      throw new Error('validation_failed')
    }
    const repository = await createFoundationReadRepository()
    const details = await Promise.all(productIds.map((productId) => repository.getProductWorkspaceDetail({
      organizationId,
      productId,
      includeInventory: values.includeInventory === true,
      includeCost: values.includeCost === true,
    })))
    if (details.some((detail) => !detail || detail.skuListCapped)) throw new Error('foundation_command_failed')
    return { ok: true, data: { products: details.map((detail) => ({ id: detail!.id, name: detail!.name, skus: detail!.skus })) } }
  } catch (error) {
    const safeError = mapFoundationError(error)
    return { ok: false, error: safeError.code, status: safeError.status }
  }
}
export async function executeFoundationCommandAction(
  input: unknown,
): Promise<FoundationActionResult<FoundationCommandOutcome>> {
  let commandId: string | undefined
  try {
    const command = parseFoundationCommand(input)
    commandId = command.commandId
    const data = await executeFoundationServerCommand(command)
    return { ok: true, data, commandId }
  } catch (error) {
    const safeError = mapFoundationError(error, commandId)
    return {
      ok: false,
      error: safeError.code,
      status: safeError.status,
      commandId: safeError.commandId,
    }
  }
}

export async function executeProductImageCleanupAction(
  input: unknown,
): Promise<FoundationActionResult<FoundationCommandOutcome>> {
  let commandId: string | undefined
  try {
    const command = parseFoundationCommand(input)
    commandId = command.commandId
    if (command.kind !== 'entity'
      || (command.commandType !== 'product.image.fail'
        && command.commandType !== 'product.image.archive')) {
      throw new Error('invalid_product_image_cleanup_command')
    }
    const data = await executeProductImageCleanupCommand(command as Parameters<
      typeof executeProductImageCleanupCommand
    >[0])
    return { ok: true, data, commandId }
  } catch (error) {
    const safeError = mapFoundationError(error, commandId)
    return {
      ok: false,
      error: safeError.code,
      status: safeError.status,
      commandId: safeError.commandId,
    }
  }
}

export async function checkProductIdentifiersAction(
  input: unknown,
): Promise<ProductIdentifierCheckActionResult> {
  try {
    return { ok: true, data: await checkProductIdentifiers(input) }
  } catch (error) {
    const safeError = mapFoundationError(error)
    return { ok: false, error: safeError.code, status: safeError.status }
  }
}
export async function checkVariantProductIdentifiersAction(
  input: unknown,
): Promise<VariantProductIdentifierCheckActionResult> {
  try {
    return { ok: true, data: await checkVariantProductIdentifiers(input) }
  } catch (error) {
    const safeError = mapFoundationError(error)
    return { ok: false, error: safeError.code, status: safeError.status }
  }
}

export async function previewVariantSkuSequenceAction(
  input: unknown,
): Promise<VariantSkuSequencePreviewActionResult> {
  try {
    return { ok: true, data: await previewVariantSkuSequence(input) }
  } catch (error) {
    const safeError = mapFoundationError(error)
    return { ok: false, error: safeError.code, status: safeError.status }
  }
}

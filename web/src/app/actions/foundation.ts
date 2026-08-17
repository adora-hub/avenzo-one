'use server'

import { parseFoundationCommand } from '@/lib/foundation/contracts'
import type { FoundationActionResult, FoundationErrorCode } from '@/lib/foundation/errors'
import { mapFoundationError } from '@/lib/foundation/errors'
import type { FoundationCommandOutcome } from '@/lib/foundation/contracts'
import { executeFoundationServerCommand } from '@/lib/foundation/server-service'
import { executeProductImageCleanupCommand } from '@/lib/foundation/product-image-cleanup.server'
import { createFoundationReadRepository } from '@/lib/foundation/server-read'
import type { ProductWorkspaceSkuDetail } from '@/lib/foundation/repositories'
import {
  checkProductIdentifiers,
  checkVariantProductIdentifiers,
  type ProductIdentifierCheckResult,
  type VariantProductIdentifierCheckResult,
} from '@/lib/foundation/product-identifier-check.server'

export type ProductIdentifierCheckActionResult =
  | { ok: true; data: ProductIdentifierCheckResult }
  | { ok: false; error: FoundationErrorCode; status: number }

export type VariantProductIdentifierCheckActionResult =
  | { ok: true; data: VariantProductIdentifierCheckResult }
  | { ok: false; error: FoundationErrorCode; status: number }

export type ProductsBulkEditContextActionResult =
  | { ok: true; data: { products: Array<{ id: string; name: string; skus: ProductWorkspaceSkuDetail[] }> } }
  | { ok: false; error: FoundationErrorCode; status: number }

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

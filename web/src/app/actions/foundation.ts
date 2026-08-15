'use server'

import { parseFoundationCommand } from '@/lib/foundation/contracts'
import type { FoundationActionResult, FoundationErrorCode } from '@/lib/foundation/errors'
import { mapFoundationError } from '@/lib/foundation/errors'
import type { FoundationCommandOutcome } from '@/lib/foundation/contracts'
import { executeFoundationServerCommand } from '@/lib/foundation/server-service'
import { executeProductImageCleanupCommand } from '@/lib/foundation/product-image-cleanup.server'
import {
  checkProductIdentifiers,
  type ProductIdentifierCheckResult,
} from '@/lib/foundation/product-identifier-check.server'

export type ProductIdentifierCheckActionResult =
  | { ok: true; data: ProductIdentifierCheckResult }
  | { ok: false; error: FoundationErrorCode; status: number }

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

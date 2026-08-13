'use server'

import { parseFoundationCommand } from '@/lib/foundation/contracts'
import type { FoundationActionResult } from '@/lib/foundation/errors'
import { mapFoundationError } from '@/lib/foundation/errors'
import type { FoundationCommandOutcome } from '@/lib/foundation/contracts'
import { executeFoundationServerCommand } from '@/lib/foundation/server-service'

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


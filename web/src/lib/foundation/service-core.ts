import { createHash } from 'node:crypto'
import type { FoundationActor } from './authorization'
import { requireFoundationPermission } from './authorization'
import type { FoundationApplicationCommand, FoundationCommandOutcome } from './contracts'
import { FoundationError, mapFoundationError } from './errors'
import type { FoundationCommandRepository } from './repositories'

function canonicalJson(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(',')}]`
  if (value && typeof value === 'object') {
    const record = value as Record<string, unknown>
    return `{${Object.keys(record).sort().map((key) => `${JSON.stringify(key)}:${canonicalJson(record[key])}`).join(',')}}`
  }
  return JSON.stringify(value)
}

export function foundationRequestHash(command: FoundationApplicationCommand) {
  return createHash('sha256').update(canonicalJson(command)).digest('hex')
}

function requiredPermission(command: FoundationApplicationCommand) {
  if (command.kind === 'entity') {
    return command.commandType.startsWith('product.') || command.commandType.startsWith('sku.')
      ? 'product.manage'
      : 'warehouse.manage'
  }
  if (command.commandType === 'receive') return 'inventory.receive'
  if (command.commandType.startsWith('adjustment')) return 'inventory.adjust'
  return 'inventory.transfer'
}

export async function executeFoundationCommand({
  actor,
  command,
  repository,
  branchIds = [],
}: {
  actor: FoundationActor
  command: FoundationApplicationCommand
  repository: FoundationCommandRepository
  branchIds?: Array<string | null>
}): Promise<FoundationCommandOutcome> {
  if (actor.organizationId !== command.organizationId) {
    throw new FoundationError('tenant_access_denied', 403, command.commandId)
  }
  requireFoundationPermission(actor, requiredPermission(command), branchIds)

  try {
    return await repository.execute(
      command,
      actor.userId,
      foundationRequestHash(command),
    )
  } catch (error) {
    throw mapFoundationError(error, command.commandId)
  }
}


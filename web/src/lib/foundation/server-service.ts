import 'server-only'

import type { FoundationApplicationCommand, FoundationCommandOutcome } from './contracts'
import { executeFoundationCommand } from './service-core'
import { requireFoundationPermission } from './authorization'
import { getFoundationActor } from './server-context'
import { SupabaseFoundationCommandRepository } from './supabase-repository'
import { createAdminClient } from '@/lib/supabase/admin'
import { mapFoundationError } from './errors'
import {
  executeInitialStockWorkflow,
  type InitialStockWorkflowInput,
  type InitialStockWorkflowResult,
} from './initial-stock-workflow'
import {
  executeRapidInitialStockWorkflow,
  type RapidInitialStockInput,
  type RapidInitialStockResult,
} from './rapid-initial-stock-workflow'

export async function executeFoundationServerCommand(
  command: FoundationApplicationCommand,
): Promise<FoundationCommandOutcome> {
  const actor = await getFoundationActor(command.organizationId)
  const repository = new SupabaseFoundationCommandRepository(createAdminClient())
  const branchIds = await repository.resolveBranchIds(command)
  return executeFoundationCommand({ actor, command, repository, branchIds })
}

export async function executeInitialStockServerWorkflow(
  input: InitialStockWorkflowInput,
): Promise<InitialStockWorkflowResult> {
  const actor = await getFoundationActor(input.organizationId)
  requireFoundationPermission(actor, 'product.update')
  if (input.receive) {
    requireFoundationPermission(actor, 'inventory.receive', [input.receive.branchId])
  }

  const repository = new SupabaseFoundationCommandRepository(createAdminClient())
  return executeInitialStockWorkflow(input, {
    executeCommand: async (command) => {
      const branchIds = await repository.resolveBranchIds(command)
      return executeFoundationCommand({ actor, command, repository, branchIds })
    },
    receiveBatch: (request) => repository.receiveInitialStockBatch(request, actor.userId),
    normalizeError: (error) => mapFoundationError(error),
  })
}

export async function executeRapidInitialStockServerWorkflow(
  input: RapidInitialStockInput,
): Promise<RapidInitialStockResult> {
  const actor = await getFoundationActor(input.organizationId)
  requireFoundationPermission(actor, 'product.update')
  requireFoundationPermission(actor, 'inventory.receive', [input.branchId])
  const repository = new SupabaseFoundationCommandRepository(createAdminClient())
  return executeRapidInitialStockWorkflow(input, {
    activate: (workflow) => executeInitialStockWorkflow(workflow, {
      executeCommand: async (command) => {
        const branchIds = await repository.resolveBranchIds(command)
        return executeFoundationCommand({ actor, command, repository, branchIds })
      },
      receiveBatch: (request) => repository.receiveInitialStockBatch(request, actor.userId),
      normalizeError: (error) => mapFoundationError(error),
    }),
    receive: (request) => repository.receiveInitialStockBatch(request, actor.userId),
    newActivationWorkflowId: () => crypto.randomUUID(),
  })
}


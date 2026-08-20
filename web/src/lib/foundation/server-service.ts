import 'server-only'

import type { FoundationApplicationCommand, FoundationCommandOutcome } from './contracts'
import { executeFoundationCommand } from './service-core'
import { getFoundationActor } from './server-context'
import { SupabaseFoundationCommandRepository } from './supabase-repository'
import { createAdminClient } from '@/lib/supabase/admin'

export async function executeFoundationServerCommand(
  command: FoundationApplicationCommand,
): Promise<FoundationCommandOutcome> {
  const actor = await getFoundationActor(command.organizationId)
  const repository = new SupabaseFoundationCommandRepository(createAdminClient())
  const branchIds = await repository.resolveBranchIds(command)
  return executeFoundationCommand({ actor, command, repository, branchIds })
}


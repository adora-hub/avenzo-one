import 'server-only'

import { FoundationError } from './errors'
import type { FoundationActor } from './authorization'
import { createClient } from '@/lib/supabase/server'

type AccessRow = {
  organization_id: string
  membership_status: string
  scope: string
  branches: Array<{ id: string }> | null
  permissions: Array<{ code: string }> | null
}

export async function getFoundationActor(organizationId: string): Promise<FoundationActor> {
  const supabase = await createClient()
  const { data: { user }, error: userError } = await supabase.auth.getUser()
  if (userError || !user) throw new FoundationError('authentication_required', 401)

  const { data, error } = await supabase.rpc('current_user_organization_access', {
    p_organization_id: organizationId,
  })
  if (error) throw new FoundationError('tenant_access_denied', 403)

  const access = (Array.isArray(data) ? data[0] : null) as AccessRow | undefined
  if (!access || access.organization_id !== organizationId
    || access.membership_status !== 'active'
    || (access.scope !== 'organization' && access.scope !== 'branch')) {
    throw new FoundationError('tenant_access_denied', 403)
  }

  return {
    userId: user.id,
    email: user.email ?? null,
    organizationId,
    scope: access.scope,
    branchIds: (access.branches ?? []).map((branch) => branch.id),
    permissions: (access.permissions ?? []).map((permission) => permission.code),
  }
}


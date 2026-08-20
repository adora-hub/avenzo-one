import { FoundationError } from './errors'

export type FoundationActor = {
  userId: string
  email: string | null
  organizationId: string
  scope: 'organization' | 'branch'
  branchIds: string[]
  permissions: string[]
}

export function requireFoundationPermission(
  actor: FoundationActor,
  permission: string,
  requiredBranchIds: Array<string | null | undefined> = [],
) {
  if (!actor.permissions.includes(permission)) {
    throw new FoundationError('permission_denied', 403)
  }
  if (actor.scope === 'organization') return

  const assigned = new Set(actor.branchIds)
  const required = requiredBranchIds.filter((branchId): branchId is string => Boolean(branchId))
  if (required.some((branchId) => !assigned.has(branchId))) {
    throw new FoundationError('branch_scope_denied', 403)
  }
}


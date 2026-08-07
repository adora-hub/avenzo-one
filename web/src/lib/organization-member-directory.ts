import type {
  OrganizationBranchSummary,
  OrganizationRoleSummary,
} from '@/lib/organization-access'

export type OrganizationMemberDirectoryEntry = {
  membership_id: string
  user_id: string
  display_name: string
  email: string
  job_title: string
  membership_status: 'invited' | 'active' | 'suspended' | 'removed'
  scope: 'organization' | 'branch'
  roles: OrganizationRoleSummary[]
  branches: OrganizationBranchSummary[]
  created_at: string
  updated_at: string
}

export type MembershipEventType =
  | 'created'
  | 'profile_updated'
  | 'role_changed'
  | 'scope_changed'
  | 'suspended'
  | 'reactivated'
  | 'removed'

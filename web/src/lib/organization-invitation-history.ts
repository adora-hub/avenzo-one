export type InvitationStatus = 'pending' | 'accepted' | 'revoked' | 'expired'

export type OrganizationInvitationHistoryItem = {
  id: string
  email: string
  role_code: string
  branch_id: string | null
  branch_code: string | null
  branch_name: string | null
  stored_status: InvitationStatus
  status: InvitationStatus
  expires_at: string
  created_at: string
  accepted_at: string | null
}

export type OrganizationInvitationHistoryResult = {
  total_count: number
  items: OrganizationInvitationHistoryItem[]
}

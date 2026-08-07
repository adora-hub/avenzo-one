export type AuditCategory = 'organization' | 'branch' | 'member' | 'invitation' | 'subscription' | 'moderation' | 'security'

export type OrganizationAuditLogItem = {
  id: string
  category: AuditCategory
  action: string
  actor_user_id: string | null
  actor_email: string | null
  target_type: string
  target_id: string | null
  target_label: string | null
  summary: string
  metadata: Record<string, unknown>
  created_at: string
}

export type OrganizationAuditLogResult = {
  total_count: number
  items: OrganizationAuditLogItem[]
}

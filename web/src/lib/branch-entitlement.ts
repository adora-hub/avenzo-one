export type OrganizationBranchEntitlement = {
  organization_id: string
  subscription_id: string
  plan_code: string
  plan_name: string
  plan_version_id: string | null
  plan_version_label: string | null
  access_state: 'legacy' | 'active' | 'grace' | 'expired'
  is_configured: boolean
  branches_enabled: boolean
  max_count: number | null
  current_count: number
  can_create: boolean
  reason:
    | 'plan_version_not_assigned'
    | 'subscription_expired'
    | 'feature_branches_disabled'
    | 'feature_branches_limit_reached'
    | 'allowed'
}

export function branchEntitlementMessage(entitlement: OrganizationBranchEntitlement | null) {
  if (!entitlement || entitlement.reason === 'plan_version_not_assigned') {
    return 'ยังไม่ได้ผูก Plan Version — ขณะนี้ระบบใช้สิทธิ์เดิม และยังไม่บังคับโควตาสาขา'
  }
  if (entitlement.reason === 'subscription_expired') return 'Subscription หมดอายุแล้ว จึงไม่สามารถสร้างสาขาเพิ่มได้'
  if (entitlement.reason === 'feature_branches_disabled') return 'Plan Version นี้ไม่ได้เปิดสิทธิ์ใช้งานสาขา'
  if (entitlement.reason === 'feature_branches_limit_reached') return 'ใช้จำนวนสาขาครบตามสิทธิ์ของ Plan Version แล้ว'
  if (entitlement.max_count === null) return 'Plan Version นี้เปิดใช้งานสาขาโดยไม่จำกัดจำนวน'
  return `ใช้งาน ${entitlement.current_count} จาก ${entitlement.max_count} สาขา`
}

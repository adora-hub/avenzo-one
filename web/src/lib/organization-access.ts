export type OrganizationRoleSummary = {
  code: string
  name: string
  description: string
}

export type OrganizationBranchSummary = {
  id: string
  code: string
  name: string
}

export type OrganizationPermissionSummary = {
  code: string
  description: string
}

export type OrganizationAccessSummary = {
  organization_id: string
  membership_status: string
  scope: string
  roles: OrganizationRoleSummary[]
  branches: OrganizationBranchSummary[]
  permissions: OrganizationPermissionSummary[]
}

const roleDetails: Record<string, { label: string; description: string }> = {
  owner: { label: 'Owner (เจ้าขององค์กร)', description: 'ดูแลและจัดการ Organization ได้ทั้งหมด' },
  admin: { label: 'Admin (ผู้ดูแลระบบ)', description: 'จัดการข้อมูลองค์กร สาขา สมาชิก และ Role' },
  manager: { label: 'Manager (ผู้จัดการ)', description: 'ดูแลการปฏิบัติงานและสาขาที่ได้รับมอบหมาย' },
  staff: { label: 'Staff (พนักงาน)', description: 'ปฏิบัติงานประจำวันตามขอบเขตที่ได้รับมอบหมาย' },
  viewer: { label: 'Viewer (ผู้ดูข้อมูล)', description: 'ดูข้อมูลที่ได้รับอนุญาตโดยไม่มีสิทธิ์แก้ไข' },
}

const permissionLabels: Record<string, string> = {
  'organization.read': 'ดูข้อมูลองค์กร',
  'organization.update': 'แก้ไขข้อมูลองค์กร',
  'branch.read': 'ดูข้อมูลสาขาตามขอบเขต',
  'branch.create': 'สร้างสาขา',
  'branch.update': 'แก้ไขข้อมูลสาขา',
  'member.read': 'ดูรายชื่อสมาชิก',
  'member.invite': 'เชิญสมาชิก',
  'member.update': 'จัดการสถานะและขอบเขตสมาชิก',
  'role.read': 'ดู Role และ Permission',
  'role.manage': 'จัดการ Role และ Permission',
}

export function getRoleLabel(role: OrganizationRoleSummary) {
  return roleDetails[role.code]?.label ?? role.name
}

export function getRoleDescription(role: OrganizationRoleSummary) {
  return roleDetails[role.code]?.description ?? role.description
}

export function getPermissionLabel(permission: OrganizationPermissionSummary) {
  return permissionLabels[permission.code] ?? permission.description ?? permission.code
}

export function getScopeLabel(access: OrganizationAccessSummary) {
  if (access.scope === 'organization') return 'ทั้ง Organization'
  if (access.branches.length > 0) {
    return `เฉพาะสาขา ${access.branches.map((branch) => `${branch.code} · ${branch.name}`).join(', ')}`
  }
  return 'เฉพาะสาขาที่ได้รับมอบหมาย'
}

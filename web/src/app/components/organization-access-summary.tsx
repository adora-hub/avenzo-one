import {
  getPermissionLabel,
  getRoleDescription,
  getRoleLabel,
  getScopeLabel,
  type OrganizationAccessSummary,
} from '@/lib/organization-access'

type Props = {
  access: OrganizationAccessSummary
  compact?: boolean
}

export function OrganizationAccessSummaryCard({ access, compact = false }: Props) {
  if (compact) {
    return (
      <div className="access-summary compact">
        <div className="access-row">
          <span>ตำแหน่ง</span>
          <strong>{access.roles.map(getRoleLabel).join(', ') || 'ยังไม่ได้กำหนด Role'}</strong>
        </div>
        <div className="access-row">
          <span>ขอบเขต</span>
          <strong>{getScopeLabel(access)}</strong>
        </div>
        <div className="access-row">
          <span>สถานะสมาชิก</span>
          <strong>{access.membership_status === 'active' ? 'ใช้งานได้' : access.membership_status}</strong>
        </div>
      </div>
    )
  }

  return (
    <article className="card access-card">
      <h2>ตำแหน่งและหน้าที่ของคุณ</h2>
      <div className="role-list">
        {access.roles.length > 0
          ? access.roles.map((role) => (
              <div className="role-item" key={role.code}>
                <strong>{getRoleLabel(role)}</strong>
                <span>{getRoleDescription(role)}</span>
              </div>
            ))
          : <div className="empty">ยังไม่ได้กำหนด Role</div>}
      </div>
      <div className="access-scope">
        <span>ขอบเขตการทำงาน</span>
        <strong>{getScopeLabel(access)}</strong>
      </div>
      <h3>สิ่งที่คุณทำได้</h3>
      {access.permissions.length > 0
        ? <ul className="permission-list">{access.permissions.map((permission) => <li key={permission.code}>{getPermissionLabel(permission)}</li>)}</ul>
        : <div className="empty">ยังไม่มี Permission ที่ได้รับมอบหมาย</div>}
    </article>
  )
}

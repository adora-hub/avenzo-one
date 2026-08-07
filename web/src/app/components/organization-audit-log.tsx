import Link from 'next/link'
import type { AuditCategory, OrganizationAuditLogItem } from '@/lib/organization-audit-log'

type FilterCategory = 'all' | AuditCategory

type Props = {
  organizationId: string
  items: OrganizationAuditLogItem[]
  totalCount: number
  page: number
  pageSize: number
  search: string
  category: FilterCategory
  timezone: string
}

const categoryLabels: Record<AuditCategory, string> = {
  organization: 'องค์กร',
  branch: 'สาขา',
  member: 'สมาชิก',
  invitation: 'คำเชิญ',
  subscription: 'Subscription',
  moderation: 'การระงับ/ตรวจสอบ',
  security: 'ความปลอดภัย',
}

const actionLabels: Record<string, string> = {
  'organization.created': 'สร้าง Organization',
  'organization.updated': 'แก้ไข Organization',
  'branch.created': 'สร้าง Branch',
  'branch.updated': 'แก้ไข Branch',
  'member.created': 'เพิ่มสมาชิก',
  'member.profile_updated': 'แก้ไขข้อมูลสมาชิก',
  'member.access_updated': 'แก้ไขสิทธิ์สมาชิก',
  'member.updated': 'แก้ไขสมาชิก',
  'member.suspended': 'พักสิทธิ์สมาชิก',
  'member.reactivated': 'เปิดสิทธิ์สมาชิก',
  'member.removed': 'ยกเลิกสมาชิก',
  'member.role_changed': 'เปลี่ยน Role สมาชิก',
  'member.scope_changed': 'เปลี่ยนขอบเขตสมาชิก',
  'invitation.created': 'สร้างคำเชิญ',
  'invitation.accepted': 'ตอบรับคำเชิญ',
  'invitation.revoked': 'ยกเลิกคำเชิญ',
  'invitation.expired': 'คำเชิญหมดอายุ',
  'subscription.provision': 'เปิด Subscription',
  'subscription.renew': 'ต่ออายุ Subscription',
  'subscription.adjust': 'ปรับ Subscription',
  'subscription.cancel': 'ยกเลิก Subscription',
  'moderation.suspend': 'พักการใช้งาน',
  'moderation.reinstate': 'เปิดใช้งานอีกครั้ง',
  'moderation.ban': 'แบนการใช้งาน',
}

function pageSequence(currentPage: number, totalPages: number) {
  const visible = new Set([1, totalPages, currentPage - 1, currentPage, currentPage + 1])
  const pages = [...visible].filter((item) => item >= 1 && item <= totalPages).sort((a, b) => a - b)
  const sequence: Array<number | 'ellipsis'> = []
  for (const item of pages) {
    const previous = sequence.at(-1)
    if (typeof previous === 'number' && item - previous > 1) sequence.push('ellipsis')
    sequence.push(item)
  }
  return sequence
}

function auditHref(organizationId: string, page: number, search: string, category: FilterCategory) {
  const params = new URLSearchParams()
  if (page > 1) params.set('auditPage', String(page))
  if (search) params.set('auditSearch', search)
  if (category !== 'all') params.set('auditCategory', category)
  const query = params.toString()
  return `/organizations/${organizationId}${query ? `?${query}` : ''}#audit-log`
}

export function OrganizationAuditLog({ organizationId, items, totalCount, page, pageSize, search, category, timezone }: Props) {
  const totalPages = Math.max(1, Math.ceil(totalCount / pageSize))
  const firstRow = totalCount === 0 ? 0 : (page - 1) * pageSize + 1
  const lastRow = Math.min(page * pageSize, totalCount)
  const dateFormatter = new Intl.DateTimeFormat('th-TH', { dateStyle: 'medium', timeStyle: 'medium', timeZone: timezone })

  return (
    <div id="audit-log">
      <form className="invitation-filters" method="get" action={`/organizations/${organizationId}`}>
        <label>
          ค้นหากิจกรรม ผู้ดำเนินการ หรือเป้าหมาย
          <input name="auditSearch" type="search" defaultValue={search} maxLength={160} placeholder="เช่น อีเมลสมาชิก" />
        </label>
        <label>
          หมวดหมู่
          <select name="auditCategory" defaultValue={category}>
            <option value="all">ทั้งหมด</option>
            {Object.entries(categoryLabels).map(([value, label]) => <option value={value} key={value}>{label}</option>)}
          </select>
        </label>
        <div className="invitation-filter-actions">
          <button className="button" type="submit">ค้นหา</button>
          <Link className="button secondary" href={`/organizations/${organizationId}#audit-log`}>ล้างตัวกรอง</Link>
        </div>
      </form>

      <div className="invitation-summary" aria-live="polite">
        {totalCount > 0 ? `แสดง ${firstRow}–${lastRow} จาก ${totalCount} กิจกรรม` : 'ไม่พบกิจกรรมตามเงื่อนไข'}
      </div>

      {items.length ? (
        <div className="audit-list">
          {items.map((item) => (
            <article className="audit-entry" key={item.id}>
              <div>
                <span className={`audit-category ${item.category}`}>{categoryLabels[item.category]}</span>
                <strong>{actionLabels[item.action] ?? item.action}</strong>
                <p>{item.target_label || item.summary}</p>
              </div>
              <div className="audit-entry-meta">
                <span>{item.actor_email ?? 'ระบบอัตโนมัติ'}</span>
                <time dateTime={item.created_at}>{dateFormatter.format(new Date(item.created_at))}</time>
              </div>
            </article>
          ))}
        </div>
      ) : <div className="empty">ยังไม่มีประวัติกิจกรรมในหน้านี้</div>}

      {totalPages > 1 ? (
        <nav className="pagination" aria-label="หน้าประวัติกิจกรรม">
          {page === 1
            ? <span className="pagination-link disabled" aria-disabled="true">ก่อนหน้า</span>
            : <Link className="pagination-link" href={auditHref(organizationId, page - 1, search, category)}>ก่อนหน้า</Link>}
          {pageSequence(page, totalPages).map((item, index) => item === 'ellipsis'
            ? <span className="pagination-ellipsis" key={`audit-ellipsis-${index}`}>…</span>
            : <Link className={`pagination-link ${item === page ? 'current' : ''}`} aria-current={item === page ? 'page' : undefined} key={item} href={auditHref(organizationId, item, search, category)}>{item}</Link>)}
          {page === totalPages
            ? <span className="pagination-link disabled" aria-disabled="true">ถัดไป</span>
            : <Link className="pagination-link" href={auditHref(organizationId, page + 1, search, category)}>ถัดไป</Link>}
          <form className="pagination-jump" method="get" action={`/organizations/${organizationId}`}>
            {search ? <input type="hidden" name="auditSearch" value={search} /> : null}
            {category !== 'all' ? <input type="hidden" name="auditCategory" value={category} /> : null}
            <label>ไปหน้าที่ <input type="number" name="auditPage" min="1" max={totalPages} defaultValue={page} /></label>
            <button className="button secondary compact-button" type="submit">ไป</button>
          </form>
        </nav>
      ) : null}
    </div>
  )
}

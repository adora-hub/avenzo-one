import Link from 'next/link'
import { CancelInvitationButton } from './cancel-invitation-button'
import { CopyInvitationLinkButton, ReuseInvitationButton } from './invitation-actions'
import type { InvitationStatus, OrganizationInvitationHistoryItem } from '@/lib/organization-invitation-history'

type FilterStatus = 'all' | InvitationStatus

type Props = {
  organizationId: string
  invitations: OrganizationInvitationHistoryItem[]
  totalCount: number
  page: number
  pageSize: number
  search: string
  status: FilterStatus
  timezone: string
  canInviteMembers: boolean
}

const statusLabels: Record<InvitationStatus, string> = {
  pending: 'รอตอบรับ',
  accepted: 'ตอบรับแล้ว',
  revoked: 'ยกเลิกแล้ว',
  expired: 'หมดอายุ',
}

function pageSequence(currentPage: number, totalPages: number) {
  const visible = new Set([1, totalPages, currentPage - 1, currentPage, currentPage + 1])
  const pages = [...visible].filter((page) => page >= 1 && page <= totalPages).sort((a, b) => a - b)
  const sequence: Array<number | 'ellipsis'> = []
  for (const page of pages) {
    if (sequence.length && typeof sequence.at(-1) === 'number' && page - Number(sequence.at(-1)) > 1) sequence.push('ellipsis')
    sequence.push(page)
  }
  return sequence
}

function invitationHref(organizationId: string, page: number, search: string, status: FilterStatus) {
  const params = new URLSearchParams()
  if (page > 1) params.set('invitePage', String(page))
  if (search) params.set('inviteSearch', search)
  if (status !== 'all') params.set('inviteStatus', status)
  const query = params.toString()
  return `/organizations/${organizationId}${query ? `?${query}` : ''}#invitation-history`
}

export function InvitationHistory({
  organizationId,
  invitations,
  totalCount,
  page,
  pageSize,
  search,
  status,
  timezone,
  canInviteMembers,
}: Props) {
  const totalPages = Math.max(1, Math.ceil(totalCount / pageSize))
  const firstRow = totalCount === 0 ? 0 : (page - 1) * pageSize + 1
  const lastRow = Math.min(page * pageSize, totalCount)
  const dateFormatter = new Intl.DateTimeFormat('th-TH', {
    dateStyle: 'medium',
    timeStyle: 'short',
    timeZone: timezone,
  })

  return (
    <div id="invitation-history">
      <form className="invitation-filters" method="get" action={`/organizations/${organizationId}`}>
        <label>
          ค้นหาอีเมล
          <input name="inviteSearch" type="search" defaultValue={search} maxLength={160} placeholder="เช่น staff@example.com" />
        </label>
        <label>
          สถานะ
          <select name="inviteStatus" defaultValue={status}>
            <option value="all">ทั้งหมด</option>
            <option value="pending">รอตอบรับ</option>
            <option value="accepted">ตอบรับแล้ว</option>
            <option value="revoked">ยกเลิกแล้ว</option>
            <option value="expired">หมดอายุ</option>
          </select>
        </label>
        <div className="invitation-filter-actions">
          <button className="button" type="submit">ค้นหา</button>
          <Link className="button secondary" href={`/organizations/${organizationId}#invitation-history`}>ล้างตัวกรอง</Link>
        </div>
      </form>

      <div className="invitation-summary" aria-live="polite">
        {totalCount > 0 ? `แสดง ${firstRow}–${lastRow} จาก ${totalCount} คำเชิญ` : 'ไม่พบคำเชิญตามเงื่อนไข'}
      </div>

      {invitations.length ? (
        <div className="invitation-table-wrap">
          <table className="invitation-table">
            <thead>
              <tr>
                <th>ผู้รับคำเชิญ</th>
                <th>Role / ขอบเขต</th>
                <th>สถานะ</th>
                <th>วันที่สร้าง</th>
                <th>การทำงาน</th>
              </tr>
            </thead>
            <tbody>
              {invitations.map((invitation) => (
                <tr key={invitation.id}>
                  <td><strong>{invitation.email}</strong></td>
                  <td>
                    <strong>{invitation.role_code}</strong>
                    <span>{invitation.branch_id ? `${invitation.branch_code ?? ''} · ${invitation.branch_name ?? 'สาขา'}` : 'ทั้ง Organization'}</span>
                  </td>
                  <td>
                    <span className={`status ${invitation.status}`}>{statusLabels[invitation.status]}</span>
                    {invitation.status === 'pending' ? <small>หมดอายุ {dateFormatter.format(new Date(invitation.expires_at))}</small> : null}
                    {invitation.status === 'expired' ? <small>หมดอายุเมื่อ {dateFormatter.format(new Date(invitation.expires_at))}</small> : null}
                    {invitation.status === 'accepted' && invitation.accepted_at ? <small>ตอบรับเมื่อ {dateFormatter.format(new Date(invitation.accepted_at))}</small> : null}
                  </td>
                  <td>{dateFormatter.format(new Date(invitation.created_at))}</td>
                  <td>
                    <div className="invitation-actions">
                      {invitation.status === 'pending' && canInviteMembers ? (
                        <>
                          <CopyInvitationLinkButton invitationId={invitation.id} />
                          <CancelInvitationButton invitationId={invitation.id} compact />
                        </>
                      ) : null}
                      {(invitation.status === 'revoked' || invitation.status === 'expired') && canInviteMembers ? (
                        <ReuseInvitationButton detail={{ email: invitation.email, roleCode: invitation.role_code, branchId: invitation.branch_id }} />
                      ) : null}
                      {invitation.status === 'accepted' ? <span className="meta">เสร็จสิ้น</span> : null}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : <div className="empty">ยังไม่มีรายการในหน้านี้</div>}

      {totalPages > 1 ? (
        <nav className="pagination" aria-label="หน้าประวัติคำเชิญ">
          {page === 1
            ? <span className="pagination-link disabled" aria-disabled="true">ก่อนหน้า</span>
            : <Link className="pagination-link" href={invitationHref(organizationId, page - 1, search, status)}>ก่อนหน้า</Link>}
          {pageSequence(page, totalPages).map((item, index) => item === 'ellipsis'
            ? <span className="pagination-ellipsis" key={`ellipsis-${index}`}>…</span>
            : <Link className={`pagination-link ${item === page ? 'current' : ''}`} aria-current={item === page ? 'page' : undefined} key={item} href={invitationHref(organizationId, item, search, status)}>{item}</Link>)}
          {page === totalPages
            ? <span className="pagination-link disabled" aria-disabled="true">ถัดไป</span>
            : <Link className="pagination-link" href={invitationHref(organizationId, page + 1, search, status)}>ถัดไป</Link>}
          <form className="pagination-jump" method="get" action={`/organizations/${organizationId}`}>
            {search ? <input type="hidden" name="inviteSearch" value={search} /> : null}
            {status !== 'all' ? <input type="hidden" name="inviteStatus" value={status} /> : null}
            <label>ไปหน้าที่ <input type="number" name="invitePage" min="1" max={totalPages} defaultValue={page} /></label>
            <button className="button secondary compact-button" type="submit">ไป</button>
          </form>
        </nav>
      ) : null}
    </div>
  )
}

'use client'

import { FormEvent, useState } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/browser'
import type { OrganizationMemberDirectoryEntry } from '@/lib/organization-member-directory'

type Role = { code: string; name: string }
type Branch = { id: string; code: string; name: string }
type MemberStatus = OrganizationMemberDirectoryEntry['membership_status']

type Props = {
  members: OrganizationMemberDirectoryEntry[]
  roles: Role[]
  branches: Branch[]
  canUpdateMembers: boolean
  canManageRoles: boolean
  canManageOwners: boolean
}

const statusLabels: Record<MemberStatus, string> = {
  invited: 'รอตอบรับ',
  active: 'ใช้งานได้',
  suspended: 'พักสิทธิ์',
  removed: 'ยกเลิกแล้ว',
}

const errorLabels: Record<string, string> = {
  authentication_required: 'กรุณาเข้าสู่ระบบใหม่',
  organization_member_not_found: 'ไม่พบสมาชิกที่ต้องการจัดการ',
  organization_role_not_found: 'ไม่พบ Role ที่เลือก',
  organization_branch_not_found: 'ไม่พบสาขาที่เลือกหรือสาขาไม่ได้เปิดใช้งาน',
  owner_requires_organization_scope: 'Owner ต้องมีขอบเขตทั้ง Organization',
  member_update_permission_required: 'บัญชีนี้ไม่มีสิทธิ์จัดการสมาชิก',
  member_access_management_permission_required: 'บัญชีนี้ไม่มีสิทธิ์เปลี่ยน Role หรือ Branch Scope',
  owner_management_requires_owner: 'เฉพาะ Owner เท่านั้นที่จัดการสมาชิกที่เป็น Owner ได้',
  last_active_owner_required: 'ไม่สามารถดำเนินการได้ เพราะ Organization ต้องมี Owner ที่ใช้งานได้อย่างน้อย 1 คน',
  removed_member_cannot_be_updated: 'สมาชิกที่ยกเลิกแล้วไม่สามารถแก้ไขได้ กรุณาส่งคำเชิญใหม่',
  removed_membership_is_final: 'สมาชิกที่ยกเลิกแล้วไม่สามารถเปิดคืนจากหน้านี้ได้ กรุณาส่งคำเชิญใหม่',
  membership_status_reason_required: 'กรุณาระบุเหตุผลก่อนเปลี่ยนสถานะสมาชิก',
  invalid_membership_status_transition: 'ไม่สามารถเปลี่ยนสถานะสมาชิกตามลำดับนี้ได้',
}

function getErrorMessage(message: string) {
  const key = Object.keys(errorLabels).find((candidate) => message.includes(candidate))
  return key ? errorLabels[key] : message
}

function getMemberName(member: OrganizationMemberDirectoryEntry) {
  return member.display_name || 'ยังไม่ระบุชื่อเล่น'
}

function getRoleText(member: OrganizationMemberDirectoryEntry) {
  return member.roles.map((role) => role.name || role.code).join(', ') || 'ยังไม่กำหนด Role'
}

function getScopeText(member: OrganizationMemberDirectoryEntry) {
  if (member.scope === 'organization') return 'ทั้ง Organization'
  return member.branches.map((branch) => `${branch.code} · ${branch.name}`).join(', ') || 'ยังไม่กำหนดสาขา'
}

export function MemberManagement({
  members,
  roles,
  branches,
  canUpdateMembers,
  canManageRoles,
  canManageOwners,
}: Props) {
  const router = useRouter()
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [displayName, setDisplayName] = useState('')
  const [jobTitle, setJobTitle] = useState('')
  const [roleCode, setRoleCode] = useState('')
  const [branchId, setBranchId] = useState('')
  const [reason, setReason] = useState('')
  const [message, setMessage] = useState('')
  const [loading, setLoading] = useState(false)

  const selectedMember = members.find((member) => member.membership_id === selectedId) ?? null
  const selectedMemberIsOwner = selectedMember?.roles.some((role) => role.code === 'owner') ?? false
  const availableRoles = roles.filter((role) => role.code !== 'owner' || canManageOwners || selectedMemberIsOwner)

  function openEditor(member: OrganizationMemberDirectoryEntry) {
    setSelectedId(member.membership_id)
    setDisplayName(member.display_name)
    setJobTitle(member.job_title)
    setRoleCode(member.roles[0]?.code ?? roles[0]?.code ?? '')
    setBranchId(member.scope === 'branch' ? member.branches[0]?.id ?? '' : '')
    setReason('')
    setMessage('')
  }

  function closeEditor() {
    setSelectedId(null)
    setReason('')
    setMessage('')
  }

  async function saveMember(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!selectedMember) return
    setLoading(true)
    setMessage('')
    try {
      const { error } = await createClient().rpc('update_organization_member', {
        p_membership_id: selectedMember.membership_id,
        p_display_name: displayName,
        p_job_title: jobTitle,
        p_role_code: roleCode,
        p_branch_id: branchId || null,
      })
      if (error) throw error
      closeEditor()
      router.refresh()
    } catch (error) {
      setMessage(getErrorMessage(error instanceof Error ? error.message : 'ไม่สามารถบันทึกข้อมูลสมาชิกได้'))
    } finally {
      setLoading(false)
    }
  }

  async function changeStatus(newStatus: 'active' | 'suspended' | 'removed') {
    if (!selectedMember) return
    if (!reason.trim()) {
      setMessage(errorLabels.membership_status_reason_required)
      return
    }
    if (newStatus === 'removed' && !window.confirm(`ยืนยันยกเลิกสมาชิก ${selectedMember.email} ออกจาก Organization ใช่หรือไม่`)) return

    setLoading(true)
    setMessage('')
    try {
      const { error } = await createClient().rpc('change_organization_member_status', {
        p_membership_id: selectedMember.membership_id,
        p_new_status: newStatus,
        p_reason: reason,
      })
      if (error) throw error
      closeEditor()
      router.refresh()
    } catch (error) {
      setMessage(getErrorMessage(error instanceof Error ? error.message : 'ไม่สามารถเปลี่ยนสถานะสมาชิกได้'))
    } finally {
      setLoading(false)
    }
  }

  if (members.length === 0) return <div className="empty">ยังไม่มีสมาชิก</div>

  return (
    <>
      <div className="member-table-wrap">
        <table className="member-table">
          <thead>
            <tr>
              <th>สมาชิก</th>
              <th>ตำแหน่งงาน</th>
              <th>Role</th>
              <th>ขอบเขต</th>
              <th>สถานะ</th>
              {canUpdateMembers ? <th>จัดการ</th> : null}
            </tr>
          </thead>
          <tbody>
            {members.map((member) => (
              <tr key={member.membership_id}>
                <td><strong>{getMemberName(member)}</strong><span>{member.email}</span></td>
                <td>{member.job_title || 'ยังไม่ระบุตำแหน่ง'}</td>
                <td>{getRoleText(member)}</td>
                <td>{getScopeText(member)}</td>
                <td><span className={`status ${member.membership_status}`}>{statusLabels[member.membership_status]}</span></td>
                {canUpdateMembers ? (
                  <td>
                    {member.membership_status === 'removed'
                      ? <span className="meta">เชิญใหม่เพื่อเพิ่มกลับ</span>
                      : member.roles.some((role) => role.code === 'owner') && !canManageOwners
                        ? <span className="meta">Owner เท่านั้น</span>
                        : <button className="button secondary compact-button" type="button" onClick={() => openEditor(member)}>จัดการ</button>}
                  </td>
                ) : null}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {selectedMember ? (
        <section className="member-editor" aria-label={`จัดการสมาชิก ${selectedMember.email}`}>
          <div className="member-editor-header">
            <div><h3>จัดการสมาชิก</h3><p>{selectedMember.email}</p></div>
            <button className="button secondary compact-button" type="button" onClick={closeEditor} disabled={loading}>ปิด</button>
          </div>

          <form className="form" onSubmit={saveMember}>
            <div className="member-form-grid">
              <label>ชื่อแสดง/ชื่อเล่น<input value={displayName} maxLength={120} onChange={(event) => setDisplayName(event.target.value)} placeholder="เช่น ต้น" /></label>
              <label>ตำแหน่งงาน<input value={jobTitle} maxLength={160} onChange={(event) => setJobTitle(event.target.value)} placeholder="เช่น พนักงานขาย" /></label>
              <label>Role<select value={roleCode} disabled={!canManageRoles} onChange={(event) => { const value = event.target.value; setRoleCode(value); if (value === 'owner') setBranchId('') }}>{availableRoles.map((role) => <option key={role.code} value={role.code}>{role.name} ({role.code})</option>)}</select></label>
              <label>Branch Scope<select value={branchId} disabled={!canManageRoles || roleCode === 'owner'} onChange={(event) => setBranchId(event.target.value)}><option value="">ทั้ง Organization</option>{branches.map((branch) => <option key={branch.id} value={branch.id}>{branch.code} · {branch.name}</option>)}</select></label>
            </div>
            <button className="button" disabled={loading || !roleCode}>{loading ? 'กำลังบันทึก…' : 'บันทึกข้อมูลสมาชิก'}</button>
          </form>

          <div className="member-status-actions">
            <h3>สถานะสมาชิก</h3>
            <label>เหตุผล<textarea value={reason} maxLength={1000} onChange={(event) => setReason(event.target.value)} placeholder="ระบุเหตุผลเพื่อเก็บในประวัติการจัดการ" /></label>
            <div className="member-action-buttons">
              {selectedMember.membership_status === 'active' ? <button className="button secondary" type="button" disabled={loading} onClick={() => changeStatus('suspended')}>พักสิทธิ์ชั่วคราว</button> : null}
              {selectedMember.membership_status === 'suspended' ? <button className="button secondary" type="button" disabled={loading} onClick={() => changeStatus('active')}>เปิดสิทธิ์กลับมา</button> : null}
              {selectedMember.membership_status === 'active' || selectedMember.membership_status === 'suspended' ? <button className="button danger" type="button" disabled={loading} onClick={() => changeStatus('removed')}>ยกเลิกสมาชิก</button> : null}
            </div>
          </div>

          {message ? <div className="error" role="alert" aria-live="polite">{message}</div> : null}
        </section>
      ) : null}
    </>
  )
}

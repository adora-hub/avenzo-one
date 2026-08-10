'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import type { FormEvent } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/browser'

export type PlatformAdminDirectoryEntry = {
  user_id: string
  email: string
  display_name: string | null
  role_code: 'super_admin' | 'platform_admin'
  status: 'active' | 'suspended'
  note: string
  verified_mfa_factors: number
  last_sign_in_at: string | null
  created_at: string
  updated_at: string
  is_current_user: boolean
}

type PendingAction = {
  action: 'grant' | 'update' | 'suspend' | 'reactivate' | 'profile'
  email: string
  displayName: string
  roleCode: PlatformAdminDirectoryEntry['role_code']
  reason: string
}

const roleLabels = {
  super_admin: {
    label: 'Super Admin',
    description: 'ใช้งาน Control Plane ทั้งหมด และเพิ่มหรือพักสิทธิ์ผู้ดูแลคนอื่นได้',
  },
  platform_admin: {
    label: 'Platform Admin',
    description: 'ใช้งาน Control Plane และเป็นผู้อนุมัติคนที่ 2 ได้ แต่จัดการสิทธิ์ผู้ดูแลไม่ได้',
  },
} as const

function dateTime(value: string | null) {
  if (!value) return 'ยังไม่เคยเข้าสู่ระบบ'
  return new Intl.DateTimeFormat('th-TH', {
    dateStyle: 'medium',
    timeStyle: 'short',
    timeZone: 'Asia/Bangkok',
  }).format(new Date(value))
}

function errorMessage(error: unknown) {
  const message = error instanceof Error
    ? error.message
    : typeof error === 'object' && error && 'message' in error && typeof error.message === 'string'
      ? error.message
      : 'ไม่สามารถจัดการสิทธิ์ Platform Admin ได้'

  if (message.includes('platform_super_admin_aal2_required')) return 'ต้องเป็น Super Admin และยืนยัน MFA ก่อนดำเนินการ'
  if (message.includes('platform_admin_confirmed_user_not_found')) return 'ไม่พบบัญชีที่ยืนยันอีเมลแล้ว กรุณาให้ผู้ใช้สร้างบัญชีและยืนยันอีเมลก่อน'
  if (message.includes('platform_admin_cannot_change_own_access')) return 'ไม่สามารถเปลี่ยนหรือลดสิทธิ์บัญชีของตัวเองได้'
  if (message.includes('platform_admin_last_super_admin_protected')) return 'ไม่สามารถพักหรือลดสิทธิ์ Super Admin คนสุดท้ายได้'
  if (message.includes('platform_admin_already_active')) return 'อีเมลนี้เป็น Platform Admin ที่ใช้งานอยู่แล้ว'
  if (message.includes('platform_admin_not_suspended')) return 'บัญชีนี้ไม่ได้อยู่ในสถานะพักสิทธิ์'
  if (message.includes('platform_admin_reason_invalid')) return 'กรุณาระบุเหตุผลอย่างน้อย 10 ตัวอักษร'
  if (message.includes('platform_admin_display_name_invalid')) return 'กรุณาระบุชื่อที่แสดง 2–100 ตัวอักษร'
  return message
}

export function PlatformAdminAccessManager({
  initialAdmins,
  canManage,
}: {
  initialAdmins: PlatformAdminDirectoryEntry[]
  canManage: boolean
}) {
  const router = useRouter()
  const [email, setEmail] = useState('')
  const [displayName, setDisplayName] = useState('')
  const [roleCode, setRoleCode] = useState<PlatformAdminDirectoryEntry['role_code']>('platform_admin')
  const [reason, setReason] = useState('')
  const [pending, setPending] = useState<PendingAction | null>(null)
  const [loading, setLoading] = useState(false)
  const [message, setMessage] = useState('')
  const [tone, setTone] = useState<'success' | 'error'>('success')
  const [editingProfile, setEditingProfile] = useState(false)
  const [profileDisplayName, setProfileDisplayName] = useState('')
  const [profileReason, setProfileReason] = useState('')
  const confirmationRef = useRef<HTMLElement>(null)

  useEffect(() => {
    if (!pending) return

    confirmationRef.current?.scrollIntoView({
      behavior: 'smooth',
      block: 'start',
    })
    confirmationRef.current?.focus({ preventScroll: true })
  }, [pending])

  const activeCount = useMemo(() => initialAdmins.filter((admin) => admin.status === 'active').length, [initialAdmins])

  function prepareGrant(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setMessage('')
    setPending({ action: 'grant', email: email.trim().toLowerCase(), displayName: displayName.trim(), roleCode, reason: reason.trim() })
  }

  function prepareExisting(admin: PlatformAdminDirectoryEntry, action: PendingAction['action']) {
    setMessage('')
    setPending({
      action,
      email: admin.email,
      displayName: admin.display_name ?? '',
      roleCode: action === 'update'
        ? admin.role_code === 'super_admin' ? 'platform_admin' : 'super_admin'
        : admin.role_code,
      reason: '',
    })
  }

  function startProfileEdit(admin: PlatformAdminDirectoryEntry) {
    setMessage('')
    setPending(null)
    setProfileDisplayName(admin.display_name ?? '')
    setProfileReason('')
    setEditingProfile(true)
  }

  function prepareOwnProfile(event: FormEvent<HTMLFormElement>, admin: PlatformAdminDirectoryEntry) {
    event.preventDefault()
    setMessage('')
    setPending({
      action: 'profile',
      email: admin.email,
      displayName: profileDisplayName.trim(),
      roleCode: admin.role_code,
      reason: profileReason.trim(),
    })
  }

  async function confirm() {
    if (!pending) return
    if (pending.reason.trim().length < 10) {
      setTone('error')
      setMessage('กรุณาระบุเหตุผลอย่างน้อย 10 ตัวอักษร')
      return
    }

    setLoading(true)
    setMessage('')
    try {
      const supabase = createClient()
      const commandId = crypto.randomUUID()
      const { error } = pending.action === 'profile'
        ? await supabase.rpc('platform_update_own_admin_profile', {
          p_command_id: commandId,
          p_display_name: pending.displayName,
          p_reason: pending.reason,
        })
        : await supabase.rpc('platform_manage_admin_access', {
          p_command_id: commandId,
          p_email: pending.email,
          p_display_name: pending.displayName,
          p_role_code: pending.roleCode,
          p_action: pending.action,
          p_reason: pending.reason,
        })
      if (error) throw error

      setPending(null)
      setEmail('')
      setDisplayName('')
      setRoleCode('platform_admin')
      setReason('')
      setEditingProfile(false)
      setProfileDisplayName('')
      setProfileReason('')
      setTone('success')
      setMessage(pending.action === 'profile'
        ? 'บันทึกชื่อของคุณและ Audit Log สำเร็จ'
        : 'บันทึกสิทธิ์ Platform Admin และ Audit Log สำเร็จ')
      router.refresh()
    } catch (error) {
      setTone('error')
      setMessage(errorMessage(error))
    } finally {
      setLoading(false)
    }
  }

  const confirmationTitle = pending?.action === 'grant'
    ? 'ยืนยันเพิ่ม Platform Admin'
    : pending?.action === 'suspend'
      ? 'ยืนยันพักสิทธิ์ชั่วคราว'
      : pending?.action === 'reactivate'
        ? 'ยืนยันเปิดสิทธิ์กลับ'
        : pending?.action === 'profile'
          ? 'ยืนยันแก้ไขชื่อของฉัน'
        : 'ยืนยันเปลี่ยนระดับสิทธิ์'

  return <div className="platform-access-shell">
    <div className="platform-access-layout">
      <section className="card platform-access-create-card">
      <div><div className="eyebrow">Access setup</div><h2>เพิ่มผู้ดูแลระบบ</h2><p>ผู้รับสิทธิ์ต้องสร้างบัญชีและยืนยันอีเมลใน AVENZO ONE แล้ว</p></div>
      {canManage ? <form className="form" onSubmit={prepareGrant}>
        <label>อีเมลบัญชีผู้ใช้<input type="email" value={email} onChange={(event) => setEmail(event.target.value)} placeholder="admin@example.com" required /></label>
        <label>ชื่อที่แสดงในระบบ<input value={displayName} onChange={(event) => setDisplayName(event.target.value)} minLength={2} maxLength={100} placeholder="เช่น คุณสมชาย ฝ่ายการเงิน" required /></label>
        <label>ระดับสิทธิ์<select value={roleCode} onChange={(event) => setRoleCode(event.target.value as PlatformAdminDirectoryEntry['role_code'])}>
          <option value="platform_admin">Platform Admin — ใช้งานและอนุมัติ</option>
          <option value="super_admin">Super Admin — จัดการผู้ดูแลได้</option>
        </select><span className="field-help">{roleLabels[roleCode].description}</span></label>
        <label>เหตุผลสำหรับ Audit Log<textarea value={reason} onChange={(event) => setReason(event.target.value)} minLength={10} maxLength={2000} rows={3} placeholder="เช่น เพิ่มผู้อนุมัติคนที่ 2 สำหรับระบบ Billing" required /></label>
        <button className="button" disabled={loading}>ตรวจสอบก่อนเพิ่ม</button>
      </form> : <div className="info-message"><span>i</span><p>บัญชีของคุณใช้งาน Control Plane ได้ แต่มีเฉพาะ Super Admin เท่านั้นที่เพิ่มหรือเปลี่ยนสิทธิ์ผู้ดูแลได้</p></div>}
      </section>

      <section className="platform-access-directory">
      <div className="feature-list-heading"><div><div className="eyebrow">Directory</div><h2>Platform Admin ทั้งหมด</h2><p>มีผู้ดูแลที่ใช้งานอยู่ {activeCount} บัญชี</p></div><span className="feature-count">{initialAdmins.length} บัญชี</span></div>
      {message ? <div className={tone === 'success' ? 'success' : 'error'} role="status">{message}</div> : null}
      <div className="platform-access-list">{initialAdmins.map((admin) => <article className="card platform-access-item" key={admin.user_id}>
        <div className="platform-access-item-heading">
          <div><div className="platform-access-name-row"><h3>{admin.display_name || 'ยังไม่ได้ตั้งชื่อ'}</h3>{admin.is_current_user ? <span className="status active">บัญชีของคุณ</span> : null}</div><p>{admin.email}</p></div>
          <span className={`status ${admin.status}`}>{admin.status === 'active' ? 'ใช้งานอยู่' : 'พักสิทธิ์'}</span>
        </div>
        <dl className="platform-access-meta">
          <div><dt>ระดับสิทธิ์</dt><dd>{roleLabels[admin.role_code].label}</dd></div>
          <div><dt>Authenticator</dt><dd>{admin.verified_mfa_factors > 0 ? `${admin.verified_mfa_factors} เครื่อง` : 'ยังไม่ได้ตั้งค่า MFA'}</dd></div>
          <div><dt>เข้าสู่ระบบล่าสุด</dt><dd>{dateTime(admin.last_sign_in_at)}</dd></div>
          <div><dt>หมายเหตุล่าสุด</dt><dd>{admin.note || 'ไม่มีหมายเหตุ'}</dd></div>
        </dl>
        {admin.is_current_user ? <div className="platform-access-profile-actions">
          {!editingProfile ? <button className="button secondary" type="button" onClick={() => startProfileEdit(admin)}>แก้ไขชื่อของฉัน</button> : null}
          {editingProfile ? <form className="platform-access-profile-form" onSubmit={(event) => prepareOwnProfile(event, admin)}>
            <div><div className="eyebrow">บัญชีของคุณ</div><h4>แก้ไขชื่อที่แสดง</h4><p>เปลี่ยนเฉพาะชื่อของคุณ ไม่เปลี่ยนระดับสิทธิ์หรือสถานะบัญชี</p></div>
            <label>ชื่อที่แสดงในระบบ<input autoFocus value={profileDisplayName} onChange={(event) => setProfileDisplayName(event.target.value)} minLength={2} maxLength={100} placeholder="เช่น คุณธนาธิป" required /></label>
            <label>เหตุผลสำหรับ Audit Log<textarea value={profileReason} onChange={(event) => setProfileReason(event.target.value)} minLength={10} maxLength={2000} rows={2} placeholder="เช่น ตั้งชื่อบัญชีเพื่อให้ทีมระบุตัวผู้ดูแลได้" required /></label>
            <div className="button-row"><button className="button secondary" type="button" onClick={() => setEditingProfile(false)}>ยกเลิก</button><button className="button" disabled={loading}>ตรวจสอบก่อนบันทึก</button></div>
          </form> : null}
        </div> : null}
        {canManage && !admin.is_current_user ? <div className="platform-access-actions">
          <button className="button secondary" type="button" onClick={() => prepareExisting(admin, 'update')}>
            {admin.role_code === 'super_admin' ? 'เปลี่ยนเป็น Platform Admin' : 'เลื่อนเป็น Super Admin'}
          </button>
          {admin.status === 'active'
            ? <button className="button danger" type="button" onClick={() => prepareExisting(admin, 'suspend')}>พักสิทธิ์ชั่วคราว</button>
            : <button className="button" type="button" onClick={() => prepareExisting(admin, 'reactivate')}>เปิดสิทธิ์กลับ</button>}
        </div> : null}
      </article>)}</div>
      </section>
    </div>

    {pending ? <section
      className="subscription-confirmation platform-access-confirmation"
      ref={confirmationRef}
      tabIndex={-1}
    >
      <div className="subscription-confirmation-heading"><div><span className="eyebrow">ตรวจสอบครั้งสุดท้าย</span><h3>{confirmationTitle}</h3></div><span className="status pending">ยังไม่บันทึก</span></div>
      <div className="subscription-confirmation-grid">
        <div><span>บัญชี</span><strong>{pending.email}</strong></div>
        <div><span>ชื่อที่แสดง</span><strong>{pending.displayName || 'ไม่ได้ระบุ'}</strong></div>
        <div><span>ระดับสิทธิ์</span><strong>{roleLabels[pending.roleCode].label}</strong><small>{roleLabels[pending.roleCode].description}</small></div>
        <div><span>ผลที่จะเกิดขึ้น</span><strong>{pending.action === 'suspend'
          ? 'ออกจาก Control Plane จนกว่าจะเปิดสิทธิ์กลับ'
          : pending.action === 'profile'
            ? 'เปลี่ยนเฉพาะชื่อที่แสดง โดยไม่เปลี่ยนสิทธิ์หรือสถานะบัญชี'
            : 'เข้าใช้งานตามระดับสิทธิ์หลัง Login และ MFA'}</strong></div>
      </div>
      <label className="readiness-note">เหตุผลสำหรับ Audit Log<textarea value={pending.reason} minLength={10} maxLength={2000} onChange={(event) => setPending({ ...pending, reason: event.target.value })} placeholder="ระบุเหตุผลอย่างน้อย 10 ตัวอักษร" required /></label>
      <div className="button-row"><button className="button secondary" type="button" disabled={loading} onClick={() => setPending(null)}>ย้อนกลับแก้ไข</button><button className={`button ${pending.action === 'suspend' ? 'danger' : ''}`} type="button" disabled={loading} onClick={confirm}>{loading ? 'กำลังบันทึก…' : confirmationTitle}</button></div>
    </section> : null}
  </div>
}

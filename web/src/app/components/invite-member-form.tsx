'use client'

import { FormEvent, useEffect, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'

type Role = { code: string; name: string }
type Branch = { id: string; code: string; name: string }

export function InviteMemberForm({ organizationId, roles, branches }: { organizationId: string; roles: Role[]; branches: Branch[] }) {
  const router = useRouter()
  const emailInputRef = useRef<HTMLInputElement>(null)
  const [email, setEmail] = useState('')
  const [roleCode, setRoleCode] = useState(roles.find((role) => role.code === 'staff')?.code ?? roles[0]?.code ?? '')
  const [branchId, setBranchId] = useState('')
  const [message, setMessage] = useState('')
  const [invitationUrl, setInvitationUrl] = useState('')
  const [invitationEmail, setInvitationEmail] = useState('')
  const [copied, setCopied] = useState(false)
  const [notice, setNotice] = useState(false)
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    function reuseInvitation(event: Event) {
      const detail = (event as CustomEvent<{ email: string; roleCode: string; branchId: string | null }>).detail
      setEmail(detail.email)
      if (roles.some((role) => role.code === detail.roleCode)) setRoleCode(detail.roleCode)
      setBranchId(detail.branchId && branches.some((branch) => branch.id === detail.branchId) ? detail.branchId : '')
      setInvitationUrl('')
      setMessage('นำข้อมูลคำเชิญเดิมมาแล้ว กรุณาตรวจสอบก่อนส่งใหม่')
      setNotice(true)
      document.getElementById('invite-member')?.scrollIntoView({ behavior: 'smooth', block: 'start' })
      emailInputRef.current?.focus()
    }
    window.addEventListener('avenzo:reuse-invitation', reuseInvitation)
    return () => window.removeEventListener('avenzo:reuse-invitation', reuseInvitation)
  }, [branches, roles])

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setLoading(true)
    setMessage('')
    setNotice(false)
    setInvitationUrl('')
    setInvitationEmail(email)
    setCopied(false)
    try {
      const response = await fetch('/api/invitations/send', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ organizationId, email, roleCode, branchId: branchId || null }) })
      const result = await response.json() as { message?: string; error?: string; invitationUrl?: string }
      if (!response.ok) {
        setMessage(result.message ?? result.error ?? 'ไม่สามารถสร้างคำเชิญได้')
        setInvitationUrl(result.invitationUrl ?? '')
        return
      }
      setEmail('')
      setMessage(result.message ?? 'สร้างคำเชิญสำเร็จ')
      setInvitationUrl(result.invitationUrl ?? '')
      router.refresh()
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'ไม่สามารถสร้างคำเชิญได้')
    } finally { setLoading(false) }
  }

  return <form id="invite-member" className="form" onSubmit={submit}><label>อีเมลสมาชิก<input ref={emailInputRef} type="email" required value={email} onChange={(event) => setEmail(event.target.value)} /></label><label>Role<select value={roleCode} onChange={(event) => { const value = event.target.value; setRoleCode(value); if (value === 'owner') setBranchId('') }}>{roles.map((role) => <option value={role.code} key={role.code}>{role.name} ({role.code})</option>)}</select></label><label>Branch Scope<select value={branchId} disabled={roleCode === 'owner'} onChange={(event) => setBranchId(event.target.value)}><option value="">ทั้ง Organization</option>{branches.map((branch) => <option value={branch.id} key={branch.id}>{branch.code} · {branch.name}</option>)}</select></label>{message && <div className={invitationUrl || notice ? 'countdown' : 'error'}>{message}{invitationUrl && <div style={{ marginTop: 10 }}><div>ลิงก์นี้ใช้กับ: {invitationEmail}</div><input readOnly value={invitationUrl} onFocus={(event) => event.currentTarget.select()} style={{ marginTop: 8 }} /><div style={{ display: 'flex', gap: 8, marginTop: 8 }}><a className="button secondary" href={invitationUrl}>เปิดลิงก์คำเชิญ</a><button className="button secondary" type="button" onClick={async () => { await navigator.clipboard.writeText(invitationUrl); setCopied(true) }}>{copied ? 'คัดลอกแล้ว' : 'คัดลอกลิงก์'}</button></div></div>}</div>}<button className="button" disabled={loading}>{loading ? 'กำลังส่งคำเชิญ…' : 'สร้างและส่งคำเชิญ'}</button></form>
}

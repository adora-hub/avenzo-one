'use client'

import { FormEvent, useState } from 'react'
import { useRouter } from 'next/navigation'

type Role = { code: string; name: string }
type Branch = { id: string; code: string; name: string }

export function InviteMemberForm({ organizationId, roles, branches }: { organizationId: string; roles: Role[]; branches: Branch[] }) {
  const router = useRouter()
  const [email, setEmail] = useState('')
  const [roleCode, setRoleCode] = useState(roles.find((role) => role.code === 'staff')?.code ?? roles[0]?.code ?? '')
  const [branchId, setBranchId] = useState('')
  const [message, setMessage] = useState('')
  const [invitationUrl, setInvitationUrl] = useState('')
  const [loading, setLoading] = useState(false)

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setLoading(true)
    setMessage('')
    setInvitationUrl('')
    try {
      const response = await fetch('/api/invitations/send', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ organizationId, email, roleCode, branchId: branchId || null }) })
      const result = await response.json() as { message?: string; error?: string; invitationUrl?: string }
      if (!response.ok) throw new Error(result.error ?? 'ไม่สามารถสร้างคำเชิญได้')
      setEmail('')
      setMessage(result.message ?? 'สร้างคำเชิญสำเร็จ')
      setInvitationUrl(result.invitationUrl ?? '')
      router.refresh()
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'ไม่สามารถสร้างคำเชิญได้')
    } finally { setLoading(false) }
  }

  return <form className="form" onSubmit={submit}><label>อีเมลสมาชิก<input type="email" required value={email} onChange={(event) => setEmail(event.target.value)} /></label><label>Role<select value={roleCode} onChange={(event) => setRoleCode(event.target.value)}>{roles.map((role) => <option value={role.code} key={role.code}>{role.name} ({role.code})</option>)}</select></label><label>Branch Scope<select value={branchId} onChange={(event) => setBranchId(event.target.value)}><option value="">ทั้ง Organization</option>{branches.map((branch) => <option value={branch.id} key={branch.id}>{branch.code} · {branch.name}</option>)}</select></label>{message && <div className={invitationUrl ? 'countdown' : 'error'}>{message}{invitationUrl && <a href={invitationUrl} style={{ display: 'block', marginTop: 8, color: 'inherit', textDecoration: 'underline' }}>เปิดลิงก์คำเชิญ</a>}</div>}<button className="button" disabled={loading}>{loading ? 'กำลังส่งคำเชิญ…' : 'สร้างและส่งคำเชิญ'}</button></form>
}

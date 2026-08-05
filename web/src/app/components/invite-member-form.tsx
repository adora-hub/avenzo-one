'use client'

import { FormEvent, useState } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/browser'

type Role = { code: string; name: string }
type Branch = { id: string; code: string; name: string }

export function InviteMemberForm({ organizationId, roles, branches }: { organizationId: string; roles: Role[]; branches: Branch[] }) {
  const router = useRouter()
  const [email, setEmail] = useState('')
  const [roleCode, setRoleCode] = useState(roles.find((role) => role.code === 'staff')?.code ?? roles[0]?.code ?? '')
  const [branchId, setBranchId] = useState('')
  const [message, setMessage] = useState('')
  const [loading, setLoading] = useState(false)

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setLoading(true)
    setMessage('')
    try {
      const { error } = await createClient().rpc('create_organization_invitation', { p_organization_id: organizationId, p_email: email, p_role_code: roleCode, p_branch_id: branchId || null })
      if (error) throw error
      setEmail('')
      setMessage('สร้างคำเชิญสำเร็จ')
      router.refresh()
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'ไม่สามารถสร้างคำเชิญได้')
    } finally { setLoading(false) }
  }

  return <form className="form" onSubmit={submit}><label>อีเมลสมาชิก<input type="email" required value={email} onChange={(event) => setEmail(event.target.value)} /></label><label>Role<select value={roleCode} onChange={(event) => setRoleCode(event.target.value)}>{roles.map((role) => <option value={role.code} key={role.code}>{role.name} ({role.code})</option>)}</select></label><label>Branch Scope<select value={branchId} onChange={(event) => setBranchId(event.target.value)}><option value="">ทั้ง Organization</option>{branches.map((branch) => <option value={branch.id} key={branch.id}>{branch.code} · {branch.name}</option>)}</select></label>{message && <div className={message.includes('สำเร็จ') ? 'countdown' : 'error'}>{message}</div>}<button className="button" disabled={loading}>{loading ? 'กำลังส่ง…' : 'สร้างคำเชิญ'}</button></form>
}

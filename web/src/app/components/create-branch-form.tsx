'use client'

import { FormEvent, useState } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/browser'
import { branchEntitlementMessage, type OrganizationBranchEntitlement } from '@/lib/branch-entitlement'

const branchErrorMessages: Record<string, string> = {
  subscription_expired: 'Subscription หมดอายุแล้ว จึงไม่สามารถสร้างสาขาเพิ่มได้',
  feature_branches_disabled: 'Plan Version นี้ไม่ได้เปิดสิทธิ์ใช้งานสาขา',
  feature_branches_limit_reached: 'ใช้จำนวนสาขาครบตามสิทธิ์ของ Plan Version แล้ว',
}

function friendlyBranchError(message: string) {
  const entry = Object.entries(branchErrorMessages).find(([code]) => message.includes(code))
  return entry?.[1] ?? message
}

export function CreateBranchForm({
  organizationId,
  entitlement,
}: {
  organizationId: string
  entitlement: OrganizationBranchEntitlement | null
}) {
  const router = useRouter()
  const [code, setCode] = useState('')
  const [name, setName] = useState('')
  const [message, setMessage] = useState('')
  const [loading, setLoading] = useState(false)
  const canCreate = entitlement?.can_create ?? true

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!canCreate) return
    setLoading(true)
    setMessage('')
    try {
      const supabase = createClient()
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) throw new Error('กรุณาเข้าสู่ระบบใหม่')
      const { error } = await supabase.from('branches').insert({
        organization_id: organizationId,
        code: code.trim().toUpperCase(),
        name: name.trim(),
        address: {},
        created_by: user.id,
      })
      if (error) throw error
      setCode('')
      setName('')
      setMessage('สร้าง Branch สำเร็จ')
      router.refresh()
    } catch (error) {
      const rawMessage = error instanceof Error ? error.message : 'ไม่สามารถสร้าง Branch ได้'
      setMessage(friendlyBranchError(rawMessage))
    } finally {
      setLoading(false)
    }
  }

  return (
    <form className="form" onSubmit={submit}>
      <div className={canCreate ? 'countdown' : 'error'}>{branchEntitlementMessage(entitlement)}</div>
      <label>รหัส Branch<input required pattern="[A-Z0-9-]+" value={code} onChange={(event) => setCode(event.target.value)} placeholder="BKK-01" disabled={!canCreate} /></label>
      <label>ชื่อ Branch<input required value={name} onChange={(event) => setName(event.target.value)} placeholder="สาขากรุงเทพ" disabled={!canCreate} /></label>
      {message && <div className={message.includes('สำเร็จ') ? 'countdown' : 'error'}>{message}</div>}
      <button className="button" disabled={loading || !canCreate}>{loading ? 'กำลังบันทึก…' : 'สร้าง Branch'}</button>
    </form>
  )
}

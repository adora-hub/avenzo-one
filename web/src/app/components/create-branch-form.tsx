'use client'

import { FormEvent, useState } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/browser'

export function CreateBranchForm({ organizationId }: { organizationId: string }) {
  const router = useRouter()
  const [code, setCode] = useState('')
  const [name, setName] = useState('')
  const [message, setMessage] = useState('')
  const [loading, setLoading] = useState(false)

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setLoading(true)
    setMessage('')
    try {
      const supabase = createClient()
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) throw new Error('กรุณาเข้าสู่ระบบใหม่')
      const { error } = await supabase.from('branches').insert({ organization_id: organizationId, code: code.trim().toUpperCase(), name: name.trim(), address: {}, created_by: user.id })
      if (error) throw error
      setCode('')
      setName('')
      setMessage('สร้าง Branch สำเร็จ')
      router.refresh()
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'ไม่สามารถสร้าง Branch ได้')
    } finally { setLoading(false) }
  }

  return <form className="form" onSubmit={submit}><label>รหัส Branch<input required pattern="[A-Z0-9-]+" value={code} onChange={(event) => setCode(event.target.value)} placeholder="BKK-01" /></label><label>ชื่อ Branch<input required value={name} onChange={(event) => setName(event.target.value)} placeholder="สาขากรุงเทพ" /></label>{message && <div className={message.includes('สำเร็จ') ? 'countdown' : 'error'}>{message}</div>}<button className="button" disabled={loading}>{loading ? 'กำลังบันทึก…' : 'สร้าง Branch'}</button></form>
}

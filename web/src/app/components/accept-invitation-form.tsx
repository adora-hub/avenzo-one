'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/browser'

export function AcceptInvitationForm({ invitationId }: { invitationId: string }) {
  const router = useRouter()
  const [message, setMessage] = useState('')
  const [loading, setLoading] = useState(false)

  async function accept() {
    setLoading(true)
    setMessage('')
    const { data, error } = await createClient().rpc('accept_organization_invitation', { p_invitation_id: invitationId })
    if (error) {
      setMessage(error.message)
      setLoading(false)
      return
    }
    const result = Array.isArray(data) ? data[0] : data
    if (!result?.organization_id) {
      setMessage('ไม่พบข้อมูล Organization จากคำเชิญนี้')
      setLoading(false)
      return
    }
    router.push(`/organizations/${result.organization_id}`)
    router.refresh()
  }

  return <div className="form"><button className="button" type="button" onClick={accept} disabled={loading}>{loading ? 'กำลังรับคำเชิญ…' : 'ยอมรับคำเชิญ'}</button>{message && <div className="error">{message}</div>}</div>
}

'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/browser'

export function CancelInvitationButton({ invitationId, compact = false }: { invitationId: string; compact?: boolean }) {
  const router = useRouter()
  const [loading, setLoading] = useState(false)

  async function cancel() {
    if (!window.confirm('ต้องการยกเลิกคำเชิญนี้ใช่หรือไม่')) return
    setLoading(true)
    const { error } = await createClient().rpc('revoke_organization_invitation', { p_invitation_id: invitationId })
    if (error) window.alert(error.message)
    else router.refresh()
    setLoading(false)
  }

  return <button className={`button danger${compact ? ' compact-button' : ''}`} type="button" onClick={cancel} disabled={loading}>{loading ? 'กำลังยกเลิก…' : 'ยกเลิก'}</button>
}

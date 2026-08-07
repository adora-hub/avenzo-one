'use client'

import { useState } from 'react'

type ReuseInvitationDetail = {
  email: string
  roleCode: string
  branchId: string | null
}

export function CopyInvitationLinkButton({ invitationId }: { invitationId: string }) {
  const [copied, setCopied] = useState(false)
  const [failed, setFailed] = useState(false)

  async function copyLink() {
    try {
      const invitationUrl = new URL(`/invitations/${invitationId}`, window.location.origin).toString()
      await navigator.clipboard.writeText(invitationUrl)
      setCopied(true)
      setFailed(false)
    } catch {
      setFailed(true)
    }
  }

  return (
    <button className="button secondary compact-button" type="button" onClick={copyLink}>
      {failed ? 'คัดลอกไม่สำเร็จ' : copied ? 'คัดลอกแล้ว' : 'คัดลอกลิงก์'}
    </button>
  )
}

export function ReuseInvitationButton({ detail }: { detail: ReuseInvitationDetail }) {
  function reuseInvitation() {
    window.dispatchEvent(new CustomEvent<ReuseInvitationDetail>('avenzo:reuse-invitation', { detail }))
  }

  return (
    <button className="button secondary compact-button" type="button" onClick={reuseInvitation}>
      เชิญใหม่
    </button>
  )
}

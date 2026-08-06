'use client'

import { FormEvent, useState } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/browser'

export function InvitationPasswordSetupForm({ invitationId }: { invitationId: string }) {
  const router = useRouter()
  const [password, setPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [message, setMessage] = useState('')
  const [loading, setLoading] = useState(false)

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setMessage('')

    if (password !== confirmPassword) {
      setMessage('รหัสผ่านทั้งสองช่องไม่ตรงกัน')
      return
    }

    setLoading(true)
    const supabase = createClient()
    const { error: passwordError } = await supabase.auth.updateUser({ password })

    if (passwordError) {
      setMessage(passwordError.message)
      setLoading(false)
      return
    }

    const { data, error: invitationError } = await supabase.rpc('accept_organization_invitation', {
      p_invitation_id: invitationId,
    })

    if (invitationError) {
      setMessage(`ตั้งรหัสผ่านสำเร็จ แต่รับคำเชิญไม่สำเร็จ: ${invitationError.message}`)
      setLoading(false)
      return
    }

    const result = Array.isArray(data) ? data[0] : data
    if (!result?.organization_id) {
      setMessage('ตั้งรหัสผ่านสำเร็จ แต่ไม่พบ Organization จากคำเชิญนี้')
      setLoading(false)
      return
    }

    router.replace(`/organizations/${result.organization_id}`)
    router.refresh()
  }

  return (
    <form className="form" onSubmit={submit}>
      <div className="countdown" style={{ marginTop: 0 }}>
        ตั้งรหัสผ่านสำหรับบัญชีนี้ก่อนรับคำเชิญ เพื่อให้กลับมาเข้าสู่ระบบได้ในครั้งถัดไป
      </div>
      <label>
        รหัสผ่านใหม่
        <input
          type="password"
          required
          minLength={8}
          autoComplete="new-password"
          value={password}
          onChange={(event) => setPassword(event.target.value)}
        />
      </label>
      <label>
        ยืนยันรหัสผ่านใหม่
        <input
          type="password"
          required
          minLength={8}
          autoComplete="new-password"
          value={confirmPassword}
          onChange={(event) => setConfirmPassword(event.target.value)}
        />
      </label>
      {message && <div className="error">{message}</div>}
      <button className="button" disabled={loading}>
        {loading ? 'กำลังตั้งรหัสผ่านและรับคำเชิญ…' : 'ตั้งรหัสผ่านและรับคำเชิญ'}
      </button>
    </form>
  )
}

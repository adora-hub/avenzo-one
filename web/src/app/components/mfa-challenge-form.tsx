'use client'

import { useState } from 'react'
import type { FormEvent } from 'react'
import { getThaiAuthError } from '@/lib/auth-error-message'
import { createClient } from '@/lib/supabase/browser'

export function MfaChallengeForm({ nextPath }: { nextPath: string }) {
  const [verificationCode, setVerificationCode] = useState('')
  const [message, setMessage] = useState('')
  const [loading, setLoading] = useState(false)

  async function verify(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (verificationCode.length !== 6) return

    setLoading(true)
    setMessage('')

    try {
      const supabase = createClient()
      const factors = await supabase.auth.mfa.listFactors()
      if (factors.error) throw factors.error

      const factor = factors.data.totp[0]
      if (!factor) {
        setMessage('ไม่พบ Authenticator ที่ยืนยันแล้ว กรุณาติดต่อผู้ดูแลระบบ')
        return
      }

      const result = await supabase.auth.mfa.challengeAndVerify({
        factorId: factor.id,
        code: verificationCode,
      })
      if (result.error) throw result.error

      const auditResult = await supabase.rpc('record_platform_security_event', {
        p_action: 'mfa_challenge_verified',
        p_factor_type: 'totp',
      })
      if (auditResult.error) {
        console.error('[mfa-challenge] audit event failed', { message: auditResult.error.message })
      }

      window.location.assign(nextPath)
    } catch (error) {
      setMessage(getThaiAuthError(error))
      setVerificationCode('')
    } finally {
      setLoading(false)
    }
  }

  return (
    <form className="form mfa-challenge-form" onSubmit={verify}>
      <label htmlFor="mfa-challenge-code">รหัสจากแอป Authenticator</label>
      <input
        id="mfa-challenge-code"
        value={verificationCode}
        onChange={(event) => setVerificationCode(event.target.value.replace(/\D/g, '').slice(0, 6))}
        inputMode="numeric"
        autoComplete="one-time-code"
        pattern="[0-9]{6}"
        minLength={6}
        maxLength={6}
        placeholder="000000"
        autoFocus
        required
      />
      {message ? <div className="error" role="alert">{message}</div> : null}
      <button className="button" disabled={loading || verificationCode.length !== 6}>
        {loading ? 'กำลังตรวจสอบ…' : 'ยืนยันและเข้า Platform Admin'}
      </button>
      <p className="mfa-help">รหัสเปลี่ยนทุกประมาณ 30 วินาที หากรหัสหมดเวลาให้ใช้รหัสชุดใหม่</p>
    </form>
  )
}

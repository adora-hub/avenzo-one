'use client'

import { useEffect, useState } from 'react'
import type { FormEvent } from 'react'
import type { Factor } from '@supabase/supabase-js'
import { getThaiAuthError } from '@/lib/auth-error-message'
import { createClient } from '@/lib/supabase/browser'

export function MfaChallengeForm({ nextPath }: { nextPath: string }) {
  const [factors, setFactors] = useState<Factor<'totp', 'verified'>[]>([])
  const [factorId, setFactorId] = useState('')
  const [verificationCode, setVerificationCode] = useState('')
  const [message, setMessage] = useState('')
  const [loadingFactors, setLoadingFactors] = useState(true)
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    let active = true
    async function loadFactors() {
      const result = await createClient().auth.mfa.listFactors()
      if (!active) return
      if (result.error) setMessage(getThaiAuthError(result.error))
      else {
        setFactors(result.data.totp)
        setFactorId(result.data.totp[0]?.id ?? '')
        if (result.data.totp.length === 0) setMessage('ไม่พบ Authenticator ที่ยืนยันแล้ว กรุณาติดต่อผู้ดูแลระบบ')
      }
      setLoadingFactors(false)
    }
    void loadFactors()
    return () => { active = false }
  }, [])

  async function verify(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!factorId || verificationCode.length !== 6) return
    setLoading(true)
    setMessage('')
    try {
      const supabase = createClient()
      const result = await supabase.auth.mfa.challengeAndVerify({ factorId, code: verificationCode })
      if (result.error) throw result.error
      const auditResult = await supabase.rpc('record_platform_security_event', { p_action: 'mfa_challenge_verified', p_factor_type: 'totp' })
      if (auditResult.error) console.error('[mfa-challenge] audit event failed', { message: auditResult.error.message })
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
      {factors.length > 1 ? (
        <label htmlFor="mfa-factor">เลือก Authenticator
          <select id="mfa-factor" value={factorId} onChange={(event) => setFactorId(event.target.value)}>
            {factors.map((factor, index) => <option value={factor.id} key={factor.id}>{factor.friendly_name || `Authenticator เครื่องที่ ${index + 1}`}</option>)}
          </select>
        </label>
      ) : null}
      <label htmlFor="mfa-challenge-code">รหัสจากแอป Authenticator</label>
      <input id="mfa-challenge-code" value={verificationCode} onChange={(event) => setVerificationCode(event.target.value.replace(/\D/g, '').slice(0, 6))} inputMode="numeric" autoComplete="one-time-code" pattern="[0-9]{6}" minLength={6} maxLength={6} placeholder="000000" autoFocus required />
      {message ? <div className="error" role="alert">{message}</div> : null}
      <button className="button" disabled={loadingFactors || loading || !factorId || verificationCode.length !== 6}>
        {loadingFactors ? 'กำลังโหลด Authenticator…' : loading ? 'กำลังตรวจสอบ…' : 'ยืนยันและเข้า Platform Admin'}
      </button>
      <p className="mfa-help">หากมีเครื่องหลักและเครื่องสำรอง ให้เลือกรหัสจากอุปกรณ์ที่กำลังใช้งาน</p>
    </form>
  )
}

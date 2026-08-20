'use client'

import type { Factor } from '@supabase/supabase-js'
import { FormEvent, useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { getThaiAuthError } from '@/lib/auth-error-message'
import { createClient } from '@/lib/supabase/browser'

type VerifiedTotpFactor = Factor<'totp', 'verified'>

export function SetPasswordForm() {
  const router = useRouter()
  const [password, setPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [verificationCode, setVerificationCode] = useState('')
  const [factors, setFactors] = useState<VerifiedTotpFactor[]>([])
  const [factorId, setFactorId] = useState('')
  const [mfaRequired, setMfaRequired] = useState(false)
  const [checkingMfa, setCheckingMfa] = useState(true)
  const [message, setMessage] = useState('')
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    let active = true

    async function loadMfaRequirement() {
      const supabase = createClient()
      const assurance = await supabase.auth.mfa.getAuthenticatorAssuranceLevel()

      if (!active) return
      if (assurance.error) {
        setMessage(getThaiAuthError(assurance.error))
        setCheckingMfa(false)
        return
      }

      if (assurance.data.currentLevel === 'aal2') {
        setMfaRequired(false)
        setCheckingMfa(false)
        return
      }

      const factorResult = await supabase.auth.mfa.listFactors()
      if (!active) return
      if (factorResult.error) {
        setMessage(getThaiAuthError(factorResult.error))
        setCheckingMfa(false)
        return
      }

      const verifiedFactors = factorResult.data.totp.filter(
        (factor): factor is VerifiedTotpFactor => factor.status === 'verified',
      )
      const needsAal2 = verifiedFactors.length > 0 || assurance.data.nextLevel === 'aal2'
      setMfaRequired(needsAal2)
      setFactors(verifiedFactors)
      setFactorId(verifiedFactors[0]?.id ?? '')

      if (verifiedFactors.length === 0) {
        setMessage('บัญชีนี้กำหนดให้ใช้ MFA แต่ไม่พบ Authenticator ที่ยืนยันแล้ว กรุณาติดต่อผู้ดูแลระบบ')
      }
      setCheckingMfa(false)
    }

    void loadMfaRequirement()
    return () => {
      active = false
    }
  }, [])

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setMessage('')

    if (password !== confirmPassword) {
      setMessage('รหัสผ่านทั้งสองช่องไม่ตรงกัน')
      return
    }

    if (mfaRequired && !/^\d{6}$/.test(verificationCode)) {
      setMessage('กรุณากรอกรหัส Authenticator 6 หลัก')
      return
    }

    setLoading(true)
    const supabase = createClient()

    if (mfaRequired) {
      if (!factorId) {
        setMessage('ไม่พบ Authenticator ที่พร้อมใช้งาน กรุณาติดต่อผู้ดูแลระบบ')
        setLoading(false)
        return
      }

      const verification = await supabase.auth.mfa.challengeAndVerify({
        factorId,
        code: verificationCode,
      })

      if (verification.error) {
        setMessage(getThaiAuthError(verification.error))
        setVerificationCode('')
        setLoading(false)
        return
      }

      const sessionUpdate = await supabase.auth.setSession({
        access_token: verification.data.access_token,
        refresh_token: verification.data.refresh_token,
      })
      if (sessionUpdate.error) {
        setMessage(getThaiAuthError(sessionUpdate.error))
        setVerificationCode('')
        setLoading(false)
        return
      }

      const assurance = await supabase.auth.mfa.getAuthenticatorAssuranceLevel(
        verification.data.access_token,
      )
      if (assurance.error || assurance.data.currentLevel !== 'aal2') {
        setMessage(
          assurance.error
            ? getThaiAuthError(assurance.error)
            : 'ยืนยัน MFA ไม่สำเร็จ กรุณากรอกรหัส Authenticator ใหม่อีกครั้ง',
        )
        setVerificationCode('')
        setLoading(false)
        return
      }
    }

    const { error } = await supabase.auth.updateUser({ password })
    if (error) {
      setMessage(getThaiAuthError(error))
      setLoading(false)
      return
    }

    router.replace('/dashboard')
    router.refresh()
  }

  const cannotSubmit =
    loading || checkingMfa || (mfaRequired && (!factorId || factors.length === 0))

  return (
    <form className="form" onSubmit={submit}>
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

      {mfaRequired && (
        <>
          <div className="countdown">
            บัญชีนี้เปิด MFA กรุณายืนยันรหัส 6 หลักจากแอป Authenticator ก่อนบันทึกรหัสผ่านใหม่
          </div>
          {factors.length > 1 && (
            <label>
              Authenticator
              <select value={factorId} onChange={(event) => setFactorId(event.target.value)}>
                {factors.map((factor, index) => (
                  <option key={factor.id} value={factor.id}>
                    {factor.friendly_name || `Authenticator เครื่องที่ ${index + 1}`}
                  </option>
                ))}
              </select>
            </label>
          )}
          <label>
            รหัส Authenticator 6 หลัก
            <input
              type="text"
              required
              inputMode="numeric"
              autoComplete="one-time-code"
              pattern="[0-9]{6}"
              maxLength={6}
              placeholder="000000"
              value={verificationCode}
              onChange={(event) =>
                setVerificationCode(event.target.value.replace(/\D/g, '').slice(0, 6))
              }
            />
          </label>
        </>
      )}

      {message && <div className="error">{message}</div>}
      <button className="button" disabled={cannotSubmit}>
        {checkingMfa
          ? 'กำลังตรวจสอบความปลอดภัย…'
          : loading
            ? 'กำลังบันทึก…'
            : mfaRequired
              ? 'ยืนยัน MFA และบันทึกรหัสผ่านใหม่'
              : 'บันทึกรหัสผ่านใหม่'}
      </button>
    </form>
  )
}

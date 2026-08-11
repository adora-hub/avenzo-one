'use client'

import { useEffect, useState } from 'react'
import type { FormEvent, KeyboardEvent } from 'react'
import { getThaiAuthError, isExistingAccountError } from '@/lib/auth-error-message'
import { registerCurrentAppSession, reportSessionRegistrationFailure } from '@/lib/session-registration'
import { getAppSessionLogoutMessage } from '@/lib/session-activity'
import { createClient } from '@/lib/supabase/browser'

const rememberedEmailKey = 'avenzo-one:remembered-email:v1'
const productionAppOrigin = 'https://app.avenzoone.com'

function getPasswordRecoveryRedirectUrl() {
  const configuredOrigin = process.env.NEXT_PUBLIC_APP_URL?.replace(/\/$/, '')
  const recoveryOrigin = configuredOrigin?.startsWith('https://')
    ? configuredOrigin
    : productionAppOrigin

  return `${recoveryOrigin}/auth/callback?next=${encodeURIComponent('/auth/set-password')}`
}

const passwordRules = [
  { key: 'length', label: 'อย่างน้อย 8 ตัวอักษร', test: (value: string) => value.length >= 8 },
  { key: 'lowercase', label: 'ตัวอักษรภาษาอังกฤษพิมพ์เล็ก', test: (value: string) => /[a-z]/.test(value) },
  { key: 'uppercase', label: 'ตัวอักษรภาษาอังกฤษพิมพ์ใหญ่', test: (value: string) => /[A-Z]/.test(value) },
  { key: 'number', label: 'ตัวเลขอย่างน้อย 1 ตัว', test: (value: string) => /\d/.test(value) },
  { key: 'symbol', label: 'สัญลักษณ์พิเศษอย่างน้อย 1 ตัว', test: (value: string) => /[\p{P}\p{S}]/u.test(value) },
] as const

function EyeIcon({ hidden }: { hidden: boolean }) {
  return hidden ? (
    <svg aria-hidden="true" viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <path d="M3 3l18 18" />
      <path d="M10.6 10.7a2 2 0 0 0 2.7 2.7" />
      <path d="M9.9 4.2A10.8 10.8 0 0 1 12 4c5.2 0 8.8 4.5 9.7 6.1a3.5 3.5 0 0 1 0 3.8 14.2 14.2 0 0 1-2.1 2.8" />
      <path d="M6.2 6.2a15.5 15.5 0 0 0-3.9 3.9 3.5 3.5 0 0 0 0 3.8C3.2 15.5 6.8 20 12 20a10.6 10.6 0 0 0 4-.8" />
    </svg>
  ) : (
    <svg aria-hidden="true" viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <path d="M2.3 10.1a3.5 3.5 0 0 0 0 3.8C3.2 15.5 6.8 20 12 20s8.8-4.5 9.7-6.1a3.5 3.5 0 0 0 0-3.8C20.8 8.5 17.2 4 12 4S3.2 8.5 2.3 10.1Z" />
      <circle cx="12" cy="12" r="3" />
    </svg>
  )
}

export function AuthForm() {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [mode, setMode] = useState<'sign-in' | 'sign-up' | 'forgot-password'>('sign-in')
  const [message, setMessage] = useState('')
  const [messageTone, setMessageTone] = useState<'success' | 'error'>('error')
  const [loading, setLoading] = useState(false)
  const [canResend, setCanResend] = useState(false)
  const [resending, setResending] = useState(false)
  const [showPassword, setShowPassword] = useState(false)
  const [rememberEmail, setRememberEmail] = useState(false)
  const [capsLockOn, setCapsLockOn] = useState(false)

  const passwordChecks = passwordRules.map((rule) => ({ ...rule, passed: rule.test(password) }))
  const passwordMeetsRequirements = passwordChecks.every((rule) => rule.passed)

  useEffect(() => {
    const search = new URLSearchParams(window.location.search)
    const sessionMessage = getAppSessionLogoutMessage(search.get('session'))
    if (sessionMessage) {
      setMessageTone('error')
      setMessage(sessionMessage)
    }

    if (search.get('forgot') === '1') {
      setMode('forgot-password')
      if (search.get('recovery') === 'expired') {
        setMessageTone('error')
        setMessage('ลิงก์ตั้งรหัสผ่านหมดอายุหรือถูกใช้แล้ว กรุณาขอลิงก์ใหม่')
      }
    }

    const rememberedEmail = window.localStorage.getItem(rememberedEmailKey)
    if (rememberedEmail) {
      setEmail(rememberedEmail)
      setRememberEmail(true)
    }

    const hash = new URLSearchParams(window.location.hash.replace(/^#/, ''))
    const recoveryError = hash.get('error_code') || hash.get('error')
    if (recoveryError) {
      setMode('forgot-password')
      setMessageTone('error')
      setMessage(
        recoveryError === 'otp_expired'
          ? 'ลิงก์ตั้งรหัสผ่านหมดอายุหรือถูกใช้แล้ว กรุณาขอลิงก์ใหม่ด้านล่าง'
          : 'ไม่สามารถเปิดลิงก์ตั้งรหัสผ่านได้ กรุณาขอลิงก์ใหม่ด้านล่าง',
      )
      window.history.replaceState({}, document.title, '/?forgot=1&recovery=expired')
      return
    }

    const accessToken = hash.get('access_token')
    const refreshToken = hash.get('refresh_token')
    const authType = hash.get('type')
    if (!accessToken || !refreshToken) return

    setLoading(true)
    const supabase = createClient()
    supabase.auth.setSession({ access_token: accessToken, refresh_token: refreshToken }).then(async ({ error }) => {
      if (error) {
        setMessageTone('error')
        setMessage(getThaiAuthError(error))
        setLoading(false)
        return
      }
      if (authType === 'recovery') {
        window.history.replaceState({}, document.title, '/auth/set-password')
        window.location.assign('/auth/set-password')
        return
      }
      const registration = await registerCurrentAppSession(supabase)
      reportSessionRegistrationFailure('hash-session', registration)
      window.history.replaceState({}, document.title, window.location.pathname)
      const pendingResponse = await fetch('/api/invitations/pending')
      const pending = await pendingResponse.json() as { invitationId?: string | null }
      window.location.assign(pending.invitationId ? `/invitations/${pending.invitationId}?setup=1` : '/dashboard')
    })
  }, [])

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setLoading(true)
    setMessage('')
    setMessageTone('error')
    setCanResend(false)

    try {
      const supabase = createClient()
      const next = new URLSearchParams(window.location.search).get('next')
      const nextPath = next && next.startsWith('/') && !next.startsWith('//') ? next : '/dashboard'
      if (mode === 'sign-up' && !passwordMeetsRequirements) {
        setMessage('รหัสผ่านยังไม่ครบทุกเงื่อนไข กรุณาตรวจสอบรายการด้านล่าง')
        return
      }
      if (mode === 'forgot-password') {
        const { error } = await supabase.auth.resetPasswordForEmail(email, {
          // Password recovery is an account-level flow. Always return users to
          // the public AVENZO ONE app, even when an administrator requested the
          // email while testing from localhost.
          redirectTo: getPasswordRecoveryRedirectUrl(),
        })
        if (error) throw error
        setMessageTone('success')
        setMessage('ส่งอีเมลพร้อมลิงก์ตั้งรหัสผ่านแล้ว กรุณาตรวจสอบ Inbox และ Spam')
        return
      }

      const result = mode === 'sign-in'
        ? await supabase.auth.signInWithPassword({ email, password })
        : await supabase.auth.signUp({
            email,
            password,
            options: { emailRedirectTo: `${window.location.origin}/auth/callback?next=${encodeURIComponent(nextPath)}` },
          })

      if (result.error) throw result.error
      if (mode === 'sign-up') {
        const existingAccount = !result.data.user?.identities?.length
        if (existingAccount) {
          setMessageTone('error')
          setMessage('อีเมลนี้มีบัญชีอยู่แล้ว กรุณาใช้ลิงก์คำเชิญฉบับล่าสุดจากอีเมล ไม่ต้องสมัครซ้ำ')
          setCanResend(false)
        } else {
          setMessageTone('success')
          setMessage('สมัครสำเร็จ กรุณาตรวจสอบอีเมลเพื่อยืนยันบัญชี หากไม่พบให้กดส่งอีเมลอีกครั้ง')
          setCanResend(true)
        }
      } else {
        const normalizedEmail = email.trim().toLowerCase()
        if (rememberEmail) window.localStorage.setItem(rememberedEmailKey, normalizedEmail)
        else window.localStorage.removeItem(rememberedEmailKey)

        const signedInUserId = result.data.user?.id
        if (!signedInUserId) throw new Error('ไม่พบข้อมูลบัญชีหลังเข้าสู่ระบบ กรุณาลองใหม่อีกครั้ง')

        const platformAdminResult = await supabase
          .from('platform_admins')
          .select('status')
          .eq('user_id', signedInUserId)
          .maybeSingle()

        if (platformAdminResult.data?.status === 'active') {
          const destination = next ? nextPath : '/platform-admin'
          const assurance = await supabase.auth.mfa.getAuthenticatorAssuranceLevel()
          if (assurance.error) throw assurance.error
          if (assurance.data.nextLevel === 'aal2' && assurance.data.currentLevel !== 'aal2') {
            window.location.assign(`/auth/mfa?next=${encodeURIComponent(destination)}`)
            return
          }
          const registration = await registerCurrentAppSession(supabase)
          reportSessionRegistrationFailure('password-login', registration)
          window.location.assign(destination)
          return
        }

        const registration = await registerCurrentAppSession(supabase)
        reportSessionRegistrationFailure('password-login', registration)
        window.location.assign(nextPath)
      }
    } catch (error) {
      setMessageTone('error')
      setMessage(getThaiAuthError(error))
      if (mode === 'sign-up' && isExistingAccountError(error)) {
        setCanResend(true)
      }
    } finally {
      setLoading(false)
    }
  }

  async function resendConfirmation() {
    if (!email) return
    setResending(true)
    setMessage('')
    const { error } = await createClient().auth.resend({
      type: 'signup',
      email,
      options: { emailRedirectTo: `${window.location.origin}/auth/callback?next=/dashboard` },
    })
    setMessageTone(error ? 'error' : 'success')
    setMessage(error ? getThaiAuthError(error) : 'ส่งอีเมลยืนยันอีกครั้งแล้ว กรุณาตรวจสอบ Inbox และ Spam')
    setResending(false)
  }

  function updateCapsLock(event: KeyboardEvent<HTMLInputElement>) {
    setCapsLockOn(event.getModifierState('CapsLock'))
  }

  return (
    <form className="form" onSubmit={submit}>
      <label>
        อีเมล
        <input type="email" required autoComplete="email" value={email} onChange={(event) => setEmail(event.target.value)} />
      </label>
      {mode !== 'forgot-password' && (
        <div className="field-group">
          <label htmlFor="auth-password">รหัสผ่าน</label>
          <span className="password-field">
            <input
              id="auth-password"
              type={showPassword ? 'text' : 'password'}
              required
              minLength={mode === 'sign-up' ? 8 : undefined}
              autoComplete={mode === 'sign-in' ? 'current-password' : 'new-password'}
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              onKeyDown={updateCapsLock}
              onKeyUp={updateCapsLock}
              onBlur={() => setCapsLockOn(false)}
              aria-describedby={mode === 'sign-up' ? 'password-requirements' : capsLockOn ? 'caps-lock-warning' : undefined}
            />
            <button
              type="button"
              className="password-toggle"
              aria-label={showPassword ? 'ซ่อนรหัสผ่าน' : 'แสดงรหัสผ่าน'}
              aria-pressed={showPassword}
              title={showPassword ? 'ซ่อนรหัสผ่าน' : 'แสดงรหัสผ่าน'}
              onClick={() => setShowPassword((current) => !current)}
            >
              <EyeIcon hidden={!showPassword} />
            </button>
          </span>
          {capsLockOn && <div id="caps-lock-warning" className="caps-lock-warning" role="status">เปิด Caps Lock อยู่</div>}
          {mode === 'sign-up' && (
            <ul id="password-requirements" className="password-requirements" aria-label="เงื่อนไขรหัสผ่าน">
              {passwordChecks.map((rule) => (
                <li key={rule.key} className={rule.passed ? 'passed' : undefined}>
                  <span aria-hidden="true">{rule.passed ? '✓' : '○'}</span>
                  {rule.label}
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
      {mode === 'sign-in' && (
        <label className="remember-row">
          <input type="checkbox" checked={rememberEmail} onChange={(event) => setRememberEmail(event.target.checked)} />
          <span>จดจำอีเมลบนอุปกรณ์นี้</span>
        </label>
      )}
      {message && <div className={messageTone === 'success' ? 'countdown' : 'error'}>{message}</div>}
      {canResend && mode === 'sign-up' && <button type="button" className="button secondary" onClick={resendConfirmation} disabled={resending}>{resending ? 'กำลังส่ง…' : 'ส่งอีเมลยืนยันอีกครั้ง'}</button>}
      <button className="button" disabled={loading}>{loading ? 'กำลังดำเนินการ…' : mode === 'sign-in' ? 'เข้าสู่ระบบ' : mode === 'sign-up' ? 'สร้างบัญชี' : 'ส่งลิงก์ตั้งรหัสผ่าน'}</button>
      {mode === 'sign-in' && <button type="button" className="button secondary" onClick={() => { setMode('forgot-password'); setMessage(''); setCanResend(false) }}>ลืมรหัสผ่าน?</button>}
      <button type="button" className="button secondary" onClick={() => { setMode(mode === 'sign-in' ? 'sign-up' : 'sign-in'); setMessage(''); setCanResend(false) }}>
        {mode === 'sign-in' ? 'สร้างบัญชีใหม่' : 'กลับไปเข้าสู่ระบบ'}
      </button>
    </form>
  )
}

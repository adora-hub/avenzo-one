'use client'

import { FormEvent, useState } from 'react'
import { createClient } from '@/lib/supabase/browser'

export function AuthForm() {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [mode, setMode] = useState<'sign-in' | 'sign-up'>('sign-in')
  const [message, setMessage] = useState('')
  const [loading, setLoading] = useState(false)
  const [canResend, setCanResend] = useState(false)
  const [resending, setResending] = useState(false)

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setLoading(true)
    setMessage('')
    setCanResend(false)

    try {
      const supabase = createClient()
      const result = mode === 'sign-in'
        ? await supabase.auth.signInWithPassword({ email, password })
        : await supabase.auth.signUp({
            email,
            password,
            options: { emailRedirectTo: `${window.location.origin}/auth/callback` },
          })

      if (result.error) throw result.error
      if (mode === 'sign-up') {
        setMessage('สมัครสำเร็จ กรุณาตรวจสอบอีเมลเพื่อยืนยันบัญชี หากไม่พบให้กดส่งอีเมลอีกครั้ง')
        setCanResend(true)
      } else {
        window.location.assign('/dashboard')
      }
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'ไม่สามารถดำเนินการได้'
      setMessage(errorMessage)
      if (mode === 'sign-up' && /already registered|already exists|user already/i.test(errorMessage)) {
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
      options: { emailRedirectTo: `${window.location.origin}/auth/callback` },
    })
    setMessage(error ? error.message : 'ส่งอีเมลยืนยันอีกครั้งแล้ว กรุณาตรวจสอบ Inbox และ Spam')
    setResending(false)
  }

  return (
    <form className="form" onSubmit={submit}>
      <label>อีเมล<input type="email" required value={email} onChange={(event) => setEmail(event.target.value)} /></label>
      <label>รหัสผ่าน<input type="password" required minLength={6} value={password} onChange={(event) => setPassword(event.target.value)} /></label>
      {message && <div className={message.includes('สำเร็จ') || message.includes('ส่งอีเมล') ? 'countdown' : 'error'}>{message}</div>}
      {canResend && mode === 'sign-up' && <button type="button" className="button secondary" onClick={resendConfirmation} disabled={resending}>{resending ? 'กำลังส่ง…' : 'ส่งอีเมลยืนยันอีกครั้ง'}</button>}
      <button className="button" disabled={loading}>{loading ? 'กำลังดำเนินการ…' : mode === 'sign-in' ? 'เข้าสู่ระบบ' : 'สร้างบัญชี'}</button>
      <button type="button" className="button secondary" onClick={() => { setMode(mode === 'sign-in' ? 'sign-up' : 'sign-in'); setMessage(''); setCanResend(false) }}>
        {mode === 'sign-in' ? 'สร้างบัญชีใหม่' : 'มีบัญชีแล้ว เข้าสู่ระบบ'}
      </button>
    </form>
  )
}

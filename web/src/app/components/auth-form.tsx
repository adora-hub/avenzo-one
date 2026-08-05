'use client'

import { FormEvent, useState } from 'react'
import { createClient } from '@/lib/supabase/browser'

export function AuthForm() {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [mode, setMode] = useState<'sign-in' | 'sign-up'>('sign-in')
  const [message, setMessage] = useState('')
  const [loading, setLoading] = useState(false)

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setLoading(true)
    setMessage('')

    try {
      const supabase = createClient()
      const result = mode === 'sign-in'
        ? await supabase.auth.signInWithPassword({ email, password })
        : await supabase.auth.signUp({ email, password, options: { emailRedirectTo: `${window.location.origin}/auth/callback` } })

      if (result.error) throw result.error
      if (mode === 'sign-up') {
        setMessage('สมัครสำเร็จ กรุณาตรวจสอบอีเมลเพื่อยืนยันบัญชี')
      } else {
        window.location.assign('/dashboard')
      }
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'ไม่สามารถเข้าสู่ระบบได้')
    } finally {
      setLoading(false)
    }
  }

  return (
    <form className="form" onSubmit={submit}>
      <label>อีเมล<input type="email" required value={email} onChange={(event) => setEmail(event.target.value)} /></label>
      <label>รหัสผ่าน<input type="password" required minLength={6} value={password} onChange={(event) => setPassword(event.target.value)} /></label>
      {message && <div className={message.includes('สำเร็จ') ? 'countdown' : 'error'}>{message}</div>}
      <button className="button" disabled={loading}>{loading ? 'กำลังดำเนินการ…' : mode === 'sign-in' ? 'เข้าสู่ระบบ' : 'สร้างบัญชี'}</button>
      <button type="button" className="button secondary" onClick={() => { setMode(mode === 'sign-in' ? 'sign-up' : 'sign-in'); setMessage('') }}>
        {mode === 'sign-in' ? 'สร้างบัญชีใหม่' : 'มีบัญชีแล้ว เข้าสู่ระบบ'}
      </button>
    </form>
  )
}

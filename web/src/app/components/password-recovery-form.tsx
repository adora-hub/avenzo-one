'use client'

import { useEffect, useState } from 'react'
import { SetPasswordForm } from './set-password-form'
import { createClient } from '@/lib/supabase/browser'

type RecoveryState = 'loading' | 'ready' | 'invalid'

export function PasswordRecoveryForm() {
  const [state, setState] = useState<RecoveryState>('loading')
  const [email, setEmail] = useState<string | null>(null)

  useEffect(() => {
    let active = true

    async function prepareRecoverySession() {
      const supabase = createClient()
      const hash = new URLSearchParams(window.location.hash.replace(/^#/, ''))
      const query = new URLSearchParams(window.location.search)
      const accessToken = hash.get('access_token')
      const refreshToken = hash.get('refresh_token')
      const authType = hash.get('type')
      const recoveryError = hash.get('error') || hash.get('error_code') || query.get('error')

      if (recoveryError) {
        if (active) setState('invalid')
        return
      }

      if (accessToken && refreshToken) {
        if (authType && authType !== 'recovery') {
          if (active) setState('invalid')
          return
        }

        const { data, error } = await supabase.auth.setSession({
          access_token: accessToken,
          refresh_token: refreshToken,
        })
        if (error || !data.user) {
          if (active) setState('invalid')
          return
        }

        window.history.replaceState({}, document.title, '/auth/set-password')
        if (active) {
          setEmail(data.user.email ?? null)
          setState('ready')
        }
        return
      }

      const { data, error } = await supabase.auth.getUser()
      if (!active) return
      if (error || !data.user) {
        setState('invalid')
        return
      }

      setEmail(data.user.email ?? null)
      setState('ready')
    }

    void prepareRecoverySession()
    return () => { active = false }
  }, [])

  if (state === 'loading') {
    return <div className="countdown" role="status">กำลังตรวจสอบลิงก์ตั้งรหัสผ่าน…</div>
  }

  if (state === 'invalid') {
    return (
      <div className="form">
        <div className="error" role="alert">
          ลิงก์ตั้งรหัสผ่านไม่ถูกต้อง หมดอายุ หรือถูกใช้ไปแล้ว
        </div>
        <a className="button" href="/?forgot=1&recovery=expired">ขอลิงก์ตั้งรหัสผ่านใหม่</a>
        <a className="button secondary" href="/">กลับหน้าเข้าสู่ระบบ</a>
      </div>
    )
  }

  return (
    <>
      {email && <div className="countdown">กำลังตั้งรหัสผ่านสำหรับ {email}</div>}
      <SetPasswordForm />
    </>
  )
}

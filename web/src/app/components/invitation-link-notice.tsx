'use client'

import { useEffect, useState } from 'react'

export function InvitationLinkNotice() {
  const [message, setMessage] = useState('')

  useEffect(() => {
    const hash = new URLSearchParams(window.location.hash.replace(/^#/, ''))
    const errorCode = hash.get('error_code')

    if (errorCode === 'otp_expired') {
      setMessage('ลิงก์เข้าสู่ระบบในอีเมลถูกใช้ไปแล้วหรือหมดอายุ แต่สถานะคำเชิญด้านล่างยังตรวจสอบได้ตามปกติ')
      window.history.replaceState({}, document.title, window.location.pathname)
    }
  }, [])

  return message ? <div className="countdown">{message}</div> : null
}

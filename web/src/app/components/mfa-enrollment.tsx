'use client'

import { useEffect, useState } from 'react'
import type { FormEvent } from 'react'
import { getThaiAuthError } from '@/lib/auth-error-message'
import { createClient } from '@/lib/supabase/browser'

const factorFriendlyName = 'AVENZO ONE Platform Admin'

type EnrollmentDetails = {
  factorId: string
  qrCode: string
  secret: string
}

type EnrollmentStage = 'checking' | 'ready' | 'enrolling' | 'verify' | 'enabled' | 'complete'

export function MfaEnrollment() {
  const [stage, setStage] = useState<EnrollmentStage>('checking')
  const [enrollment, setEnrollment] = useState<EnrollmentDetails | null>(null)
  const [verificationCode, setVerificationCode] = useState('')
  const [message, setMessage] = useState('')
  const [messageTone, setMessageTone] = useState<'success' | 'error'>('error')

  useEffect(() => {
    let active = true

    async function checkFactors() {
      const { data, error } = await createClient().auth.mfa.listFactors()
      if (!active) return
      if (error) {
        setMessage(getThaiAuthError(error))
        setStage('ready')
        return
      }
      setStage(data.totp.length > 0 ? 'enabled' : 'ready')
    }

    void checkFactors()
    return () => { active = false }
  }, [])

  async function recordSecurityEvent(action: 'mfa_enrollment_started' | 'mfa_enrollment_verified') {
    return createClient().rpc('record_platform_security_event', {
      p_action: action,
      p_factor_type: 'totp',
    })
  }

  async function startEnrollment() {
    setStage('enrolling')
    setMessage('')
    setMessageTone('error')

    try {
      const supabase = createClient()
      const factors = await supabase.auth.mfa.listFactors()
      if (factors.error) throw factors.error
      if (factors.data.totp.length > 0) {
        setStage('enabled')
        return
      }

      const staleFactors = factors.data.all.filter((factor) => (
        factor.factor_type === 'totp'
        && factor.status === 'unverified'
        && factor.friendly_name === factorFriendlyName
      ))
      for (const factor of staleFactors) {
        const { error } = await supabase.auth.mfa.unenroll({ factorId: factor.id })
        if (error) throw error
      }

      const { data, error } = await supabase.auth.mfa.enroll({
        factorType: 'totp',
        friendlyName: factorFriendlyName,
        issuer: 'AVENZO ONE',
      })
      if (error) throw error

      setEnrollment({
        factorId: data.id,
        qrCode: data.totp.qr_code,
        secret: data.totp.secret,
      })
      setStage('verify')
      const auditResult = await recordSecurityEvent('mfa_enrollment_started')
      if (auditResult.error) {
        setMessage('เริ่มตั้งค่าได้แล้ว แต่ระบบบันทึก Audit Log ไม่สำเร็จ กรุณาแจ้งผู้ดูแลก่อนยืนยันรหัส')
      }
    } catch (error) {
      setMessage(getThaiAuthError(error))
      setStage('ready')
    }
  }

  async function verifyEnrollment(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!enrollment || verificationCode.length !== 6) return
    setMessage('')
    setMessageTone('error')

    try {
      const { error } = await createClient().auth.mfa.challengeAndVerify({
        factorId: enrollment.factorId,
        code: verificationCode,
      })
      if (error) throw error

      const auditResult = await recordSecurityEvent('mfa_enrollment_verified')
      setEnrollment(null)
      setVerificationCode('')
      setStage('complete')
      setMessageTone('success')
      setMessage(auditResult.error
        ? 'เปิด MFA สำเร็จแล้ว แต่ระบบบันทึก Audit Log ไม่สำเร็จ กรุณาแจ้งผู้ดูแลระบบ'
        : 'เปิด MFA สำหรับบัญชี Platform Admin สำเร็จแล้ว')
    } catch (error) {
      setMessage(getThaiAuthError(error))
    }
  }

  if (stage === 'checking') {
    return <div className="empty" role="status">กำลังตรวจสอบสถานะ MFA…</div>
  }

  if (stage === 'enabled' || stage === 'complete') {
    return (
      <div className="mfa-status-card">
        <span className="status active">เปิดใช้งานแล้ว</span>
        <h2>บัญชีนี้มี TOTP MFA</h2>
        <p>Authenticator ถูกลงทะเบียนแล้ว ขั้นตอนบังคับกรอกรหัสหลัง Login จะพัฒนาใน Phase 0.10.2</p>
        {message ? <div className={messageTone === 'success' ? 'countdown' : 'error'}>{message}</div> : null}
      </div>
    )
  }

  if (stage === 'verify' && enrollment) {
    return (
      <div className="mfa-enrollment-grid">
        <section className="card mfa-qr-section">
          <div className="eyebrow">ขั้นตอนที่ 1</div>
          <h2>สแกน QR Code</h2>
          <p>เปิด Google Authenticator, Microsoft Authenticator, 1Password หรือ Authy แล้วเพิ่มบัญชีใหม่</p>
          <div className="mfa-qr-frame">
            {/* Runtime-generated Supabase SVG data URLs are intentionally rendered by the browser. */}
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={enrollment.qrCode} alt="QR Code สำหรับลงทะเบียน TOTP ของ AVENZO ONE" width={240} height={240} />
          </div>
          <details className="mfa-secret">
            <summary>สแกนไม่ได้? แสดงรหัสสำหรับกรอกเอง</summary>
            <code>{enrollment.secret}</code>
            <p>เก็บรหัสนี้เป็นความลับ ห้ามส่งให้บุคคลอื่นหรือบันทึกในแชต</p>
          </details>
        </section>

        <form className="card form mfa-verify-form" onSubmit={verifyEnrollment}>
          <div className="eyebrow">ขั้นตอนที่ 2</div>
          <h2>ยืนยันรหัส 6 หลัก</h2>
          <p>กรอกรหัสปัจจุบันที่แสดงอยู่ในแอป Authenticator</p>
          <label>
            รหัสยืนยัน
            <input
              value={verificationCode}
              onChange={(event) => setVerificationCode(event.target.value.replace(/\D/g, '').slice(0, 6))}
              inputMode="numeric"
              autoComplete="one-time-code"
              pattern="[0-9]{6}"
              minLength={6}
              maxLength={6}
              placeholder="000000"
              required
            />
          </label>
          {message ? <div className="error">{message}</div> : null}
          <button className="button" disabled={verificationCode.length !== 6}>ยืนยันและเปิด MFA</button>
          <div className="mfa-security-note">เมื่อยืนยันสำเร็จ Session อื่นของบัญชีนี้จะออกจากระบบเพื่อความปลอดภัย</div>
        </form>
      </div>
    )
  }

  return (
    <div className="mfa-intro card">
      <span className="status pending">ยังไม่ได้เปิด</span>
      <h2>เพิ่ม Authenticator ให้บัญชีนี้</h2>
      <p>หลังจากเริ่ม ระบบจะแสดง QR Code ให้สแกนด้วยโทรศัพท์ และให้กรอกรหัส 6 หลักเพื่อยืนยัน</p>
      <ul className="permission-list">
        <li>ไม่มีค่า SMS และไม่ต้องรออีเมล</li>
        <li>QR Code และ Secret จะแสดงเฉพาะระหว่างตั้งค่า</li>
        <li>ยังไม่บังคับถามรหัสหลัง Login จนกว่าจะทำ Phase 0.10.2</li>
      </ul>
      {message ? <div className="error">{message}</div> : null}
      <button className="button" onClick={startEnrollment} disabled={stage === 'enrolling'}>
        {stage === 'enrolling' ? 'กำลังสร้าง QR Code…' : 'เริ่มตั้งค่า TOTP MFA'}
      </button>
    </div>
  )
}

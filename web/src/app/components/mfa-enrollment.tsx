'use client'

import { useEffect, useState } from 'react'
import type { FormEvent } from 'react'
import type { Factor } from '@supabase/supabase-js'
import { getThaiAuthError } from '@/lib/auth-error-message'
import { createClient } from '@/lib/supabase/browser'

const maxVerifiedFactors = 2
const removeConfirmation = 'REMOVE'

type EnrollmentDetails = {
  factorId: string
  qrCode: string
  secret: string
}

type SecurityEvent =
  | 'mfa_enrollment_started'
  | 'mfa_enrollment_verified'
  | 'mfa_factor_unenrolled'
  | 'mfa_other_sessions_revoked'
  | 'mfa_preferred_factor_changed'

type EnrollmentStage = 'checking' | 'ready' | 'enrolling' | 'verify' | 'enabled'

function displayFactorName(factor: Factor<'totp', 'verified'>, index: number) {
  return factor.friendly_name?.trim() || `Authenticator เครื่องที่ ${index + 1}`
}

function displayCreatedAt(value: string) {
  return new Intl.DateTimeFormat('th-TH', {
    dateStyle: 'medium',
    timeStyle: 'short',
    timeZone: 'Asia/Bangkok',
  }).format(new Date(value))
}

function sortFactors(factors: Factor<'totp', 'verified'>[], preferredFactorId: string | null) {
  return [...factors].sort((left, right) => left.id === preferredFactorId ? -1 : right.id === preferredFactorId ? 1 : 0)
}

export function MfaEnrollment() {
  const [stage, setStage] = useState<EnrollmentStage>('checking')
  const [verifiedFactors, setVerifiedFactors] = useState<Factor<'totp', 'verified'>[]>([])
  const [preferredFactorId, setPreferredFactorId] = useState<string | null>(null)
  const [enrollment, setEnrollment] = useState<EnrollmentDetails | null>(null)
  const [factorName, setFactorName] = useState('')
  const [verificationCode, setVerificationCode] = useState('')
  const [removeFactorId, setRemoveFactorId] = useState<string | null>(null)
  const [removeText, setRemoveText] = useState('')
  const [busyFactorId, setBusyFactorId] = useState<string | null>(null)
  const [message, setMessage] = useState('')
  const [messageTone, setMessageTone] = useState<'success' | 'error'>('error')

  async function loadFactors() {
    const supabase = createClient()
    const [factors, preference] = await Promise.all([
      supabase.auth.mfa.listFactors(),
      supabase.from('platform_mfa_preferences').select('preferred_factor_id').maybeSingle(),
    ])
    if (factors.error) throw factors.error
    if (preference.error) throw preference.error
    const preferredId = preference.data?.preferred_factor_id ?? null
    const sortedFactors = sortFactors(factors.data.totp, preferredId)
    setPreferredFactorId(preferredId)
    setVerifiedFactors(sortedFactors)
    setFactorName(sortedFactors.length === 0 ? 'เครื่องหลัก' : 'เครื่องสำรอง')
    setStage(sortedFactors.length > 0 ? 'enabled' : 'ready')
    return sortedFactors
  }

  useEffect(() => {
    let active = true

    async function checkFactors() {
      try {
        const supabase = createClient()
        const [{ data, error }, preference] = await Promise.all([
          supabase.auth.mfa.listFactors(),
          supabase.from('platform_mfa_preferences').select('preferred_factor_id').maybeSingle(),
        ])
        if (!active) return
        if (error) throw error
        if (preference.error) throw preference.error
        const preferredId = preference.data?.preferred_factor_id ?? null
        const sortedFactors = sortFactors(data.totp, preferredId)
        setPreferredFactorId(preferredId)
        setVerifiedFactors(sortedFactors)
        setFactorName(sortedFactors.length === 0 ? 'เครื่องหลัก' : 'เครื่องสำรอง')
        setStage(sortedFactors.length > 0 ? 'enabled' : 'ready')
      } catch (error) {
        if (!active) return
        setMessage(getThaiAuthError(error))
        setStage('ready')
      }
    }

    void checkFactors()
    return () => { active = false }
  }, [])

  async function recordSecurityEvent(action: SecurityEvent) {
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
      if (factors.data.totp.length >= maxVerifiedFactors) {
        setVerifiedFactors(factors.data.totp)
        setMessage('บัญชีนี้มี Authenticator ครบ 2 เครื่องแล้ว กรุณาถอดเครื่องเดิมก่อนเพิ่มเครื่องใหม่')
        setStage('enabled')
        return
      }

      for (const factor of factors.data.all.filter((item) => item.factor_type === 'totp' && item.status === 'unverified')) {
        const { error } = await supabase.auth.mfa.unenroll({ factorId: factor.id })
        if (error) throw error
      }

      const friendlyName = factorName.trim() || (factors.data.totp.length === 0 ? 'เครื่องหลัก' : 'เครื่องสำรอง')
      const { data, error } = await supabase.auth.mfa.enroll({ factorType: 'totp', friendlyName, issuer: 'AVENZO ONE' })
      if (error) throw error

      setEnrollment({ factorId: data.id, qrCode: data.totp.qr_code, secret: data.totp.secret })
      setStage('verify')
      const auditResult = await recordSecurityEvent('mfa_enrollment_started')
      if (auditResult.error) setMessage('เริ่มตั้งค่าได้แล้ว แต่ระบบบันทึก Audit Log ไม่สำเร็จ กรุณาแจ้งผู้ดูแลก่อนยืนยันรหัส')
    } catch (error) {
      setMessage(getThaiAuthError(error))
      setStage(verifiedFactors.length > 0 ? 'enabled' : 'ready')
    }
  }

  async function verifyEnrollment(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!enrollment || verificationCode.length !== 6) return
    setMessage('')
    setMessageTone('error')

    try {
      const { error } = await createClient().auth.mfa.challengeAndVerify({ factorId: enrollment.factorId, code: verificationCode })
      if (error) throw error

      const auditResult = await recordSecurityEvent('mfa_enrollment_verified')
      setEnrollment(null)
      setVerificationCode('')
      await loadFactors()
      setMessageTone('success')
      setMessage(auditResult.error
        ? 'เพิ่ม Authenticator สำเร็จแล้ว แต่ระบบบันทึก Audit Log ไม่สำเร็จ กรุณาแจ้งผู้ดูแลระบบ'
        : 'เพิ่ม Authenticator สำเร็จแล้ว Session อื่นของบัญชีนี้ถูกยกเลิกอัตโนมัติ')
    } catch (error) {
      setMessage(getThaiAuthError(error))
    }
  }

  async function removeFactor(factorId: string) {
    if (verifiedFactors.length <= 1 || removeText !== removeConfirmation) return
    setBusyFactorId(factorId)
    setMessage('')
    setMessageTone('error')

    try {
      const supabase = createClient()
      const assurance = await supabase.auth.mfa.getAuthenticatorAssuranceLevel()
      if (assurance.error) throw assurance.error
      if (assurance.data.currentLevel !== 'aal2') {
        window.location.assign('/auth/mfa?next=/platform-admin/security/mfa')
        return
      }

      const signOutResult = await supabase.auth.signOut({ scope: 'others' })
      if (signOutResult.error) throw signOutResult.error
      const sessionAudit = await recordSecurityEvent('mfa_other_sessions_revoked')
      if (sessionAudit.error) console.error('[mfa-recovery] session revocation audit failed', { message: sessionAudit.error.message })

      const { error } = await supabase.auth.mfa.unenroll({ factorId })
      if (error) throw error
      const removalAudit = await recordSecurityEvent('mfa_factor_unenrolled')
      if (removalAudit.error) console.error('[mfa-recovery] factor removal audit failed', { message: removalAudit.error.message })

      if (factorId === preferredFactorId) {
        const remainingFactor = verifiedFactors.find((factor) => factor.id !== factorId)
        if (remainingFactor) {
          const preferenceResult = await supabase.rpc('set_platform_mfa_preferred_factor', { p_factor_id: remainingFactor.id })
          if (preferenceResult.error) throw preferenceResult.error
        }
      }

      const refreshResult = await supabase.auth.refreshSession()
      if (refreshResult.error) throw refreshResult.error
      window.location.assign('/auth/mfa?next=/platform-admin/security/mfa')
    } catch (error) {
      setMessage(getThaiAuthError(error))
      setBusyFactorId(null)
    }
  }

  async function setPreferredFactor(factorId: string) {
    setBusyFactorId(factorId)
    setMessage('')
    setMessageTone('error')
    try {
      const { error } = await createClient().rpc('set_platform_mfa_preferred_factor', { p_factor_id: factorId })
      if (error) throw error
      setPreferredFactorId(factorId)
      setVerifiedFactors((current) => sortFactors(current, factorId))
      setMessageTone('success')
      setMessage('เปลี่ยนเครื่องหลักสำเร็จ ระบบจะเลือกเครื่องนี้เป็นค่าเริ่มต้นตอน Login ครั้งถัดไป')
    } catch (error) {
      setMessage(getThaiAuthError(error))
    } finally {
      setBusyFactorId(null)
    }
  }

  if (stage === 'checking') return <div className="empty" role="status">กำลังตรวจสอบสถานะ MFA…</div>

  if (stage === 'enabled' || stage === 'enrolling') {
    const canAddFactor = verifiedFactors.length < maxVerifiedFactors
    return (
      <div className="mfa-management">
        <section className="mfa-status-card">
          <span className="status active">เปิดใช้งานแล้ว</span>
          <h2>Authenticator ของบัญชีนี้</h2>
          <p>เพิ่มเครื่องสำรองไว้กู้คืนบัญชีเมื่อโทรศัพท์หลักสูญหาย และเลือกใช้เครื่องใดก็ได้ตอน Login</p>
          <div className="mfa-factor-list">
            {verifiedFactors.map((factor, index) => {
              const isPreferred = factor.id === preferredFactorId || (!preferredFactorId && index === 0)
              return (
              <article className="mfa-factor-item" key={factor.id}>
                <div>
                  <div className="mfa-factor-title"><strong>{displayFactorName(factor, index)}</strong><span className={`mfa-factor-role ${isPreferred ? 'primary' : ''}`}>{isPreferred ? 'เครื่องหลัก · ลำดับ 1' : 'เครื่องสำรอง · ลำดับ 2'}</span></div>
                  <span>เพิ่มเมื่อ {displayCreatedAt(factor.created_at)} · ยืนยันแล้ว</span>
                </div>
                <div className="mfa-factor-actions">{!isPreferred ? <button className="button secondary" type="button" disabled={busyFactorId !== null} onClick={() => void setPreferredFactor(factor.id)}>ตั้งเป็นเครื่องหลัก</button> : null}<button className="button danger" type="button" disabled={verifiedFactors.length <= 1 || busyFactorId !== null} onClick={() => {
                  setRemoveFactorId(factor.id)
                  setRemoveText('')
                  setMessage('')
                }}>ถอดอุปกรณ์</button></div>
              </article>
            )})}
          </div>
          {verifiedFactors.length <= 1 ? <div className="mfa-security-note">ต้องเพิ่ม Authenticator สำรองก่อน จึงจะถอดเครื่องปัจจุบันได้</div> : null}
        </section>

        {removeFactorId ? (
          <section className="card mfa-remove-card">
            <div className="eyebrow">ยืนยันการถอดอุปกรณ์</div>
            <h2>การดำเนินการด้านความปลอดภัย</h2>
            <p>ระบบจะยกเลิก Session อื่นทั้งหมดก่อนถอดอุปกรณ์ แล้วให้ยืนยันรหัสจากเครื่องที่เหลืออีกครั้ง</p>
            <label>พิมพ์ REMOVE เพื่อยืนยัน
              <input value={removeText} onChange={(event) => setRemoveText(event.target.value.toUpperCase())} autoComplete="off" />
            </label>
            <div className="mfa-action-row">
              <button className="button danger" type="button" disabled={removeText !== removeConfirmation || busyFactorId !== null} onClick={() => void removeFactor(removeFactorId)}>
                {busyFactorId ? 'กำลังถอดและยกเลิก Session…' : 'ยืนยันถอดอุปกรณ์'}
              </button>
              <button className="button secondary" type="button" disabled={busyFactorId !== null} onClick={() => setRemoveFactorId(null)}>ยกเลิก</button>
            </div>
          </section>
        ) : null}

        {canAddFactor ? (
          <section className="card mfa-add-card">
            <div><div className="eyebrow">Backup & Recovery</div><h2>เพิ่ม Authenticator สำรอง</h2><p>ใช้โทรศัพท์อีกเครื่องหรือแอป Authenticator อีกชุดหนึ่ง และตั้งชื่อให้จำได้ว่าอยู่ที่ใด</p></div>
            <label>ชื่ออุปกรณ์
              <input value={factorName} onChange={(event) => setFactorName(event.target.value.slice(0, 50))} placeholder="เช่น iPhone เครื่องสำรอง" />
            </label>
            <button className="button" type="button" onClick={startEnrollment} disabled={stage === 'enrolling' || !factorName.trim()}>
              {stage === 'enrolling' ? 'กำลังสร้าง QR Code…' : 'เพิ่ม Authenticator สำรอง'}
            </button>
          </section>
        ) : <div className="empty">มี Authenticator ครบ 2 เครื่องตามนโยบายแล้ว</div>}
        {message ? <div className={messageTone === 'success' ? 'countdown' : 'error'} role="status">{message}</div> : null}
      </div>
    )
  }

  if (stage === 'verify' && enrollment) {
    return (
      <div className="mfa-enrollment-grid">
        <section className="card mfa-qr-section">
          <div className="eyebrow">ขั้นตอนที่ 1</div><h2>สแกน QR Code</h2>
          <p>เปิด Google Authenticator, Microsoft Authenticator, 1Password หรือ Authy แล้วเพิ่มบัญชีใหม่</p>
          <div className="mfa-qr-frame">
            {/* Runtime-generated Supabase SVG data URLs are intentionally rendered by the browser. */}
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={enrollment.qrCode} alt="QR Code สำหรับลงทะเบียน TOTP ของ AVENZO ONE" width={240} height={240} />
          </div>
          <details className="mfa-secret"><summary>สแกนไม่ได้? แสดงรหัสสำหรับกรอกเอง</summary><code>{enrollment.secret}</code><p>เก็บรหัสนี้เป็นความลับ ห้ามส่งให้บุคคลอื่นหรือบันทึกในแชต</p></details>
        </section>

        <form className="card form mfa-verify-form" onSubmit={verifyEnrollment}>
          <div className="eyebrow">ขั้นตอนที่ 2</div><h2>ยืนยันรหัส 6 หลัก</h2><p>กรอกรหัสปัจจุบันที่แสดงอยู่ในแอป Authenticator เครื่องใหม่</p>
          <label>รหัสยืนยัน
            <input value={verificationCode} onChange={(event) => setVerificationCode(event.target.value.replace(/\D/g, '').slice(0, 6))} inputMode="numeric" autoComplete="one-time-code" pattern="[0-9]{6}" minLength={6} maxLength={6} placeholder="000000" required />
          </label>
          {message ? <div className="error">{message}</div> : null}
          <button className="button" disabled={verificationCode.length !== 6}>ยืนยันและเพิ่ม Authenticator</button>
          <div className="mfa-security-note">เมื่อยืนยันสำเร็จ Supabase จะยกเลิก Session อื่นของบัญชีนี้อัตโนมัติ</div>
        </form>
      </div>
    )
  }

  return (
    <div className="mfa-intro card">
      <span className="status pending">ยังไม่ได้เปิด</span><h2>เพิ่ม Authenticator ให้บัญชีนี้</h2>
      <p>หลังจากเริ่ม ระบบจะแสดง QR Code ให้สแกนด้วยโทรศัพท์ และให้กรอกรหัส 6 หลักเพื่อยืนยัน</p>
      <ul className="permission-list"><li>ไม่มีค่า SMS และไม่ต้องรออีเมล</li><li>QR Code และ Secret จะแสดงเฉพาะระหว่างตั้งค่า</li><li>เมื่อเปิดแล้ว Platform Admin ต้องใช้รหัส 6 หลักหลัง Login</li></ul>
      <label>ชื่ออุปกรณ์
        <input value={factorName} onChange={(event) => setFactorName(event.target.value.slice(0, 50))} placeholder="เช่น iPhone เครื่องหลัก" />
      </label>
      {message ? <div className="error">{message}</div> : null}
      <button className="button" onClick={startEnrollment} disabled={!factorName.trim()}>เริ่มตั้งค่า TOTP MFA</button>
    </div>
  )
}

'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/browser'

export type TransferApprovalPolicy = {
  policy_key: string
  currency: string
  single_admin_limit: number
  require_two_person_on_risk: boolean
  version: number
  updated_by_email: string | null
  updated_at: string
}

function money(value: number) {
  return new Intl.NumberFormat('th-TH', { style: 'currency', currency: 'THB', minimumFractionDigits: 2 }).format(value)
}

function policyError(error: unknown) {
  const raw = error instanceof Error ? error.message : String((error as { message?: string } | null)?.message ?? error ?? '')
  if (raw.includes('approval_policy_version_conflict')) return 'นโยบายถูกแก้ไขจากอีกหน้าจอ กรุณาโหลดหน้าใหม่แล้วตรวจสอบอีกครั้ง'
  if (raw.includes('platform_super_admin_aal2_required')) return 'เฉพาะ Super Admin ที่ยืนยัน MFA แล้วเท่านั้นที่แก้นโยบายได้'
  if (raw.includes('single_admin_limit_invalid')) return 'วงเงินต้องอยู่ระหว่าง 0 ถึง 100,000,000 บาท'
  if (raw.includes('approval_policy_reason_invalid')) return 'กรุณาระบุเหตุผลอย่างน้อย 10 ตัวอักษร'
  return 'บันทึกนโยบายไม่สำเร็จ ระบบไม่ได้เปลี่ยนการตั้งค่า'
}

export function BillingTransferApprovalPolicy({ initialPolicy, canEdit }: { initialPolicy: TransferApprovalPolicy; canEdit: boolean }) {
  const router = useRouter()
  const [policy, setPolicy] = useState(initialPolicy)
  const [limit, setLimit] = useState(String(initialPolicy.single_admin_limit))
  const [riskRule, setRiskRule] = useState(initialPolicy.require_two_person_on_risk)
  const [reason, setReason] = useState('')
  const [reviewing, setReviewing] = useState(false)
  const [loading, setLoading] = useState(false)
  const [message, setMessage] = useState('')
  const parsedLimit = Number(limit)
  const validLimit = Number.isFinite(parsedLimit) && parsedLimit >= 0 && parsedLimit <= 100000000
  const changed = validLimit && (parsedLimit !== policy.single_admin_limit || riskRule !== policy.require_two_person_on_risk)

  async function savePolicy() {
    if (!changed || reason.trim().length < 10) return
    setLoading(true)
    setMessage('')
    const { error } = await createClient().rpc('platform_update_billing_transfer_approval_policy', {
      p_single_admin_limit: parsedLimit,
      p_require_two_person_on_risk: riskRule,
      p_reason: reason.trim(),
      p_command_id: crypto.randomUUID(),
      p_expected_version: policy.version,
    })
    if (error) {
      setMessage(policyError(error))
      setLoading(false)
      return
    }
    setPolicy((current) => ({
      ...current,
      single_admin_limit: parsedLimit,
      require_two_person_on_risk: riskRule,
      version: current.version + 1,
      updated_at: new Date().toISOString(),
    }))
    setReviewing(false)
    setReason('')
    setMessage('บันทึกนโยบายสำเร็จและสร้าง Audit Log แล้ว')
    setLoading(false)
    router.refresh()
  }

  return <section className="subscription-management-section" id="transfer-approval-policy">
    <div className="feature-list-heading"><div><div className="eyebrow">PHASE 1.1.3.8.5.1 · APPROVAL POLICY</div><div className="inline-title-row"><span className="status pending">ตั้งค่านโยบาย</span><h2>วงเงินอนุมัติรายการโอน</h2></div><p>กำหนดว่ารายการใดให้ผู้ดูแลคนเดียวจัดการได้ และรายการใดต้องใช้ผู้ดูแลสองคน</p></div><span className="feature-count">Version {policy.version}</span></div>
    <div className="safety-note"><strong>ยังไม่เปลี่ยนขั้นตอนรับชำระใน Phase นี้</strong><p>ระบบจะเริ่มบังคับใช้นโยบายนี้ใน Phase 1.1.3.8.5.2 หลังทดสอบหน้าตั้งค่าผ่านแล้ว</p></div>
    {message && <div className={message.startsWith('บันทึก') ? 'success' : 'error'} role="status">{message}</div>}
    <div className="approval-policy-layout">
      <div className="card approval-policy-form">
        <label className="field-stack"><span>วงเงินสูงสุดที่อนุมัติคนเดียวได้ (บาท)</span><input type="number" min="0" max="100000000" step="0.01" value={limit} disabled={!canEdit || loading} onChange={(event) => { setLimit(event.target.value); setReviewing(false) }} /><small>ตัวอย่าง 5,000 หมายถึงยอดไม่เกิน 5,000 บาท ใช้ผู้ดูแล 1 คนได้</small></label>
        <label className="remember-row approval-policy-check"><input type="checkbox" checked={riskRule} disabled={!canEdit || loading} onChange={(event) => { setRiskRule(event.target.checked); setReviewing(false) }} /><span>รายการที่มีสัญญาณเสี่ยงต้องใช้ผู้ดูแล 2 คนเสมอ</span></label>
        <label className="field-stack"><span>เหตุผลสำหรับ Audit Log</span><textarea value={reason} maxLength={2000} disabled={!canEdit || loading} placeholder="เช่น กำหนดวงเงินอนุมัติให้เหมาะกับการปฏิบัติงานจริง" onChange={(event) => { setReason(event.target.value); setReviewing(false) }} /></label>
        {!canEdit && <div className="info-message">บัญชี Platform Admin ดูนโยบายได้ แต่ต้องให้ Super Admin เป็นผู้แก้ไข</div>}
        {canEdit && <button className="button primary" type="button" disabled={!changed || !validLimit || reason.trim().length < 10 || loading} onClick={() => { setReviewing(true); requestAnimationFrame(() => document.getElementById('approval-policy-confirmation')?.scrollIntoView({ behavior: 'smooth', block: 'center' })) }}>ตรวจสอบก่อนบันทึก</button>}
      </div>
      <div className="card approval-policy-preview"><div className="eyebrow">ภาษาที่ใช้ในการทำงาน</div><h3>นโยบายที่ระบบจะแสดง</h3><div className="approval-policy-rule"><span className="status active">ผู้ดูแล 1 คน</span><strong>ยอดไม่เกิน {validLimit ? money(parsedLimit) : '—'}</strong><p>เมื่อไม่มีสัญญาณเสี่ยง สามารถตรวจหลักฐานและยืนยันรับชำระได้โดยผู้ดูแลคนเดียว</p></div><div className="approval-policy-rule"><span className="status suspended">ผู้ดูแล 2 คน</span><strong>ยอดมากกว่า {validLimit ? money(parsedLimit) : '—'}</strong><p>ผู้ตรวจหลักฐานและผู้ยืนยันรับชำระต้องเป็นคนละบัญชี</p></div>{riskRule && <div className="approval-policy-rule"><span className="status pending">รายการเสี่ยง</span><strong>ต้องใช้ผู้ดูแล 2 คนเสมอ</strong><p>กติกาความเสี่ยงมีสิทธิ์เข้มกว่าวงเงินปกติ</p></div>}</div>
    </div>
    {reviewing && <section className="confirmation-card" id="approval-policy-confirmation"><div className="confirmation-card-heading"><div><div className="eyebrow">ตรวจสอบครั้งสุดท้าย</div><h2>ยืนยันบันทึกนโยบาย</h2></div><span className="status pending">ยังไม่บันทึก</span></div><dl className="subscription-overview-grid"><div><dt>อนุมัติคนเดียวได้สูงสุด</dt><dd>{money(parsedLimit)}</dd></div><div><dt>รายการเกินวงเงิน</dt><dd>ต้องใช้ Platform Admin 2 คน</dd></div><div><dt>รายการมีความเสี่ยง</dt><dd>{riskRule ? 'ต้องใช้ 2 คนเสมอ' : 'พิจารณาตามวงเงิน'}</dd></div><div><dt>เหตุผล</dt><dd>{reason.trim()}</dd></div></dl><div className="button-row"><button className="button secondary" type="button" disabled={loading} onClick={() => setReviewing(false)}>ย้อนกลับแก้ไข</button><button className="button primary" type="button" disabled={loading} onClick={savePolicy}>{loading ? 'กำลังบันทึก…' : 'ยืนยันบันทึกนโยบาย'}</button></div></section>}
  </section>
}

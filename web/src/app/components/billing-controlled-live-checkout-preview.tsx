'use client'

import { useState } from 'react'
import type {
  BillingLiveActivationRequest,
  BillingLiveRolloutPolicy,
  BillingLiveSafetyControl,
  BillingLiveTester,
} from '@/lib/billing/live-safety'

type Props = {
  control: BillingLiveSafetyControl
  policy: BillingLiveRolloutPolicy
  testers: BillingLiveTester[]
  latestApprovedRequest: BillingLiveActivationRequest | null
  productionReadinessComplete: boolean
  environmentLocked: boolean
  liveCredentialsConfigured: boolean
  serverNow: string
}

function money(value: number) {
  return new Intl.NumberFormat('th-TH', {
    style: 'currency',
    currency: 'THB',
    minimumFractionDigits: 2,
  }).format(value)
}

export function BillingControlledLiveCheckoutPreview({
  control,
  policy,
  testers,
  latestApprovedRequest,
  productionReadinessComplete,
  environmentLocked,
  liveCredentialsConfigured,
  serverNow,
}: Props) {
  const activeTesters = testers.filter((tester) => tester.active)
  const [testerEmail, setTesterEmail] = useState(activeTesters[0]?.email ?? '')
  const [amount, setAmount] = useState('')
  const [reference, setReference] = useState('')
  const [reviewed, setReviewed] = useState(false)

  const amountNumber = Number(amount)
  const approvalValid = Boolean(
    latestApprovedRequest
      && latestApprovedRequest.status === 'approved'
      && new Date(latestApprovedRequest.expires_at).getTime() > new Date(serverNow).getTime()
      && latestApprovedRequest.policy_version === policy.version
      && Number(latestApprovedRequest.max_amount_per_charge) === Number(policy.max_amount_per_charge)
      && Number(latestApprovedRequest.max_total_amount) === Number(policy.max_total_amount)
      && latestApprovedRequest.max_successful_charges === policy.max_successful_charges,
  )
  const testerAllowed = activeTesters.some((tester) => tester.email === testerEmail)
  const amountValid = Number.isFinite(amountNumber) && amountNumber > 0
  const amountWithinLimit = amountValid && amountNumber <= Number(policy.max_amount_per_charge)
  const referenceValid = reference.trim().length >= 10

  const checks = [
    { label: 'ผ่านการตรวจความพร้อม Production', passed: productionReadinessComplete, detail: 'รายการตรวจสอบด้วยคนต้องมีสถานะครบถ้วน' },
    { label: 'อนุมัติร่วมกัน 2 คนยังใช้ได้', passed: approvalValid, detail: 'คำอนุมัติต้องไม่หมดอายุและตรงกับ Policy เวอร์ชันปัจจุบัน' },
    { label: 'บัญชีผู้ทดสอบอยู่ในรายชื่ออนุญาต', passed: testerAllowed, detail: testerEmail || 'ยังไม่มีผู้ทดสอบที่เปิดใช้งาน' },
    { label: 'ยอดเงินอยู่ในวงเงินต่อครั้ง', passed: amountWithinLimit, detail: `สูงสุด ${money(Number(policy.max_amount_per_charge))}` },
    { label: 'มีรหัสอ้างอิงการทดสอบ', passed: referenceValid, detail: 'อย่างน้อย 10 ตัวอักษร เพื่อให้ตามรอยการทดสอบได้' },
    { label: 'Live Credentials ฝั่ง Server พร้อม', passed: liveCredentialsConfigured, detail: 'แสดงเฉพาะสถานะ ไม่ส่ง Secret มาที่ Browser' },
    { label: 'Environment Lock ยังทำงาน', passed: environmentLocked, detail: 'Phase นี้ต้องยังไม่อนุญาตการรับเงินจริง' },
    { label: 'Emergency Stop ยังทำงาน', passed: control.emergency_stop === true, detail: 'การรับเงินจริงต้องถูกบังคับหยุดตลอดการทดสอบ UI' },
  ]
  const allChecksPassed = checks.every((check) => check.passed)

  function resetReview() {
    if (reviewed) setReviewed(false)
  }

  return <section className="readiness-review-card controlled-checkout-card">
    <div className="feature-list-heading">
      <div>
        <div className="eyebrow">Phase 1.1.3.7.5.1 · Controlled Live Checkout UI</div>
        <h2>ทดลองตรวจ Checkout แบบควบคุม</h2>
        <p>ตรวจผู้ทดสอบ วงเงิน คำอนุมัติ และ Safety Lock ก่อนเข้าสู่ขั้นพัฒนาฝั่ง Server</p>
      </div>
      <span className="status pending">UI จำลอง · ไม่รับเงินจริง</span>
    </div>

    <div className="controlled-checkout-warning" role="note">
      <strong>หน้านี้ไม่สร้าง Checkout Session หรือ Payment Intent</strong>
      <span>ไม่มีการบันทึกรายการชำระเงิน ไม่มีการเรียก Stripe Live API และไม่มีเงินจริงเคลื่อนย้าย</span>
    </div>

    <div className="controlled-checkout-form">
      <label>บัญชีผู้ทดสอบ
        <select value={testerEmail} onChange={(event) => { setTesterEmail(event.target.value); resetReview() }} disabled={!activeTesters.length}>
          {!activeTesters.length ? <option value="">ยังไม่มีผู้ทดสอบที่เปิดใช้งาน</option> : null}
          {activeTesters.map((tester) => <option key={tester.id} value={tester.email}>{tester.email}</option>)}
        </select>
      </label>
      <label>ยอดทดสอบ (บาท)
        <input type="number" min="0.01" step="0.01" value={amount} onChange={(event) => { setAmount(event.target.value); resetReview() }} placeholder={`ไม่เกิน ${Number(policy.max_amount_per_charge).toLocaleString('th-TH')} บาท`} />
      </label>
      <label className="controlled-checkout-reference">รหัสอ้างอิง / เหตุผลการทดสอบ
        <input value={reference} maxLength={120} onChange={(event) => { setReference(event.target.value); resetReview() }} placeholder="เช่น LIVE-PILOT-TEST-001" />
      </label>
    </div>

    <div className="readiness-check-grid">
      {checks.map((check) => <article className={`readiness-check ${check.passed ? 'passed' : 'failed'}`} key={check.label}>
        <span aria-hidden="true">{check.passed ? '✓' : '!'}</span>
        <div><strong>{check.label}</strong><p>{check.detail}</p></div>
      </article>)}
    </div>

    <div className="button-row">
      <button className="button" type="button" disabled={!testerEmail || !amount || !reference.trim()} onClick={() => setReviewed(true)}>ตรวจสอบ Checkout แบบจำลอง</button>
    </div>

    {reviewed ? <section className="subscription-confirmation controlled-checkout-review">
      <div className="subscription-confirmation-heading">
        <div><span className="eyebrow">ตรวจสอบครั้งสุดท้าย</span><h3>สรุป Controlled Checkout</h3></div>
        <span className={`status ${allChecksPassed ? 'active' : 'suspended'}`}>{allChecksPassed ? 'ผ่านเงื่อนไข UI' : 'ยังไม่ผ่าน'}</span>
      </div>
      <dl className="live-safety-state-grid">
        <div><dt>ผู้ทดสอบ</dt><dd>{testerEmail || '—'}</dd></div>
        <div><dt>ยอดทดสอบ</dt><dd>{amountValid ? money(amountNumber) : 'ยอดไม่ถูกต้อง'}</dd></div>
        <div><dt>Policy</dt><dd>Version {policy.version}</dd></div>
        <div><dt>รหัสอ้างอิง</dt><dd>{reference.trim() || '—'}</dd></div>
      </dl>
      {!allChecksPassed ? <div className="error" role="status">ยังมีเงื่อนไขที่ไม่ผ่าน กรุณาดูรายการเครื่องหมาย ! ด้านบน</div> : <div className="success" role="status">ข้อมูลแบบจำลองผ่านกติกา UI แล้ว แต่ยังไม่อนุญาตให้รับเงินจริง</div>}
      <div className="button-row">
        <button className="button secondary" type="button" onClick={() => setReviewed(false)}>ย้อนกลับแก้ไข</button>
        <button className="button" type="button" disabled>สร้าง Live Checkout — ยังล็อก</button>
      </div>
    </section> : null}
  </section>
}

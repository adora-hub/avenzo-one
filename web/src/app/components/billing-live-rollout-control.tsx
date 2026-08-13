'use client'

import { useEffect, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import type { BillingLiveRolloutEvaluation, BillingLiveRolloutPolicy, BillingLiveTester } from '@/lib/billing/live-safety'
import { createClient } from '@/lib/supabase/browser'

type ReviewAction = 'policy' | 'tester' | 'rollback' | null

function errorMessage(error: unknown) {
  const raw = error instanceof Error ? error.message : ''
  if (raw.includes('platform_admin_aal2_required')) return 'กรุณายืนยัน MFA ก่อนดำเนินการ'
  if (raw.includes('billing_live_rollout_limit_invalid')) return 'วงเงินไม่ถูกต้อง: ยอดรวมต้องไม่น้อยกว่าวงเงินต่อครั้ง และจำนวนครั้งต้องอยู่ระหว่าง 1–100'
  if (raw.includes('billing_live_tester_email_invalid')) return 'รูปแบบอีเมลผู้ทดสอบไม่ถูกต้อง'
  if (raw.includes('billing_live_reason_invalid')) return 'กรุณาระบุเหตุผลอย่างน้อย 10 ตัวอักษร'
  return 'ไม่สามารถบันทึกคำสั่งได้ กรุณาลองใหม่'
}

export function BillingLiveRolloutControl({
  policy,
  testers,
}: {
  policy: BillingLiveRolloutPolicy
  testers: BillingLiveTester[]
}) {
  const router = useRouter()
  const [perCharge, setPerCharge] = useState(String(policy.max_amount_per_charge))
  const [totalAmount, setTotalAmount] = useState(String(policy.max_total_amount))
  const [maxCount, setMaxCount] = useState(String(policy.max_successful_charges))
  const [policyReason, setPolicyReason] = useState('')
  const [testerEmail, setTesterEmail] = useState('')
  const [testerActive, setTesterActive] = useState(true)
  const [testerReason, setTesterReason] = useState('')
  const [simulationEmail, setSimulationEmail] = useState('')
  const [simulationAmount, setSimulationAmount] = useState('')
  const [simulationReason, setSimulationReason] = useState('')
  const [evaluation, setEvaluation] = useState<BillingLiveRolloutEvaluation | null>(null)
  const [rollbackReason, setRollbackReason] = useState('')
  const [reviewAction, setReviewAction] = useState<ReviewAction>(null)
  const [loading, setLoading] = useState(false)
  const [message, setMessage] = useState('')
  const feedbackRef = useRef<HTMLDivElement>(null)
  const reviewRef = useRef<HTMLElement>(null)

  useEffect(() => {
    const target = reviewAction ? reviewRef.current : message ? feedbackRef.current : null
    if (!target) return

    const frame = window.requestAnimationFrame(() => {
      target.scrollIntoView({ behavior: 'smooth', block: 'center' })
      target.focus({ preventScroll: true })
    })

    return () => window.cancelAnimationFrame(frame)
  }, [message, reviewAction])

  function reasonValid(value: string) {
    return value.trim().length >= 10
  }

  function prepare(action: Exclude<ReviewAction, null>) {
    setMessage('')
    const valid = action === 'policy'
      ? reasonValid(policyReason)
      : action === 'tester'
        ? testerEmail.includes('@') && reasonValid(testerReason)
        : reasonValid(rollbackReason)
    if (!valid) {
      setMessage(action === 'tester' && !testerEmail.includes('@')
        ? 'กรุณากรอกอีเมลผู้ทดสอบให้ถูกต้อง'
        : 'กรุณาระบุเหตุผลอย่างน้อย 10 ตัวอักษร')
      return
    }
    setReviewAction(action)
  }

  async function confirmReview() {
    if (!reviewAction) return
    setLoading(true)
    setMessage('')
    try {
      const supabase = createClient()
      if (reviewAction === 'policy') {
        const { error } = await supabase.rpc('platform_update_billing_live_rollout_policy', {
          p_command_id: crypto.randomUUID(),
          p_max_amount_per_charge: Number(perCharge),
          p_max_total_amount: Number(totalAmount),
          p_max_successful_charges: Number(maxCount),
          p_reason: policyReason.trim(),
        })
        if (error) throw error
        setPolicyReason('')
        setMessage('บันทึกขีดจำกัดการทดลองและ Audit Log แล้ว')
      } else if (reviewAction === 'tester') {
        const { error } = await supabase.rpc('platform_set_billing_live_tester', {
          p_command_id: crypto.randomUUID(),
          p_email: testerEmail.trim(),
          p_active: testerActive,
          p_reason: testerReason.trim(),
        })
        if (error) throw error
        setTesterEmail('')
        setTesterReason('')
        setMessage(testerActive ? 'เพิ่มผู้ทดสอบในรายการอนุญาตแล้ว' : 'พักสิทธิ์ผู้ทดสอบแล้ว')
      } else {
        const { error } = await supabase.rpc('platform_trigger_billing_live_rollback', {
          p_command_id: crypto.randomUUID(),
          p_reason: rollbackReason.trim(),
        })
        if (error) throw error
        setRollbackReason('')
        setMessage('สั่งย้อนกลับและยืนยัน Emergency Stop แล้ว')
      }
      setReviewAction(null)
      router.refresh()
    } catch (error) {
      setMessage(errorMessage(error))
    } finally {
      setLoading(false)
    }
  }

  async function simulate() {
    setLoading(true)
    setMessage('')
    setEvaluation(null)
    try {
      const { data, error } = await createClient().rpc('platform_preview_billing_live_rollout', {
        p_command_id: crypto.randomUUID(),
        p_email: simulationEmail.trim(),
        p_amount: Number(simulationAmount),
        p_reason: simulationReason.trim(),
      })
      if (error) throw error
      setEvaluation(data as BillingLiveRolloutEvaluation)
      setMessage('ตรวจสอบกติกาแบบ Dry Run แล้ว ไม่มีการเรียกเก็บเงินจริง')
      router.refresh()
    } catch (error) {
      setMessage(errorMessage(error))
    } finally {
      setLoading(false)
    }
  }

  const reviewTitle = reviewAction === 'policy'
    ? 'ยืนยันขีดจำกัดการทดลอง'
    : reviewAction === 'tester'
      ? testerActive ? 'ยืนยันเพิ่มผู้ทดสอบ' : 'ยืนยันพักสิทธิ์ผู้ทดสอบ'
      : 'ยืนยันย้อนกลับฉุกเฉิน'

  return <>
    <section className="readiness-review-card live-rollout-policy-card">
      <div className="feature-list-heading"><div><div className="eyebrow">Phase 1.1.3.7.3</div><h2>ขีดจำกัดการทดลองรับเงินจริง</h2><p>กติกาถูกตรวจฝั่งฐานข้อมูล ไม่สามารถข้ามด้วยการแก้หน้าเว็บ</p></div><span className="status pending">ยังไม่เปิดรับเงินจริง</span></div>
      <div className="live-rollout-limit-grid">
        <label className="readiness-note">วงเงินสูงสุดต่อครั้ง (บาท)<input type="number" min="0.01" step="0.01" value={perCharge} onChange={(event) => setPerCharge(event.target.value)} /></label>
        <label className="readiness-note">ยอดสำเร็จสะสมสูงสุด (บาท)<input type="number" min="0.01" step="0.01" value={totalAmount} onChange={(event) => setTotalAmount(event.target.value)} /></label>
        <label className="readiness-note">จำนวนรายการสำเร็จสูงสุด<input type="number" min="1" max="100" step="1" value={maxCount} onChange={(event) => setMaxCount(event.target.value)} /></label>
      </div>
      <label className="readiness-note">เหตุผลสำหรับ Audit Log<textarea value={policyReason} maxLength={2000} onChange={(event) => setPolicyReason(event.target.value)} placeholder="เช่น จำกัดวงเงินสำหรับทดสอบ Pilot รอบแรกกับบัญชีภายใน" /></label>
      <button className="button" type="button" onClick={() => prepare('policy')}>ตรวจสอบก่อนบันทึกขีดจำกัด</button>
    </section>

    <section className="readiness-review-card" id="live-rollout-testers">
      <div className="feature-list-heading"><div><div className="eyebrow">Tester Allowlist</div><h2>ผู้ทดสอบที่ได้รับอนุญาต</h2><p>อีเมลต้องอยู่ในรายการนี้ก่อนจึงจะผ่านกติกาผู้ทดสอบ</p></div><span className="feature-count">{testers.filter((tester) => tester.active).length} คนใช้งาน</span></div>
      <div className="live-rollout-tester-form">
        <label className="readiness-note">อีเมลผู้ทดสอบ<input type="email" value={testerEmail} onChange={(event) => setTesterEmail(event.target.value)} placeholder="tester@example.com" /></label>
        <label className="readiness-note">คำสั่ง<select value={testerActive ? 'allow' : 'revoke'} onChange={(event) => setTesterActive(event.target.value === 'allow')}><option value="allow">อนุญาตให้ทดสอบ</option><option value="revoke">พักสิทธิ์ทดสอบ</option></select></label>
      </div>
      <label className="readiness-note">เหตุผลสำหรับ Audit Log<textarea value={testerReason} maxLength={2000} onChange={(event) => setTesterReason(event.target.value)} placeholder="เช่น เพิ่มบัญชีทีมการเงินสำหรับทดสอบวงเงินจำกัด" /></label>
      <button className="button" type="button" onClick={() => prepare('tester')}>ตรวจสอบก่อนบันทึกผู้ทดสอบ</button>
      {testers.length ? <div className="live-rollout-testers">{testers.map((tester) => <article key={tester.id} className={tester.active ? 'semantic-panel-success' : 'semantic-panel-warning'}><div><strong>{tester.email}</strong><span>แก้ไขโดย {tester.updated_by_email}</span></div><span className={`status ${tester.active ? 'active' : 'suspended'}`}>{tester.active ? 'อนุญาต' : 'พักสิทธิ์'}</span><p>{tester.reason}</p></article>)}</div> : <div className="empty-state">ยังไม่มีผู้ทดสอบในรายการอนุญาต</div>}
    </section>

    <section className="readiness-review-card">
      <div className="feature-list-heading"><div><div className="eyebrow">Dry Run</div><h2>จำลองตรวจสอบก่อนเปิดจริง</h2><p>ระบบบันทึกผลตรวจลง Audit Log แต่ไม่สร้าง Checkout และไม่เรียกเก็บเงิน</p></div><span className="status pending">ปลอดภัย</span></div>
      <div className="live-rollout-tester-form">
        <label className="readiness-note">อีเมลผู้ทดสอบ<input type="email" value={simulationEmail} onChange={(event) => setSimulationEmail(event.target.value)} placeholder="tester@example.com" /></label>
        <label className="readiness-note">จำนวนเงินจำลอง (บาท)<input type="number" min="0.01" step="0.01" value={simulationAmount} onChange={(event) => setSimulationAmount(event.target.value)} /></label>
      </div>
      <label className="readiness-note">เหตุผลสำหรับ Audit Log<textarea value={simulationReason} maxLength={2000} onChange={(event) => setSimulationReason(event.target.value)} placeholder="เช่น ทดสอบว่าบัญชีและยอดเงินผ่านกติกาก่อนเปิด Pilot" /></label>
      <button className="button" type="button" disabled={loading} onClick={simulate}>{loading ? 'กำลังตรวจสอบ…' : 'จำลองตรวจสอบกติกา'}</button>
      {evaluation ? <div className="live-rollout-evaluation"><div className="feature-list-heading"><div><strong>ผล Dry Run: {evaluation.allowed ? 'ผ่านทุกกติกา' : 'ยังไม่อนุญาตรับเงินจริง'}</strong><p>Phase นี้คาดว่าผลรวมต้องไม่อนุญาต เพราะ Pilot และ Emergency Stop ยังล็อกอยู่</p></div><span className={`status ${evaluation.allowed ? 'active' : 'pending'}`}>{evaluation.allowed ? 'อนุญาต' : 'ถูกบล็อก'}</span></div><div className="readiness-check-grid">{[
        ['อยู่ในรายการผู้ทดสอบ', evaluation.tester_allowed],
        ['ยอดต่อครั้งไม่เกินกำหนด', evaluation.amount_within_limit],
        ['จำนวนครั้งยังไม่เต็ม', evaluation.count_within_limit],
        ['ยอดสะสมยังไม่เต็ม', evaluation.total_within_limit],
        ['เปิด Pilot แล้ว', evaluation.pilot_enabled],
        ['ปลด Emergency Stop แล้ว', evaluation.emergency_stop_clear],
      ].map(([label, passed]) => <article className={`readiness-check ${passed ? 'passed' : 'failed'}`} key={String(label)}><span>{passed ? '✓' : '!'}</span><div><strong>{label}</strong></div></article>)}</div></div> : null}
    </section>

    <section className="live-safety-control-card">
      <div className="feature-list-heading"><div><div className="eyebrow">Emergency Rollback</div><h2>ย้อนกลับสู่สถานะล็อกทันที</h2><p>ยืนยัน Emergency Stop และบันทึกคำสั่งสองชุดใน Audit Log</p></div><span className="status pending">พร้อมใช้งาน</span></div>
      <label className="readiness-note">เหตุผลสำหรับ Audit Log<textarea value={rollbackReason} maxLength={2000} onChange={(event) => setRollbackReason(event.target.value)} placeholder="เช่น ซ้อมแผนย้อนกลับหลังพบผลตรวจไม่ตรงตามนโยบาย" /></label>
      <button className="button danger" type="button" onClick={() => prepare('rollback')}>ตรวจสอบก่อนสั่งย้อนกลับ</button>
    </section>

    {message ? <div className={message.includes('แล้ว') || message.includes('ไม่มีการ') ? 'success live-rollout-message' : 'error live-rollout-message'} ref={feedbackRef} role="status" tabIndex={-1}>{message}</div> : null}

    {reviewAction ? <section aria-labelledby="live-rollout-review-title" className="subscription-confirmation live-rollout-confirmation" ref={reviewRef} tabIndex={-1}>
      <div className="subscription-confirmation-heading"><div><span className="eyebrow">ตรวจสอบครั้งสุดท้าย</span><h3 id="live-rollout-review-title">{reviewTitle}</h3></div><span className="status pending">ยังไม่บันทึก</span></div>
      <div className="readiness-preview-note"><strong>ผลด้านความปลอดภัย</strong><span>ยังคงไม่เปิดรับเงินจริง และทุกคำสั่งจะถูกบันทึก Audit Log</span></div>
      <div className="readiness-preview-note"><strong>เหตุผล</strong><span>{reviewAction === 'policy' ? policyReason.trim() : reviewAction === 'tester' ? testerReason.trim() : rollbackReason.trim()}</span></div>
      <div className="button-row"><button className="button secondary" type="button" disabled={loading} onClick={() => setReviewAction(null)}>ย้อนกลับแก้ไข</button><button className={`button ${reviewAction === 'rollback' ? 'danger' : ''}`} type="button" disabled={loading} onClick={confirmReview}>{loading ? 'กำลังบันทึก…' : reviewTitle}</button></div>
    </section> : null}
  </>
}

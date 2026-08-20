'use client'

import { useState } from 'react'
import type { LiveExecutorDesignReport } from '@/lib/billing/live-executor-design'

export function BillingLiveExecutorDesign() {
  const [running, setRunning] = useState(false)
  const [report, setReport] = useState<LiveExecutorDesignReport | null>(null)
  const [error, setError] = useState('')

  async function inspectDesign() {
    setRunning(true)
    setError('')
    try {
      const response = await fetch('/api/billing/stripe/live-executor-design', { method: 'POST' })
      const payload = await response.json() as { report?: LiveExecutorDesignReport; error?: string }
      if (!response.ok || !payload.report) throw new Error(payload.error ?? 'live_executor_design_review_failed')
      setReport(payload.report)
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'live_executor_design_review_failed')
    } finally {
      setRunning(false)
    }
  }

  return <section className="readiness-review-card controlled-checkout-card">
    <div className="feature-list-heading">
      <div>
        <div className="eyebrow">Phase 1.1.3.7.5.5 · Executor Design & Feature Flag</div>
        <h2>ทบทวนแบบ Executor ก่อนเขียนระบบรับเงินจริง</h2>
        <p>ตรวจ Feature Flag, Kill Switch และลำดับการทำงานจากฝั่ง Server โดยยังไม่มี Checkout Endpoint จริง</p>
      </div>
      <span className="status pending">ออกแบบเท่านั้น · ไม่รับเงินจริง</span>
    </div>

    <div className="controlled-checkout-warning" role="note">
      <strong>Feature Flag ไม่สามารถเปิดรับเงินจริงใน Phase นี้</strong>
      <span>ค่าที่อนุญาตมีเพียง disabled และ shadow; ค่าอื่นจะถูกปฏิเสธและบังคับกลับเป็น disabled</span>
    </div>

    <button className="button" type="button" disabled={running} onClick={inspectDesign}>
      {running ? 'กำลังตรวจแบบจากฝั่ง Server...' : 'ตรวจ Executor Design และ Feature Flag'}
    </button>

    {error ? <div className="error" role="alert">ตรวจแบบไม่สำเร็จ: {error}</div> : null}
    {report ? <>
      <dl className="live-safety-state-grid">
        <div><dt>Feature Flag</dt><dd>{report.featureFlagKey}</dd></div>
        <div><dt>โหมดที่ใช้งาน</dt><dd>{report.mode === 'shadow' ? 'Shadow — ตรวจแต่ไม่ส่ง Stripe' : 'Disabled — ปิดทั้งหมด'}</dd></div>
        <div><dt>เรียก Stripe Live API</dt><dd>ไม่อนุญาต</dd></div>
        <div><dt>ผู้ยืนยันการชำระในอนาคต</dt><dd>Live Webhook ที่ตรวจลายเซ็นแล้วเท่านั้น</dd></div>
      </dl>
      <div className="readiness-check-grid">
        {report.checks.map((check) => <article className={`readiness-check ${check.passed ? 'passed' : 'failed'}`} key={check.key}>
          <span aria-hidden="true">{check.passed ? '✓' : '!'}</span>
          <div><strong>{check.label}</strong><p>{check.detail}</p></div>
        </article>)}
      </div>
      <section className="readiness-review-card">
        <div className="feature-list-heading"><div><h3>ลำดับงานที่วางแผนไว้</h3><p>ทุกขั้นยังปิดและต้องได้รับอนุมัติใหม่ก่อนเริ่มเขียน Executor จริง</p></div><span className="feature-count">{report.plannedStages.length} ขั้น</span></div>
        <div className="live-safety-events">{report.plannedStages.map((stage) => <article key={stage.order}><div><strong>{stage.order}. {stage.name}</strong><span>ยังไม่เปิดใช้งาน</span></div></article>)}</div>
      </section>
      <div className={report.decision === 'design_review_ready' ? 'success' : 'error'} role="status">
        <strong>{report.decision === 'design_review_ready' ? 'แบบพร้อมให้ตรวจสอบและทดสอบ Local' : 'พบสถานะที่ไม่ปลอดภัย'}</strong>
        <span> · realMoneyAllowed=false · Stripe Live API ไม่ถูกเรียก</span>
      </div>
    </> : null}
  </section>
}

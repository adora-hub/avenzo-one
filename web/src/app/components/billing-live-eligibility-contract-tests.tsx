'use client'

import { useState } from 'react'
import type { LiveEligibilityContractReport } from '@/lib/billing/live-eligibility-contract'

export function BillingLiveEligibilityContractTests() {
  const [running, setRunning] = useState(false)
  const [report, setReport] = useState<LiveEligibilityContractReport | null>(null)
  const [error, setError] = useState('')

  async function runTests() {
    setRunning(true)
    setError('')
    setReport(null)
    try {
      const response = await fetch('/api/billing/stripe/live-eligibility/contract-tests', { method: 'POST' })
      const payload = await response.json() as { report?: LiveEligibilityContractReport; error?: string }
      if (!response.ok || !payload.report) throw new Error(payload.error ?? 'live_eligibility_contract_tests_failed')
      setReport(payload.report)
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'live_eligibility_contract_tests_failed')
    } finally {
      setRunning(false)
    }
  }

  return <section className="readiness-review-card controlled-checkout-card">
    <div className="feature-list-heading">
      <div>
        <div className="eyebrow">Phase 1.1.3.7.5.3 · Contract & Abuse-case Tests</div>
        <h2>ทดสอบการปฏิเสธคำสั่งผิดเงื่อนไข</h2>
        <p>ตรวจ MFA, Tester Allowlist, วงเงิน และ Command ซ้ำจาก Server โดยไม่เรียก Stripe Live API</p>
      </div>
      <span className={`status ${report?.passed ? 'active' : 'pending'}`}>{report ? `${report.cases.filter((item) => item.passed).length} / ${report.cases.length} ผ่าน` : 'รอทดสอบ'}</span>
    </div>

    <div className="controlled-checkout-warning" role="note">
      <strong>ชุดทดสอบนี้สร้างเฉพาะ Dry-run Audit</strong>
      <span>ไม่สร้าง Checkout Session, Payment Intent, Invoice หรือรายการรับเงินจริง</span>
    </div>

    <button className="button" type="button" disabled={running} onClick={runTests}>
      {running ? 'กำลังทดสอบฝั่ง Server...' : 'เริ่มทดสอบ Contract 4 กรณี'}
    </button>

    {error ? <div className="error" role="alert">ทดสอบไม่สำเร็จ: {error}</div> : null}
    {report ? <>
      <div className="readiness-check-grid">
        {report.cases.map((item) => <article className={`readiness-check ${item.passed ? 'passed' : 'failed'}`} key={item.key}>
          <span aria-hidden="true">{item.passed ? '✓' : '!'}</span>
          <div><strong>{item.label}</strong><p>{item.detail}</p>{item.auditIds.length ? <small>Audit: {[...new Set(item.auditIds)].join(', ')}</small> : null}</div>
        </article>)}
      </div>
      <div className={report.passed ? 'success' : 'error'} role="status">
        {report.passed ? 'ผ่านครบทุกกรณี' : 'มีกรณีที่ยังไม่ผ่าน'} · ยืนยันไม่มีการรับเงินจริง · {new Date(report.executedAt).toLocaleString('th-TH')}
      </div>
    </> : null}
  </section>
}

'use client'

import { useState } from 'react'
import type { LiveReleaseGateReport } from '@/lib/billing/live-release-gate'

export function BillingLiveReleaseGate() {
  const [running, setRunning] = useState(false)
  const [report, setReport] = useState<LiveReleaseGateReport | null>(null)
  const [error, setError] = useState('')

  async function generateEvidence() {
    setRunning(true)
    setError('')
    setReport(null)
    try {
      const response = await fetch('/api/billing/stripe/live-release-gate', { method: 'POST' })
      const payload = await response.json() as { report?: LiveReleaseGateReport; error?: string }
      if (!response.ok || !payload.report) throw new Error(payload.error ?? 'live_release_gate_failed')
      setReport(payload.report)
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'live_release_gate_failed')
    } finally {
      setRunning(false)
    }
  }

  return <section className="readiness-review-card controlled-checkout-card">
    <div className="feature-list-heading">
      <div>
        <div className="eyebrow">Phase 1.1.3.7.5.4 · Release Gate & Evidence Pack</div>
        <h2>ตรวจด่านก่อนพัฒนา Live Checkout Executor</h2>
        <p>รวบรวมหลักฐานความปลอดภัยและ Audit ที่มีอยู่ โดยยังไม่เปิด Pilot และไม่สร้างรายการรับเงินจริง</p>
      </div>
      <span className={`status ${report?.passed ? 'active' : 'pending'}`}>
        {report ? `${report.checks.filter((check) => check.passed).length} / ${report.checks.length} ผ่าน` : 'รอตรวจสอบ'}
      </span>
    </div>

    <div className="controlled-checkout-warning" role="note">
      <strong>ผ่าน Gate ไม่ได้แปลว่าอนุญาตรับเงินจริง</strong>
      <span>ผลผ่านอนุญาตเพียงให้เสนอแผนพัฒนา Executor ที่ยังปิดด้วย Feature Flag และต้องได้รับอนุมัติแยกอีกครั้ง</span>
    </div>

    <button className="button" type="button" disabled={running} onClick={generateEvidence}>
      {running ? 'กำลังตรวจหลักฐานฝั่ง Server...' : 'ตรวจ Release Gate และสร้าง Evidence Pack'}
    </button>

    {error ? <div className="error" role="alert">ตรวจ Release Gate ไม่สำเร็จ: {error}</div> : null}
    {report ? <>
      <div className="readiness-check-grid">
        {report.checks.map((check) => <article className={`readiness-check ${check.passed ? 'passed' : 'failed'}`} key={check.key}>
          <span aria-hidden="true">{check.passed ? '✓' : '!'}</span>
          <div>
            <strong>{check.label}</strong>
            <p>{check.detail}</p>
            {check.evidenceIds.length ? <small>หลักฐาน: {check.evidenceIds.slice(0, 5).join(', ')}{check.evidenceIds.length > 5 ? ` และอีก ${check.evidenceIds.length - 5} รายการ` : ''}</small> : null}
          </div>
        </article>)}
      </div>
      <div className={report.passed ? 'success' : 'error'} role="status">
        <strong>{report.passed ? 'หลักฐานครบสำหรับเสนอขั้นพัฒนาถัดไป' : 'ยังไม่ผ่าน Release Gate'}</strong>
        <span> · ไม่อนุญาตรับเงินจริง · ตรวจเมื่อ {new Date(report.generatedAt).toLocaleString('th-TH')}</span>
      </div>
      <div className="button-row">
        <a
          className="button secondary"
          download={`avenzo-live-release-evidence-${report.generatedAt.replace(/[:.]/g, '-')}.json`}
          href={`data:application/json;charset=utf-8,${encodeURIComponent(JSON.stringify(report, null, 2))}`}
        >ดาวน์โหลดหลักฐาน JSON</a>
      </div>
    </> : null}
  </section>
}

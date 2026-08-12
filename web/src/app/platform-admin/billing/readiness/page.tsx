import { redirect } from 'next/navigation'
import { BillingProductionReadinessReview } from '@/app/components/billing-production-readiness-review'
import { ApplicationShell } from '@/app/components/application-shell'
import { SignOutButton } from '@/app/components/sign-out-button'
import { buildPaymentExceptions, type PaymentExceptionAttempt, type PaymentExceptionEvent, type PaymentExceptionInvoice } from '@/lib/billing/payment-exceptions'
import { inspectBillingProductionEnvironment, type ReadinessCheck } from '@/lib/billing/production-readiness'
import { readinessManualItems } from '@/lib/billing/readiness-manual'
import { createClient } from '@/lib/supabase/server'

type ReadinessReview = {
  id: string
  manual_status: 'in_progress' | 'manual_complete'
  manual_checklist: Record<string, boolean>
  evidence_note: string
  actor_email: string
  created_at: string
}

function dateTime(value: string) {
  return new Intl.DateTimeFormat('th-TH', { dateStyle: 'medium', timeStyle: 'short', timeZone: 'Asia/Bangkok' }).format(new Date(value))
}

export default async function BillingProductionReadinessPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/?next=/platform-admin/billing/readiness')
  const [adminResult, assuranceResult] = await Promise.all([
    supabase.from('platform_admins').select('status').eq('user_id', user.id).maybeSingle(),
    supabase.auth.mfa.getAuthenticatorAssuranceLevel(),
  ])
  if (adminResult.data?.status !== 'active') redirect('/dashboard')
  if (assuranceResult.data?.currentLevel !== 'aal2') redirect('/auth/mfa?next=/platform-admin/billing/readiness')

  const since24Hours = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString()
  const [reviewResult, attemptsResult, failedWebhookResult] = await Promise.all([
    supabase.from('billing_production_readiness_reviews').select('id, manual_status, manual_checklist, evidence_note, actor_email, created_at').order('created_at', { ascending: false }).limit(1).maybeSingle(),
    supabase.from('billing_payment_attempts').select('id, invoice_id, organization_id, provider, status, payment_method, amount, currency, failure_code, failure_message, provider_fee_actual, provider_net_amount, created_at, updated_at').eq('provider', 'stripe').eq('environment', 'sandbox').order('updated_at', { ascending: false }).limit(100),
    supabase.from('billing_payment_events').select('id', { count: 'exact', head: true }).eq('provider', 'stripe').eq('processing_status', 'failed').gte('received_at', since24Hours),
  ])
  const attempts = (attemptsResult.data ?? []) as PaymentExceptionAttempt[]
  const attemptIds = attempts.map((item) => item.id)
  const invoiceIds = [...new Set(attempts.map((item) => item.invoice_id))]
  const [eventsResult, invoicesResult] = await Promise.all([
    attemptIds.length
      ? supabase.from('billing_payment_events').select('attempt_id, processing_status, error_code, received_at').in('attempt_id', attemptIds).order('received_at', { ascending: false })
      : Promise.resolve({ data: [], error: null }),
    invoiceIds.length
      ? supabase.from('billing_invoices').select('id, invoice_number, organization_id, status').in('id', invoiceIds)
      : Promise.resolve({ data: [], error: null }),
  ])

  const firstError = [reviewResult, attemptsResult, failedWebhookResult, eventsResult, invoicesResult].find((result) => result.error)?.error
  const events = (eventsResult.data ?? []) as PaymentExceptionEvent[]
  const invoices = (invoicesResult.data ?? []) as PaymentExceptionInvoice[]
  const exceptions = buildPaymentExceptions({ attempts, events, invoices, organizationNames: new Map() })
  const envInspection = inspectBillingProductionEnvironment()
  const operationalChecks: ReadinessCheck[] = [
    {
      id: 'critical_exception_queue',
      label: 'ไม่มีคิวเร่งด่วนเกินกำหนด',
      detail: exceptions.some((item) => item.severity === 'critical' && item.slaStatus === 'overdue')
        ? 'ยังมีรายการเร่งด่วนเกินกำหนด ต้องจัดการที่หน้า Billing ก่อน'
        : 'ไม่พบรายการ Payment เร่งด่วนที่เกินกำหนดตรวจสอบ',
      passed: !exceptions.some((item) => item.severity === 'critical' && item.slaStatus === 'overdue'),
    },
    {
      id: 'card_acceptance',
      label: 'มีหลักฐาน Card Test สำเร็จ',
      detail: attempts.some((item) => item.payment_method === 'card' && item.status === 'succeeded')
        ? 'พบรายการบัตร Test Mode ที่ชำระสำเร็จ'
        : 'ยังไม่พบรายการบัตร Test Mode ที่สำเร็จใน 100 รายการล่าสุด',
      passed: attempts.some((item) => item.payment_method === 'card' && item.status === 'succeeded'),
    },
    {
      id: 'promptpay_acceptance',
      label: 'มีหลักฐาน PromptPay Test สำเร็จ',
      detail: attempts.some((item) => item.payment_method === 'promptpay' && item.status === 'succeeded')
        ? 'พบรายการ PromptPay Test Mode ที่ชำระสำเร็จ'
        : 'ยังไม่พบรายการ PromptPay Test Mode ที่สำเร็จใน 100 รายการล่าสุด',
      passed: attempts.some((item) => item.payment_method === 'promptpay' && item.status === 'succeeded'),
    },
    {
      id: 'webhook_24h',
      label: 'Webhook 24 ชั่วโมงล่าสุดไม่มี Error',
      detail: (failedWebhookResult.count ?? 0) === 0
        ? 'ไม่พบ Stripe Webhook ที่ประมวลผลล้มเหลวใน 24 ชั่วโมงล่าสุด'
        : `พบ ${(failedWebhookResult.count ?? 0)} Event ที่ต้องแก้ไขก่อน`,
      passed: (failedWebhookResult.count ?? 0) === 0,
    },
  ]
  const automaticChecks = [...envInspection.checks, ...operationalChecks]
  const automaticPassed = automaticChecks.filter((item) => item.passed).length
  const latestReview = reviewResult.data as ReadinessReview | null
  const manualCompleted = readinessManualItems.filter((item) => latestReview?.manual_checklist?.[item.key]).length
  const readyForControlledActivation = automaticPassed === automaticChecks.length && latestReview?.manual_status === 'manual_complete'

  return <ApplicationShell email={user.email ?? ''} isPlatformAdmin section="platform">
    <header className="topbar"><div className="brand">AVENZO ONE / Billing Readiness</div><div className="topbar-actions"><span>{user.email}</span><SignOutButton /></div></header>
    <section className="content platform-subscription-content">
      <div className="hero"><div><div className="eyebrow">Phase 1.1.3.6</div><h1>ความพร้อมก่อนเปิดรับเงินจริง</h1><p>ตรวจระบบ หลักฐาน และผู้รับผิดชอบก่อนเสนอเปิด Stripe Live Mode</p></div></div>
      <div className={`readiness-decision ${readyForControlledActivation ? 'ready' : 'blocked'}`} role="status">
        <span aria-hidden="true">{readyForControlledActivation ? '✓' : '!'}</span>
        <div><strong>{readyForControlledActivation ? 'พร้อมเสนอเข้าสู่ขั้นเปิดแบบควบคุม' : 'ยังไม่พร้อมเปิดรับเงินจริง'}</strong><p>{readyForControlledActivation ? 'ผ่านระบบอัตโนมัติและรายการรับรองแล้ว แต่ยังต้องอนุมัติ Phase เปิด Live แยกต่างหาก' : 'Stripe ยังอยู่ใน Test Mode ให้แก้รายการที่ไม่ผ่านและบันทึกหลักฐานให้ครบ'}</p></div>
        <span className="status pending">ยังไม่เปิดเงินจริง</span>
      </div>
      {firstError ? <div className="error">อ่านข้อมูลตรวจความพร้อมไม่ครบ: {firstError.message}</div> : <>
        <section className="readiness-review-card">
          <div className="feature-list-heading"><div><div className="eyebrow">ตรวจอัตโนมัติ</div><h2>ระบบและหลักฐานการทดสอบ</h2><p>ระบบแสดงเฉพาะสถานะ ไม่แสดง Secret Key หรือ Signing Secret</p></div><span className="feature-count">{automaticPassed} / {automaticChecks.length} ข้อ</span></div>
          <div className="readiness-check-grid">{automaticChecks.map((check) => <article className={`readiness-check ${check.passed ? 'passed' : 'failed'}`} key={check.id}><span aria-hidden="true">{check.passed ? '✓' : '!'}</span><div><strong>{check.label}</strong><p>{check.detail}</p></div></article>)}</div>
        </section>
        <BillingProductionReadinessReview initialChecklist={latestReview?.manual_checklist} initialNote={latestReview?.evidence_note} />
        <section className="readiness-history-card">
          <div><span className="history-label">ผลตรวจล่าสุด</span><strong>{latestReview ? `${manualCompleted} / ${readinessManualItems.length} ข้อ` : 'ยังไม่เคยบันทึก'}</strong></div>
          {latestReview ? <><div><span className="history-label">ผู้ตรวจ</span><strong>{latestReview.actor_email}</strong></div><div><span className="history-label">บันทึกเมื่อ</span><strong>{dateTime(latestReview.created_at)}</strong></div></> : null}
        </section>
      </>}
      <div className="readiness-safety-note"><strong>ขอบเขตความปลอดภัยของ Phase นี้</strong><p>หน้านี้มีไว้ตรวจและบันทึกหลักฐานเท่านั้น ไม่มีปุ่มเปิด Live Mode และโค้ด Checkout/Webhook ปัจจุบันยังปฏิเสธ Live Key กับ Live Event</p></div>
    </section>
  </ApplicationShell>
}

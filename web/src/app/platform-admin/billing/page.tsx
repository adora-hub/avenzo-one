import Link from 'next/link'
import { redirect } from 'next/navigation'
import { BillingInvoiceForm, type BillingOrganization, type BillingPrice, type BillingSubscription } from '@/app/components/billing-invoice-form'
import { BillingPaymentActions } from '@/app/components/billing-payment-actions'
import { BillingGatewaySandbox, type BillingGatewayAttempt } from '@/app/components/billing-gateway-sandbox'
import { StripeFeeSnapshot, StripeTestCheckout, type StripeFeeAttemptSnapshot } from '@/app/components/stripe-test-checkout'
import { BillingDocumentProfiles } from '@/app/components/billing-document-profiles'
import { BillingDocumentActions } from '@/app/components/billing-document-actions'
import { billingStatusLabels } from '@/app/components/billing-labels'
import { PaymentExceptionActions } from '@/app/components/payment-exception-actions'
import { SignOutButton } from '@/app/components/sign-out-button'
import { buildPaymentExceptions, type PaymentExceptionAttempt, type PaymentExceptionEvent, type PaymentExceptionInvoice, type PaymentExceptionSeverity, type PaymentExceptionSlaStatus } from '@/lib/billing/payment-exceptions'
import { createClient } from '@/lib/supabase/server'

const PAGE_SIZE = 10
const AUDIT_PAGE_SIZE = 10

type BillingSearchParams = {
  page?: string
  exception_q?: string
  exception_severity?: string
  exception_sla?: string
  audit_page?: string
  audit_q?: string
  audit_status?: string
  audit_action?: string
}

function formatMoney(value: number, currency: string) { return new Intl.NumberFormat('th-TH', { style: 'currency', currency, minimumFractionDigits: 2 }).format(value) }
function formatDate(value: string, timezone = 'Asia/Bangkok') { return new Intl.DateTimeFormat('th-TH', { dateStyle: 'medium', timeStyle: 'short', timeZone: timezone }).format(new Date(value)) }
function paymentMethodLabel(value: string | null) { return value === 'promptpay' ? 'PromptPay' : value === 'card' ? 'บัตร' : value ?? 'ไม่ระบุ' }
function exceptionActionLabel(value: string) {
  if (value === 'reconcile_fee') return 'ตรวจค่าธรรมเนียมอีกครั้ง'
  if (value === 'refresh_provider_status') return 'ตรวจสถานะ Provider'
  if (value === 'retry_checkout') return 'สร้าง Checkout ใหม่'
  return value
}
function exceptionCommandStatus(value: string) {
  if (value === 'succeeded') return { label: 'สำเร็จ', className: 'active' }
  if (value === 'failed') return { label: 'ไม่สำเร็จ', className: 'suspended' }
  return { label: 'กำลังดำเนินการ', className: 'pending' }
}
function cleanSearch(value: string | undefined) { return (value ?? '').trim().replace(/[%_,()]/g, ' ').replace(/\s+/g, ' ').slice(0, 80) }
function pageNumbers(current: number, total: number) {
  const values = new Set([1, total, current - 2, current - 1, current, current + 1, current + 2])
  return [...values].filter((value) => value >= 1 && value <= total).sort((left, right) => left - right)
}
function billingHref(query: BillingSearchParams, updates: Partial<BillingSearchParams>) {
  const params = new URLSearchParams()
  const merged = { ...query, ...updates }
  for (const [key, value] of Object.entries(merged)) if (value) params.set(key, value)
  return `/platform-admin/billing?${params.toString()}`
}
function slaLabel(status: PaymentExceptionSlaStatus, remainingMinutes: number) {
  if (status === 'overdue') return `เกินกำหนด ${Math.abs(remainingMinutes)} นาที`
  if (status === 'due_soon') return `ใกล้ถึงกำหนด · เหลือ ${remainingMinutes} นาที`
  return `ยังอยู่ในกำหนด · เหลือ ${remainingMinutes} นาที`
}
function slaTargetLabel(minutes: number) {
  if (minutes >= 1440) return `${Math.round(minutes / 1440)} วัน`
  if (minutes >= 60) return `${Math.round(minutes / 60)} ชั่วโมง`
  return `${minutes} นาที`
}

export default async function PlatformAdminBillingPage({ searchParams }: { searchParams: Promise<BillingSearchParams> }) {
  const query = await searchParams
  const requestedPage = Math.max(1, Number.parseInt(query.page ?? '1', 10) || 1)
  const from = (requestedPage - 1) * PAGE_SIZE
  const exceptionSearch = cleanSearch(query.exception_q)
  const exceptionSeverity = (['critical', 'warning', 'info'].includes(query.exception_severity ?? '') ? query.exception_severity : 'all') as PaymentExceptionSeverity | 'all'
  const exceptionSla = (['overdue', 'due_soon', 'on_track'].includes(query.exception_sla ?? '') ? query.exception_sla : 'all') as PaymentExceptionSlaStatus | 'all'
  const auditPage = Math.max(1, Number.parseInt(query.audit_page ?? '1', 10) || 1)
  const auditSearch = cleanSearch(query.audit_q)
  const auditStatus = ['pending', 'succeeded', 'failed'].includes(query.audit_status ?? '') ? query.audit_status! : 'all'
  const auditAction = ['reconcile_fee', 'refresh_provider_status', 'retry_checkout'].includes(query.audit_action ?? '') ? query.audit_action! : 'all'
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/?next=/platform-admin/billing')
  const [platformAdminResult, assuranceResult] = await Promise.all([
    supabase.from('platform_admins').select('status').eq('user_id', user.id).maybeSingle(),
    supabase.auth.mfa.getAuthenticatorAssuranceLevel(),
  ])
  if (platformAdminResult.data?.status !== 'active') redirect('/dashboard')
  if (assuranceResult.data?.currentLevel !== 'aal2') redirect('/auth/mfa?next=/platform-admin/billing')

  let exceptionCommandsQuery = supabase.from('billing_payment_exception_commands').select('id, invoice_id, organization_id, action, status, reason, actor_email, error_code, created_at, completed_at', { count: 'exact' })
  if (auditStatus !== 'all') exceptionCommandsQuery = exceptionCommandsQuery.eq('status', auditStatus)
  if (auditAction !== 'all') exceptionCommandsQuery = exceptionCommandsQuery.eq('action', auditAction)
  if (auditSearch) exceptionCommandsQuery = exceptionCommandsQuery.or(`actor_email.ilike.%${auditSearch}%,reason.ilike.%${auditSearch}%`)
  exceptionCommandsQuery = exceptionCommandsQuery.order('created_at', { ascending: false }).range((auditPage - 1) * AUDIT_PAGE_SIZE, auditPage * AUDIT_PAGE_SIZE - 1)

  const [organizationsResult, subscriptionsResult, plansResult, versionsResult, pricesResult, invoicesResult, issuerResult, customersResult, exceptionAttemptsResult, exceptionCommandsResult] = await Promise.all([
    supabase.from('organizations').select('id, name, slug, timezone, currency').order('name'),
    supabase.from('organization_subscriptions').select('id, organization_id, plan_code, plan_version_id, lifecycle_status, starts_at, expires_at, metadata').in('lifecycle_status', ['active', 'suspended']).not('plan_version_id', 'is', null).order('updated_at', { ascending: false }),
    supabase.from('subscription_plans').select('code, name'),
    supabase.from('subscription_plan_versions').select('id, label'),
    supabase.from('subscription_plan_prices').select('id, plan_version_id, billing_interval, amount, currency').eq('is_active', true),
    supabase.from('billing_invoices').select('id, invoice_number, organization_id, subscription_id, billing_interval, billing_period_start, billing_period_end, currency, subtotal_amount, discount_amount, tax_amount, total_amount, status, issued_at, due_at, reason', { count: 'exact' }).order('issued_at', { ascending: false }).range(from, from + PAGE_SIZE - 1),
    supabase.from('billing_issuer_profiles').select('legal_name, tax_id, branch_code, address, email, phone').eq('is_active', true).maybeSingle(),
    supabase.from('billing_customer_profiles').select('organization_id, legal_name, tax_id, branch_code, address, email, phone'),
    supabase.from('billing_payment_attempts').select('id, invoice_id, organization_id, provider, status, payment_method, amount, currency, failure_code, failure_message, provider_fee_actual, provider_net_amount, created_at, updated_at').order('updated_at', { ascending: false }).limit(100),
    exceptionCommandsQuery,
  ])
  const invoiceRows = invoicesResult.data ?? []
  const invoiceIds = invoiceRows.map((item) => item.id)
  const exceptionAttempts = (exceptionAttemptsResult.data ?? []) as PaymentExceptionAttempt[]
  const exceptionAttemptIds = exceptionAttempts.map((item) => item.id)
  const exceptionInvoiceIds = [...new Set([...exceptionAttempts.map((item) => item.invoice_id), ...(exceptionCommandsResult.data ?? []).map((item) => item.invoice_id)])]
  const [paymentsResult, attemptsResult, gatewayEventsResult, documentsResult, exceptionEventsResult, exceptionInvoicesResult] = await Promise.all([
    invoiceIds.length
      ? supabase.from('billing_payments').select('id, payment_number, invoice_id, provider, provider_reference, status, amount, currency, reason, occurred_at').in('invoice_id', invoiceIds).order('occurred_at', { ascending: false })
      : Promise.resolve({ data: [], error: null }),
    invoiceIds.length
      ? supabase.from('billing_payment_attempts').select('id, invoice_id, provider, provider_session_id, status, amount, currency, payment_method, estimated_provider_fee, customer_fee_amount, customer_charge_amount, provider_fee_actual, provider_net_amount, created_at, completed_at').in('invoice_id', invoiceIds).order('created_at', { ascending: false })
      : Promise.resolve({ data: [], error: null }),
    supabase.from('billing_payment_events').select('id, provider_event_id, event_type, result_status, processing_status, received_at').order('received_at', { ascending: false }).limit(10),
    invoiceIds.length
      ? supabase.from('billing_invoice_documents').select('id, invoice_id, document_number, status, total_amount, currency, issued_at').in('invoice_id', invoiceIds)
      : Promise.resolve({ data: [], error: null }),
    exceptionAttemptIds.length
      ? supabase.from('billing_payment_events').select('attempt_id, processing_status, error_code, received_at').in('attempt_id', exceptionAttemptIds).order('received_at', { ascending: false })
      : Promise.resolve({ data: [], error: null }),
    exceptionInvoiceIds.length
      ? supabase.from('billing_invoices').select('id, invoice_number, organization_id, status').in('id', exceptionInvoiceIds)
      : Promise.resolve({ data: [], error: null }),
  ])
  const documentIds = (documentsResult.data ?? []).map((item) => item.id)
  const creditNotesResult = documentIds.length
    ? await supabase.from('billing_credit_notes').select('id, invoice_document_id, credit_note_number, status, total_amount, currency, reason, issued_at').in('invoice_document_id', documentIds).order('issued_at', { ascending: false })
    : { data: [], error: null }
  const firstError = [organizationsResult, subscriptionsResult, plansResult, versionsResult, pricesResult, invoicesResult, issuerResult, customersResult, exceptionAttemptsResult, exceptionCommandsResult, paymentsResult, attemptsResult, gatewayEventsResult, documentsResult, exceptionEventsResult, exceptionInvoicesResult, creditNotesResult].find((result) => result.error)?.error
  const organizations = (organizationsResult.data ?? []) as BillingOrganization[]
  const organizationsById = new Map(organizations.map((item) => [item.id, item]))
  const allPaymentExceptions = buildPaymentExceptions({
    attempts: exceptionAttempts,
    events: (exceptionEventsResult.data ?? []) as PaymentExceptionEvent[],
    invoices: (exceptionInvoicesResult.data ?? []) as PaymentExceptionInvoice[],
    organizationNames: new Map(organizations.map((item) => [item.id, item.name])),
  })
  const paymentExceptions = allPaymentExceptions.filter((exception) => {
    const searchable = `${exception.organizationName} ${exception.invoiceNumber} ${exception.title} ${exception.description} ${exception.failureCode ?? ''}`.toLocaleLowerCase('th-TH')
    return (!exceptionSearch || searchable.includes(exceptionSearch.toLocaleLowerCase('th-TH')))
      && (exceptionSeverity === 'all' || exception.severity === exceptionSeverity)
      && (exceptionSla === 'all' || exception.slaStatus === exceptionSla)
  })
  const overdueExceptions = allPaymentExceptions.filter((exception) => exception.slaStatus === 'overdue')
  const urgentOverdueCount = overdueExceptions.filter((exception) => exception.severity === 'critical').length
  const plansByCode = new Map((plansResult.data ?? []).map((item) => [item.code, item.name]))
  const versionsById = new Map((versionsResult.data ?? []).map((item) => [item.id, item.label]))
  const subscriptions: BillingSubscription[] = (subscriptionsResult.data ?? []).flatMap((item) => item.plan_version_id ? [{ ...item, plan_version_id: item.plan_version_id, plan_name: plansByCode.get(item.plan_code) ?? item.plan_code, plan_version_label: versionsById.get(item.plan_version_id) ?? item.plan_version_id, selected_price_id: typeof (item.metadata as Record<string, unknown> | null)?.price_id === 'string' ? (item.metadata as Record<string, unknown>).price_id as string : null }] : [])
  const prices: BillingPrice[] = (pricesResult.data ?? []).map((item) => ({ ...item, amount: Number(item.amount) }))
  const invoices = invoiceRows.map((item) => ({ ...item, subtotal_amount: Number(item.subtotal_amount), discount_amount: Number(item.discount_amount), tax_amount: Number(item.tax_amount), total_amount: Number(item.total_amount) }))
  const paymentsByInvoice = new Map<string, typeof paymentsResult.data>()
  for (const payment of paymentsResult.data ?? []) paymentsByInvoice.set(payment.invoice_id, [...(paymentsByInvoice.get(payment.invoice_id) ?? []), payment])
  const latestAttemptByInvoice = new Map<string, BillingGatewayAttempt>()
  for (const attempt of attemptsResult.data ?? []) if (attempt.provider === 'sandbox' && !latestAttemptByInvoice.has(attempt.invoice_id)) latestAttemptByInvoice.set(attempt.invoice_id, { ...attempt, amount: Number(attempt.amount) })
  const latestStripeAttemptByInvoice = new Map<string, StripeFeeAttemptSnapshot>()
  for (const attempt of attemptsResult.data ?? []) {
    if (attempt.provider !== 'stripe' || latestStripeAttemptByInvoice.has(attempt.invoice_id)) continue
    latestStripeAttemptByInvoice.set(attempt.invoice_id, {
      id: attempt.id,
      status: attempt.status,
      payment_method: attempt.payment_method === 'card' || attempt.payment_method === 'promptpay' ? attempt.payment_method : null,
      estimated_provider_fee: attempt.estimated_provider_fee === null ? null : Number(attempt.estimated_provider_fee),
      customer_fee_amount: Number(attempt.customer_fee_amount ?? 0),
      customer_charge_amount: attempt.customer_charge_amount === null ? null : Number(attempt.customer_charge_amount),
      provider_fee_actual: attempt.provider_fee_actual === null ? null : Number(attempt.provider_fee_actual),
      provider_net_amount: attempt.provider_net_amount === null ? null : Number(attempt.provider_net_amount),
      created_at: attempt.created_at,
    })
  }
  const documentsByInvoice = new Map((documentsResult.data ?? []).map((item) => [item.invoice_id, { ...item, total_amount: Number(item.total_amount) }]))
  const creditNotesByDocument = new Map<string, Array<{ id: string; invoice_document_id: string; credit_note_number: string; status: string; total_amount: number; currency: string; reason: string }>>()
  for (const creditNote of creditNotesResult.data ?? []) creditNotesByDocument.set(creditNote.invoice_document_id, [...(creditNotesByDocument.get(creditNote.invoice_document_id) ?? []), { ...creditNote, total_amount: Number(creditNote.total_amount) }])
  const totalPages = Math.max(1, Math.ceil((invoicesResult.count ?? 0) / PAGE_SIZE))
  const auditTotalPages = Math.max(1, Math.ceil((exceptionCommandsResult.count ?? 0) / AUDIT_PAGE_SIZE))
  const currentAuditPage = Math.min(auditPage, auditTotalPages)
  if (auditPage > auditTotalPages) redirect(billingHref(query, { audit_page: String(auditTotalPages) }))

  return <main className="dashboard">
    <header className="topbar"><div className="brand">AVENZO ONE / Billing</div><div className="topbar-actions"><span>{user.email}</span><SignOutButton /></div></header>
    <section className="content platform-subscription-content">
      <div className="hero"><div><div className="eyebrow">Phase 1.1.3.7.1</div><h1>Billing &amp; Payment Exceptions</h1><p>ตรวจรายการชำระเงินผิดปกติ ติดตาม SLA และเก็บหลักฐานทุกคำสั่งแก้ไข</p></div><div className="button-row"><Link className="button secondary" href="/platform-admin/billing/live-control">ศูนย์ควบคุมการรับเงินจริง</Link><Link className="button secondary" href="/platform-admin/billing/readiness">ตรวจความพร้อม Production</Link><Link className="button secondary" href="/platform-admin">กลับ Platform Admin</Link></div></div>
      {firstError ? <div className="error">ไม่สามารถอ่านข้อมูล Billing ได้: {firstError.message}</div> : <>
        <section className="subscription-management-section"><div className="feature-list-heading"><div><div className="eyebrow">ความพร้อมระบบรับชำระ</div><h2>สถานะระบบรับชำระเงิน</h2><p>เชื่อม Stripe โหมดทดสอบ โดยข้อมูลลับและการยืนยัน Webhook อยู่ฝั่ง Server เท่านั้น</p></div><span className="status active">Stripe Test Mode</span></div>
          <div className="gateway-readiness-grid"><div className="card"><span className="history-label">Provider หลัก</span><h3>Stripe Thailand</h3><p>Hosted Checkout รองรับบัตรและ PromptPay QR</p></div><div className="card"><span className="history-label">ค่าธรรมเนียมลูกค้า</span><h3>0 บาท</h3><p>รอบนี้ AVENZO ONE รับภาระค่าธรรมเนียมและเก็บ Fee Snapshot แยก</p></div><div className="card"><span className="history-label">Webhook ล่าสุด</span><h3>{gatewayEventsResult.data?.length ?? 0} Event</h3><p>ตรวจลายเซ็น เก็บ Event ID และ Hash เพื่อป้องกันการประมวลผลซ้ำ</p></div></div>
        </section>
        <section className="subscription-management-section payment-exception-section">
          <div className="feature-list-heading"><div><div className="eyebrow">คิวตรวจสอบการชำระเงิน</div><h2>รายการชำระเงินที่ต้องตรวจสอบ <span className="term-help" tabIndex={0} aria-label="คำอธิบายกำหนดเวลาตรวจสอบ">i<span role="tooltip">กำหนดเวลาตรวจสอบ (SLA) คือเวลาเป้าหมายที่ผู้ดูแลควรเข้าตรวจปัญหา ระบบจะไม่แก้ไขรายการให้อัตโนมัติ</span></span></h2><p>รวมปัญหาจากรายการรับชำระ 100 รายการล่าสุด เรียงรายการที่เกินกำหนดก่อน และแสดงไม่เกิน 10 แถว</p></div><span className={`feature-count ${allPaymentExceptions.length ? 'has-warning' : ''}`}>{paymentExceptions.length} / {allPaymentExceptions.length} รายการ</span></div>
          {overdueExceptions.length ? <div className={`payment-sla-alert ${urgentOverdueCount ? 'critical' : 'warning'}`} role="alert"><span aria-hidden="true">!</span><div><strong>{urgentOverdueCount ? `มี ${urgentOverdueCount} รายการเร่งด่วนเกินกำหนด` : `มี ${overdueExceptions.length} รายการเกินกำหนดตรวจสอบ`}</strong><p>ให้ผู้ดูแลระบบเปิดตรวจหลักฐานและดำเนินการจากรายการด้านล่างก่อนงาน Billing ปกติ</p></div></div> : <div className="payment-sla-alert healthy"><span aria-hidden="true">✓</span><div><strong>ยังไม่มีรายการตรวจสอบที่เกินกำหนด</strong><p>รายการที่เปิดอยู่ยังอยู่ภายในเวลาตรวจสอบตามนโยบาย</p></div></div>}
          <form className="payment-exception-filters" method="get">
            <input name="exception_q" defaultValue={exceptionSearch} placeholder="ค้นหา Organization, Invoice หรือรหัสอ้างอิง" aria-label="ค้นหารายการผิดปกติ" />
            <select name="exception_severity" defaultValue={exceptionSeverity} aria-label="ระดับความสำคัญ"><option value="all">ทุกระดับ</option><option value="critical">เร่งด่วน</option><option value="warning">ควรตรวจสอบ</option><option value="info">ติดตาม</option></select>
            <select name="exception_sla" defaultValue={exceptionSla} aria-label="สถานะกำหนดเวลาตรวจสอบ"><option value="all">ทุกสถานะกำหนดเวลา</option><option value="overdue">เกินกำหนดตรวจสอบ</option><option value="due_soon">ใกล้ถึงกำหนดตรวจสอบ</option><option value="on_track">ยังอยู่ในกำหนด</option></select>
            <input type="hidden" name="audit_q" value={auditSearch} /><input type="hidden" name="audit_status" value={auditStatus} /><input type="hidden" name="audit_action" value={auditAction} />
            <button className="button secondary" type="submit">ค้นหา</button><Link className="button secondary" href={billingHref(query, { exception_q: undefined, exception_severity: undefined, exception_sla: undefined })}>ล้างตัวกรอง</Link>
          </form>
          {paymentExceptions.length ? <div className="payment-exception-list">{paymentExceptions.slice(0, 10).map((exception) => {
            const timezone = organizationsById.get(exception.organizationId)?.timezone
            return <article className={`payment-exception-row ${exception.severity}`} key={exception.attemptId}>
              <div className="payment-exception-main"><span className={`exception-severity ${exception.severity}`}>{exception.severity === 'critical' ? 'เร่งด่วน' : exception.severity === 'warning' ? 'ควรตรวจสอบ' : 'ติดตาม'}</span><div><h3>{exception.title}</h3><p>{exception.description}</p></div><span className={`exception-sla ${exception.slaStatus}`}>{slaLabel(exception.slaStatus, exception.slaRemainingMinutes)}</span></div>
              <dl className="payment-exception-details"><div><dt>องค์กร</dt><dd>{exception.organizationName}</dd></div><div><dt>ใบแจ้งหนี้</dt><dd>{exception.invoiceNumber}</dd></div><div><dt>ช่องทาง</dt><dd>{exception.provider} · {paymentMethodLabel(exception.paymentMethod)}</dd></div><div><dt>ยอดชำระ</dt><dd>{formatMoney(exception.amount, exception.currency)}</dd></div><div><dt>เกิดเมื่อ</dt><dd>{formatDate(exception.occurredAt, timezone)}</dd></div><div><dt>ควรตรวจภายใน</dt><dd>{formatDate(exception.slaDueAt, timezone)} · เวลาตรวจเป้าหมาย {slaTargetLabel(exception.slaTargetMinutes)}</dd></div>{exception.failureCode ? <div><dt>รหัสอ้างอิง</dt><dd>{exception.failureCode}</dd></div> : null}</dl>
              <PaymentExceptionActions attemptId={exception.attemptId} kind={exception.kind} invoiceNumber={exception.invoiceNumber} paymentMethod={exception.paymentMethod} />
            </article>
          })}</div> : <div className="payment-exception-empty"><span aria-hidden="true">✓</span><div><h3>{allPaymentExceptions.length ? 'ไม่พบรายการตามตัวกรอง' : 'ไม่มีรายการผิดปกติที่ต้องตรวจสอบ'}</h3><p>{allPaymentExceptions.length ? 'ลองเปลี่ยนคำค้นหา ระดับความสำคัญ หรือสถานะ SLA' : 'Payment, Webhook, Invoice และค่าธรรมเนียมอยู่ในสถานะสอดคล้องกัน'}</p></div></div>}
        </section>
        <section className="subscription-management-section">
          <div className="feature-list-heading"><div><div className="eyebrow">ประวัติการดำเนินการ</div><h2>ประวัติคำสั่งแก้ไข</h2><p>เก็บผู้ดำเนินการ เหตุผล ผลลัพธ์ และเวลา แสดง 10 รายการต่อหน้า</p></div><span className="feature-count">{exceptionCommandsResult.count ?? 0} รายการ</span></div>
          <form className="payment-exception-filters" method="get">
            <input name="audit_q" defaultValue={auditSearch} placeholder="ค้นหาอีเมลผู้ดำเนินการหรือเหตุผล" aria-label="ค้นหาประวัติคำสั่ง" />
            <select name="audit_action" defaultValue={auditAction} aria-label="ประเภทคำสั่ง"><option value="all">ทุกคำสั่ง</option><option value="reconcile_fee">ตรวจค่าธรรมเนียม</option><option value="refresh_provider_status">ตรวจสถานะ Provider</option><option value="retry_checkout">สร้าง Checkout ใหม่</option></select>
            <select name="audit_status" defaultValue={auditStatus} aria-label="ผลคำสั่ง"><option value="all">ทุกผลลัพธ์</option><option value="succeeded">สำเร็จ</option><option value="failed">ไม่สำเร็จ</option><option value="pending">กำลังดำเนินการ</option></select>
            <input type="hidden" name="exception_q" value={exceptionSearch} /><input type="hidden" name="exception_severity" value={exceptionSeverity} /><input type="hidden" name="exception_sla" value={exceptionSla} />
            <button className="button secondary" type="submit">ค้นหา</button><Link className="button secondary" href={billingHref(query, { audit_page: undefined, audit_q: undefined, audit_status: undefined, audit_action: undefined })}>ล้างตัวกรอง</Link>
          </form>
          {exceptionCommandsResult.data?.length ? <div className="payment-exception-command-history">{exceptionCommandsResult.data.map((command) => {
            const status = exceptionCommandStatus(command.status)
            const organization = organizationsById.get(command.organization_id)
            const invoiceNumber = (exceptionInvoicesResult.data ?? []).find((invoice) => invoice.id === command.invoice_id)?.invoice_number ?? command.invoice_id
            return <article key={command.id}>
              <div><strong>{exceptionActionLabel(command.action)}</strong><span className={`status ${status.className}`}>{status.label}</span></div>
              <dl><div><dt>Organization</dt><dd>{organization?.name ?? command.organization_id}</dd></div><div><dt>Invoice</dt><dd>{invoiceNumber}</dd></div><div><dt>ผู้ดำเนินการ</dt><dd>{command.actor_email}</dd></div><div><dt>เวลา</dt><dd>{formatDate(command.completed_at ?? command.created_at, organization?.timezone)}</dd></div></dl>
              <p><strong>เหตุผล:</strong> {command.reason}</p>
              {command.error_code ? <p className="history-command-error">รหัสข้อผิดพลาด: {command.error_code}</p> : null}
            </article>
          })}</div> : <div className="payment-exception-empty"><span aria-hidden="true">i</span><div><h3>{exceptionCommandsResult.count ? 'ไม่พบประวัติตามตัวกรอง' : 'ยังไม่มีประวัติคำสั่งแก้ไข'}</h3><p>{exceptionCommandsResult.count ? 'ลองเปลี่ยนคำค้นหา ประเภทคำสั่ง หรือผลลัพธ์' : 'ประวัติจะเริ่มแสดงหลังยืนยันดำเนินการจาก Exception Queue'}</p></div></div>}
          {auditTotalPages > 1 ? <nav className="pagination" aria-label="หน้าประวัติคำสั่งแก้ไข">
            <Link className={`pagination-link ${currentAuditPage <= 1 ? 'disabled' : ''}`} href={billingHref(query, { audit_page: String(Math.max(1, currentAuditPage - 1)) })}>ก่อนหน้า</Link>
            {pageNumbers(currentAuditPage, auditTotalPages).map((page, index, pages) => <span className="pagination-number-wrap" key={page}>{index > 0 && pages[index - 1] < page - 1 ? <span>…</span> : null}<Link className={`pagination-link ${page === currentAuditPage ? 'current' : ''}`} href={billingHref(query, { audit_page: String(page) })}>{page}</Link></span>)}
            <Link className={`pagination-link ${currentAuditPage >= auditTotalPages ? 'disabled' : ''}`} href={billingHref(query, { audit_page: String(Math.min(auditTotalPages, currentAuditPage + 1)) })}>ถัดไป</Link>
            <form className="pagination-jump" method="get"><input type="hidden" name="audit_q" value={auditSearch} /><input type="hidden" name="audit_status" value={auditStatus} /><input type="hidden" name="audit_action" value={auditAction} /><label>ไปหน้าที่<input name="audit_page" type="number" min="1" max={auditTotalPages} defaultValue={currentAuditPage} /></label><button className="button secondary" type="submit">ไป</button></form>
          </nav> : null}
        </section>
        <section className="subscription-management-section"><div className="feature-list-heading"><div><div className="eyebrow">DOCUMENT IDENTITY</div><h2>ข้อมูลบนเอกสาร</h2><p>ต้องตั้งค่าผู้ออกเอกสารและผู้รับเอกสารก่อนออก Invoice Document</p></div></div><BillingDocumentProfiles issuer={issuerResult.data} organizations={organizations.map(({ id, name }) => ({ id, name }))} customers={customersResult.data ?? []} /></section>
        <section className="subscription-management-section"><div className="feature-list-heading"><div><div className="eyebrow">NEW INVOICE</div><h2>สร้าง Invoice</h2><p>ยอดตั้งต้นมาจาก Active Plan Price และบันทึกเป็น Snapshot</p></div></div><div className="card"><BillingInvoiceForm organizations={organizations} subscriptions={subscriptions} prices={prices} /></div></section>
        <section className="subscription-management-section"><div className="feature-list-heading"><div><div className="eyebrow">HISTORY</div><h2>Invoices &amp; Payments</h2><p>แสดง 10 รายการต่อหน้า พร้อมประวัติการชำระ</p></div><span className="feature-count">{invoicesResult.count ?? 0} Invoice</span></div>
          {invoices.length ? <div className="billing-invoice-list">{invoices.map((invoice) => {
            const organization = organizationsById.get(invoice.organization_id)
            const status = billingStatusLabels[invoice.status] ?? { label: invoice.status, description: '' }
            const payments = paymentsByInvoice.get(invoice.id) ?? []
            const latestStripeAttempt = latestStripeAttemptByInvoice.get(invoice.id) ?? null
            const isPayable = invoice.status === 'pending' || invoice.status === 'failed'
            return <article className="card billing-invoice-card" id={`invoice-${invoice.id}`} key={invoice.id}>
              <div className="billing-invoice-header"><div><span className={`subscription-state ${invoice.status}`}>{status.label}</span><h3>{invoice.invoice_number}</h3><p className="meta">{organization?.name}</p></div><div className="subscription-plan-highlight"><span>ยอดสุทธิ</span><strong>{formatMoney(invoice.total_amount, invoice.currency)}</strong><small>ครบกำหนด {formatDate(invoice.due_at, organization?.timezone)}</small></div></div>
              <p className="subscription-status-description">{status.description}</p>
              <dl className="subscription-overview-grid"><div><dt>ยอดก่อนส่วนลด</dt><dd>{formatMoney(invoice.subtotal_amount, invoice.currency)}</dd></div><div><dt>ส่วนลด</dt><dd>{formatMoney(invoice.discount_amount, invoice.currency)}</dd></div><div><dt>ภาษี</dt><dd>{formatMoney(invoice.tax_amount, invoice.currency)}</dd></div><div><dt>รอบ Billing</dt><dd>{formatDate(invoice.billing_period_start, organization?.timezone)} – {formatDate(invoice.billing_period_end, organization?.timezone)}</dd></div></dl>
              <details className="subscription-action-panel"><summary>ดูประวัติและจัดการ Payment</summary>
                {payments.length ? <div className="billing-payment-history">{payments.map((payment) => <div className="billing-payment-row" key={payment.id}><strong>{payment.payment_number}</strong><span>{billingStatusLabels[payment.status]?.label ?? payment.status}</span><span>{formatMoney(Number(payment.amount), payment.currency)}</span><span>{payment.provider}{payment.provider_reference ? ` · ${payment.provider_reference}` : ''}</span><time>{formatDate(payment.occurred_at, organization?.timezone)}</time></div>)}</div> : <div className="empty">ยังไม่มีประวัติ Payment</div>}
                {!isPayable && latestStripeAttempt && <StripeFeeSnapshot attempt={latestStripeAttempt} currency={invoice.currency} fallbackAmount={invoice.total_amount} />}
                {isPayable && <><StripeTestCheckout key={`stripe:${invoice.id}:${invoice.status}`} invoice={invoice} configured={Boolean(process.env.STRIPE_SECRET_KEY?.startsWith('sk_test_') && process.env.STRIPE_WEBHOOK_SECRET?.startsWith('whsec_'))} latestAttempt={latestStripeAttempt} /><details className="manual-payment-panel"><summary>Sandbox ภายในระบบ (สำหรับทดสอบโดยไม่เปิด Stripe)</summary><BillingGatewaySandbox key={`gateway:${invoice.id}:${invoice.status}:${latestAttemptByInvoice.get(invoice.id)?.id ?? 'new'}`} invoice={invoice} latestAttempt={latestAttemptByInvoice.get(invoice.id) ?? null} /></details><details className="manual-payment-panel"><summary>บันทึก Payment แบบ Manual</summary><BillingPaymentActions key={`${invoice.id}:${invoice.status}`} invoice={invoice} /></details></>}
              </details>
              <details className="subscription-action-panel"><summary>เอกสาร Invoice และ Credit Note</summary><BillingDocumentActions invoice={invoice} document={documentsByInvoice.get(invoice.id) ?? null} creditNotes={documentsByInvoice.get(invoice.id) ? creditNotesByDocument.get(documentsByInvoice.get(invoice.id)!.id) ?? [] : []} /></details>
            </article>
          })}</div> : <div className="empty">ยังไม่มี Invoice</div>}
          {totalPages > 1 && <nav className="pagination" aria-label="หน้า Invoice"><Link className={`button secondary ${requestedPage <= 1 ? 'is-disabled' : ''}`} href={billingHref(query, { page: String(Math.max(1, requestedPage - 1)) })}>ก่อนหน้า</Link><span>หน้า {requestedPage} / {totalPages}</span><Link className={`button secondary ${requestedPage >= totalPages ? 'is-disabled' : ''}`} href={billingHref(query, { page: String(Math.min(totalPages, requestedPage + 1)) })}>ถัดไป</Link><form className="pagination-jump" method="get"><input type="hidden" name="exception_q" value={exceptionSearch} /><input type="hidden" name="exception_severity" value={exceptionSeverity} /><input type="hidden" name="exception_sla" value={exceptionSla} /><input type="hidden" name="audit_q" value={auditSearch} /><input type="hidden" name="audit_status" value={auditStatus} /><input type="hidden" name="audit_action" value={auditAction} /><label>ไปหน้าที่<input name="page" type="number" min="1" max={totalPages} defaultValue={requestedPage} /></label><button className="button secondary" type="submit">ไป</button></form></nav>}
        </section>
      </>}
    </section>
  </main>
}

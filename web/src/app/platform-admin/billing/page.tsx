import Link from 'next/link'
import { redirect } from 'next/navigation'
import { BillingInvoiceForm, type BillingOrganization, type BillingPrice, type BillingSubscription } from '@/app/components/billing-invoice-form'
import { BillingPaymentActions } from '@/app/components/billing-payment-actions'
import { BillingGatewaySandbox, type BillingGatewayAttempt } from '@/app/components/billing-gateway-sandbox'
import { StripeFeeSnapshot, StripeTestCheckout, type StripeFeeAttemptSnapshot } from '@/app/components/stripe-test-checkout'
import { BillingDocumentProfiles } from '@/app/components/billing-document-profiles'
import { BillingDocumentActions } from '@/app/components/billing-document-actions'
import { billingStatusLabels } from '@/app/components/billing-labels'
import { SignOutButton } from '@/app/components/sign-out-button'
import { createClient } from '@/lib/supabase/server'

const PAGE_SIZE = 10

function formatMoney(value: number, currency: string) { return new Intl.NumberFormat('th-TH', { style: 'currency', currency, minimumFractionDigits: 2 }).format(value) }
function formatDate(value: string, timezone = 'Asia/Bangkok') { return new Intl.DateTimeFormat('th-TH', { dateStyle: 'medium', timeStyle: 'short', timeZone: timezone }).format(new Date(value)) }

export default async function PlatformAdminBillingPage({ searchParams }: { searchParams: Promise<{ page?: string }> }) {
  const query = await searchParams
  const requestedPage = Math.max(1, Number.parseInt(query.page ?? '1', 10) || 1)
  const from = (requestedPage - 1) * PAGE_SIZE
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/?next=/platform-admin/billing')
  const [platformAdminResult, assuranceResult] = await Promise.all([
    supabase.from('platform_admins').select('status').eq('user_id', user.id).maybeSingle(),
    supabase.auth.mfa.getAuthenticatorAssuranceLevel(),
  ])
  if (platformAdminResult.data?.status !== 'active') redirect('/dashboard')
  if (assuranceResult.data?.currentLevel !== 'aal2') redirect('/auth/mfa?next=/platform-admin/billing')

  const [organizationsResult, subscriptionsResult, plansResult, versionsResult, pricesResult, invoicesResult, issuerResult, customersResult] = await Promise.all([
    supabase.from('organizations').select('id, name, slug, timezone, currency').order('name'),
    supabase.from('organization_subscriptions').select('id, organization_id, plan_code, plan_version_id, lifecycle_status, starts_at, expires_at, metadata').in('lifecycle_status', ['active', 'suspended']).not('plan_version_id', 'is', null).order('updated_at', { ascending: false }),
    supabase.from('subscription_plans').select('code, name'),
    supabase.from('subscription_plan_versions').select('id, label'),
    supabase.from('subscription_plan_prices').select('id, plan_version_id, billing_interval, amount, currency').eq('is_active', true),
    supabase.from('billing_invoices').select('id, invoice_number, organization_id, subscription_id, billing_interval, billing_period_start, billing_period_end, currency, subtotal_amount, discount_amount, tax_amount, total_amount, status, issued_at, due_at, reason', { count: 'exact' }).order('issued_at', { ascending: false }).range(from, from + PAGE_SIZE - 1),
    supabase.from('billing_issuer_profiles').select('legal_name, tax_id, branch_code, address, email, phone').eq('is_active', true).maybeSingle(),
    supabase.from('billing_customer_profiles').select('organization_id, legal_name, tax_id, branch_code, address, email, phone'),
  ])
  const invoiceRows = invoicesResult.data ?? []
  const invoiceIds = invoiceRows.map((item) => item.id)
  const paymentsResult = invoiceIds.length
    ? await supabase.from('billing_payments').select('id, payment_number, invoice_id, provider, provider_reference, status, amount, currency, reason, occurred_at').in('invoice_id', invoiceIds).order('occurred_at', { ascending: false })
    : { data: [], error: null }
  const attemptsResult = invoiceIds.length
    ? await supabase.from('billing_payment_attempts').select('id, invoice_id, provider, provider_session_id, status, amount, currency, payment_method, estimated_provider_fee, customer_fee_amount, customer_charge_amount, provider_fee_actual, provider_net_amount, created_at, completed_at').in('invoice_id', invoiceIds).order('created_at', { ascending: false })
    : { data: [], error: null }
  const gatewayEventsResult = await supabase.from('billing_payment_events').select('id, provider_event_id, event_type, result_status, processing_status, received_at').order('received_at', { ascending: false }).limit(10)
  const documentsResult = invoiceIds.length
    ? await supabase.from('billing_invoice_documents').select('id, invoice_id, document_number, status, total_amount, currency, issued_at').in('invoice_id', invoiceIds)
    : { data: [], error: null }
  const documentIds = (documentsResult.data ?? []).map((item) => item.id)
  const creditNotesResult = documentIds.length
    ? await supabase.from('billing_credit_notes').select('id, invoice_document_id, credit_note_number, status, total_amount, currency, reason, issued_at').in('invoice_document_id', documentIds).order('issued_at', { ascending: false })
    : { data: [], error: null }
  const firstError = [organizationsResult, subscriptionsResult, plansResult, versionsResult, pricesResult, invoicesResult, issuerResult, customersResult, paymentsResult, attemptsResult, gatewayEventsResult, documentsResult, creditNotesResult].find((result) => result.error)?.error
  const organizations = (organizationsResult.data ?? []) as BillingOrganization[]
  const organizationsById = new Map(organizations.map((item) => [item.id, item]))
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

  return <main className="dashboard">
    <header className="topbar"><div className="brand">AVENZO ONE / Billing</div><div className="topbar-actions"><span>{user.email}</span><SignOutButton /></div></header>
    <section className="content platform-subscription-content">
      <div className="hero"><div><div className="eyebrow">Phase 1.1.3.4</div><h1>Billing &amp; Stripe Test Checkout</h1><p>ทดลอง Checkout, Webhook และกระทบยอดค่าธรรมเนียมโดยไม่ตัดเงินจริง</p></div><Link className="button secondary" href="/platform-admin">กลับ Platform Admin</Link></div>
      {firstError ? <div className="error">ไม่สามารถอ่านข้อมูล Billing ได้: {firstError.message}</div> : <>
        <section className="subscription-management-section"><div className="feature-list-heading"><div><div className="eyebrow">PAYMENT READINESS</div><h2>สถานะ Payment Gateway</h2><p>เชื่อม Stripe Test Mode โดย Secret และการยืนยัน Webhook อยู่ฝั่ง Server เท่านั้น</p></div><span className="status active">Stripe Test Mode</span></div>
          <div className="gateway-readiness-grid"><div className="card"><span className="history-label">Provider หลัก</span><h3>Stripe Thailand</h3><p>Hosted Checkout รองรับบัตรและ PromptPay QR</p></div><div className="card"><span className="history-label">ค่าธรรมเนียมลูกค้า</span><h3>0 บาท</h3><p>รอบนี้ AVENZO ONE รับภาระค่าธรรมเนียมและเก็บ Fee Snapshot แยก</p></div><div className="card"><span className="history-label">Webhook ล่าสุด</span><h3>{gatewayEventsResult.data?.length ?? 0} Event</h3><p>ตรวจลายเซ็น เก็บ Event ID และ Hash เพื่อป้องกันการประมวลผลซ้ำ</p></div></div>
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
            return <article className="card billing-invoice-card" key={invoice.id}>
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
          {totalPages > 1 && <nav className="pagination" aria-label="หน้า Invoice"><Link className={`button secondary ${requestedPage <= 1 ? 'is-disabled' : ''}`} href={`?page=${Math.max(1, requestedPage - 1)}`}>ก่อนหน้า</Link><span>หน้า {requestedPage} / {totalPages}</span><Link className={`button secondary ${requestedPage >= totalPages ? 'is-disabled' : ''}`} href={`?page=${Math.min(totalPages, requestedPage + 1)}`}>ถัดไป</Link><form className="pagination-jump" method="get"><label>ไปหน้าที่<input name="page" type="number" min="1" max={totalPages} defaultValue={requestedPage} /></label><button className="button secondary" type="submit">ไป</button></form></nav>}
        </section>
      </>}
    </section>
  </main>
}

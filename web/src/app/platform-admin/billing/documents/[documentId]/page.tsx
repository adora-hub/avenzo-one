import Link from 'next/link'
import { notFound, redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { BillingDocumentPrintButton } from '@/app/components/billing-document-print-button'

type PartySnapshot = { legal_name?: string; tax_id?: string | null; branch_code?: string | null; address?: string; email?: string | null; phone?: string | null }
type LineItem = { description?: string; subtotal_amount?: number; discount_amount?: number; tax_amount?: number; total_amount?: number }

function money(value: number, currency: string) { return new Intl.NumberFormat('th-TH', { style: 'currency', currency, minimumFractionDigits: 2 }).format(value) }
function date(value: string) { return new Intl.DateTimeFormat('th-TH', { dateStyle: 'long', timeStyle: 'short', timeZone: 'Asia/Bangkok' }).format(new Date(value)) }
function Party({ title, party }: { title: string; party: PartySnapshot }) { return <section className="document-party"><span>{title}</span><strong>{party.legal_name}</strong>{party.tax_id && <p>เลขประจำตัวผู้เสียภาษี: {party.tax_id}{party.branch_code ? ` · สาขา ${party.branch_code}` : ''}</p>}<p>{party.address}</p>{party.email && <p>{party.email}</p>}{party.phone && <p>{party.phone}</p>}</section> }

export default async function BillingDocumentPrintPage({ params }: { params: Promise<{ documentId: string }> }) {
  const { documentId } = await params
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect(`/?next=/platform-admin/billing/documents/${documentId}`)
  const [admin, assurance] = await Promise.all([supabase.from('platform_admins').select('status').eq('user_id', user.id).maybeSingle(), supabase.auth.mfa.getAuthenticatorAssuranceLevel()])
  if (admin.data?.status !== 'active') redirect('/dashboard')
  if (assurance.data?.currentLevel !== 'aal2') redirect(`/auth/mfa?next=/platform-admin/billing/documents/${documentId}`)
  const { data: document, error } = await supabase.from('billing_invoice_documents').select('id, invoice_id, document_number, status, issuer_snapshot, recipient_snapshot, line_items, subtotal_amount, discount_amount, tax_amount, total_amount, currency, issued_at, canceled_at, cancellation_reason, billing_invoices(invoice_number, status, billing_period_start, billing_period_end, due_at)').eq('id', documentId).maybeSingle()
  if (error) throw error
  if (!document) notFound()
  const invoice = Array.isArray(document.billing_invoices) ? document.billing_invoices[0] : document.billing_invoices
  const issuer = document.issuer_snapshot as PartySnapshot
  const recipient = document.recipient_snapshot as PartySnapshot
  const lines = (document.line_items as LineItem[]) ?? []
  return <main className="document-print-page">
    <div className="document-print-toolbar"><Link className="button secondary" href="/platform-admin/billing">กลับ Billing</Link><BillingDocumentPrintButton /></div>
    <article className="billing-document-sheet">
      <header className="billing-document-header"><div><span className="eyebrow">AVENZO ONE</span><h1>ใบแจ้งหนี้</h1><p>Billing Invoice Document · {document.status === 'issued' ? 'ออกเอกสารแล้ว' : 'ยกเลิกเอกสารแล้ว'}</p></div><div className="billing-document-number"><span>เลขที่เอกสาร</span><strong>{document.document_number}</strong><span>วันที่ออก {date(document.issued_at)}</span><span>อ้างอิง Invoice {invoice?.invoice_number}</span></div></header>
      {document.status === 'canceled' && <div className="document-canceled-banner"><strong>เอกสารถูกยกเลิก</strong><span>{document.cancellation_reason}</span></div>}
      <div className="document-party-grid"><Party title="ผู้ออกเอกสาร" party={issuer} /><Party title="ผู้รับเอกสาร" party={recipient} /></div>
      <section className="document-period"><span>รอบบริการ</span><strong>{invoice ? `${date(invoice.billing_period_start)} – ${date(invoice.billing_period_end)}` : '—'}</strong>{invoice && <span>ครบกำหนดชำระ {date(invoice.due_at)}</span>}</section>
      <table className="document-line-table"><thead><tr><th>รายการ</th><th>ก่อนส่วนลด</th><th>ส่วนลด</th><th>ภาษี</th><th>รวม</th></tr></thead><tbody>{lines.map((line, index) => <tr key={index}><td>{line.description}</td><td>{money(Number(line.subtotal_amount ?? 0), document.currency)}</td><td>{money(Number(line.discount_amount ?? 0), document.currency)}</td><td>{money(Number(line.tax_amount ?? 0), document.currency)}</td><td>{money(Number(line.total_amount ?? 0), document.currency)}</td></tr>)}</tbody><tfoot><tr><td colSpan={4}>ยอดสุทธิ</td><td>{money(Number(document.total_amount), document.currency)}</td></tr></tfoot></table>
      <footer className="document-footer"><p>เอกสารนี้เป็นเอกสารการเรียกเก็บเงินจากระบบ AVENZO ONE ข้อมูลผู้รับและผู้ออกถูกบันทึกเป็น Snapshot ณ เวลาที่ออกเอกสาร</p><p>ก่อนใช้เป็นเอกสารภาษีตามกฎหมาย โปรดให้ผู้เชี่ยวชาญด้านบัญชีและภาษีตรวจสอบรูปแบบและข้อความ</p></footer>
    </article>
  </main>
}

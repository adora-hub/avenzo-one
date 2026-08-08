'use client'

import { FormEvent, useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/browser'
import { billingErrorMessage } from './billing-labels'

type Invoice = { id: string; invoice_number: string; status: string; total_amount: number; tax_amount: number; currency: string }
type Document = { id: string; document_number: string; status: string; total_amount: number; currency: string }
type CreditNote = { id: string; credit_note_number: string; status: string; total_amount: number; currency: string; reason: string }

export function BillingDocumentActions({ invoice, document, creditNotes }: { invoice: Invoice; document: Document | null; creditNotes: CreditNote[] }) {
  const router = useRouter()
  const [message, setMessage] = useState('')
  const [loading, setLoading] = useState(false)
  const [showCredit, setShowCredit] = useState(false)
  const [showCancel, setShowCancel] = useState(false)
  const [creditAmount, setCreditAmount] = useState(String(invoice.total_amount - invoice.tax_amount))
  const [creditTax, setCreditTax] = useState(String(invoice.tax_amount))
  const [reason, setReason] = useState('ปรับปรุงรายการเรียกเก็บ')

  async function issueDocument() {
    setLoading(true); setMessage('')
    try { const { error } = await createClient().rpc('platform_issue_billing_invoice_document', { p_invoice_id: invoice.id, p_command_id: crypto.randomUUID() }); if (error) throw error; setMessage('ออกเอกสารสำเร็จ'); router.refresh() }
    catch (error) { setMessage(billingErrorMessage(error instanceof Error ? error.message : 'ไม่สามารถออกเอกสารได้')) } finally { setLoading(false) }
  }
  async function cancelDocument(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); if (!document) return; setLoading(true); setMessage('')
    try { const { error } = await createClient().rpc('platform_cancel_billing_invoice_document', { p_document_id: document.id, p_reason: reason }); if (error) throw error; setMessage('ยกเลิกเอกสารสำเร็จ'); setShowCancel(false); router.refresh() }
    catch (error) { setMessage(billingErrorMessage(error instanceof Error ? error.message : 'ไม่สามารถยกเลิกเอกสารได้')) } finally { setLoading(false) }
  }
  async function createCredit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); if (!document) return; setLoading(true); setMessage('')
    try { const { error } = await createClient().rpc('platform_create_billing_credit_note', { p_invoice_document_id: document.id, p_subtotal_amount: Number(creditAmount), p_tax_amount: Number(creditTax), p_reason: reason, p_command_id: crypto.randomUUID() }); if (error) throw error; setMessage('ออก Credit Note สำเร็จ'); setShowCredit(false); router.refresh() }
    catch (error) { setMessage(billingErrorMessage(error instanceof Error ? error.message : 'ไม่สามารถออก Credit Note ได้')) } finally { setLoading(false) }
  }

  return <div className="billing-document-actions">
    <div className="billing-document-heading"><div><strong>เอกสาร Billing</strong><span>{document ? `${document.document_number} · ${document.status === 'issued' ? 'ออกเอกสารแล้ว' : 'ยกเลิกแล้ว'}` : 'ยังไม่ได้ออกเอกสาร'}</span></div>{document && <Link className="button secondary compact-button" href={`/platform-admin/billing/documents/${document.id}`} target="_blank">เปิดหน้าพิมพ์</Link>}</div>
    {message && <div className={message.includes('สำเร็จ') ? 'countdown' : 'error'}>{message}</div>}
    {!document && invoice.status !== 'canceled' && <button className="button secondary compact-button" type="button" disabled={loading} onClick={issueDocument}>{loading ? 'กำลังออกเอกสาร…' : 'ออก Invoice Document'}</button>}
    {document?.status === 'issued' && <div className="button-row"><button className="button secondary compact-button" type="button" onClick={() => { setShowCredit(!showCredit); setShowCancel(false) }}>ออก Credit Note</button>{invoice.status === 'canceled' && <button className="button danger compact-button" type="button" onClick={() => { setShowCancel(!showCancel); setShowCredit(false) }}>ยกเลิกเอกสาร</button>}</div>}
    {showCredit && <form className="compact-form" onSubmit={createCredit}><label>ยอดก่อนภาษีที่ให้เครดิต<input type="number" min="0" step="0.01" value={creditAmount} onChange={(event) => setCreditAmount(event.target.value)} /></label><label>ภาษีที่ให้เครดิต<input type="number" min="0" step="0.01" value={creditTax} onChange={(event) => setCreditTax(event.target.value)} /></label><label>เหตุผล<textarea rows={2} minLength={3} value={reason} onChange={(event) => setReason(event.target.value)} /></label><button className="button" type="submit" disabled={loading}>ยืนยันออก Credit Note</button><p className="field-help">ออกได้เฉพาะ Invoice ที่ชำระแล้ว และยอดรวม Credit Note ต้องไม่เกินยอดเอกสาร</p></form>}
    {showCancel && <form className="compact-form" onSubmit={cancelDocument}><label>เหตุผลการยกเลิก<textarea rows={2} minLength={3} value={reason} onChange={(event) => setReason(event.target.value)} /></label><button className="button danger" type="submit" disabled={loading}>ยืนยันยกเลิกเอกสาร</button><p className="field-help">ยกเลิกได้เมื่อ Invoice ต้นทางถูกยกเลิกแล้วเท่านั้น</p></form>}
    {creditNotes.length > 0 && <div className="billing-credit-list">{creditNotes.map((credit) => <div key={credit.id}><strong>{credit.credit_note_number}</strong><span>{credit.status === 'issued' ? 'ออกแล้ว' : 'ยกเลิกแล้ว'} · {new Intl.NumberFormat('th-TH', { style: 'currency', currency: credit.currency }).format(credit.total_amount)}</span><small>{credit.reason}</small></div>)}</div>}
  </div>
}

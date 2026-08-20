'use client'

import { useEffect, useMemo, useRef, useState, type DragEvent } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/browser'

export type TransferInvoiceOption = {
  id: string
  invoice_number: string
  total_amount: number
  currency: string
  due_at: string
}

export type TransferChannelOption = {
  id: string
  channel_type: 'bank_account' | 'promptpay'
  display_name: string
  provider_name: string
  account_name: string
  account_identifier: string
  customer_instructions: string | null
}

export type TransferProofSummary = {
  id: string
  invoice_id: string
  original_file_name: string
  claimed_amount: number
  claimed_transfer_at: string
  status: string
  submitted_at: string | null
  fulfilled_payment_id: string | null
  fulfilled_at: string | null
  payment_number: string | null
}

const acceptedTypes = ['image/jpeg', 'image/png', 'image/webp', 'application/pdf']
const maxBytes = 5 * 1024 * 1024

const proofStatusLabel: Record<string, string> = {
  uploading: 'กำลังอัปโหลด',
  submitted: 'ส่งหลักฐานแล้ว · รอตรวจ',
  under_review: 'กำลังตรวจสอบ',
  accepted: 'ตรวจหลักฐานผ่าน',
  rejected: 'หลักฐานไม่ผ่าน',
  canceled: 'ยกเลิกแล้ว',
}

function formatMoney(amount: number, currency: string) {
  return new Intl.NumberFormat('th-TH', { style: 'currency', currency }).format(amount)
}

function localDateTimeValue() {
  const now = new Date()
  now.setMinutes(now.getMinutes() - now.getTimezoneOffset())
  return now.toISOString().slice(0, 16)
}

function friendlyError(message: string) {
  if (message.includes('unsupported_transfer_proof_type')) return 'รองรับเฉพาะ JPG, PNG, WebP หรือ PDF เท่านั้น'
  if (message.includes('transfer_proof_file_too_large')) return 'ไฟล์ต้องมีขนาดไม่เกิน 5 MB'
  if (message.includes('billing_invoice_not_pending')) return 'Invoice นี้ไม่ได้อยู่ในสถานะรอชำระแล้ว'
  if (message.includes('active_transfer_channel_required')) return 'ช่องทางรับโอนนี้ถูกปิดใช้งาน กรุณาเลือกช่องทางใหม่'
  if (message.includes('transfer_proof_file_missing')) return 'อัปโหลดไฟล์ไม่ครบ กรุณาลองใหม่อีกครั้ง'
  return message
}

export function BillingTransferProofUpload({
  invoices,
  channels,
  proofs,
}: {
  invoices: TransferInvoiceOption[]
  channels: TransferChannelOption[]
  proofs: TransferProofSummary[]
}) {
  const router = useRouter()
  const [invoiceId, setInvoiceId] = useState(invoices[0]?.id ?? '')
  const [channelId, setChannelId] = useState(channels[0]?.id ?? '')
  const selectedInvoice = useMemo(() => invoices.find((invoice) => invoice.id === invoiceId) ?? null, [invoiceId, invoices])
  const selectedChannel = useMemo(() => channels.find((channel) => channel.id === channelId) ?? null, [channelId, channels])
  const invoiceCurrencyById = useMemo(() => new Map(invoices.map((invoice) => [invoice.id, invoice.currency])), [invoices])
  const [amount, setAmount] = useState(selectedInvoice ? String(selectedInvoice.total_amount) : '')
  const [transferredAt, setTransferredAt] = useState(localDateTimeValue)
  const [note, setNote] = useState('')
  const [file, setFile] = useState<File | null>(null)
  const [filePreviewUrl, setFilePreviewUrl] = useState('')
  const filePreviewUrlRef = useRef('')
  const [fileInputKey, setFileInputKey] = useState(0)
  const [isDragging, setIsDragging] = useState(false)
  const [reviewing, setReviewing] = useState(false)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [success, setSuccess] = useState('')
  const fulfilledProof = proofs.find((proof) => Boolean(proof.fulfilled_payment_id)) ?? null
  const acceptedProof = proofs.find((proof) => proof.status === 'accepted' && !proof.fulfilled_payment_id) ?? null
  const pendingProof = proofs.find((proof) => ['uploading', 'submitted', 'under_review'].includes(proof.status)) ?? null
  const billingState = invoices.length > 0
    ? 'pending'
    : fulfilledProof
      ? 'paid'
      : acceptedProof
        ? 'awaiting_confirmation'
        : pendingProof
          ? 'under_review'
          : 'none'

  const billingStateLabel = billingState === 'paid'
    ? 'ชำระแล้ว'
    : billingState === 'awaiting_confirmation'
      ? 'รอยืนยันรับชำระ'
      : billingState === 'under_review'
        ? 'รอตรวจหลักฐาน'
        : 'รอชำระ'

  const billingStateClass = billingState === 'paid'
    ? 'active'
    : billingState === 'awaiting_confirmation' || billingState === 'under_review'
      ? 'invited'
      : 'pending'

  useEffect(() => () => {
    if (filePreviewUrlRef.current) URL.revokeObjectURL(filePreviewUrlRef.current)
  }, [])

  function clearFilePreview() {
    if (filePreviewUrlRef.current) URL.revokeObjectURL(filePreviewUrlRef.current)
    filePreviewUrlRef.current = ''
    setFilePreviewUrl('')
  }

  function selectFile(nextFile: File | null) {
    setError('')
    setSuccess('')
    setReviewing(false)
    clearFilePreview()

    if (!nextFile) {
      setFile(null)
      return
    }
    if (!acceptedTypes.includes(nextFile.type)) {
      setFile(null)
      setFileInputKey((current) => current + 1)
      setError('รองรับเฉพาะ JPG, PNG, WebP หรือ PDF เท่านั้น')
      return
    }
    if (nextFile.size < 1 || nextFile.size > maxBytes) {
      setFile(null)
      setFileInputKey((current) => current + 1)
      setError('ไฟล์ต้องมีขนาดไม่เกิน 5 MB')
      return
    }

    setFile(nextFile)
    if (nextFile.type.startsWith('image/')) {
      const nextPreviewUrl = URL.createObjectURL(nextFile)
      filePreviewUrlRef.current = nextPreviewUrl
      setFilePreviewUrl(nextPreviewUrl)
    }
  }

  function removeFile() {
    selectFile(null)
    setFileInputKey((current) => current + 1)
  }

  function dropFile(event: DragEvent<HTMLLabelElement>) {
    event.preventDefault()
    setIsDragging(false)
    selectFile(event.dataTransfer.files?.[0] ?? null)
  }

  function changeInvoice(nextId: string) {
    const next = invoices.find((invoice) => invoice.id === nextId)
    setInvoiceId(nextId)
    setAmount(next ? String(next.total_amount) : '')
    setReviewing(false)
  }

  function validate() {
    if (!selectedInvoice) return 'กรุณาเลือก Invoice'
    if (!selectedChannel) return 'กรุณาเลือกช่องทางที่โอน'
    if (!file) return 'กรุณาเลือกไฟล์หลักฐาน'
    if (!acceptedTypes.includes(file.type)) return 'รองรับเฉพาะ JPG, PNG, WebP หรือ PDF เท่านั้น'
    if (file.size < 1 || file.size > maxBytes) return 'ไฟล์ต้องมีขนาดไม่เกิน 5 MB'
    if (!amount || Number(amount) <= 0) return 'กรุณากรอกยอดที่โอนให้ถูกต้อง'
    if (!transferredAt) return 'กรุณาระบุวันและเวลาที่โอน'
    return ''
  }

  function preview() {
    const validation = validate()
    setError(validation)
    setSuccess('')
    if (!validation) setReviewing(true)
  }

  async function submit() {
    const validation = validate()
    if (validation || !file) {
      setError(validation)
      setReviewing(false)
      return
    }

    setSaving(true)
    setError('')
    const supabase = createClient()
    try {
      const { data: prepared, error: prepareError } = await supabase.rpc('customer_prepare_billing_transfer_proof', {
        p_invoice_id: invoiceId,
        p_transfer_channel_id: channelId,
        p_original_file_name: file.name,
        p_mime_type: file.type,
        p_file_size_bytes: file.size,
        p_claimed_amount: Number(amount),
        p_claimed_transfer_at: new Date(transferredAt).toISOString(),
        p_customer_note: note,
        p_command_id: crypto.randomUUID(),
      })
      if (prepareError) throw prepareError

      const proof = Array.isArray(prepared) ? prepared[0] : prepared
      if (!proof?.id || !proof.storage_path) throw new Error('ระบบไม่สามารถเตรียมพื้นที่อัปโหลดได้')

      const { error: uploadError } = await supabase.storage
        .from('billing-transfer-proofs')
        .upload(proof.storage_path, file, { contentType: file.type, upsert: false })
      if (uploadError) throw uploadError

      const { error: finalizeError } = await supabase.rpc('customer_finalize_billing_transfer_proof', {
        p_proof_id: proof.id,
      })
      if (finalizeError) throw finalizeError

      setReviewing(false)
      clearFilePreview()
      setFile(null)
      setFileInputKey((current) => current + 1)
      setNote('')
      setSuccess('ส่งหลักฐานแล้ว ระบบยังไม่ถือว่าชำระสำเร็จจนกว่าเจ้าหน้าที่จะตรวจสอบ')
      router.refresh()
    } catch (caught) {
      setError(friendlyError(caught instanceof Error ? caught.message : 'ไม่สามารถส่งหลักฐานได้'))
    } finally {
      setSaving(false)
    }
  }

  return (
    <article className="card billing-transfer-proof-card">
      <div className="status-title-row">
        <span className={`status ${billingStateClass}`}>{billingStateLabel}</span>
        <h2>แจ้งโอนและแนบหลักฐาน</h2>
      </div>
      <p>ไฟล์เก็บในพื้นที่ Private และเปิดดูได้เฉพาะผู้มีสิทธิ์ของ Organization เท่านั้น</p>
      {billingState === 'paid' ? (
        <div className="success" role="status">
          <strong>ยืนยันรับชำระสำเร็จ</strong>
          <span>Invoice ชำระแล้ว{fulfilledProof?.payment_number ? ` · Payment ${fulfilledProof.payment_number}` : ''}</span>
        </div>
      ) : billingState === 'awaiting_confirmation' ? (
        <div className="transfer-proof-warning" role="note">
          <strong>หลักฐานผ่านแล้ว · รอยืนยันรับชำระ</strong>
          <span>ระบบจะเปลี่ยนเป็น “ชำระแล้ว” เมื่อขั้นตอนยืนยันรับชำระเสร็จสมบูรณ์</span>
        </div>
      ) : billingState === 'under_review' ? (
        <div className="transfer-proof-warning" role="note">
          <strong>ส่งหลักฐานแล้ว · รอตรวจสอบ</strong>
          <span>Invoice ยังไม่ถือว่าชำระสำเร็จจนกว่าเจ้าหน้าที่จะตรวจและยืนยันรับชำระ</span>
        </div>
      ) : (
        <div className="transfer-proof-warning" role="note">
          <strong>แนบหลักฐานแล้ว ≠ ชำระสำเร็จ</strong>
          <span>Invoice จะยังคงเป็น “รอชำระ” จนกว่าเจ้าหน้าที่ตรวจยอดและอนุมัติ</span>
        </div>
      )}

      {!invoices.length || !channels.length ? (
        <div className="empty">
          {!invoices.length ? 'ยังไม่มี Invoice ที่รอชำระ' : 'ยังไม่มีช่องทางรับโอนที่เปิดใช้งาน'}
        </div>
      ) : (
        <div className="transfer-proof-form">
          <label className="system-select-field">Invoice
            <span className="system-select-control">
              <select value={invoiceId} onChange={(event) => changeInvoice(event.target.value)}>
                {invoices.map((invoice) => (
                  <option key={invoice.id} value={invoice.id}>
                    {invoice.invoice_number} · {formatMoney(invoice.total_amount, invoice.currency)}
                  </option>
                ))}
              </select>
              <span className="system-select-arrow" aria-hidden="true">
                <svg viewBox="0 0 20 20" focusable="false"><path d="m6 8 4 4 4-4" /></svg>
              </span>
            </span>
          </label>
          <label className="system-select-field">ช่องทางที่โอน
            <span className="system-select-control">
              <select value={channelId} onChange={(event) => { setChannelId(event.target.value); setReviewing(false) }}>
                {channels.map((channel) => <option key={channel.id} value={channel.id}>{channel.display_name} · {channel.provider_name}</option>)}
              </select>
              <span className="system-select-arrow" aria-hidden="true">
                <svg viewBox="0 0 20 20" focusable="false"><path d="m6 8 4 4 4-4" /></svg>
              </span>
            </span>
          </label>
          {selectedChannel && (
            <div className="transfer-channel-customer-summary">
              <div><span>ชื่อบัญชี</span><strong>{selectedChannel.account_name}</strong></div>
              <div><span>เลขบัญชี / พร้อมเพย์</span><strong>{selectedChannel.account_identifier}</strong></div>
              {selectedChannel.customer_instructions && <p>{selectedChannel.customer_instructions}</p>}
            </div>
          )}
          <div className="form-grid-two">
            <label>ยอดที่โอน
              <input type="number" min="0.01" step="0.01" value={amount} onChange={(event) => { setAmount(event.target.value); setReviewing(false) }} />
            </label>
            <label>วันและเวลาที่โอน
              <input type="datetime-local" value={transferredAt} onChange={(event) => { setTransferredAt(event.target.value); setReviewing(false) }} />
            </label>
          </div>
          <div className="system-file-field">
            <div className="system-file-heading">
              <strong>ไฟล์หลักฐาน</strong>
              <span>JPG, PNG, WebP หรือ PDF · ไม่เกิน 5 MB</span>
            </div>
            <label
              className={`system-file-drop-zone${isDragging ? ' is-dragging' : ''}`}
              onDragEnter={(event) => { event.preventDefault(); setIsDragging(true) }}
              onDragOver={(event) => { event.preventDefault(); setIsDragging(true) }}
              onDragLeave={(event) => { event.preventDefault(); setIsDragging(false) }}
              onDrop={dropFile}
            >
              <input
                key={fileInputKey}
                className="system-file-input"
                type="file"
                accept="image/jpeg,image/png,image/webp,application/pdf"
                onChange={(event) => selectFile(event.target.files?.[0] ?? null)}
              />
              <span className="system-upload-icon" aria-hidden="true">
                <svg viewBox="0 0 24 24" focusable="false"><path d="M12 16V4m0 0L7.5 8.5M12 4l4.5 4.5M5 15.5v2.75A1.75 1.75 0 0 0 6.75 20h10.5A1.75 1.75 0 0 0 19 18.25V15.5" /></svg>
              </span>
              <strong>ลากไฟล์มาวางที่นี่</strong>
              <span>หรือ <b>คลิกเพื่อเลือกไฟล์จากเครื่อง</b></span>
            </label>
            {file && (
              <div className="system-file-card" role="status">
                <div
                  className={`system-file-preview${filePreviewUrl ? ' has-image' : ''}`}
                  style={filePreviewUrl ? { backgroundImage: `url(${filePreviewUrl})` } : undefined}
                  aria-hidden="true"
                >
                  {!filePreviewUrl && (file.type === 'application/pdf' ? 'PDF' : 'FILE')}
                </div>
                <div className="system-file-info">
                  <strong>{file.name}</strong>
                  <span>{(file.size / 1024 / 1024).toFixed(2)} MB · พร้อมแนบ</span>
                </div>
                <button type="button" className="system-file-remove" onClick={removeFile} aria-label={`ลบไฟล์ ${file.name}`}>ลบไฟล์</button>
              </div>
            )}
          </div>
          <label>หมายเหตุ (ถ้ามี)
            <textarea rows={3} maxLength={500} value={note} onChange={(event) => { setNote(event.target.value); setReviewing(false) }} placeholder="เช่น ชื่อผู้โอน หรือข้อมูลที่ช่วยตรวจสอบ" />
          </label>
          {error && <div className="error" role="alert">{error}</div>}
          {success && <div className="success" role="status">{success}</div>}
          {!reviewing && <button type="button" className="button" onClick={preview}>ตรวจสอบก่อนส่งหลักฐาน</button>}
          {reviewing && selectedInvoice && selectedChannel && file && (
            <section className="transfer-proof-review" aria-label="ตรวจสอบข้อมูลก่อนส่งหลักฐาน">
              <div className="status-title-row"><span className="status invited">ตรวจสอบครั้งสุดท้าย</span><h3>ส่งหลักฐานการโอน</h3></div>
              <dl>
                <div><dt>Invoice</dt><dd>{selectedInvoice.invoice_number}</dd></div>
                <div><dt>ช่องทาง</dt><dd>{selectedChannel.display_name}</dd></div>
                <div><dt>ยอดที่แจ้ง</dt><dd>{formatMoney(Number(amount), selectedInvoice.currency)}</dd></div>
                <div><dt>ไฟล์</dt><dd>{file.name} · {(file.size / 1024 / 1024).toFixed(2)} MB</dd></div>
              </dl>
              <div className="button-row">
                <button type="button" className="button secondary" onClick={() => setReviewing(false)} disabled={saving}>ย้อนกลับแก้ไข</button>
                <button type="button" className="button" onClick={submit} disabled={saving}>{saving ? 'กำลังอัปโหลด…' : 'ยืนยันส่งหลักฐาน'}</button>
              </div>
            </section>
          )}
        </div>
      )}

      {proofs.length > 0 && (
        <section className="transfer-proof-history">
          <h3>หลักฐานล่าสุด</h3>
          {proofs.map((proof) => (
            <div key={proof.id} className="transfer-proof-history-row">
              <div><strong>{proof.original_file_name}</strong><span>{formatMoney(proof.claimed_amount, invoiceCurrencyById.get(proof.invoice_id) ?? 'THB')}</span></div>
              <span className={`status ${proof.fulfilled_payment_id ? 'active' : proof.status === 'rejected' ? 'revoked' : proof.status === 'accepted' ? 'invited' : 'pending'}`}>
                {proof.fulfilled_payment_id
                  ? `ชำระแล้ว${proof.payment_number ? ` · ${proof.payment_number}` : ''}`
                  : proof.status === 'accepted'
                    ? 'หลักฐานผ่าน · รอยืนยันรับชำระ'
                    : proofStatusLabel[proof.status] ?? proof.status}
              </span>
            </div>
          ))}
        </section>
      )}
    </article>
  )
}

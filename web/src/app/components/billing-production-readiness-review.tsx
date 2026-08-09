'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { readinessManualItems, type ReadinessManualChecklist } from '@/lib/billing/readiness-manual'
import { createClient } from '@/lib/supabase/browser'

export function BillingProductionReadinessReview({
  initialChecklist,
  initialNote,
}: {
  initialChecklist?: Partial<ReadinessManualChecklist> | null
  initialNote?: string | null
}) {
  const router = useRouter()
  const initial = Object.fromEntries(readinessManualItems.map((item) => [item.key, Boolean(initialChecklist?.[item.key])])) as ReadinessManualChecklist
  const [checklist, setChecklist] = useState<ReadinessManualChecklist>(initial)
  const [note, setNote] = useState(initialNote ?? '')
  const [preview, setPreview] = useState(false)
  const [loading, setLoading] = useState(false)
  const [message, setMessage] = useState<string | null>(null)
  const completed = Object.values(checklist).filter(Boolean).length
  const noteValid = note.trim().length >= 10

  function prepare() {
    setMessage(null)
    if (!noteValid) {
      setMessage('กรุณาระบุหลักฐานหรือหมายเหตุอย่างน้อย 10 ตัวอักษร')
      return
    }
    setPreview(true)
  }

  async function confirm() {
    setLoading(true)
    setMessage(null)
    try {
      const { error } = await createClient().rpc('platform_record_billing_production_readiness_review', {
        p_command_id: crypto.randomUUID(),
        p_manual_checklist: checklist,
        p_evidence_note: note.trim(),
      })
      if (error) throw error
      setPreview(false)
      setMessage('บันทึกผลตรวจความพร้อมแล้ว โดยยังไม่ได้เปิดรับเงินจริง')
      router.refresh()
    } catch (error) {
      const raw = error instanceof Error ? error.message : ''
      setMessage(raw.includes('platform_admin_aal2_required')
        ? 'กรุณายืนยัน MFA ก่อนบันทึกผลตรวจ'
        : raw.includes('readiness_evidence')
          ? 'กรุณาระบุหลักฐานหรือหมายเหตุ 10–2,000 ตัวอักษร'
          : 'ไม่สามารถบันทึกผลตรวจได้ กรุณาลองใหม่')
    } finally {
      setLoading(false)
    }
  }

  return <section className="readiness-review-card">
    <div className="feature-list-heading"><div><div className="eyebrow">รายการที่ผู้ดูแลต้องรับรอง</div><h2>ตรวจเอกสารและขั้นตอนปฏิบัติงาน</h2><p>ติ๊กเฉพาะข้อที่ตรวจหลักฐานจริงแล้ว สามารถบันทึกความคืบหน้าได้</p></div><span className="feature-count">{completed} / {readinessManualItems.length} ข้อ</span></div>
    {!preview ? <>
      <div className="readiness-manual-list">{readinessManualItems.map((item) => <label className={`readiness-manual-item ${checklist[item.key] ? 'checked' : ''}`} key={item.key}>
        <input type="checkbox" checked={checklist[item.key]} onChange={(event) => setChecklist((current) => ({ ...current, [item.key]: event.target.checked }))} />
        <span><strong>{item.label}</strong><small>{item.help}</small></span>
      </label>)}</div>
      <label className="readiness-note">หลักฐานหรือหมายเหตุ<textarea value={note} maxLength={2000} onChange={(event) => setNote(event.target.value)} placeholder="เช่น ผู้ตรวจ วันที่ เอกสารอ้างอิง และรายการที่ยังติดขัด โดยห้ามใส่ Secret Key" /><span className="field-help">อย่างน้อย 10 ตัวอักษร · ห้ามบันทึก Key, Password หรือข้อมูลบัญชีเต็ม</span></label>
      {message && <div className={message.startsWith('บันทึก') ? 'success' : 'error'} role="status">{message}</div>}
      <button className="button" type="button" onClick={prepare}>ตรวจสอบก่อนบันทึก</button>
    </> : <div className="subscription-confirmation">
      <div className="subscription-confirmation-heading"><div><span className="eyebrow">ตรวจสอบครั้งสุดท้าย</span><h3>ผลตรวจด้วยผู้ดูแล {completed} จาก {readinessManualItems.length} ข้อ</h3></div><span className="status pending">ยังไม่บันทึก</span></div>
      <p>{completed === readinessManualItems.length ? 'รายการที่ต้องรับรองครบแล้ว' : `ยังเหลือ ${readinessManualItems.length - completed} ข้อที่ต้องตรวจหลักฐาน`}</p>
      <div className="readiness-preview-note"><strong>หลักฐานหรือหมายเหตุ</strong><span>{note.trim()}</span></div>
      <div className="button-row"><button className="button secondary" type="button" disabled={loading} onClick={() => setPreview(false)}>ย้อนกลับแก้ไข</button><button className="button" type="button" disabled={loading} onClick={confirm}>{loading ? 'กำลังบันทึก…' : 'ยืนยันบันทึกผลตรวจ'}</button></div>
      {message && <div className="error" role="alert">{message}</div>}
    </div>}
  </section>
}

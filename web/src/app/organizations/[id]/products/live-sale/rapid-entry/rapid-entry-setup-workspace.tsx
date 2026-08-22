'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { parseRapidBrowserDraft, rapidBrowserDraftStorageKey } from './rapid-entry-browser-draft'
import type { RapidBrowserDraft } from './rapid-entry-browser-draft'
import { RapidEntryTable } from './rapid-entry-table'
import { RapidNamingTemplateBuilder } from './rapid-naming-template-builder'
import { RapidPrefixAssistant } from './rapid-prefix-assistant'
import type { RapidRangeSelection } from './rapid-prefix-assistant'
import { formatRapidReservationRemaining, resolveRapidReservationWindow } from './rapid-reservation-window'

type Props = {
  organizationId: string
  actorUserId: string
  canManage: boolean
  activeReservation: RapidRangeSelection | null
}

export function RapidEntrySetupWorkspace({ organizationId, actorUserId, canManage, activeReservation }: Props) {
  const [selectedRange, setSelectedRange] = useState<RapidRangeSelection | null>(activeReservation)
  const [namingTemplate, setNamingTemplate] = useState('PayDay-{code}')
  const [pendingDraft, setPendingDraft] = useState<RapidBrowserDraft | null>(null)
  const [restoredDraft, setRestoredDraft] = useState<RapidBrowserDraft | null>(null)
  const [discardOpen, setDiscardOpen] = useState(false)
  const [draftNotice, setDraftNotice] = useState('')
  const [draftSavedAt, setDraftSavedAt] = useState('')
  const [nowMs, setNowMs] = useState(0)
  const ignoreNextPrefixResetRef = useRef(false)
  const storageKey = rapidBrowserDraftStorageKey(organizationId, actorUserId)

  useEffect(() => {
    const raw = window.localStorage.getItem(storageKey)
    if (!raw) return
    const draft = parseRapidBrowserDraft(raw, organizationId, actorUserId)
    if (!draft) {
      window.localStorage.removeItem(storageKey)
      setDraftNotice('พบ Browser Draft ที่ไม่สมบูรณ์ ระบบล้างข้อมูลนั้นเพื่อความปลอดภัยแล้ว')
      return
    }
    setPendingDraft(draft)
  }, [actorUserId, organizationId, storageKey])

  useEffect(() => {
    setNowMs(Date.now())
    const timer = window.setInterval(() => setNowMs(Date.now()), 30_000)
    return () => window.clearInterval(timer)
  }, [])

  const handleDraftSaved = useCallback((savedAt: string, message: string) => {
    setDraftSavedAt(savedAt)
    setDraftNotice(message)
  }, [])
  const handleDraftRestored = useCallback(() => setRestoredDraft(null), [])
  const handleRangeSelect = useCallback((range: RapidRangeSelection | null) => {
    if (!range && ignoreNextPrefixResetRef.current) {
      ignoreNextPrefixResetRef.current = false
      return
    }
    setRestoredDraft(null)
    setSelectedRange(range)
  }, [])

  function restoreDraft() {
    if (!pendingDraft) return
    setNamingTemplate(pendingDraft.namingTemplate)
    ignoreNextPrefixResetRef.current = true
    setSelectedRange(pendingDraft.range)
    setRestoredDraft(pendingDraft)
    setPendingDraft(null)
    const imageCount = pendingDraft.rows.filter((row) => row.imageFileName).length
    setDraftNotice(imageCount
      ? `กู้คืน Browser Draft แล้ว · กรุณาเลือกภาพใหม่ ${imageCount} รายการ เพราะระบบไม่เก็บไฟล์ภาพไว้ใน Browser`
      : 'กู้คืน Browser Draft แล้ว คุณทำงานต่อจากข้อมูลเดิมได้ทันที')
  }

  function discardDraft() {
    window.localStorage.removeItem(storageKey)
    setPendingDraft(null)
    setRestoredDraft(null)
    setSelectedRange(null)
    setNamingTemplate('PayDay-{code}')
    setDraftSavedAt('')
    setDraftNotice('ล้าง Browser Draft แล้ว')
    setDiscardOpen(false)
  }

  const editorEnabled = canManage && !pendingDraft
  const reservationWindow = selectedRange?.expiresAt && nowMs
    ? resolveRapidReservationWindow(selectedRange.expiresAt, nowMs)
    : null
  const reservationExpired = Boolean(selectedRange && (
    selectedRange.reserved !== true || !selectedRange.expiresAt || reservationWindow?.state === 'expired'
  ))
  const reservationTone = reservationExpired ? 'expired' : reservationWindow?.state ?? 'active'
  const reservationTitle = reservationExpired
    ? 'หมดเวลาจองรหัสแล้ว — ข้อมูลที่กรอกไม่หาย'
    : reservationWindow
      ? `จองรหัสแล้ว · เหลือ ${formatRapidReservationRemaining(reservationWindow.remainingMs)}`
      : 'กำลังเตรียมสถานะการจองรหัส'
  const pendingReservationWindow = pendingDraft?.range.expiresAt && nowMs
    ? resolveRapidReservationWindow(pendingDraft.range.expiresAt, nowMs)
    : null
  const pendingReservationExpired = Boolean(pendingDraft && (
    pendingDraft.range.reserved !== true || !pendingDraft.range.expiresAt || pendingReservationWindow?.state === 'expired'
  ))

  return <div className="live-sale-rapid-setup-stack">
    {pendingDraft ? <section className="live-sale-rapid-draft-notice is-recovery" role="status" aria-labelledby="rapidDraftRecoveryTitle">
      <div><span className="live-sale-rapid-kicker">Browser Draft · พบงานที่ยังไม่เสร็จ</span><h3 id="rapidDraftRecoveryTitle">ต้องการทำงานชุดเดิมต่อหรือไม่?</h3>
        <p>{pendingDraft.range.prefix}{String(pendingDraft.range.start).padStart(3, '0')}–{pendingDraft.range.prefix}{String(pendingDraft.range.end).padStart(3, '0')} · บันทึกล่าสุด {new Date(pendingDraft.savedAt).toLocaleString('th-TH')}</p>
        <p>{pendingReservationExpired
          ? 'การจองรหัสหมดอายุแล้ว · เปิด Draft เพื่อดูข้อมูลได้ แต่ระบบจะไม่ส่งสร้าง'
          : pendingReservationWindow
            ? `การจองรหัสเหลือ ${formatRapidReservationRemaining(pendingReservationWindow.remainingMs)}`
            : 'กำลังตรวจสอบเวลาจองรหัส'}</p></div>
      <div><button className="button secondary" type="button" onClick={() => setDiscardOpen(true)}>ล้าง Draft</button><button className="button" type="button" onClick={restoreDraft}>{pendingReservationExpired ? 'เปิดดู Draft' : 'กู้คืนและทำต่อ'}</button></div>
    </section> : null}
    {!pendingDraft && (selectedRange || draftNotice) ? <section id="rapidReservationStatus" className={`live-sale-rapid-draft-notice is-compact is-${reservationTone}${draftNotice.includes('ไม่สมบูรณ์') ? ' is-warning' : ''}`} role="status" aria-live="polite">
      <div><strong>{selectedRange ? reservationTitle : 'สถานะ Browser Draft'}</strong>
        <p>{reservationExpired
          ? 'ระบบหยุดส่งสร้างเพื่อไม่ให้ใช้รหัสที่หมดเวลา ข้อมูลเดิมยังอยู่ใน Browser Draft และเปิดดูได้'
          : selectedRange?.expiresAt
            ? `หมดอายุ ${new Date(selectedRange.expiresAt).toLocaleString('th-TH')} · Browser Draft บันทึกเงียบอัตโนมัติ${draftSavedAt ? ` · ล่าสุด ${new Date(draftSavedAt).toLocaleTimeString('th-TH')}` : ''}`
            : draftNotice || 'ข้อมูลจะบันทึกอัตโนมัติภายใน Browser เครื่องนี้'}</p></div>
      {selectedRange ? <button className="button secondary" type="button" onClick={() => setDiscardOpen(true)}>ล้าง Draft</button> : null}
    </section> : null}
    <RapidPrefixAssistant organizationId={organizationId} canManage={editorEnabled} reservedRange={selectedRange} onRangeSelect={handleRangeSelect} />
    <RapidNamingTemplateBuilder selectedRange={selectedRange} canManage={editorEnabled} onTemplateChange={setNamingTemplate} />
    <RapidEntryTable organizationId={organizationId} actorUserId={actorUserId} selectedRange={selectedRange} namingTemplate={namingTemplate} canManage={editorEnabled} reservationExpired={reservationExpired}
      restoredDraft={restoredDraft} onDraftRestored={handleDraftRestored} onDraftSaved={handleDraftSaved} />
    {discardOpen ? <div className="live-sale-rapid-bulk-dialog-backdrop" role="presentation"><section className="live-sale-rapid-bulk-dialog" role="dialog" aria-modal="true" aria-labelledby="rapidDiscardDraftTitle">
      <header><div><span className="live-sale-rapid-kicker">ยืนยันการล้างข้อมูล</span><h4 id="rapidDiscardDraftTitle">ล้าง Browser Draft ชุดนี้?</h4></div><button type="button" onClick={() => setDiscardOpen(false)} aria-label="ปิดหน้าต่างยืนยันล้าง Draft">×</button></header>
      <div><p>ข้อมูลที่กรอกในตารางและการเลือกต่าง ๆ จะถูกลบออกจาก Browser เครื่องนี้ และไม่สามารถกู้คืนได้</p>
        {selectedRange?.reserved ? <p><strong>ช่วงรหัสที่จองจะไม่ถูกคืนทันที</strong> และยังคงถูกกันไว้บนระบบจนกว่าจะครบ 3 ชั่วโมง เพื่อป้องกันผู้ใช้งานหลายคนได้รับรหัสชุดเดียวกัน</p> : null}</div>
      <footer><button className="button secondary" type="button" onClick={() => setDiscardOpen(false)}>ยกเลิก</button><button className="button" type="button" onClick={discardDraft}>ยืนยันล้าง Draft</button></footer>
    </section></div> : null}
  </div>
}

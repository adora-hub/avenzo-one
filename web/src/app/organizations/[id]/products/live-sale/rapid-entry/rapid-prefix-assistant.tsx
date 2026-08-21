'use client'

import { useEffect, useRef, useState } from 'react'
import type { ChangeEvent } from 'react'
import { RapidInfoHint } from './rapid-info-hint'

type Props = {
  canManage: boolean
  onRangeSelect?: (range: RapidRangeSelection | null) => void
}

type PrefixStatus = 'idle' | 'checking' | 'ready' | 'conflict' | 'error' | 'denied'

type RangeSuggestion = {
  prefix: string
  start: number
  end: number
  occupiedUntil: number
}

export type RapidRangeSelection = RangeSuggestion

const RANGE_SIZE = 50
const PREFIX_PATTERN = /^[A-Z0-9-]{1,8}$/

function codeFor(prefix: string, number: number) {
  return `${prefix}${String(number).padStart(3, '0')}`
}

function suggestionFor(prefix: string): RangeSuggestion {
  const occupiedUntil = prefix === 'A' ? 119 : prefix === 'B' ? 50 : 0
  const start = occupiedUntil + 1
  return { prefix, start, end: start + RANGE_SIZE - 1, occupiedUntil }
}

function rangeLabel(range: RangeSuggestion) {
  return `${codeFor(range.prefix, range.start)}–${codeFor(range.prefix, range.end)}`
}

function SearchIcon() {
  return <svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="11" cy="11" r="7" /><path d="m16.5 16.5 4 4" /></svg>
}

function InfoIcon() {
  return <svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="9" /><path d="M12 11v6M12 7.5v.5" /></svg>
}

export function RapidPrefixAssistant({ canManage, onRangeSelect }: Props) {
  const requestSequenceRef = useRef(0)
  const [prefix, setPrefix] = useState('A')
  const [status, setStatus] = useState<PrefixStatus>(canManage ? 'idle' : 'denied')
  const [suggestion, setSuggestion] = useState<RangeSuggestion | null>(null)
  const [selectedRange, setSelectedRange] = useState('')
  const [retryKey, setRetryKey] = useState(0)

  useEffect(() => {
    const requestSequence = requestSequenceRef.current + 1
    requestSequenceRef.current = requestSequence
    setSelectedRange('')
    onRangeSelect?.(null)

    if (!canManage) {
      setStatus('denied')
      setSuggestion(null)
      return
    }

    if (!prefix) {
      setStatus('idle')
      setSuggestion(null)
      return
    }

    if (!PREFIX_PATTERN.test(prefix)) {
      setStatus('error')
      setSuggestion(null)
      return
    }

    setStatus('checking')
    setSuggestion(null)
    const timer = window.setTimeout(() => {
      if (requestSequenceRef.current !== requestSequence) return
      setSuggestion(suggestionFor(prefix))
      setStatus('ready')
    }, 450)

    return () => window.clearTimeout(timer)
  }, [canManage, onRangeSelect, prefix, retryKey])

  function updatePrefix(event: ChangeEvent<HTMLInputElement>) {
    setPrefix(event.target.value.toUpperCase().slice(0, 8))
  }

  function useSuggestion() {
    if (!suggestion || status !== 'ready') return
    setSelectedRange(rangeLabel(suggestion))
    onRangeSelect?.(suggestion)
  }

  function simulateConflict() {
    if (!suggestion || !canManage) return
    const nextStart = suggestion.end + 1
    setSuggestion({ ...suggestion, start: nextStart, end: nextStart + RANGE_SIZE - 1, occupiedUntil: suggestion.end })
    setSelectedRange('')
    onRangeSelect?.(null)
    setStatus('conflict')
  }

  function simulateError() {
    if (!canManage) return
    setSelectedRange('')
    onRangeSelect?.(null)
    setStatus('error')
  }

  function retryCheck() {
    setRetryKey((current) => current + 1)
  }

  const prefixError = prefix && !PREFIX_PATTERN.test(prefix)

  return <section className="live-sale-prefix-assistant" aria-labelledby="rapidPrefixTitle">
    <header className="live-sale-rapid-section-header">
      <div className="live-sale-rapid-section-title">
        <span aria-hidden="true">1</span>
        <div>
        <h3 id="rapidPrefixTitle">ค้นหาช่วงรหัสขาย</h3>
        <p>ระบบจะเริ่มตรวจอัตโนมัติหลังหยุดพิมพ์ 450ms และแนะนำรหัสว่างต่อเนื่อง 50 รายการ</p>
        </div>
      </div>
      <span className="live-sale-prefix-simulation-badge">UI Simulation</span>
    </header>

    <div className="live-sale-prefix-layout">
      <div className="live-sale-prefix-control">
        <span className="live-sale-rapid-field-label">
          <label htmlFor="rapidSalesCodePrefix">Prefix รหัสขาย <b>*</b></label>
          <RapidInfoHint label=" Prefix รหัสขาย" description="ใช้ A–Z, 0–9 หรือขีดกลาง สูงสุด 8 ตัวอักษร ระบบจะแปลงเป็นตัวพิมพ์ใหญ่อัตโนมัติ" />
        </span>
        <div className="live-sale-prefix-input-wrap">
          <SearchIcon />
          <input
            id="rapidSalesCodePrefix"
            value={prefix}
            onChange={updatePrefix}
            inputMode="text"
            autoComplete="off"
            maxLength={8}
            disabled={!canManage}
            aria-invalid={Boolean(prefixError)}
            aria-describedby="rapidPrefixHelp rapidPrefixStatus"
            placeholder="เช่น A หรือ LIVE-"
          />
          {status === 'checking' && <span className="live-sale-prefix-spinner" aria-hidden="true" />}
        </div>
        <small id="rapidPrefixHelp">ใช้ A–Z, 0–9 หรือขีดกลาง สูงสุด 8 ตัวอักษร ระบบจะแปลงเป็นตัวพิมพ์ใหญ่อัตโนมัติ</small>
      </div>

      <div id="rapidPrefixStatus" className={`live-sale-prefix-result is-${status}`} aria-live="polite">
        {status === 'idle' && <><strong>กรอก Prefix เพื่อเริ่มตรวจ</strong><span>ตัวอย่าง Prefix: A, B หรือ LIVE-</span></>}
        {status === 'checking' && <><strong>กำลังตรวจสอบช่วงรหัส…</strong><span>กำลังค้นหารหัสว่างต่อเนื่อง {RANGE_SIZE} รายการ</span></>}
        {status === 'ready' && suggestion && <>
          <div><span>ช่วงที่แนะนำ</span><strong>{rangeLabel(suggestion)}</strong></div>
          <p>{suggestion.occupiedUntil > 0 ? `${codeFor(suggestion.prefix, 1)}–${codeFor(suggestion.prefix, suggestion.occupiedUntil)} มีการใช้งานหรือถูกจองแล้ว` : `ยังไม่พบรหัส ${suggestion.prefix} ที่ใช้งานอยู่`}</p>
          <button className="button" type="button" onClick={useSuggestion}>ใช้ช่วงที่แนะนำ</button>
        </>}
        {status === 'conflict' && suggestion && <>
          <div><span>ช่วงเดิมไม่ว่างแล้ว</span><strong>แนะนำใหม่ {rangeLabel(suggestion)}</strong></div>
          <p>มีผู้ใช้อื่นจองช่วงก่อนหน้าในระหว่างตรวจ ระบบจะไม่เปลี่ยนช่วงให้อัตโนมัติ</p>
          <button className="button" type="button" onClick={() => { setStatus('ready'); setSelectedRange('') }}>ตรวจช่วงใหม่แล้ว</button>
        </>}
        {status === 'error' && <>
          <strong>{prefixError ? 'รูปแบบ Prefix ไม่ถูกต้อง' : 'ตรวจสอบช่วงรหัสไม่ได้'}</strong>
          <span>{prefixError ? 'กรุณาใช้เฉพาะ A–Z, 0–9 และขีดกลาง' : 'ข้อมูลที่กรอกยังอยู่ครบ กรุณาลองตรวจอีกครั้ง'}</span>
          {!prefixError && <button className="button secondary" type="button" onClick={retryCheck}>ลองตรวจอีกครั้ง</button>}
        </>}
        {status === 'denied' && <><strong>ไม่มีสิทธิ์ตรวจและจองรหัสขาย</strong><span>ติดต่อเจ้าของพื้นที่ทำงานเพื่อขอสิทธิ์สร้างสินค้า</span></>}
      </div>
    </div>

    {selectedRange && <p className="live-sale-prefix-selected" role="status"><span>✓</span>เลือกช่วง <strong>{selectedRange}</strong> สำหรับขั้นตอนถัดไปแล้ว — ยังไม่มีการจองรหัสจริง</p>}

    {canManage && <details className="live-sale-prefix-preview-tools">
      <summary>ทดสอบ State ของ UI Preview</summary>
      <div>
        <button type="button" onClick={simulateConflict} disabled={!suggestion || status === 'checking'}>จำลอง Conflict</button>
        <button type="button" onClick={simulateError} disabled={status === 'checking'}>จำลองตรวจไม่ได้</button>
        <button type="button" onClick={retryCheck}>กลับไปตรวจปกติ</button>
      </div>
      <p><InfoIcon />เครื่องมือนี้ใช้ตรวจหน้าตา UI บน localhost เท่านั้น และจะถูกถอดเมื่อเชื่อม Backend จริง</p>
    </details>}
  </section>
}

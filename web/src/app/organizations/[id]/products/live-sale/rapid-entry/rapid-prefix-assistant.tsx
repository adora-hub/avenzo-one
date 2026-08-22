'use client'

import { useEffect, useRef, useState } from 'react'
import type { ChangeEvent } from 'react'
import { previewGlobalSalesCodeRangeAction } from '@/app/actions/foundation'
import {
  globalSalesCodePreviewFailureMessage,
  withGlobalSalesCodePreviewTimeout,
} from '@/lib/foundation/global-sales-code-preview-ui'
import { normalizeGlobalSalesCodePrefix } from '@/lib/foundation/global-sales-code'
import { RapidInfoHint } from './rapid-info-hint'

type Props = {
  organizationId: string
  canManage: boolean
  onRangeSelect?: (range: RapidRangeSelection | null) => void
}

type PrefixStatus = 'idle' | 'checking' | 'ready' | 'error' | 'timeout' | 'denied'

type RangeSuggestion = {
  prefix: string
  start: number
  end: number
  occupiedUntil: number
  requestedPrefix?: string
  authoritative?: true
  movedToNextPrefix?: boolean
}

export type RapidRangeSelection = RangeSuggestion

const RANGE_SIZE = 50
const PREFIX_PATTERN = /^[A-Z]{1,3}$/

function codeFor(prefix: string, number: number) {
  return `${prefix}${String(number).padStart(3, '0')}`
}

function rangeLabel(range: RangeSuggestion) {
  return `${codeFor(range.prefix, range.start)}–${codeFor(range.prefix, range.end)}`
}

function SearchIcon() {
  return <svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="11" cy="11" r="7" /><path d="m16.5 16.5 4 4" /></svg>
}

export function RapidPrefixAssistant({ organizationId, canManage, onRangeSelect }: Props) {
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
    const timer = window.setTimeout(async () => {
      try {
        const result = await withGlobalSalesCodePreviewTimeout(
          previewGlobalSalesCodeRangeAction({ organizationId, prefix, quantity: RANGE_SIZE }),
        )
        if (requestSequenceRef.current !== requestSequence) return
        if (!result.ok) {
          setStatus(result.error === 'permission_denied' ? 'denied' : 'error')
          return
        }
        setSuggestion({
          prefix: result.data.prefix,
          start: result.data.startNumber,
          end: result.data.endNumber,
          occupiedUntil: Math.max(0, result.data.startNumber - 1),
          requestedPrefix: result.data.requestedPrefix,
          authoritative: true,
          movedToNextPrefix: result.data.movedToNextPrefix,
        })
        setStatus('ready')
      } catch (error) {
        if (requestSequenceRef.current !== requestSequence) return
        setStatus(error instanceof Error && error.message === 'global_sales_code_preview_timeout' ? 'timeout' : 'error')
      }
    }, 450)

    return () => window.clearTimeout(timer)
  }, [canManage, onRangeSelect, organizationId, prefix, retryKey])

  function updatePrefix(event: ChangeEvent<HTMLInputElement>) {
    setPrefix(normalizeGlobalSalesCodePrefix(event.target.value).replace(/[^A-Z]/g, '').slice(0, 3))
  }

  function useSuggestion() {
    if (!suggestion || status !== 'ready') return
    setSelectedRange(rangeLabel(suggestion))
    onRangeSelect?.(suggestion)
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
      <span className="live-sale-prefix-simulation-badge">ตรวจจากระบบจริง</span>
    </header>

    <div className="live-sale-prefix-layout">
      <div className="live-sale-prefix-control">
        <span className="live-sale-rapid-field-label">
          <label htmlFor="rapidSalesCodePrefix">Prefix รหัสขาย <b>*</b></label>
          <RapidInfoHint label=" Prefix รหัสขาย" description="ใช้ตัวอักษรอังกฤษ A–Z จำนวน 1–3 ตัว ระบบจะตรวจช่วงว่างจริง 50 รหัสกับฐานข้อมูล" />
        </span>
        <div className="live-sale-prefix-input-wrap">
          <SearchIcon />
          <input
            id="rapidSalesCodePrefix"
            value={prefix}
            onChange={updatePrefix}
            inputMode="text"
            autoComplete="off"
            maxLength={3}
            disabled={!canManage}
            aria-invalid={Boolean(prefixError)}
            aria-describedby="rapidPrefixHelp rapidPrefixStatus"
            placeholder="เช่น A หรือ AB"
          />
          {status === 'checking' && <span className="live-sale-prefix-spinner" aria-hidden="true" />}
        </div>
        <small id="rapidPrefixHelp">ใช้ A–Z จำนวน 1–3 ตัว · ระบบตรวจฐานข้อมูลจริงและไม่จองรหัสในขั้นตอนนี้</small>
      </div>

      <div id="rapidPrefixStatus" className={`live-sale-prefix-result is-${status}`} aria-live="polite">
        {status === 'idle' && <><strong>กรอก Prefix เพื่อเริ่มตรวจ</strong><span>ตัวอย่าง Prefix: A, B หรือ AA</span></>}
        {status === 'checking' && <><strong>กำลังตรวจสอบช่วงรหัส…</strong><span>กำลังค้นหารหัสว่างต่อเนื่อง {RANGE_SIZE} รายการ</span></>}
        {status === 'ready' && suggestion && <>
          <div><span>ช่วงที่แนะนำ</span><strong>{rangeLabel(suggestion)}</strong></div>
          <p>{suggestion.movedToNextPrefix ? `Prefix ${suggestion.requestedPrefix} มีช่วงว่างไม่พอ ระบบเลื่อนไป ${suggestion.prefix} โดยอัตโนมัติ` : suggestion.occupiedUntil > 0 ? `${codeFor(suggestion.prefix, 1)}–${codeFor(suggestion.prefix, suggestion.occupiedUntil)} มีการใช้งานหรือถูกจองแล้ว` : `ยังไม่พบรหัส ${suggestion.prefix} ที่ใช้งานอยู่`}</p>
          <button className="button" type="button" onClick={useSuggestion}>ใช้ช่วงที่แนะนำ</button>
        </>}
        {status === 'error' && <>
          <strong>{prefixError ? 'รูปแบบ Prefix ไม่ถูกต้อง' : 'ตรวจสอบช่วงรหัสไม่ได้'}</strong>
          <span>{prefixError ? 'กรุณาใช้ตัวอักษรอังกฤษ A–Z จำนวน 1–3 ตัว' : globalSalesCodePreviewFailureMessage(null)}</span>
          {!prefixError && <button className="button secondary" type="button" onClick={retryCheck}>ลองตรวจอีกครั้ง</button>}
        </>}
        {status === 'timeout' && <><strong>การตรวจสอบใช้เวลานานเกินไป</strong><span>ข้อมูลที่กรอกยังอยู่ครบ กรุณาตรวจสอบรหัสอีกครั้ง</span><button className="button secondary" type="button" onClick={retryCheck}>ตรวจสอบรหัสอีกครั้ง</button></>}
        {status === 'denied' && <><strong>ไม่มีสิทธิ์ตรวจและจองรหัสขาย</strong><span>ติดต่อเจ้าของพื้นที่ทำงานเพื่อขอสิทธิ์สร้างสินค้า</span></>}
      </div>
    </div>

    {selectedRange && <p className="live-sale-prefix-selected" role="status"><span>✓</span>เลือกช่วง <strong>{selectedRange}</strong> จากฐานข้อมูลแล้ว — ยังไม่จองจนกดสร้างสินค้า</p>}
  </section>
}

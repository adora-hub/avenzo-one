'use client'

import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useEffect, useRef, useState } from 'react'
import type { ChangeEvent, FormEvent, KeyboardEvent } from 'react'

type Props = {
  organizationId: string
  organizationName: string
  canManage: boolean
}

type ReservationDraft = {
  name: string
  prefix: string
  start: number
  count: number
  digits: number
  assignee: string
  branch: string
}

type QuickProductDraft = {
  name: string
  price: string
  quantity: string
  unit: string
  branch: string
  note: string
}

type QuickProductItem = QuickProductDraft & {
  code: string
  imageName: string
  imagePreviewUrl: string
  savedAt: string
}

type SalesCodeStatus = 'used' | 'next' | 'reserved' | 'skipped'
type SalesCodeFilter = 'all' | SalesCodeStatus

const DEFAULT_RESERVATION: ReservationDraft = {
  name: 'Live รอบใหม่ · สินค้าขายด่วน',
  prefix: 'B',
  start: 1,
  count: 50,
  digits: 3,
  assignee: 'แม่ค้าออนไลน์ A',
  branch: 'BKK-01',
}

const DEFAULT_QUICK_PRODUCT: QuickProductDraft = {
  name: '',
  price: '',
  quantity: '1',
  unit: 'คู่',
  branch: 'BKK-01',
  note: '',
}

function InfoIcon() {
  return <svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="9" /><path d="M12 11v6M12 7.5v.5" /></svg>
}

function ArrowLeftIcon() {
  return <svg viewBox="0 0 24 24" aria-hidden="true"><path d="m15 18-6-6 6-6M9 12h10" /></svg>
}

function BoltIcon() {
  return <svg viewBox="0 0 24 24" aria-hidden="true"><path d="m13 2-8 12h7l-1 8 8-12h-7z" /></svg>
}

function CodePoolIcon() {
  return <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 5h16v14H4zM8 9h3M8 13h8M8 17h5" /></svg>
}

function CloseIcon() {
  return <svg viewBox="0 0 24 24" aria-hidden="true"><path d="m6 6 12 12M18 6 6 18" /></svg>
}

function ImageIcon() {
  return <svg viewBox="0 0 24 24" aria-hidden="true"><rect x="3" y="4" width="18" height="16" rx="2" /><circle cx="9" cy="10" r="2" /><path d="m4 17 5-4 3 3 2-2 6 4" /></svg>
}

function codeFor(draft: ReservationDraft, number: number) {
  return `${draft.prefix || 'B'}${String(number).padStart(draft.digits, '0')}`
}

function reservationError(draft: ReservationDraft) {
  if (!draft.name.trim()) return 'กรุณากรอกชื่อชุดรหัส'
  if (!/^[A-Z0-9-]{1,8}$/.test(draft.prefix)) return 'Prefix ใช้ได้เฉพาะ A–Z, 0–9 และขีดกลาง สูงสุด 8 ตัวอักษร'
  if (!Number.isInteger(draft.start) || draft.start < 0) return 'เลขเริ่มต้นต้องเป็นจำนวนเต็มตั้งแต่ 0 ขึ้นไป'
  if (!Number.isInteger(draft.count) || draft.count < 1 || draft.count > 500) return 'จำนวนรหัสต้องอยู่ระหว่าง 1–500 รหัส'
  const last = draft.start + draft.count - 1
  if (last >= 10 ** draft.digits) return `ช่วงเลขเกิน ${draft.digits} หลัก กรุณาเพิ่มจำนวนหลักหรือลดจำนวนรหัส`
  return ''
}

export function LiveSaleReservationUi({ organizationId, organizationName, canManage }: Props) {
  const router = useRouter()
  const productsHref = `/organizations/${organizationId}/products`
  const rapidEntryHref = `${productsHref}/live-sale/rapid-entry`
  const triggerRef = useRef<HTMLButtonElement>(null)
  const dialogRef = useRef<HTMLElement>(null)
  const nameRef = useRef<HTMLInputElement>(null)
  const quickNameRef = useRef<HTMLInputElement>(null)
  const imageInputRef = useRef<HTMLInputElement>(null)
  const imagePreviewUrlRef = useRef('')
  const imageObjectUrlsRef = useRef<Set<string>>(new Set())
  const [dialogOpen, setDialogOpen] = useState(false)
  const [draft, setDraft] = useState<ReservationDraft>(DEFAULT_RESERVATION)
  const [reservation, setReservation] = useState<ReservationDraft | null>(null)
  const [quickDraft, setQuickDraft] = useState<QuickProductDraft>(DEFAULT_QUICK_PRODUCT)
  const [quickItems, setQuickItems] = useState<QuickProductItem[]>([])
  const [quickError, setQuickError] = useState('')
  const [quickStatus, setQuickStatus] = useState('')
  const [imageName, setImageName] = useState('')
  const [imagePreviewUrl, setImagePreviewUrl] = useState('')
  const [skippedCodes, setSkippedCodes] = useState<string[]>([])
  const [codeSearch, setCodeSearch] = useState('')
  const [codeFilter, setCodeFilter] = useState<SalesCodeFilter>('all')
  const error = reservationError(draft)
  const previewStart = codeFor(draft, draft.start)
  const previewEnd = codeFor(draft, draft.start + Math.max(draft.count, 1) - 1)
  const previewNext = codeFor(draft, draft.start + Math.max(draft.count, 1))

  useEffect(() => {
    if (!dialogOpen) return
    const previousOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    nameRef.current?.focus()
    return () => { document.body.style.overflow = previousOverflow }
  }, [dialogOpen])

  useEffect(() => () => {
    imageObjectUrlsRef.current.forEach((url) => URL.revokeObjectURL(url))
    imageObjectUrlsRef.current.clear()
  }, [])

  function closeDialog() {
    setDialogOpen(false)
    window.requestAnimationFrame(() => triggerRef.current?.focus())
  }

  function trapDialogFocus(event: KeyboardEvent<HTMLElement>) {
    if (event.key === 'Escape') {
      event.preventDefault()
      closeDialog()
      return
    }
    if (event.key !== 'Tab') return
    const controls = Array.from(dialogRef.current?.querySelectorAll<HTMLElement>('button:not(:disabled), input:not(:disabled), select:not(:disabled)') ?? [])
    if (!controls.length) return
    const first = controls[0]
    const last = controls[controls.length - 1]
    if (event.shiftKey && document.activeElement === first) {
      event.preventDefault()
      last.focus()
    } else if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault()
      first.focus()
    }
  }

  function updateDraft<K extends keyof ReservationDraft>(key: K, value: ReservationDraft[K]) {
    setDraft((current) => ({ ...current, [key]: value }))
  }

  function confirmReservation(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (error) return
    imageObjectUrlsRef.current.forEach((url) => URL.revokeObjectURL(url))
    imageObjectUrlsRef.current.clear()
    imagePreviewUrlRef.current = ''
    setImagePreviewUrl('')
    setImageName('')
    if (imageInputRef.current) imageInputRef.current.value = ''
    setReservation({ ...draft })
    setQuickDraft((current) => ({ ...current, branch: draft.branch }))
    setQuickItems([])
    setSkippedCodes([])
    setCodeSearch('')
    setCodeFilter('all')
    setQuickError('')
    setQuickStatus('')
    closeDialog()
  }

  function updateQuickDraft<K extends keyof QuickProductDraft>(key: K, value: QuickProductDraft[K]) {
    setQuickDraft((current) => ({ ...current, [key]: value }))
    setQuickError('')
  }

  function clearImagePreview() {
    if (imagePreviewUrlRef.current) {
      URL.revokeObjectURL(imagePreviewUrlRef.current)
      imageObjectUrlsRef.current.delete(imagePreviewUrlRef.current)
    }
    imagePreviewUrlRef.current = ''
    setImagePreviewUrl('')
    setImageName('')
    if (imageInputRef.current) imageInputRef.current.value = ''
  }

  function selectQuickImage(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0]
    if (!file) return
    if (!file.type.startsWith('image/')) {
      setQuickError('รองรับเฉพาะไฟล์รูปภาพเท่านั้น')
      event.target.value = ''
      return
    }
    if (file.size > 10 * 1024 * 1024) {
      setQuickError('รูปภาพต้องมีขนาดไม่เกิน 10 MB')
      event.target.value = ''
      return
    }
    if (imagePreviewUrlRef.current) {
      URL.revokeObjectURL(imagePreviewUrlRef.current)
      imageObjectUrlsRef.current.delete(imagePreviewUrlRef.current)
    }
    setImageName(file.name.slice(0, 180))
    const nextPreviewUrl = URL.createObjectURL(file)
    imageObjectUrlsRef.current.add(nextPreviewUrl)
    imagePreviewUrlRef.current = nextPreviewUrl
    setImagePreviewUrl(nextPreviewUrl)
    setQuickError('')
  }

  function resetQuickProduct() {
    setQuickDraft((current) => ({ ...DEFAULT_QUICK_PRODUCT, branch: current.branch }))
    imagePreviewUrlRef.current = ''
    setImagePreviewUrl('')
    setImageName('')
    if (imageInputRef.current) imageInputRef.current.value = ''
    window.requestAnimationFrame(() => quickNameRef.current?.focus())
  }

  function saveQuickProduct(destination: 'next' | 'products') {
    if (!reservation) {
      setQuickError('กรุณาจองชุดรหัสก่อนสร้างสินค้าขายด่วน')
      return
    }
    if (quickItems.length >= reservation.count) {
      setQuickError('ชุดรหัสนี้ถูกใช้ครบแล้ว')
      return
    }
    const price = Number(quickDraft.price)
    const quantity = Number(quickDraft.quantity)
    const errors: string[] = []
    if (!quickDraft.name.trim()) errors.push('กรุณากรอกชื่อสินค้า')
    if (quickDraft.price === '' || !Number.isFinite(price) || price < 0) errors.push('ราคาขายไม่ถูกต้อง')
    if (quickDraft.quantity === '' || !Number.isInteger(quantity) || quantity < 0) errors.push('จำนวนต้องเป็นจำนวนเต็มตั้งแต่ 0 ขึ้นไป')
    if (errors.length) {
      setQuickError(errors.join(' · '))
      return
    }

    const item: QuickProductItem = {
      ...quickDraft,
      name: quickDraft.name.trim().slice(0, 120),
      note: quickDraft.note.trim().slice(0, 240),
      code: activeNext,
      imageName,
      imagePreviewUrl,
      savedAt: new Date().toISOString(),
    }
    const nextItems = [...quickItems, item]
    setQuickItems(nextItems)
    setQuickError('')
    const nextUsedCodes = new Set(nextItems.map((entry) => entry.code))
    const skippedCodeSet = new Set(skippedCodes)
    const followingCode = Array.from({ length: reservation.count }, (_, index) => codeFor(reservation, reservation.start + index))
      .find((code) => !nextUsedCodes.has(code) && !skippedCodeSet.has(code)) ?? 'ครบชุด'
    setQuickStatus(`บันทึก ${item.code} ใน UI Simulation แล้ว · รหัสถัดไป ${followingCode}`)
    if (destination === 'products') {
      router.push(productsHref)
      return
    }
    resetQuickProduct()
  }

  function submitQuickProduct(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    saveQuickProduct('next')
  }

  const activeStart = reservation ? codeFor(reservation, reservation.start) : ''
  const activeEnd = reservation ? codeFor(reservation, reservation.start + reservation.count - 1) : ''
  const reservationCodes = reservation
    ? Array.from({ length: reservation.count }, (_, index) => codeFor(reservation, reservation.start + index))
    : []
  const quickItemByCode = new Map(quickItems.map((item) => [item.code, item]))
  const skippedCodeSet = new Set(skippedCodes)
  const activeNext = reservationCodes.find((code) => !quickItemByCode.has(code) && !skippedCodeSet.has(code)) ?? 'ครบชุด'
  const remainingCodes = reservationCodes.filter((code) => !quickItemByCode.has(code) && !skippedCodeSet.has(code)).length
  const codeRows = reservationCodes.map((code) => {
    const item = quickItemByCode.get(code)
    const status: SalesCodeStatus = item ? 'used' : skippedCodeSet.has(code) ? 'skipped' : code === activeNext ? 'next' : 'reserved'
    return { code, item, status }
  })
  const filteredCodeRows = codeRows.filter((row) => {
    if (codeFilter !== 'all' && row.status !== codeFilter) return false
    const query = codeSearch.trim().toLocaleLowerCase('th-TH')
    if (!query) return true
    return row.code.toLocaleLowerCase('th-TH').includes(query) || row.item?.name.toLocaleLowerCase('th-TH').includes(query)
  })
  const codeCounts = {
    used: codeRows.filter((row) => row.status === 'used').length,
    next: codeRows.filter((row) => row.status === 'next').length,
    reserved: codeRows.filter((row) => row.status === 'reserved').length,
    skipped: codeRows.filter((row) => row.status === 'skipped').length,
  }

  function skipSalesCode(code: string) {
    if (code !== activeNext || !canManage) return
    setSkippedCodes((current) => current.includes(code) ? current : [...current, code])
    setQuickStatus(`ข้ามรหัส ${code} ใน UI Simulation แล้ว · สามารถนำกลับมาใช้ได้จากตารางสถานะรหัส`)
  }

  function restoreSalesCode(code: string) {
    if (!canManage) return
    setSkippedCodes((current) => current.filter((entry) => entry !== code))
    setQuickStatus(`นำรหัส ${code} กลับมาใช้แล้ว`)
  }

  return <>
    <header className="live-sale-page-heading">
      <div className="live-sale-heading-copy">
        <span className="live-sale-eyebrow">LIVE SALE</span>
        <div className="live-sale-title-line">
          <h1>ชุดรหัสขายด่วน</h1>
          <span className="live-sale-preview-badge">UI PREVIEW</span>
        </div>
        <p>จองรหัสขายล่วงหน้า แล้วเพิ่มสินค้ามาไว–ไปไวต่อเนื่องสำหรับ {organizationName}</p>
      </div>
      <div className="live-sale-heading-actions">
        <Link className="button secondary" href={productsHref}><ArrowLeftIcon />กลับหน้าสินค้า</Link>
        <Link className="button secondary" href={rapidEntryHref}>กรอกสินค้าแบบตาราง</Link>
        <button ref={triggerRef} className="button" type="button" disabled={!canManage} aria-haspopup="dialog" onClick={() => setDialogOpen(true)}>＋ จองชุดรหัส</button>
      </div>
    </header>

    <section id="liveSalePreviewNotice" className="live-sale-preview-notice" role="note">
      <InfoIcon />
      <div>
        <strong>UI Preview เท่านั้น</strong>
        <span>การทดลองจองในหน้านี้ไม่จองรหัส ไม่สร้าง Product/SKU ไม่เปิดบิล และไม่เปลี่ยนแปลง Stock จริง</span>
      </div>
    </section>

    <section className="live-sale-shell-stage" aria-label="พื้นที่ทำงาน Live Sale">
      {reservation ? <article className="live-sale-reservation-card" aria-labelledby="activeReservationTitle">
        <header>
          <div>
            <div className="live-sale-reservation-title"><h2 id="activeReservationTitle">{reservation.name}</h2><span><i />UI Simulation</span></div>
            <p>ช่วงรหัส <strong>{activeStart}–{activeEnd}</strong> · ผู้รับผิดชอบ {reservation.assignee || 'ยังไม่ระบุ'} · สาขา {reservation.branch}</p>
          </div>
          <button className="button secondary" type="button" onClick={() => { setDraft(reservation); setDialogOpen(true) }}>แก้ไขรายละเอียด</button>
        </header>
        <div className="live-sale-reservation-metrics">
          <div><span>รหัสทั้งหมด</span><strong>{reservation.count}</strong></div>
          <div><span>ใช้แล้ว</span><strong>{quickItems.length}</strong></div>
          <div><span>คงเหลือ</span><strong>{remainingCodes}</strong></div>
          <div><span>รหัสถัดไป</span><strong className="code">{activeNext}</strong></div>
        </div>
        <div className="live-sale-reservation-progress" aria-label={`ใช้รหัสแล้ว ${quickItems.length} จาก ${reservation.count}`}><span style={{ width: `${(quickItems.length / reservation.count) * 100}%` }} /></div>
      </article> : <div className="live-sale-shell-intro">
        <span className="live-sale-shell-icon"><BoltIcon /></span>
        <div>
          <h2>ยังไม่มีชุดรหัสขายด่วน</h2>
          <p>กด “จองชุดรหัส” เพื่อกำหนด Prefix เลขเริ่มต้น และจำนวนรหัสสำหรับรอบขาย</p>
        </div>
        <span className="live-sale-shell-status">พร้อมทดลองจอง</span>
      </div>}

      <div className="live-sale-shell-grid" aria-label="ลำดับการทำงาน">
        <article className="live-sale-shell-panel">
          <header>
            <div><h2>สร้างสินค้าขายด่วน</h2><p>กรอกข้อมูลที่จำเป็น แล้วไปยังรหัสถัดไปได้ต่อเนื่อง</p></div>
            <span aria-label="ขั้นตอนที่ 1">1</span>
          </header>
          {reservation ? <div className="live-sale-quick-create-body">
            <form className="live-sale-quick-form" noValidate onSubmit={submitQuickProduct}>
              <div className="live-sale-code-preview">
                <div><span>รหัสถัดไปในชุด</span><strong>{activeNext}</strong><small>ยืนยันจริงเมื่อเชื่อม Backend</small></div>
                <span className="live-sale-code-lock">จองชั่วคราว</span>
              </div>

              <div className="live-sale-quick-image-field">
                <span className="live-sale-field-label">รูปสินค้า <small>(ไม่บังคับ)</small></span>
                <button className="live-sale-quick-image-picker" type="button" onClick={() => imageInputRef.current?.click()}>
                  {imagePreviewUrl ? <span className="live-sale-quick-image-preview" style={{ backgroundImage: `url(${imagePreviewUrl})` }} aria-label={`ภาพตัวอย่าง ${imageName}`} /> : <span className="live-sale-quick-image-icon"><ImageIcon /></span>}
                  <span><strong>{imageName || 'เลือกรูปสินค้า'}</strong><small>JPG, PNG หรือ WebP · ไม่เกิน 10 MB</small></span>
                </button>
                <input ref={imageInputRef} className="live-sale-visually-hidden" type="file" accept="image/jpeg,image/png,image/webp" onChange={selectQuickImage} />
                {imageName ? <button className="live-sale-image-remove" type="button" onClick={clearImagePreview}>นำรูปออก</button> : null}
              </div>

              <div className="live-sale-quick-fields">
                <label className="wide"><span>ชื่อสินค้า <b>*</b></span><input ref={quickNameRef} maxLength={120} autoComplete="off" placeholder="เช่น ต่างหู Gucci สีเงิน" value={quickDraft.name} onChange={(event) => updateQuickDraft('name', event.target.value)} /></label>
                <label><span>ราคาขาย <b>*</b></span><input type="number" min="0" max="99999999" step="0.01" inputMode="decimal" placeholder="0.00" value={quickDraft.price} onChange={(event) => updateQuickDraft('price', event.target.value)} /></label>
                <label><span>จำนวนเริ่มต้น <b>*</b></span><input type="number" min="0" max="999999" step="1" inputMode="numeric" value={quickDraft.quantity} onChange={(event) => updateQuickDraft('quantity', event.target.value)} /></label>
                <label><span>หน่วยขาย</span><span className="live-sale-select-control"><select value={quickDraft.unit} onChange={(event) => updateQuickDraft('unit', event.target.value)}><option>ชิ้น</option><option>คู่</option><option>แพ็ค</option><option>ชุด</option><option>กล่อง</option></select></span></label>
                <label><span>สาขา</span><span className="live-sale-select-control"><select value={quickDraft.branch} onChange={(event) => updateQuickDraft('branch', event.target.value)}><option value="BKK-01">BKK-01 · กรุงเทพ</option><option value="PKT-01">PKT-01 · ภูเก็ต</option><option value="ONLINE">ONLINE · ออนไลน์</option></select></span></label>
                <label className="wide"><span>หมายเหตุ <small>(ไม่บังคับ)</small></span><input maxLength={240} placeholder="เช่น Live รอบ 19:00" value={quickDraft.note} onChange={(event) => updateQuickDraft('note', event.target.value)} /></label>
              </div>

              {quickError ? <p className="live-sale-quick-error" role="alert">{quickError}</p> : null}
              <div className="live-sale-quick-actions">
                <button className="button secondary" type="button" disabled={!canManage || activeNext === 'ครบชุด'} onClick={() => saveQuickProduct('products')}>บันทึกและกลับ Products</button>
                <button className="button" type="submit" disabled={!canManage || activeNext === 'ครบชุด'}>บันทึกและสร้างรายการถัดไป →</button>
              </div>
              <p className="live-sale-quick-helper"><strong>ระบบจริง:</strong> Sales Code ต้อง resolve เป็น SKU ID ก่อนเปิดบิลหรือตัด Stock เสมอ</p>
            </form>

            <section className="live-sale-recent" aria-live="polite" aria-label="รายการล่าสุดในชุด">
              <h3>รายการล่าสุดในชุด</h3>
              {quickItems.length ? <div className="live-sale-recent-list">{[...quickItems].reverse().slice(0, 5).map((item) => <article key={item.code}>
                {item.imagePreviewUrl
                  ? <span className="live-sale-recent-image" style={{ backgroundImage: `url(${item.imagePreviewUrl})` }} role="img" aria-label={`รูปสินค้า ${item.name}`} />
                  : <span className="live-sale-recent-image placeholder" aria-label={`ยังไม่มีรูปสินค้า ${item.name}`}><ImageIcon /></span>}
                <code>{item.code}</code><div><strong>{item.name}</strong><span>฿{Number(item.price).toLocaleString('th-TH')} · {item.quantity} {item.unit}</span></div><span>บันทึกแล้ว</span>
              </article>)}</div> : <p>ยังไม่มีสินค้าที่บันทึกในชุดนี้</p>}
            </section>
            <p className="live-sale-quick-status" role="status" aria-live="polite">{quickStatus}</p>
          </div> : <div className="live-sale-shell-placeholder"><BoltIcon /><strong>เริ่มได้หลังมีชุดรหัส</strong><small>กด “จองชุดรหัส” ก่อน ระบบจึงจะแสดง Sales Code ถัดไปสำหรับกรอกสินค้า</small></div>}
        </article>

        <article className="live-sale-shell-panel live-sale-code-status-panel">
          <header>
            <div><h2>สถานะรหัสในชุด</h2><p>ติดตามรหัสที่ใช้แล้ว รหัสถัดไป รหัสที่จองไว้ และรหัสที่ข้าม</p></div>
            <span aria-label="ขั้นตอนที่ 2">2</span>
          </header>
          {reservation ? <div className="live-sale-code-status-body">
            <div className="live-sale-code-status-summary" aria-label="สรุปสถานะรหัส">
              <div><span>ทั้งหมด</span><strong>{reservation.count}</strong></div>
              <div><span>ใช้แล้ว</span><strong>{codeCounts.used}</strong></div>
              <div><span>พร้อมใช้</span><strong>{codeCounts.next + codeCounts.reserved}</strong></div>
              <div><span>ข้าม</span><strong>{codeCounts.skipped}</strong></div>
            </div>
            <div className="live-sale-code-status-toolbar">
              <label><span className="live-sale-visually-hidden">ค้นหารหัสหรือสินค้า</span><input type="search" maxLength={120} placeholder="ค้นหารหัสหรือชื่อสินค้า" value={codeSearch} onChange={(event) => setCodeSearch(event.target.value)} /></label>
              <label><span className="live-sale-visually-hidden">กรองสถานะรหัส</span><span className="live-sale-select-control"><select value={codeFilter} onChange={(event) => setCodeFilter(event.target.value as SalesCodeFilter)}><option value="all">ทุกสถานะ</option><option value="next">รหัสถัดไป</option><option value="used">ใช้แล้ว</option><option value="reserved">จองไว้</option><option value="skipped">ข้าม</option></select></span></label>
            </div>
            <div className="live-sale-code-table-wrap">
              <table className="live-sale-code-table">
                <thead><tr><th>รหัสขาย</th><th>สถานะ</th><th>สินค้า</th><th>ราคา / จำนวน</th><th>บันทึกล่าสุด</th><th>ดำเนินการ</th></tr></thead>
                <tbody>{filteredCodeRows.length ? filteredCodeRows.map((row) => {
                  const statusLabel = row.status === 'used' ? 'ใช้แล้ว' : row.status === 'next' ? 'รหัสถัดไป' : row.status === 'skipped' ? 'ข้าม' : 'จองไว้'
                  return <tr key={row.code} className={row.status === 'next' ? 'is-next' : undefined}>
                    <td><code>{row.code}</code></td>
                    <td><span className={`live-sale-code-status ${row.status}`}><i />{statusLabel}</span></td>
                    <td>{row.item ? <div className="live-sale-code-product">{row.item.imagePreviewUrl ? <span style={{ backgroundImage: `url(${row.item.imagePreviewUrl})` }} role="img" aria-label={`รูปสินค้า ${row.item.name}`} /> : <span className="placeholder"><ImageIcon /></span>}<strong title={row.item.name}>{row.item.name}</strong></div> : <span className="live-sale-code-empty">—</span>}</td>
                    <td>{row.item ? <><strong>฿{Number(row.item.price).toLocaleString('th-TH')}</strong><small>{row.item.quantity} {row.item.unit}</small></> : <span className="live-sale-code-empty">—</span>}</td>
                    <td>{row.item ? new Intl.DateTimeFormat('th-TH', { hour: '2-digit', minute: '2-digit' }).format(new Date(row.item.savedAt)) : <span className="live-sale-code-empty">—</span>}</td>
                    <td>{row.status === 'next' ? <button type="button" onClick={() => skipSalesCode(row.code)} disabled={!canManage}>ข้ามรหัส</button> : row.status === 'skipped' ? <button type="button" onClick={() => restoreSalesCode(row.code)} disabled={!canManage}>นำกลับมาใช้</button> : <span className="live-sale-code-empty">—</span>}</td>
                  </tr>
                }) : <tr><td colSpan={6}><div className="live-sale-code-table-empty"><CodePoolIcon /><strong>ไม่พบรหัสตามเงื่อนไข</strong><span>ลองเปลี่ยนคำค้นหาหรือตัวกรองสถานะ</span></div></td></tr>}</tbody>
              </table>
            </div>
            <p className="live-sale-code-status-note"><InfoIcon /><span><strong>UI Simulation:</strong> สถานะทั้งหมดอยู่ใน Browser เท่านั้น เมื่อรีเฟรชหน้าจะหายและยังไม่จอง Sales Code ในฐานข้อมูล</span></p>
          </div> : <div className="live-sale-shell-placeholder"><CodePoolIcon /><strong>ยังไม่มีรหัสในชุด</strong><small>กด “จองชุดรหัส” ก่อน ระบบจึงจะแสดงตารางสถานะ Sales Code</small></div>}
        </article>
      </div>
    </section>

    {!canManage ? <p className="live-sale-permission-note" role="status">บัญชีนี้เปิดดู UI Preview ได้ แต่ไม่มีสิทธิ์สร้างหรือจัดการสินค้า</p> : null}

    {dialogOpen ? <div className="live-sale-dialog-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) closeDialog() }}>
      <section ref={dialogRef} className="live-sale-dialog" role="dialog" aria-modal="true" aria-labelledby="liveSaleReservationTitle" aria-describedby="liveSaleReservationDescription" onKeyDown={trapDialogFocus}>
        <header className="live-sale-dialog-header">
          <div><h2 id="liveSaleReservationTitle">จองชุด Sales Code</h2><p id="liveSaleReservationDescription">กำหนดช่วงรหัสสำหรับ Live, Campaign หรือผู้ขายแต่ละคน</p></div>
          <button className="live-sale-dialog-close" type="button" aria-label="ปิดหน้าต่างจองชุดรหัส" title="ปิด" onClick={closeDialog}><CloseIcon /></button>
        </header>
        <form onSubmit={confirmReservation}>
          <div className="live-sale-dialog-body">
            <div className="live-sale-reservation-form">
              <label className="wide"><span>ชื่อชุดรหัส <b>*</b></span><input ref={nameRef} maxLength={100} value={draft.name} onChange={(event) => updateDraft('name', event.target.value)} /></label>
              <label><span>Prefix</span><input maxLength={8} autoComplete="off" value={draft.prefix} onChange={(event) => updateDraft('prefix', event.target.value.toUpperCase().replace(/[^A-Z0-9-]/g, ''))} /></label>
              <label><span>เลขเริ่มต้น</span><input type="number" min="0" max="999999" inputMode="numeric" value={draft.start} onChange={(event) => updateDraft('start', Number(event.target.value))} /></label>
              <label><span>จำนวนรหัส</span><input type="number" min="1" max="500" inputMode="numeric" value={draft.count} onChange={(event) => updateDraft('count', Number(event.target.value))} /></label>
              <label><span>จำนวนหลัก</span><span className="live-sale-select-control"><select value={draft.digits} onChange={(event) => updateDraft('digits', Number(event.target.value))}><option value="3">3 หลัก (001)</option><option value="4">4 หลัก (0001)</option><option value="5">5 หลัก (00001)</option></select></span></label>
              <label><span>มอบหมายให้</span><input maxLength={100} value={draft.assignee} onChange={(event) => updateDraft('assignee', event.target.value)} /></label>
              <label><span>สาขา</span><span className="live-sale-select-control"><select value={draft.branch} onChange={(event) => updateDraft('branch', event.target.value)}><option value="BKK-01">BKK-01 · สาขาทดสอบกรุงเทพ</option><option value="PKT-01">PKT-01 · ภูเก็ต</option><option value="ONLINE">ONLINE · ออนไลน์</option></select></span></label>
            </div>

            <div className="live-sale-range-preview" aria-live="polite">
              <span>ตัวอย่างช่วงที่จะจอง</span>
              <strong>{previewStart}–{previewEnd}</strong>
              <p>{Math.max(draft.count, 0)} รหัส · รหัสถัดไปหลังจบชุดคือ {previewNext}</p>
            </div>
            {error ? <p className="live-sale-reservation-error" role="alert">{error}</p> : null}
            <div className="live-sale-reservation-rule" role="note"><InfoIcon /><span><strong>ข้อกำหนดเมื่อเชื่อมระบบจริง:</strong> ระบบต้องตรวจช่วงซ้ำภายใน Organization และจองแบบ Atomic เพื่อไม่ให้ผู้ใช้สองคนได้รหัสเดียวกัน</span></div>
          </div>
          <footer className="live-sale-dialog-footer">
            <button className="button secondary" type="button" onClick={closeDialog}>ยกเลิก</button>
            <button className="button" type="submit" disabled={Boolean(error)}>ทดลองจอง {Math.max(draft.count, 0)} รหัส</button>
          </footer>
        </form>
      </section>
    </div> : null}
  </>
}

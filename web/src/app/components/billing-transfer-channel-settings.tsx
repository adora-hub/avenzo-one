'use client'

import { FormEvent, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/browser'
import { billingErrorMessage } from './billing-labels'

export type BillingTransferChannel = {
  id: string
  channel_type: 'bank_account' | 'promptpay'
  display_name: string
  provider_name: string
  account_name: string
  account_identifier: string
  customer_instructions: string | null
  status: 'active' | 'inactive'
  display_order: number
  updated_at: string
}

type FormValue = Omit<BillingTransferChannel, 'id' | 'updated_at'> & { id: string | null; reason: string }

const blank: FormValue = {
  id: null,
  channel_type: 'bank_account',
  display_name: '',
  provider_name: '',
  account_name: '',
  account_identifier: '',
  customer_instructions: '',
  status: 'inactive',
  display_order: 100,
  reason: '',
}

function maskIdentifier(value: string) {
  if (value.length <= 4) return value
  return `${'•'.repeat(Math.max(2, value.length - 4))}${value.slice(-4)}`
}

function toForm(channel: BillingTransferChannel): FormValue {
  return { ...channel, customer_instructions: channel.customer_instructions ?? '', reason: '' }
}

export function BillingTransferChannelSettings({ channels }: { channels: BillingTransferChannel[] }) {
  const router = useRouter()
  const formRef = useRef<HTMLFormElement>(null)
  const [value, setValue] = useState<FormValue>(blank)
  const [reviewing, setReviewing] = useState(false)
  const [loading, setLoading] = useState(false)
  const [message, setMessage] = useState('')
  const set = <K extends keyof FormValue>(key: K, next: FormValue[K]) => {
    setValue((current) => ({ ...current, [key]: next }))
    setReviewing(false)
    setMessage('')
  }
  const reset = () => { setValue(blank); setReviewing(false); setMessage('') }

  function editChannel(channel: BillingTransferChannel) {
    setValue(toForm(channel))
    setReviewing(false)
    setMessage('')
    window.requestAnimationFrame(() => {
      formRef.current?.scrollIntoView({ behavior: 'smooth', block: 'nearest' })
      formRef.current?.querySelector<HTMLInputElement>('input[name="display_name"]')?.focus({ preventScroll: true })
    })
  }

  function validate() {
    if (value.display_name.trim().length < 2 || value.provider_name.trim().length < 2 || value.account_name.trim().length < 2) return 'กรุณากรอกชื่อช่องทาง ธนาคาร/ผู้ให้บริการ และชื่อบัญชีให้ครบ'
    const digits = value.account_identifier.replace(/\D/g, '')
    if (digits.length < 6 || digits.length > 20) return 'เลขบัญชีหรือหมายเลขพร้อมเพย์ต้องมีตัวเลข 6–20 หลัก'
    if (value.reason.trim().length < 3) return 'กรุณาระบุเหตุผลสำหรับ Audit Log อย่างน้อย 3 ตัวอักษร'
    return ''
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const validation = validate()
    if (validation) { setMessage(validation); setReviewing(false); return }
    if (!reviewing) { setReviewing(true); setMessage(''); return }
    setLoading(true); setMessage('')
    try {
      const { error } = await createClient().rpc('platform_upsert_billing_transfer_channel', {
        p_channel_id: value.id,
        p_channel_type: value.channel_type,
        p_display_name: value.display_name,
        p_provider_name: value.provider_name,
        p_account_name: value.account_name,
        p_account_identifier: value.account_identifier,
        p_customer_instructions: value.customer_instructions || null,
        p_status: value.status,
        p_display_order: value.display_order,
        p_reason: value.reason,
        p_command_id: crypto.randomUUID(),
      })
      if (error) throw error
      setMessage('บันทึกช่องทางรับโอนสำเร็จ โดยยังไม่มีการรับชำระหรือเปลี่ยนสถานะ Invoice')
      setReviewing(false)
      setValue(blank)
      router.refresh()
    } catch (error) {
      setMessage(billingErrorMessage(error instanceof Error ? error.message : 'ไม่สามารถบันทึกช่องทางรับโอนได้'))
    } finally { setLoading(false) }
  }

  return <div className="transfer-channel-layout">
    <form className="card compact-form transfer-channel-form" onSubmit={submit} ref={formRef}>
      <div><span className="eyebrow">TRANSFER SETUP</span><h3>{value.id ? 'แก้ไขช่องทางรับโอน' : 'เพิ่มช่องทางรับโอน'}</h3><p>เก็บข้อมูลบัญชีของ AVENZO ONE เท่านั้น การบันทึกหน้านี้ไม่ถือว่าลูกค้าชำระเงินแล้ว</p></div>
      <label>ประเภทช่องทาง<select value={value.channel_type} onChange={(event) => set('channel_type', event.target.value as FormValue['channel_type'])}><option value="bank_account">บัญชีธนาคาร</option><option value="promptpay">พร้อมเพย์</option></select></label>
      <label>ชื่อที่แสดง<input name="display_name" value={value.display_name} onChange={(event) => set('display_name', event.target.value)} placeholder="เช่น บัญชีรับชำระ AVENZO ONE" /></label>
      <div className="form-grid-two"><label>ธนาคาร / ผู้ให้บริการ<input value={value.provider_name} onChange={(event) => set('provider_name', event.target.value)} placeholder={value.channel_type === 'promptpay' ? 'PromptPay' : 'เช่น ธนาคารกสิกรไทย'} /></label><label>ชื่อบัญชี<input value={value.account_name} onChange={(event) => set('account_name', event.target.value)} placeholder="ชื่อเจ้าของบัญชี" /></label></div>
      <label>เลขบัญชี / หมายเลขพร้อมเพย์<input inputMode="numeric" value={value.account_identifier} onChange={(event) => set('account_identifier', event.target.value)} placeholder="ใส่เฉพาะตัวเลขหรือมีขีดคั่นได้" /></label>
      <label>คำแนะนำที่จะแสดงให้ลูกค้า (ถ้ามี)<textarea rows={3} value={value.customer_instructions ?? ''} onChange={(event) => set('customer_instructions', event.target.value)} placeholder="เช่น กรุณาโอนยอดให้ตรงกับ Invoice และแนบหลักฐานหลังโอน" /></label>
      <div className="form-grid-two"><label>สถานะ<select value={value.status} onChange={(event) => set('status', event.target.value as FormValue['status'])}><option value="inactive">ปิดไว้ก่อน</option><option value="active">เปิดให้ใช้งาน</option></select></label><label>ลำดับการแสดง<input type="number" min="0" max="9999" value={value.display_order} onChange={(event) => set('display_order', Number(event.target.value))} /></label></div>
      <label>เหตุผลสำหรับ Audit Log<textarea rows={2} value={value.reason} onChange={(event) => set('reason', event.target.value)} placeholder="เช่น เพิ่มบัญชีรับโอนหลักสำหรับลูกค้า" /></label>
      {reviewing ? <div className="transfer-channel-review"><div className="feature-list-heading"><div><span className="eyebrow">ตรวจสอบครั้งสุดท้าย</span><h3>{value.id ? 'ยืนยันแก้ไขช่องทาง' : 'ยืนยันเพิ่มช่องทาง'}</h3></div><span className={`status ${value.status === 'active' ? 'active' : 'pending'}`}>{value.status === 'active' ? 'เปิดใช้งาน' : 'ยังไม่เปิด'}</span></div><dl><div><dt>ช่องทาง</dt><dd>{value.display_name}</dd></div><div><dt>ผู้ให้บริการ</dt><dd>{value.provider_name}</dd></div><div><dt>ชื่อบัญชี</dt><dd>{value.account_name}</dd></div><div><dt>เลขอ้างอิง</dt><dd>{maskIdentifier(value.account_identifier.replace(/\D/g, ''))}</dd></div></dl></div> : null}
      {message ? <div className={message.includes('สำเร็จ') ? 'countdown' : 'error'} role="status">{message}</div> : null}
      <div className="button-row">{(value.id || reviewing) ? <button className="button secondary" type="button" onClick={reset}>ยกเลิก</button> : null}<button className="button" type="submit" disabled={loading}>{loading ? 'กำลังบันทึก…' : reviewing ? 'ยืนยันบันทึกช่องทาง' : 'ตรวจสอบก่อนบันทึก'}</button></div>
    </form>
    <section className="transfer-channel-directory"><div className="feature-list-heading"><div><span className="eyebrow">DIRECTORY</span><h3>ช่องทางรับโอนทั้งหมด</h3><p>เปิดใช้งานเฉพาะบัญชีที่ตรวจสอบเจ้าของบัญชีแล้ว</p></div><span className="feature-count">{channels.length} ช่องทาง</span></div>{channels.length ? <div className="transfer-channel-list">{channels.map((channel) => <article className="card" key={channel.id}><div className="feature-list-heading"><div><strong>{channel.display_name}</strong><p>{channel.channel_type === 'promptpay' ? 'พร้อมเพย์' : 'บัญชีธนาคาร'} · {channel.provider_name}</p></div><span className={`status ${channel.status === 'active' ? 'active' : 'pending'}`}>{channel.status === 'active' ? 'เปิดใช้งาน' : 'ปิดไว้'}</span></div><dl><div><dt>ชื่อบัญชี</dt><dd>{channel.account_name}</dd></div><div><dt>เลขบัญชี / พร้อมเพย์</dt><dd>{maskIdentifier(channel.account_identifier)}</dd></div><div><dt>ลำดับ</dt><dd>{channel.display_order}</dd></div></dl><button className="button secondary" type="button" aria-pressed={value.id === channel.id} onClick={() => editChannel(channel)}>{value.id === channel.id ? 'กำลังแก้ไขช่องทางนี้' : 'แก้ไขช่องทางนี้'}</button></article>)}</div> : <div className="empty">ยังไม่มีช่องทางรับโอน</div>}</section>
  </div>
}

'use client'

import { FormEvent, useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/browser'
import { billingErrorMessage } from './billing-labels'

type IssuerProfile = { legal_name: string; tax_id: string | null; branch_code: string | null; address: string; email: string | null; phone: string | null }
type CustomerProfile = IssuerProfile & { organization_id: string }
type Organization = { id: string; name: string }

const blank = { legal_name: '', tax_id: '', branch_code: '', address: '', email: '', phone: '' }

function normalise(profile?: IssuerProfile | null) {
  return profile ? { legal_name: profile.legal_name, tax_id: profile.tax_id ?? '', branch_code: profile.branch_code ?? '', address: profile.address, email: profile.email ?? '', phone: profile.phone ?? '' } : blank
}

function ProfileFields({ value, onChange, prefix }: { value: typeof blank; onChange: (next: typeof blank) => void; prefix: string }) {
  const set = (key: keyof typeof blank, next: string) => onChange({ ...value, [key]: next })
  return <>
    <label>{prefix}<input value={value.legal_name} onChange={(event) => set('legal_name', event.target.value)} placeholder="ชื่อบริษัท/นิติบุคคล" /></label>
    <div className="form-grid-two"><label>เลขประจำตัวผู้เสียภาษี (ถ้ามี)<input value={value.tax_id} onChange={(event) => set('tax_id', event.target.value)} /></label><label>รหัสสาขา (ถ้ามี)<input value={value.branch_code} onChange={(event) => set('branch_code', event.target.value)} /></label></div>
    <label>ที่อยู่ตามเอกสาร<textarea rows={3} value={value.address} onChange={(event) => set('address', event.target.value)} placeholder="บ้านเลขที่ ถนน แขวง/ตำบล เขต/อำเภอ จังหวัด รหัสไปรษณีย์" /></label>
    <div className="form-grid-two"><label>อีเมล (ถ้ามี)<input type="email" value={value.email} onChange={(event) => set('email', event.target.value)} /></label><label>โทรศัพท์ (ถ้ามี)<input value={value.phone} onChange={(event) => set('phone', event.target.value)} /></label></div>
  </>
}

export function BillingDocumentProfiles({ issuer, organizations, customers }: { issuer: IssuerProfile | null; organizations: Organization[]; customers: CustomerProfile[] }) {
  const router = useRouter()
  const [issuerValue, setIssuerValue] = useState(normalise(issuer))
  const [organizationId, setOrganizationId] = useState(organizations[0]?.id ?? '')
  const [customerValue, setCustomerValue] = useState(normalise(customers.find((item) => item.organization_id === organizations[0]?.id)))
  const [message, setMessage] = useState('')
  const [loading, setLoading] = useState<'issuer' | 'customer' | null>(null)

  useEffect(() => setCustomerValue(normalise(customers.find((item) => item.organization_id === organizationId))), [customers, organizationId])

  async function saveIssuer(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); setLoading('issuer'); setMessage('')
    try {
      const { error } = await createClient().rpc('platform_upsert_billing_issuer_profile', {
        p_legal_name: issuerValue.legal_name, p_tax_id: issuerValue.tax_id || null, p_branch_code: issuerValue.branch_code || null,
        p_address: issuerValue.address, p_email: issuerValue.email || null, p_phone: issuerValue.phone || null,
      })
      if (error) throw error
      setMessage('บันทึกข้อมูลผู้ออกเอกสารสำเร็จ'); router.refresh()
    } catch (error) { setMessage(billingErrorMessage(error instanceof Error ? error.message : 'ไม่สามารถบันทึกข้อมูลผู้ออกเอกสารได้')) } finally { setLoading(null) }
  }

  async function saveCustomer(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); setLoading('customer'); setMessage('')
    try {
      const { error } = await createClient().rpc('platform_upsert_billing_customer_profile', {
        p_organization_id: organizationId, p_legal_name: customerValue.legal_name, p_tax_id: customerValue.tax_id || null,
        p_branch_code: customerValue.branch_code || null, p_address: customerValue.address, p_email: customerValue.email || null, p_phone: customerValue.phone || null,
      })
      if (error) throw error
      setMessage('บันทึกข้อมูลผู้รับเอกสารสำเร็จ'); router.refresh()
    } catch (error) { setMessage(billingErrorMessage(error instanceof Error ? error.message : 'ไม่สามารถบันทึกข้อมูลผู้รับเอกสารได้')) } finally { setLoading(null) }
  }

  return <section className="billing-profile-grid">
    <form className="card compact-form" onSubmit={saveIssuer}><div><span className="eyebrow">DOCUMENT SETUP</span><h3>ข้อมูลผู้ออกเอกสาร</h3><p>ระบบจะบันทึกข้อมูลนี้เป็น Snapshot เมื่อออกเอกสาร</p></div><ProfileFields value={issuerValue} onChange={setIssuerValue} prefix="ชื่อผู้ออกเอกสาร" />{message && <div className={message.includes('สำเร็จ') ? 'countdown' : 'error'}>{message}</div>}<button className="button" type="submit" disabled={loading !== null}>{loading === 'issuer' ? 'กำลังบันทึก…' : 'บันทึกผู้ออกเอกสาร'}</button></form>
    <form className="card compact-form" onSubmit={saveCustomer}><div><span className="eyebrow">RECIPIENT SETUP</span><h3>ข้อมูลผู้รับเอกสาร</h3><p>ตั้งค่าตาม Organization ก่อนออก Invoice Document</p></div><label>Organization<select value={organizationId} onChange={(event) => setOrganizationId(event.target.value)}>{organizations.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select></label><ProfileFields value={customerValue} onChange={setCustomerValue} prefix="ชื่อผู้รับเอกสาร" /><button className="button" type="submit" disabled={loading !== null}>{loading === 'customer' ? 'กำลังบันทึก…' : 'บันทึกผู้รับเอกสาร'}</button></form>
  </section>
}

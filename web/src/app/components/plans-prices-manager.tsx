'use client'

import { useState } from 'react'
import type { FormEvent } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/browser'

export type PlanRow = {
  code: string
  name: string
  description: string
  duration_days: number
  grace_period_days: number
  lifecycle_status: 'draft' | 'active' | 'retired'
}

export type PlanVersionRow = {
  id: string
  plan_code: string
  version_no: number
  label: string
  description: string
  lifecycle_status: 'draft' | 'active' | 'retired'
}

export type PlanPriceRow = {
  id: string
  plan_version_id: string
  billing_interval: 'monthly' | 'yearly' | 'one_time'
  amount: number
  currency: string
  trial_days: number
  is_active: boolean
}

export type PlanFeatureRow = {
  id: string
  plan_version_id: string
  feature_id: string
  boolean_value: boolean | null
  integer_value: number | null
}

export type CatalogFeatureRow = {
  id: string
  feature_key: string
  name: string
  value_type: 'boolean' | 'integer'
  unit: string | null
  lifecycle_status: 'draft' | 'active' | 'retired'
}

type Props = {
  plans: PlanRow[]
  versions: PlanVersionRow[]
  prices: PlanPriceRow[]
  features: PlanFeatureRow[]
  catalog: CatalogFeatureRow[]
}

function errorMessage(error: unknown) {
  if (typeof error === 'object' && error && 'code' in error && error.code === '23505') return 'ข้อมูลซ้ำ กรุณาตรวจรหัส Plan, Version หรือรอบราคา'
  if (error instanceof Error) return error.message
  if (typeof error === 'object' && error && 'message' in error && typeof error.message === 'string') return error.message
  return 'ไม่สามารถบันทึก Plans & Prices ได้'
}

function formatAmount(amount: number, currency: string) {
  return new Intl.NumberFormat('th-TH', { style: 'currency', currency }).format(Number(amount))
}

function intervalLabel(interval: PlanPriceRow['billing_interval']) {
  return interval === 'monthly' ? 'รายเดือน' : interval === 'yearly' ? 'รายปี' : 'ครั้งเดียว'
}

export function PlansPricesManager({ plans, versions, prices, features, catalog }: Props) {
  const router = useRouter()
  const selectablePlans = plans.filter((plan) => plan.lifecycle_status !== 'retired')
  const editableVersions = versions.filter((version) => version.lifecycle_status === 'draft')
  const [planCode, setPlanCode] = useState('')
  const [planName, setPlanName] = useState('')
  const [planDescription, setPlanDescription] = useState('')
  const [planDuration, setPlanDuration] = useState('30')
  const [planGrace, setPlanGrace] = useState('3')
  const [planStatus, setPlanStatus] = useState<PlanRow['lifecycle_status']>('draft')
  const [versionPlanCode, setVersionPlanCode] = useState(selectablePlans[0]?.code ?? '')
  const [versionNo, setVersionNo] = useState('1')
  const [versionLabel, setVersionLabel] = useState('')
  const [versionDescription, setVersionDescription] = useState('')
  const [selectedVersionId, setSelectedVersionId] = useState(editableVersions[0]?.id ?? '')
  const [billingInterval, setBillingInterval] = useState<PlanPriceRow['billing_interval']>('monthly')
  const [amount, setAmount] = useState('0')
  const [currency, setCurrency] = useState('THB')
  const [trialDays, setTrialDays] = useState('30')
  const [featureId, setFeatureId] = useState(catalog[0]?.id ?? '')
  const [booleanValue, setBooleanValue] = useState(true)
  const [integerValue, setIntegerValue] = useState('1')
  const [message, setMessage] = useState('')
  const [messageTone, setMessageTone] = useState<'success' | 'error'>('success')
  const [loading, setLoading] = useState(false)

  const selectedCatalogFeature = catalog.find((item) => item.id === featureId)

  function success(text: string) {
    setMessageTone('success')
    setMessage(text)
    router.refresh()
  }

  function failure(error: unknown) {
    setMessageTone('error')
    setMessage(errorMessage(error))
  }

  async function createPlan(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setLoading(true)
    setMessage('')
    try {
      const { error } = await createClient().from('subscription_plans').insert({
        code: planCode,
        name: planName,
        description: planDescription,
        duration_days: Number(planDuration),
        grace_period_days: Number(planGrace),
        lifecycle_status: planStatus,
        is_active: planStatus === 'active',
        metadata: {},
      })
      if (error) throw error
      setPlanCode('')
      setPlanName('')
      setPlanDescription('')
      success(planStatus === 'active' ? 'สร้าง Plan และเปิดใช้งานสำเร็จ' : 'สร้าง Plan สำเร็จ เริ่มต้นเป็น Draft')
    } catch (error) {
      failure(error)
    } finally {
      setLoading(false)
    }
  }

  async function createVersion(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setLoading(true)
    setMessage('')
    try {
      const { data, error } = await createClient().from('subscription_plan_versions').insert({
        plan_code: versionPlanCode,
        version_no: Number(versionNo),
        label: versionLabel,
        description: versionDescription,
        lifecycle_status: 'draft',
        metadata: {},
      }).select('id').single()
      if (error) throw error
      setSelectedVersionId(data.id)
      setVersionLabel('')
      setVersionDescription('')
      success('สร้าง Plan Version แบบ Draft สำเร็จ')
    } catch (error) {
      failure(error)
    } finally {
      setLoading(false)
    }
  }

  async function createPrice(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setLoading(true)
    setMessage('')
    try {
      const { error } = await createClient().from('subscription_plan_prices').insert({
        plan_version_id: selectedVersionId,
        billing_interval: billingInterval,
        amount: Number(amount),
        currency: currency.toUpperCase(),
        trial_days: Number(trialDays),
        is_active: true,
        metadata: {},
      })
      if (error) throw error
      success('บันทึกราคาและระยะทดลองใช้สำเร็จ')
    } catch (error) {
      failure(error)
    } finally {
      setLoading(false)
    }
  }

  async function createFeatureValue(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setLoading(true)
    setMessage('')
    try {
      const { error } = await createClient().from('subscription_plan_features').insert({
        plan_version_id: selectedVersionId,
        feature_id: featureId,
        boolean_value: selectedCatalogFeature?.value_type === 'boolean' ? booleanValue : null,
        integer_value: selectedCatalogFeature?.value_type === 'integer' ? Number(integerValue) : null,
      })
      if (error) throw error
      success('บันทึกค่า Feature ของ Plan สำเร็จ')
    } catch (error) {
      failure(error)
    } finally {
      setLoading(false)
    }
  }

  async function activateVersion(versionId: string) {
    setLoading(true)
    setMessage('')
    try {
      const { error } = await createClient().from('subscription_plan_versions').update({ lifecycle_status: 'active' }).eq('id', versionId)
      if (error) throw error
      success('เปิดใช้งาน Plan Version สำเร็จ')
    } catch (error) {
      failure(error)
    } finally {
      setLoading(false)
    }
  }

  async function activatePlan(planCodeToActivate: string) {
    setLoading(true)
    setMessage('')
    try {
      const { error } = await createClient().from('subscription_plans').update({ lifecycle_status: 'active', is_active: true }).eq('code', planCodeToActivate)
      if (error) throw error
      success('เปิดใช้งาน Plan สำเร็จ')
    } catch (error) {
      failure(error)
    } finally {
      setLoading(false)
    }
  }

  async function retirePlan(plan: PlanRow) {
    const action = plan.lifecycle_status === 'draft' ? 'เก็บ Draft นี้' : 'ปิดใช้งาน Plan นี้'
    if (!window.confirm(`${action}: ${plan.name} (${plan.code})? ข้อมูลจะไม่ถูกลบและจะกู้กลับมาเปิดใช้งานไม่ได้`)) return
    setLoading(true)
    setMessage('')
    try {
      const { error } = await createClient().from('subscription_plans').update({ lifecycle_status: 'retired', is_active: false }).eq('code', plan.code)
      if (error) throw error
      success(`${action}สำเร็จ`)
    } catch (error) {
      failure(error)
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="plans-prices-layout">
      <div className="plans-prices-forms">
        <section className="card">
          <div className="eyebrow">1 · Plan</div>
          <h2>สร้างแพ็กเกจหลัก</h2>
          <p>เช่น Free, Standard หรือ Pro แพ็กเกจใหม่เริ่มเป็น Draft ได้</p>
          <form className="form" onSubmit={createPlan}>
            <label>รหัส Plan
              <input value={planCode} onChange={(event) => setPlanCode(event.target.value.toLowerCase().replace(/[^a-z0-9_]/g, ''))} placeholder="เช่น pro" pattern="[a-z][a-z0-9_]*" minLength={2} maxLength={40} required />
            </label>
            <label>ชื่อแพ็กเกจ<input value={planName} onChange={(event) => setPlanName(event.target.value)} placeholder="เช่น Pro" minLength={2} maxLength={100} required /></label>
            <label>คำอธิบาย<textarea value={planDescription} onChange={(event) => setPlanDescription(event.target.value)} placeholder="แพ็กเกจสำหรับธุรกิจที่มีหลายสาขา" maxLength={500} rows={3} required /></label>
            <div className="form-grid-two">
              <label>อายุ Subscription (วัน)<input type="number" min={1} value={planDuration} onChange={(event) => setPlanDuration(event.target.value)} required /></label>
              <label>Grace Period (วัน)<input type="number" min={0} value={planGrace} onChange={(event) => setPlanGrace(event.target.value)} required /></label>
            </div>
            <label>สถานะเริ่มต้น<select value={planStatus} onChange={(event) => setPlanStatus(event.target.value as PlanRow['lifecycle_status'])}><option value="draft">Draft</option><option value="active">Active</option><option value="retired">Retired</option></select></label>
            <button className="button" disabled={loading}>สร้าง Plan</button>
          </form>
        </section>

        <section className="card">
          <div className="eyebrow">2 · Version</div>
          <h2>สร้างรุ่นของแพ็กเกจ</h2>
          <p>ราคาและ Feature จะผูกอยู่กับ Version เพื่อรักษาประวัติลูกค้าเดิม</p>
          <form className="form" onSubmit={createVersion}>
            <label>Plan<select value={versionPlanCode} onChange={(event) => setVersionPlanCode(event.target.value)} disabled={!selectablePlans.length} required>{selectablePlans.map((plan) => <option value={plan.code} key={plan.code}>{plan.name} ({plan.code})</option>)}</select></label>
            <div className="form-grid-two">
              <label>เลข Version<input type="number" min={1} value={versionNo} onChange={(event) => setVersionNo(event.target.value)} required /></label>
              <label>ชื่อรุ่น<input value={versionLabel} onChange={(event) => setVersionLabel(event.target.value)} placeholder="เช่น Standard 2026" minLength={2} maxLength={120} required /></label>
            </div>
            <label>คำอธิบายรุ่น<textarea value={versionDescription} onChange={(event) => setVersionDescription(event.target.value)} placeholder="รายละเอียดของรุ่นนี้" maxLength={500} rows={3} required /></label>
            <button className="button" disabled={loading || !selectablePlans.length}>สร้าง Version แบบ Draft</button>
          </form>
        </section>

        <section className="card">
          <div className="eyebrow">3 · Configuration</div>
          <h2>กำหนดราคาและ Feature</h2>
          <p>เลือก Version แบบ Draft ก่อน แล้วเพิ่มราคาและค่าฟีเจอร์</p>
          <label>Version ที่กำลังแก้ไข<select value={selectedVersionId} onChange={(event) => setSelectedVersionId(event.target.value)} disabled={!editableVersions.length} required><option value="">เลือก Version แบบ Draft</option>{editableVersions.map((version) => <option value={version.id} key={version.id}>{version.label} · Draft</option>)}</select></label>
          <form className="form compact-form" onSubmit={createPrice}>
            <h3>เพิ่มราคา</h3>
            <div className="form-grid-two">
              <label>รอบบิล<select value={billingInterval} onChange={(event) => setBillingInterval(event.target.value as PlanPriceRow['billing_interval'])}><option value="monthly">รายเดือน</option><option value="yearly">รายปี</option><option value="one_time">ครั้งเดียว</option></select></label>
              <label>ราคา<input type="number" min={0} step="0.01" value={amount} onChange={(event) => setAmount(event.target.value)} required /></label>
            </div>
            <div className="form-grid-two">
              <label>สกุลเงิน<input value={currency} onChange={(event) => setCurrency(event.target.value.toUpperCase())} maxLength={3} pattern="[A-Z]{3}" required /></label>
              <label>ทดลองใช้ (วัน)<input type="number" min={0} value={trialDays} onChange={(event) => setTrialDays(event.target.value)} required /></label>
            </div>
            <button className="button secondary" disabled={loading || !selectedVersionId}>เพิ่มราคา</button>
          </form>
          <form className="form compact-form" onSubmit={createFeatureValue}>
            <h3>เพิ่มสิทธิ์ Feature</h3>
            <label>Feature<select value={featureId} onChange={(event) => setFeatureId(event.target.value)} required><option value="">เลือก Feature</option>{catalog.filter((item) => item.lifecycle_status !== 'retired').map((feature) => <option value={feature.id} key={feature.id}>{feature.name} · {feature.feature_key}</option>)}</select></label>
            {selectedCatalogFeature?.value_type === 'boolean' ? <label>ค่า Feature<select value={booleanValue ? 'true' : 'false'} onChange={(event) => setBooleanValue(event.target.value === 'true')}><option value="true">เปิดใช้งาน</option><option value="false">ปิดใช้งาน</option></select></label> : null}
            {selectedCatalogFeature?.value_type === 'integer' ? <label>จำนวนสูงสุด ({selectedCatalogFeature.unit ?? 'หน่วย'})<input type="number" min={0} value={integerValue} onChange={(event) => setIntegerValue(event.target.value)} required /></label> : null}
            <button className="button secondary" disabled={loading || !selectedVersionId || !selectedCatalogFeature}>เพิ่มสิทธิ์ Feature</button>
          </form>
        </section>
      </div>

      <section className="plans-prices-results">
        {message ? <div className={messageTone === 'success' ? 'countdown' : 'error'} role="status">{message}</div> : null}
        <div className="feature-list-heading"><div><div className="eyebrow">Catalog</div><h2>Plans & Prices ทั้งหมด</h2></div><span className="feature-count">{plans.length} Plan</span></div>
        {plans.length ? plans.map((plan) => {
          const planVersions = versions.filter((version) => version.plan_code === plan.code)
          return <article className="card plan-summary-card" key={plan.code}>
            <div className="feature-item-header"><div><div className="feature-key">{plan.code}</div><h3>{plan.name}</h3></div><span className={`status ${plan.lifecycle_status}`}>{plan.lifecycle_status}</span></div>
            <p>{plan.description}</p>
            <div className="feature-meta"><span>อายุ <strong>{plan.duration_days} วัน</strong></span><span>Grace <strong>{plan.grace_period_days} วัน</strong></span></div>
            {plan.lifecycle_status === 'draft' ? <div className="button-row"><button className="button secondary" type="button" disabled={loading} onClick={() => void activatePlan(plan.code)}>เปิดใช้งาน Plan นี้</button><button className="button danger" type="button" disabled={loading} onClick={() => void retirePlan(plan)}>เก็บ Draft นี้</button></div> : null}
            {plan.lifecycle_status === 'active' ? <button className="button danger" type="button" disabled={loading} onClick={() => void retirePlan(plan)}>ปิดใช้งาน Plan นี้</button> : null}
            {plan.lifecycle_status === 'retired' ? <div className="field-help">Plan นี้ถูกเก็บถาวรแล้วและจะไม่ถูกเลือกใช้งาน</div> : null}
            {planVersions.length ? <div className="plan-version-list">{planVersions.map((version) => {
              const versionPrices = prices.filter((price) => price.plan_version_id === version.id)
              const versionFeatures = features.filter((feature) => feature.plan_version_id === version.id)
              return <div className="plan-version-item" key={version.id}>
                <div className="feature-item-header"><div><strong>{version.label}</strong><div className="meta">Version {version.version_no} · {version.description}</div></div><span className={`status ${version.lifecycle_status}`}>{version.lifecycle_status}</span></div>
                {versionPrices.length ? <div className="plan-detail-list"><strong>ราคา</strong>{versionPrices.map((price) => <span key={price.id}>{formatAmount(price.amount, price.currency)} / {intervalLabel(price.billing_interval)}{price.trial_days ? ` · ทดลอง ${price.trial_days} วัน` : ''}</span>)}</div> : <div className="field-help">ยังไม่ได้กำหนดราคา</div>}
                {versionFeatures.length ? <div className="plan-detail-list"><strong>Features</strong>{versionFeatures.map((feature) => { const item = catalog.find((catalogFeature) => catalogFeature.id === feature.feature_id); return <span key={feature.id}>{item?.name ?? feature.feature_id}: {item?.value_type === 'boolean' ? (feature.boolean_value ? 'เปิด' : 'ปิด') : `${feature.integer_value} ${item?.unit ?? ''}`}</span> })}</div> : <div className="field-help">ยังไม่ได้กำหนด Feature</div>}
                {version.lifecycle_status === 'draft' ? <button className="button secondary" type="button" disabled={loading} onClick={() => void activateVersion(version.id)}>เปิดใช้งาน Version นี้</button> : null}
              </div>
            })}</div> : <div className="empty">ยังไม่มี Version ของ Plan นี้</div>}
          </article>
        }) : <div className="empty">ยังไม่มี Plan เริ่มต้นด้วยการสร้างแพ็กเกจทางด้านซ้าย</div>}
      </section>
    </div>
  )
}

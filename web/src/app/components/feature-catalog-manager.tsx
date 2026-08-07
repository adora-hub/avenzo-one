'use client'

import { useState } from 'react'
import type { FormEvent } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/browser'

export type CatalogFeature = {
  id: string
  feature_key: string
  name: string
  description: string
  value_type: 'boolean' | 'integer'
  unit: string | null
  lifecycle_status: 'draft' | 'active' | 'retired'
  updated_at: string
}

type FeatureDraft = Pick<CatalogFeature, 'name' | 'description' | 'unit' | 'lifecycle_status'>

function featureErrorMessage(error: unknown) {
  if (typeof error === 'object' && error && 'code' in error && error.code === '23505') {
    return 'Feature Key นี้มีอยู่แล้ว กรุณาใช้ Key อื่น'
  }
  if (error instanceof Error) return error.message
  if (typeof error === 'object' && error && 'message' in error && typeof error.message === 'string') return error.message
  return 'ไม่สามารถบันทึก Feature Catalog ได้'
}

export function FeatureCatalogManager({ initialFeatures }: { initialFeatures: CatalogFeature[] }) {
  const router = useRouter()
  const [featureKey, setFeatureKey] = useState('')
  const [name, setName] = useState('')
  const [description, setDescription] = useState('')
  const [valueType, setValueType] = useState<CatalogFeature['value_type']>('boolean')
  const [unit, setUnit] = useState('')
  const [editingId, setEditingId] = useState<string | null>(null)
  const [editDraft, setEditDraft] = useState<FeatureDraft | null>(null)
  const [message, setMessage] = useState('')
  const [messageTone, setMessageTone] = useState<'success' | 'error'>('success')
  const [loading, setLoading] = useState(false)

  function beginEdit(feature: CatalogFeature) {
    setEditingId(feature.id)
    setEditDraft({
      name: feature.name,
      description: feature.description,
      unit: feature.unit,
      lifecycle_status: feature.lifecycle_status,
    })
    setMessage('')
  }

  async function createFeature(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setLoading(true)
    setMessage('')
    try {
      const { error } = await createClient().from('feature_catalog').insert({
        feature_key: featureKey,
        name,
        description,
        value_type: valueType,
        unit: valueType === 'integer' ? unit : null,
        lifecycle_status: 'draft',
      })
      if (error) throw error
      setFeatureKey('')
      setName('')
      setDescription('')
      setValueType('boolean')
      setUnit('')
      setMessageTone('success')
      setMessage('สร้าง Feature แบบ Draft สำเร็จ')
      router.refresh()
    } catch (error) {
      setMessageTone('error')
      setMessage(featureErrorMessage(error))
    } finally {
      setLoading(false)
    }
  }

  async function saveFeature(feature: CatalogFeature) {
    if (!editDraft) return
    setLoading(true)
    setMessage('')
    try {
      const { error } = await createClient().from('feature_catalog').update({
        name: editDraft.name,
        description: editDraft.description,
        unit: feature.value_type === 'integer' ? editDraft.unit : null,
        lifecycle_status: editDraft.lifecycle_status,
      }).eq('id', feature.id)
      if (error) throw error
      setEditingId(null)
      setEditDraft(null)
      setMessageTone('success')
      setMessage('อัปเดต Feature สำเร็จและบันทึก Audit Log แล้ว')
      router.refresh()
    } catch (error) {
      setMessageTone('error')
      setMessage(featureErrorMessage(error))
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="feature-catalog-layout">
      <section className="card feature-create-card">
        <div>
          <div className="eyebrow">New Feature</div>
          <h2>เพิ่ม Feature Definition</h2>
          <p>Feature ใหม่เริ่มเป็น Draft และยังไม่ให้สิทธิ์แก่แพ็กเกจใด</p>
        </div>
        <form className="form" onSubmit={createFeature}>
          <label>Feature Key
            <input
              value={featureKey}
              onChange={(event) => setFeatureKey(event.target.value.toLowerCase().replace(/[^a-z0-9_.]/g, ''))}
              placeholder="เช่น branches.max_count"
              pattern="[a-z][a-z0-9_]*(\.[a-z][a-z0-9_]*)*"
              minLength={3}
              maxLength={80}
              required
            />
            <span className="field-help">Key และชนิดค่าจะล็อกถาวรหลังสร้าง</span>
          </label>
          <label>ชื่อที่แสดง
            <input value={name} onChange={(event) => setName(event.target.value)} minLength={2} maxLength={100} placeholder="เช่น จำนวนสาขาสูงสุด" required />
          </label>
          <label>คำอธิบาย
            <textarea value={description} onChange={(event) => setDescription(event.target.value)} minLength={3} maxLength={500} rows={3} placeholder="อธิบายว่าฟีเจอร์นี้ควบคุมอะไร" required />
          </label>
          <label>ชนิดค่า
            <select value={valueType} onChange={(event) => setValueType(event.target.value as CatalogFeature['value_type'])}>
              <option value="boolean">เปิด / ปิด</option>
              <option value="integer">จำนวน / Limit</option>
            </select>
          </label>
          {valueType === 'integer' ? (
            <label>หน่วย
              <input value={unit} onChange={(event) => setUnit(event.target.value)} minLength={1} maxLength={30} placeholder="เช่น สาขา, คน, วัน" required />
            </label>
          ) : null}
          <button className="button" disabled={loading}>{loading ? 'กำลังบันทึก…' : 'สร้าง Feature แบบ Draft'}</button>
        </form>
      </section>

      <section className="feature-list-section">
        <div className="feature-list-heading">
          <div><div className="eyebrow">Catalog</div><h2>Feature ทั้งหมด</h2></div>
          <span className="feature-count">{initialFeatures.length} รายการ</span>
        </div>
        {message ? <div className={messageTone === 'success' ? 'countdown' : 'error'} role="status">{message}</div> : null}
        {initialFeatures.length ? (
          <div className="feature-list">
            {initialFeatures.map((feature) => {
              const isEditing = editingId === feature.id && editDraft
              return (
                <article className="card feature-item" key={feature.id}>
                  <div className="feature-item-header">
                    <div>
                      <div className="feature-key">{feature.feature_key}</div>
                      <h3>{feature.name}</h3>
                    </div>
                    <span className={`status ${feature.lifecycle_status}`}>{feature.lifecycle_status}</span>
                  </div>
                  {isEditing ? (
                    <form className="form feature-edit-form" onSubmit={(event) => { event.preventDefault(); void saveFeature(feature) }}>
                      <label>ชื่อที่แสดง<input value={editDraft.name} onChange={(event) => setEditDraft({ ...editDraft, name: event.target.value })} minLength={2} maxLength={100} required /></label>
                      <label>คำอธิบาย<textarea value={editDraft.description} onChange={(event) => setEditDraft({ ...editDraft, description: event.target.value })} minLength={3} maxLength={500} rows={3} required /></label>
                      {feature.value_type === 'integer' ? <label>หน่วย<input value={editDraft.unit ?? ''} onChange={(event) => setEditDraft({ ...editDraft, unit: event.target.value })} minLength={1} maxLength={30} required /></label> : null}
                      <label>สถานะ<select value={editDraft.lifecycle_status} onChange={(event) => setEditDraft({ ...editDraft, lifecycle_status: event.target.value as CatalogFeature['lifecycle_status'] })}><option value="draft">Draft</option><option value="active">Active</option><option value="retired">Retired</option></select></label>
                      <div className="feature-actions">
                        <button className="button" disabled={loading}>บันทึก</button>
                        <button className="button secondary" type="button" disabled={loading} onClick={() => { setEditingId(null); setEditDraft(null) }}>ยกเลิก</button>
                      </div>
                    </form>
                  ) : (
                    <>
                      <p>{feature.description}</p>
                      <div className="feature-meta">
                        <span>ชนิดค่า <strong>{feature.value_type === 'boolean' ? 'เปิด / ปิด' : 'จำนวน'}</strong></span>
                        {feature.unit ? <span>หน่วย <strong>{feature.unit}</strong></span> : null}
                        <span>อัปเดต <strong>{new Date(feature.updated_at).toLocaleString('th-TH', { timeZone: 'Asia/Bangkok' })}</strong></span>
                      </div>
                      <button className="button secondary feature-edit-button" type="button" onClick={() => beginEdit(feature)}>แก้ไขรายละเอียด</button>
                    </>
                  )}
                </article>
              )
            })}
          </div>
        ) : <div className="empty">ยังไม่มี Feature ใน Catalog เริ่มต้นด้วยการสร้าง Feature แบบ Draft</div>}
      </section>
    </div>
  )
}

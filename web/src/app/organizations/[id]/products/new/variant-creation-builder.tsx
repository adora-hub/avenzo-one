'use client'

import { useEffect, useMemo, useRef, useState, type Dispatch, type KeyboardEvent, type SetStateAction } from 'react'
import { checkVariantProductIdentifiersAction } from '@/app/actions/foundation'

export type VariantOptionValueDraft = {
  id: string
  name: string
  code: string
}

export type VariantOptionGroupDraft = {
  id: string
  name: string
  kind: 'color' | 'size' | 'custom'
  values: VariantOptionValueDraft[]
}

export type VariantCombinationDraft = {
  key: string
  enabled: boolean
  skuCode: string
  salesCode: string
  price: string
  barcode: string
  imageId: string
  status: 'draft' | 'active'
  optionValueIds: string[]
}

type ProductImageOption = { id: string; name: string }

type Props = {
  organizationId: string
  groups: VariantOptionGroupDraft[]
  setGroups: Dispatch<SetStateAction<VariantOptionGroupDraft[]>>
  combinations: VariantCombinationDraft[]
  setCombinations: Dispatch<SetStateAction<VariantCombinationDraft[]>>
  images: ProductImageOption[]
  onIdentifierCheckChange?: (ready: boolean) => void
  disabled?: boolean
}

type VariantIdentifierCollision = {
  key: string
  field: 'sku_code' | 'sales_code' | 'barcode'
  value: string
  suggestion?: string
  reason: 'duplicate_in_form' | 'already_exists'
}

const knownVariantCodes: Record<string, string> = {
  สีฟ้า: 'BLU', ฟ้า: 'BLU', สีน้ำเงิน: 'BLU', สีดำ: 'BLK', ดำ: 'BLK',
  สีขาว: 'WHT', ขาว: 'WHT', สีแดง: 'RED', แดง: 'RED', สีเงิน: 'SLV',
  เงิน: 'SLV', สีทอง: 'GLD', ทอง: 'GLD',
}

export const DEFAULT_VARIANT_GROUPS: VariantOptionGroupDraft[] = [
  {
    id: 'option-color', name: 'สี', kind: 'color',
    values: [
      { id: 'color-blue', name: 'สีฟ้า', code: 'BLU' },
      { id: 'color-black', name: 'สีดำ', code: 'BLK' },
    ],
  },
  {
    id: 'option-size', name: 'ไซซ์', kind: 'size',
    values: [
      { id: 'size-s', name: 'S', code: 'S' },
      { id: 'size-m', name: 'M', code: 'M' },
      { id: 'size-l', name: 'L', code: 'L' },
      { id: 'size-xl', name: 'XL', code: 'XL' },
    ],
  },
]

export function variantValueCode(name: string, fallbackIndex = 1) {
  const normalized = name.normalize('NFKC').trim()
  if (knownVariantCodes[normalized]) return knownVariantCodes[normalized]
  const latin = normalized.normalize('NFKD').toUpperCase().match(/[A-Z0-9]+/g)?.join('').slice(0, 6)
  return latin || `V${fallbackIndex}`
}

export function sanitizeVariantGroups(value: unknown): VariantOptionGroupDraft[] {
  if (!Array.isArray(value)) return DEFAULT_VARIANT_GROUPS
  const groups = value.slice(0, 3).flatMap((entry, groupIndex) => {
    if (!entry || typeof entry !== 'object') return []
    const record = entry as Partial<VariantOptionGroupDraft>
    const name = String(record.name ?? '').normalize('NFC').trim().slice(0, 40)
    const kind: VariantOptionGroupDraft['kind'] = record.kind === 'color' || record.kind === 'size' ? record.kind : 'custom'
    const values = Array.isArray(record.values) ? record.values.slice(0, 12).flatMap((option, valueIndex) => {
      if (!option || typeof option !== 'object') return []
      const item = option as Partial<VariantOptionValueDraft>
      const optionName = String(item.name ?? '').normalize('NFC').trim().slice(0, 40)
      if (!optionName) return []
      const code = String(item.code ?? variantValueCode(optionName, valueIndex + 1))
        .toUpperCase().replace(/[^A-Z0-9_-]/g, '').slice(0, 12)
      return [{ id: String(item.id ?? crypto.randomUUID()).slice(0, 80), name: optionName, code }]
    }) : []
    return [{ id: String(record.id ?? `option-${groupIndex + 1}`).slice(0, 80), name, kind, values }]
  })
  return groups.length ? groups : DEFAULT_VARIANT_GROUPS
}

export function sanitizeVariantCombinations(value: unknown): VariantCombinationDraft[] {
  if (!Array.isArray(value)) return []
  return value.slice(0, 100).flatMap((entry) => {
    if (!entry || typeof entry !== 'object') return []
    const item = entry as Partial<VariantCombinationDraft>
    const key = String(item.key ?? '').slice(0, 500)
    if (!key) return []
    return [{
      key,
      enabled: item.enabled !== false,
      skuCode: String(item.skuCode ?? '').toUpperCase().replace(/[^A-Z0-9._-]/g, '').slice(0, 80),
      salesCode: String(item.salesCode ?? '').toUpperCase().replace(/[^A-Z0-9._-]/g, '').slice(0, 80),
      price: Number.isFinite(Number(item.price)) && Number(item.price) >= 0 ? String(item.price) : '',
      barcode: String(item.barcode ?? '').toUpperCase().replace(/[^A-Z0-9._-]/g, '').slice(0, 128),
      imageId: String(item.imageId ?? '').slice(0, 80),
      status: item.status === 'active' ? 'active' : 'draft',
      optionValueIds: Array.isArray(item.optionValueIds) ? item.optionValueIds.map(String).slice(0, 3) : key.split('::'),
    }]
  })
}

function cartesianValues(groups: VariantOptionGroupDraft[]) {
  return groups.reduce<VariantOptionValueDraft[][]>(
    (rows, group) => rows.flatMap((row) => group.values.map((value) => [...row, value])),
    [[]],
  ).slice(0, 100)
}

export function synchronizeVariantCombinations(
  groups: VariantOptionGroupDraft[],
  previous: VariantCombinationDraft[],
  prefix = 'SKU',
) {
  const completeGroups = groups.filter((group) => group.name.trim() && group.values.length > 0)
  if (completeGroups.length !== groups.length) return []
  const previousByKey = new Map(previous.map((item) => [item.key, item]))
  const safePrefix = prefix.toUpperCase().replace(/[^A-Z0-9_-]/g, '').slice(0, 24) || 'SKU'
  return cartesianValues(completeGroups).map((values) => {
    const key = values.map((value) => value.id).join('::')
    return previousByKey.get(key) ?? {
      key,
      enabled: true,
      skuCode: `${safePrefix}-${values.map((value) => value.code).join('-')}`.slice(0, 80),
      salesCode: '',
      price: '',
      barcode: '',
      imageId: '',
      status: 'draft' as const,
      optionValueIds: values.map((value) => value.id),
    }
  })
}

function groupKind(name: string): VariantOptionGroupDraft['kind'] {
  const normalized = name.toLocaleLowerCase('th-TH')
  if (normalized.includes('สี') || normalized === 'color') return 'color'
  if (normalized.includes('ไซซ์') || normalized.includes('ขนาด') || normalized === 'size') return 'size'
  return 'custom'
}

export function VariantCreationBuilder({
  organizationId, groups, setGroups, combinations, setCombinations, images, onIdentifierCheckChange, disabled = false,
}: Props) {
  const [skuPrefix, setSkuPrefix] = useState('TS')
  const [bulkPrice, setBulkPrice] = useState('')
  const [bulkBarcode, setBulkBarcode] = useState<'none' | 'sku' | 'sequence'>('none')
  const [bulkStatus, setBulkStatus] = useState<'draft' | 'active'>('draft')
  const [salesCodeMode, setSalesCodeMode] = useState<'manual' | 'same-sku' | 'sequence'>('sequence')
  const [salesCodePrefix, setSalesCodePrefix] = useState('B')
  const [salesCodeStart, setSalesCodeStart] = useState(1)
  const [salesCodeDigits, setSalesCodeDigits] = useState(3)
  const [identifierCheck, setIdentifierCheck] = useState<{
    tone: 'idle' | 'checking' | 'success' | 'danger'
    text: string
    collisionKeys: string[]
    collisions: VariantIdentifierCollision[]
  }>({
    tone: 'idle', text: 'ระบบจะตรวจ SKU, รหัส CF และ Barcode ของทุก Variant อัตโนมัติ',
    collisionKeys: [], collisions: [],
  })
  const checkRequestRef = useRef(0)

  const enabledIdentifiers = useMemo(() => combinations.filter((item) => item.enabled).map((item) => ({
    key: item.key, skuCode: item.skuCode, salesCode: item.salesCode, barcode: item.barcode,
  })), [combinations])
  const enabledIdentifierSignature = JSON.stringify(enabledIdentifiers)

  async function checkVariantIdentifiers() {
    if (!enabledIdentifiers.length || enabledIdentifiers.some((item) => !item.skuCode || !item.salesCode)) {
      onIdentifierCheckChange?.(false)
      setIdentifierCheck({ tone: 'idle', text: 'กรอก SKU และรหัสขาย / รหัส CF ให้ครบทุก Variant ก่อนตรวจ', collisionKeys: [], collisions: [] })
      return
    }
    const requestId = ++checkRequestRef.current
    onIdentifierCheckChange?.(false)
    setIdentifierCheck({ tone: 'checking', text: `กำลังตรวจ ${enabledIdentifiers.length} Variant…`, collisionKeys: [], collisions: [] })
    const result = await checkVariantProductIdentifiersAction({ organizationId, variants: enabledIdentifiers })
    if (requestId !== checkRequestRef.current) return
    if (!result.ok) {
      onIdentifierCheckChange?.(false)
      setIdentifierCheck({ tone: 'danger', text: 'ตรวจรหัสไม่สำเร็จ กรุณาลองอีกครั้ง', collisionKeys: [], collisions: [] })
      return
    }
    const collisionKeys = result.data.collisions.map((collision) => `${collision.key}:${collision.field}`)
    if (collisionKeys.length) {
      const inForm = result.data.collisions.filter((collision) => collision.reason === 'duplicate_in_form').length
      const existing = result.data.collisions.filter((collision) => collision.reason === 'already_exists').length
      onIdentifierCheckChange?.(false)
      setIdentifierCheck({ tone: 'danger', text: `พบรหัสซ้ำ ${collisionKeys.length} จุด${inForm ? ` · ในฟอร์ม ${inForm}` : ''}${existing ? ` · มีในระบบแล้ว ${existing}` : ''}`, collisionKeys, collisions: result.data.collisions })
    } else {
      onIdentifierCheckChange?.(true)
      setIdentifierCheck({ tone: 'success', text: `รหัสทั้ง ${result.data.checked} ค่า ของ ${enabledIdentifiers.length} Variant สามารถใช้ได้`, collisionKeys: [], collisions: [] })
    }
  }

  useEffect(() => {
    const timer = window.setTimeout(() => { void checkVariantIdentifiers() }, 650)
    return () => window.clearTimeout(timer)
    // Signature represents every identifier field; recheck after each edit.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [enabledIdentifierSignature, organizationId])

  function commitGroups(next: VariantOptionGroupDraft[]) {
    setGroups(next)
    setCombinations((current) => synchronizeVariantCombinations(next, current, skuPrefix))
  }

  function addGroup() {
    if (groups.length >= 3) return
    const next = [...groups, {
      id: crypto.randomUUID(), name: `ตัวเลือก ${groups.length + 1}`,
      kind: 'custom' as const, values: [],
    }]
    commitGroups(next)
  }

  function addValue(groupId: string, rawValue: string) {
    const values = rawValue.split(',').map((entry) => entry.normalize('NFC').trim()).filter(Boolean)
    if (!values.length) return
    const next = groups.map((group) => {
      if (group.id !== groupId) return group
      const existing = new Set(group.values.map((value) => value.name.toLocaleLowerCase('th-TH')))
      const additions = values.flatMap((name, index) => {
        if (existing.has(name.toLocaleLowerCase('th-TH')) || group.values.length + index >= 12) return []
        return [{ id: crypto.randomUUID(), name: name.slice(0, 40), code: variantValueCode(name, group.values.length + index + 1) }]
      })
      return { ...group, values: [...group.values, ...additions].slice(0, 12) }
    })
    commitGroups(next)
  }

  function handleValueKeyDown(event: KeyboardEvent<HTMLInputElement>, groupId: string) {
    if (event.key !== 'Enter' && event.key !== ',') return
    event.preventDefault()
    addValue(groupId, event.currentTarget.value)
    event.currentTarget.value = ''
  }

  function updateCombination(key: string, patch: Partial<VariantCombinationDraft>) {
    setCombinations((current) => current.map((item) => item.key === key ? { ...item, ...patch } : item))
  }

  function useIdentifierSuggestion(collision: VariantIdentifierCollision) {
    if (!collision.suggestion) return
    const currentValue = collision.value.toUpperCase()
    const suggestion = collision.suggestion.toUpperCase()
    setCombinations((current) => current.map((item) => item.key !== collision.key ? item : ({
      ...item,
      skuCode: item.skuCode.toUpperCase() === currentValue ? suggestion : item.skuCode,
      salesCode: item.salesCode.toUpperCase() === currentValue ? suggestion : item.salesCode,
      barcode: item.barcode.toUpperCase() === currentValue ? suggestion : item.barcode,
    })))
  }

  function applyBulkValues() {
    const safePrefix = skuPrefix.toUpperCase().replace(/[^A-Z0-9_-]/g, '').slice(0, 24) || 'SKU'
    const safeSalesPrefix = salesCodePrefix.toUpperCase().replace(/[^A-Z0-9_-]/g, '').slice(0, 10) || 'B'
    const valuesById = new Map(groups.flatMap((group) => group.values.map((value) => [value.id, value])))
    let sequenceIndex = 0
    setCombinations((current) => current.map((item, index) => {
      const skuCode = `${safePrefix}-${item.optionValueIds.map((id) => valuesById.get(id)?.code ?? 'VAR').join('-')}`.slice(0, 80)
      const salesCode = salesCodeMode === 'same-sku'
        ? skuCode
        : salesCodeMode === 'sequence' && item.enabled
          ? `${safeSalesPrefix}${String(salesCodeStart + sequenceIndex++).padStart(salesCodeDigits, '0')}`.slice(0, 80)
          : item.salesCode
      return {
        ...item,
        skuCode,
        salesCode,
        price: bulkPrice,
        status: bulkStatus,
        barcode: bulkBarcode === 'sku' ? skuCode : bulkBarcode === 'sequence' ? `290${String(index + 1).padStart(10, '0')}` : '',
      }
    }))
  }

  const valuesById = new Map(groups.flatMap((group) => group.values.map((value) => [value.id, { group, value }])))
  const enabledCount = combinations.filter((item) => item.enabled).length
  const allEnabled = combinations.length > 0 && enabledCount === combinations.length
  const groupLimitReached = groups.length >= 3
  const suggestedIdentifierCollisions = [...new Map(identifierCheck.collisions
    .filter((collision) => collision.reason === 'already_exists' && collision.suggestion)
    .map((collision) => [`${collision.key}:${collision.value.toUpperCase()}`, collision]))
    .values()]

  return <section className="product-variant-builder" aria-labelledby="variantBuilderTitle">
    <header className="product-variant-builder-head">
      <div><h3 id="variantBuilderTitle">กำหนดตัวเลือกและสร้าง SKU Combination</h3><p>เพิ่มสี ไซซ์ หรือตัวเลือกอื่น แล้วระบบจะสร้างรายการ SKU ที่ต้องขายและนับ Stock แยกกัน</p></div>
      <div className="product-variant-group-action">
        <button className="button compact secondary" type="button" onClick={addGroup} disabled={disabled || groupLimitReached} aria-describedby="variantGroupLimitHelp">{groupLimitReached ? 'ครบ 3 กลุ่มแล้ว' : '＋ เพิ่มกลุ่มตัวเลือก'}</button>
        <small id="variantGroupLimitHelp" role="status" aria-live="polite">{groupLimitReached ? 'ลบกลุ่มใดกลุ่มหนึ่งเพื่อเพิ่มกลุ่มใหม่' : `เพิ่มได้อีก ${3 - groups.length} กลุ่ม`}</small>
      </div>
    </header>
    <div className="product-variant-builder-body">
      <div className="product-variant-option-list">{groups.map((group, groupIndex) => <article className="product-variant-option-card" key={group.id}>
        <label><span>ชื่อกลุ่มตัวเลือก</span><input value={group.name} maxLength={40} disabled={disabled} aria-label={`ชื่อกลุ่มตัวเลือก ${groupIndex + 1}`} onChange={(event) => {
          const name = event.target.value.slice(0, 40)
          commitGroups(groups.map((item) => item.id === group.id ? { ...item, name, kind: groupKind(name) } : item))
        }} /></label>
        <label><span>ค่าตัวเลือก</span><span className="product-variant-values-editor">{group.values.map((value) => <span className="product-variant-value-chip" key={value.id}>{value.name}<button type="button" disabled={disabled} aria-label={`ลบ ${value.name}`} onClick={() => commitGroups(groups.map((item) => item.id === group.id ? { ...item, values: item.values.filter((entry) => entry.id !== value.id) } : item))}>×</button></span>)}<input maxLength={40} disabled={disabled || group.values.length >= 12} placeholder="พิมพ์ค่าแล้วกด Enter เช่น สีแดง" aria-label={`เพิ่มค่าในกลุ่ม ${group.name}`} onKeyDown={(event) => handleValueKeyDown(event, group.id)} onBlur={(event) => { if (event.currentTarget.value.trim()) { addValue(group.id, event.currentTarget.value); event.currentTarget.value = '' } }} /></span></label>
        <button className="product-variant-remove" type="button" disabled={disabled || groups.length <= 1} aria-label={`ลบกลุ่ม ${group.name}`} onClick={() => commitGroups(groups.filter((item) => item.id !== group.id))}>×</button>
      </article>)}</div>

      <div className="product-variant-bulk-toolbar" aria-label="เครื่องมือกรอกหลาย Combination">
        <label><span>คำนำหน้า SKU</span><input value={skuPrefix} maxLength={24} disabled={disabled} placeholder="เช่น TS" onChange={(event) => setSkuPrefix(event.target.value.toUpperCase().replace(/[^A-Z0-9_-]/g, '').slice(0, 24))} /></label>
        <label><span>วิธีกำหนดรหัสขาย / CF</span><span className="product-select-control"><select value={salesCodeMode} disabled={disabled} onChange={(event) => setSalesCodeMode(event.target.value as typeof salesCodeMode)}><option value="sequence">รันเลขต่อเนื่อง</option><option value="same-sku">ใช้รหัสเดียวกับ SKU</option><option value="manual">กรอกเองแต่ละ Variant</option></select></span></label>
        {salesCodeMode === 'sequence' ? <div className="product-variant-sequence-controls"><label><span>Prefix</span><input value={salesCodePrefix} maxLength={10} disabled={disabled} onChange={(event) => setSalesCodePrefix(event.target.value.toUpperCase().replace(/[^A-Z0-9_-]/g, '').slice(0, 10))} /></label><label><span>เลขเริ่มต้น</span><input type="number" min="0" max="99999999" value={salesCodeStart} disabled={disabled} onChange={(event) => setSalesCodeStart(Math.max(0, Math.trunc(Number(event.target.value) || 0)))} /></label><label><span>หลัก</span><input type="number" min="2" max="8" value={salesCodeDigits} disabled={disabled} onChange={(event) => setSalesCodeDigits(Math.min(8, Math.max(2, Math.trunc(Number(event.target.value) || 3))))} /></label></div> : null}
        <label><span>ราคาขายทุกตัวเลือก</span><input value={bulkPrice} type="number" min="0" max="999999999" step="0.01" disabled={disabled} placeholder="เช่น 390.00" onChange={(event) => setBulkPrice(event.target.value)} /></label>
        <label><span>Barcode</span><span className="product-select-control"><select value={bulkBarcode} disabled={disabled} onChange={(event) => setBulkBarcode(event.target.value as typeof bulkBarcode)}><option value="none">ยังไม่กำหนด</option><option value="sku">ใช้ SKU Code เป็นรหัสภายใน</option><option value="sequence">สร้างเลขตัวอย่างต่อเนื่อง</option></select></span></label>
        <label><span>สถานะ</span><span className="product-select-control"><select value={bulkStatus} disabled={disabled} onChange={(event) => setBulkStatus(event.target.value as typeof bulkStatus)}><option value="draft">ฉบับร่าง</option><option value="active">ใช้งานอยู่</option></select></span></label>
        <div className="product-variant-bulk-actions"><button className="button compact product-primary-action" type="button" disabled={disabled || combinations.length === 0} onClick={applyBulkValues}>ใช้กับทุกรายการ</button><button className="button compact secondary" type="button" disabled={disabled || combinations.length === 0} onClick={() => { setBulkPrice(''); setBulkBarcode('none'); setBulkStatus('draft'); setCombinations((current) => current.map((item) => ({ ...item, price: '', barcode: '', status: 'draft' }))) }}>ล้างค่า</button></div>
      </div>

      <div className={`product-variant-identifier-check ${identifierCheck.tone}`} role="status" aria-live="polite"><span>{identifierCheck.tone === 'success' ? '✓' : identifierCheck.tone === 'danger' ? '!' : 'ⓘ'}</span><span>{identifierCheck.text}</span><button className="button compact secondary" type="button" disabled={disabled || identifierCheck.tone === 'checking'} onClick={() => { void checkVariantIdentifiers() }}>{identifierCheck.tone === 'checking' ? 'กำลังตรวจ…' : 'ตรวจรหัสอีกครั้ง'}</button></div>
      {suggestedIdentifierCollisions.length ? <div className="product-variant-identifier-suggestions" role="list" aria-label="รหัสถัดไปที่สามารถใช้ได้"><strong>รหัสถัดไปที่ว่างจริง</strong><div>{suggestedIdentifierCollisions.map((collision) => <button className="button compact secondary" type="button" role="listitem" key={`${collision.key}:${collision.value}`} onClick={() => useIdentifierSuggestion(collision)} disabled={disabled}><span>{collision.field === 'sku_code' ? 'SKU Code' : collision.field === 'sales_code' ? 'รหัส CF' : 'Barcode'}</span><code>{collision.value}</code><span aria-hidden="true">→</span><code>{collision.suggestion}</code></button>)}</div><small>กดใช้รหัสแล้วระบบจะตรวจฐานข้อมูลซ้ำให้อัตโนมัติ</small></div> : null}

      <div className="product-variant-matrix-wrap"><table className="product-variant-matrix">
        <thead><tr><th><input type="checkbox" checked={allEnabled} ref={(node) => { if (node) node.indeterminate = enabledCount > 0 && enabledCount < combinations.length }} disabled={disabled || combinations.length === 0} aria-label="เปิดหรือปิดทุก Combination" onChange={(event) => setCombinations((current) => current.map((item) => ({ ...item, enabled: event.target.checked })))} /></th><th>ตัวเลือก</th><th>SKU Code</th><th>รหัสขาย / รหัส CF</th><th>ราคาขาย</th><th>Barcode</th><th>รูปประจำ Variant</th><th>สถานะ</th></tr></thead>
        <tbody>{combinations.length ? combinations.map((item) => {
          const selections = item.optionValueIds.flatMap((id) => { const found = valuesById.get(id); return found ? [found] : [] })
          const name = selections.map(({ value }) => value.name).join(' / ')
          const detail = selections.map(({ group, value }) => `${group.name}: ${value.name}`).join(' · ')
          return <tr key={item.key} className={item.enabled ? '' : 'is-disabled'}><td><input type="checkbox" checked={item.enabled} disabled={disabled} aria-label={`เปิดขาย ${name}`} onChange={(event) => updateCombination(item.key, { enabled: event.target.checked })} /></td><td className="product-variant-combination-name"><strong>{name}</strong><span>{detail}</span></td><td><input value={item.skuCode} aria-invalid={identifierCheck.collisionKeys.includes(`${item.key}:sku_code`)} maxLength={80} disabled={disabled || !item.enabled} aria-label={`SKU Code ${name}`} onChange={(event) => updateCombination(item.key, { skuCode: event.target.value.toUpperCase().replace(/[^A-Z0-9._-]/g, '').slice(0, 80) })} /></td><td><input value={item.salesCode} aria-invalid={identifierCheck.collisionKeys.includes(`${item.key}:sales_code`)} maxLength={80} disabled={disabled || !item.enabled} placeholder="เช่น B001" aria-label={`รหัสขาย / รหัส CF ${name}`} onChange={(event) => updateCombination(item.key, { salesCode: event.target.value.toUpperCase().replace(/[^A-Z0-9._-]/g, '').slice(0, 80) })} /></td><td><input value={item.price} type="number" min="0" max="999999999" step="0.01" disabled={disabled || !item.enabled} aria-label={`ราคาขาย ${name}`} onChange={(event) => updateCombination(item.key, { price: event.target.value })} /></td><td><input value={item.barcode} aria-invalid={identifierCheck.collisionKeys.includes(`${item.key}:barcode`)} maxLength={128} disabled={disabled || !item.enabled} placeholder="ยังไม่กำหนด" aria-label={`Barcode ${name}`} onChange={(event) => updateCombination(item.key, { barcode: event.target.value.toUpperCase().replace(/[^A-Z0-9._-]/g, '').slice(0, 128) })} /></td><td><span className="product-select-control"><select value={item.imageId} disabled={disabled || !item.enabled} aria-label={`รูปประจำ Variant ${name}`} onChange={(event) => updateCombination(item.key, { imageId: event.target.value })}><option value="">ใช้ภาพ Product</option>{images.map((image, imageIndex) => <option key={image.id} value={image.id}>ภาพที่ {imageIndex + 1} · {image.name}</option>)}</select></span></td><td><span className="product-select-control"><select value={item.status} disabled={disabled || !item.enabled} aria-label={`สถานะ ${name}`} onChange={(event) => updateCombination(item.key, { status: event.target.value as VariantCombinationDraft['status'] })}><option value="draft">ฉบับร่าง</option><option value="active">ใช้งานอยู่</option></select></span></td></tr>
        }) : <tr><td colSpan={8} className="product-variant-empty">เพิ่มค่าให้ครบทุกกลุ่ม เพื่อสร้าง SKU Combination</td></tr>}</tbody>
      </table></div>
      <div className="product-variant-builder-footnote"><span aria-hidden="true">ⓘ</span><span>ปิด Combination ที่ไม่ขายได้ · เมื่อกดสร้าง ระบบจะบันทึก Product และ SKU ที่เปิดไว้ทั้งหมดในคำสั่งเดียว</span></div>
    </div>
  </section>
}

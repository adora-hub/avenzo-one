'use client'

import { useEffect, useMemo, useRef, useState, useTransition, type FormEvent } from 'react'
import { IconInfoHexagon } from '@tabler/icons-react'
import { executeFoundationCommandAction, loadProductsBulkEditContextAction } from '@/app/actions/foundation'
import type { ProductWorkspaceRow, ProductWorkspaceSkuDetail } from '@/lib/foundation/repositories'

type MasterOption = { id: string; name: string }
type BulkAction = 'brand' | 'category' | 'tags' | 'status' | 'price' | 'cost' | 'stock'
type SkuScope = 'all' | 'specific'

type Props = {
  organizationId: string
  rows: ProductWorkspaceRow[]
  selectedRows: Set<string>
  brandOptions: MasterOption[]
  categoryOptions: MasterOption[]
  tagOptions: MasterOption[]
  inventoryLocationOptions: Array<{ id: string; name: string; code: string; warehouseName: string }>
  canManage: boolean
  canAdjustInventory: boolean
  canReadCost: boolean
  onClear: () => void
  onCompleted: (message: string) => void
}

type BulkSku = ProductWorkspaceSkuDetail & { productName: string }
type MasterTooltip = { key: string; text: string; left: number; top: number }

const productActionConfig = {
  brand: ['เปลี่ยนแบรนด์', 'กำหนดแบรนด์เดียวให้ Product ที่เลือก'],
  category: ['เปลี่ยนหมวดหมู่', 'ย้าย Product ที่เลือกไปยังหมวดหมู่เดียวกัน'],
  tags: ['จัดการป้ายกำกับ', 'เพิ่ม นำออก หรือแทนที่ Tags ของ Product ที่เลือก'],
  status: ['เปลี่ยนสถานะสินค้า', 'กำหนดสถานะเดียวให้ Product ที่เลือก'],
} as const

const skuActionConfig = {
  price: ['แก้ไขราคาขาย', 'กำหนดราคาใหม่หรือปรับราคาให้ SKU ที่เลือก'],
  cost: ['แก้ไขราคาต้นทุน', 'จำกัดตามสิทธิ์และบันทึก Audit Log ในระบบจริง'],
  stock: ['ปรับจำนวนสต็อก', 'การยืนยันจริงจะสร้าง Stock Movement แยกตาม SKU'],
} as const

function nextNumber(current: number, input: number, mode: string, rounding: string) {
  let value = mode === 'amount' ? current + input : mode === 'percent' ? current * (1 + input / 100) : input
  if (rounding === 'whole') value = Math.round(value)
  if (rounding === 'ten') value = Math.round(value / 10) * 10
  return Math.max(0, value)
}

function money(value: number | null) {
  return value === null ? '—' : new Intl.NumberFormat('th-TH', { style: 'currency', currency: 'THB' }).format(value)
}

export function ProductsBulkEdit(props: Props) {
  const selectedProducts = useMemo(() => props.rows.filter((row) => props.selectedRows.has(row.id)), [props.rows, props.selectedRows])
  const selectedSkuCount = selectedProducts.reduce((sum, row) => sum + row.skuCount, 0)
  const [menuOpen, setMenuOpen] = useState(false)
  const [action, setAction] = useState<BulkAction | null>(null)
  const [skus, setSkus] = useState<BulkSku[]>([])
  const [skuScope, setSkuScope] = useState<SkuScope>('all')
  const [selectedSkuIds, setSelectedSkuIds] = useState<Set<string>>(new Set())
  const [skuSearch, setSkuSearch] = useState('')
  const [productSearch, setProductSearch] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  const [pending, startTransition] = useTransition()
  const [previewVersion, setPreviewVersion] = useState(0)
  const [masterTooltip, setMasterTooltip] = useState<MasterTooltip | null>(null)
  const dialogRef = useRef<HTMLElement>(null)
  const formRef = useRef<HTMLFormElement>(null)

  function showMasterTooltip(target: HTMLButtonElement, key: string, text: string) {
    const rect = target.getBoundingClientRect()
    setMasterTooltip({ key, text, left: rect.right + 10, top: rect.top + rect.height / 2 })
  }

  useEffect(() => {
    if (!action) return
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && !pending) setAction(null)
    }
    window.addEventListener('keydown', onKeyDown)
    requestAnimationFrame(() => dialogRef.current?.querySelector<HTMLElement>('input, select, button')?.focus())
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [action, pending])

  async function openAction(nextAction: BulkAction) {
    setMenuOpen(false)
    setError('')
    setSkuScope('all')
    setSkuSearch('')
    setProductSearch('')
    setAction(nextAction)
    if (nextAction === 'cost' && !props.canReadCost) return setError('บัญชีนี้ไม่มีสิทธิ์ดูหรือแก้ไขราคาต้นทุน')
    if (nextAction === 'stock' && !props.canAdjustInventory) return setError('บัญชีนี้ไม่มีสิทธิ์ปรับจำนวนสต็อก')
    if (nextAction in skuActionConfig) {
      setLoading(true)
      const result = await loadProductsBulkEditContextAction({ organizationId: props.organizationId, productIds: selectedProducts.map((row) => row.id), includeInventory: nextAction === 'stock', includeCost: nextAction === 'cost' })
      setLoading(false)
      if (!result.ok) return setError('โหลดรายการ SKU ไม่สำเร็จ กรุณาปิดแล้วลองใหม่')
      const loaded = result.data.products.flatMap((product) => product.skus.map((sku) => ({ ...sku, productName: product.name })))
      setSkus(loaded)
      setSelectedSkuIds(new Set(loaded.map((sku) => sku.id)))
    }
  }

  const activeSkus = skuScope === 'all' ? skus : skus.filter((sku) => selectedSkuIds.has(sku.id))
  const visibleSkus = skus.filter((sku) => !skuSearch.trim() || `${sku.productName} ${sku.skuCode}`.toLocaleLowerCase('th').includes(skuSearch.trim().toLocaleLowerCase('th')))

  function previewValue(sku: BulkSku, data: FormData) {
    const input = Number(data.get('bulkValue') || 0)
    if (action === 'stock') {
      const current = sku.stock.onHand ?? 0
      const direction = String(data.get('stockDirection') || 'increase')
      return direction === 'increase' ? current + input : direction === 'decrease' ? Math.max(0, current - input) : input
    }
    const current = action === 'cost' ? sku.cost.costPrice ?? 0 : sku.profile?.salePrice ?? 0
    return nextNumber(current, input, String(data.get('priceMode') || 'set'), String(data.get('rounding') || 'none'))
  }

  async function runCommand(command: unknown) {
    const result = await executeFoundationCommandAction(command)
    if (!result.ok) throw new Error(result.error)
  }

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!action) return
    const data = new FormData(event.currentTarget)
    setError('')
    startTransition(async () => {
      try {
        if (action in productActionConfig) {
          if (action === 'status') {
            const status = String(data.get('bulkProductValue') || '')
            if (!status) throw new Error('กรุณาเลือกสถานะใหม่')
            if (status === 'draft') throw new Error('ระบบไม่อนุญาตให้เปลี่ยนสินค้าที่สร้างแล้วกลับเป็นฉบับร่าง')
            for (const product of selectedProducts) await runCommand({ kind: 'entity', commandId: crypto.randomUUID(), organizationId: props.organizationId, commandType: status === 'active' ? 'product.activate' : 'product.archive', payload: { product_id: product.id, expected_version: product.version } })
          } else {
            const value = String(data.get('bulkProductValue') || '')
            const tagValues = data.getAll('tagValue').map(String)
            if (action !== 'tags' && !value) throw new Error('กรุณาเลือกค่าใหม่ก่อนนำไปใช้')
            if (action === 'tags' && !tagValues.length) throw new Error('กรุณาเลือกป้ายกำกับอย่างน้อย 1 รายการ')
            for (const product of selectedProducts) {
              let tags = product.tags.map((tag) => tag.id)
              if (action === 'tags') {
                const mode = String(data.get('tagMode') || 'add')
                tags = mode === 'replace' ? tagValues : mode === 'remove' ? tags.filter((id) => !tagValues.includes(id)) : Array.from(new Set([...tags, ...tagValues]))
              }
              await runCommand({ kind: 'entity', commandId: crypto.randomUUID(), organizationId: props.organizationId, commandType: 'product.metadata.update', payload: { product_id: product.id, expected_version: product.version, category_id: action === 'category' ? value : product.category?.id ?? null, brand_id: action === 'brand' ? (value || null) : product.brand?.id ?? null, structure_type: product.structureType, tag_ids: tags } })
            }
          }
        } else {
          if (!activeSkus.length) throw new Error('กรุณาเลือก SKU อย่างน้อย 1 รายการ')
          const raw = String(data.get('bulkValue') || '').trim()
          if (!raw || !Number.isFinite(Number(raw)) || Number(raw) < 0) throw new Error('กรุณากรอกค่าที่ต้องการเปลี่ยนให้ถูกต้อง')
          if (action === 'stock' && String(data.get('stockDirection')) === 'set') throw new Error('ระบบจริงยังไม่รองรับกำหนดยอดใหม่โดยตรง กรุณาเลือกปรับเพิ่มหรือปรับลด')
          for (const sku of activeSkus) {
            if (action === 'price') {
              const profile = sku.profile
              await runCommand({ kind: 'entity', commandId: crypto.randomUUID(), organizationId: props.organizationId, commandType: 'sku.profile.upsert', payload: { sku_id: sku.id, expected_version: profile?.version ?? 0, quantity_behavior: profile?.quantityBehavior ?? 'discrete', sale_price: previewValue(sku, data), currency_code: profile?.currencyCode ?? 'THB', tax_category: profile?.taxCategory ?? 'standard', tax_rate: profile?.taxRate ?? 7, product_weight_kg: profile?.productWeightKg ?? null, product_length_cm: profile?.productLengthCm ?? null, product_width_cm: profile?.productWidthCm ?? null, product_height_cm: profile?.productHeightCm ?? null, package_weight_kg: profile?.packageWeightKg ?? null, package_length_cm: profile?.packageLengthCm ?? null, package_width_cm: profile?.packageWidthCm ?? null, package_height_cm: profile?.packageHeightCm ?? null, safety_stock: profile?.safetyStock ?? null, reorder_min: profile?.reorderMin ?? null, reorder_max: profile?.reorderMax ?? null } })
            } else if (action === 'cost') {
              await runCommand({ kind: 'entity', commandId: crypto.randomUUID(), organizationId: props.organizationId, commandType: 'sku.cost.upsert', payload: { sku_id: sku.id, expected_version: sku.cost.mode === 'authorized' ? sku.version : 0, cost_price: previewValue(sku, data), currency_code: sku.cost.currencyCode ?? 'THB' } })
            } else {
              const direction = String(data.get('stockDirection'))
              const locationId = String(data.get('stockLocation') || '')
              const reasonNote = String(data.get('stockReason') || '').trim()
              if (!locationId || reasonNote.length < 3) throw new Error('กรุณาเลือกคลังและระบุเหตุผลอย่างน้อย 3 ตัวอักษร')
              await runCommand({ kind: 'inventory', commandId: crypto.randomUUID(), organizationId: props.organizationId, commandType: direction === 'increase' ? 'adjustment_in' : 'adjustment_out', skuId: sku.id, sourceLocationId: direction === 'decrease' ? locationId : null, destinationLocationId: direction === 'increase' ? locationId : null, quantity: Number(raw), reasonCode: 'stock_count', reasonNote })
            }
          }
        }
        const changed = action in productActionConfig ? `${selectedProducts.length} สินค้า` : `${activeSkus.length} SKU`
        setAction(null)
        props.onClear()
        props.onCompleted(`อัปเดต ${changed} เรียบร้อยแล้ว`)
      } catch (cause) {
        setError(cause instanceof Error ? cause.message : 'ระบบไม่สามารถบันทึกได้ กรุณาลองใหม่')
      }
    })
  }

  function actionMenu() {
    const groups: Array<[string, Array<[BulkAction, string, string]>]> = [
      ['ข้อมูลสินค้า', [['brand', 'เปลี่ยนแบรนด์', 'กำหนดแบรนด์เดียวให้สินค้าที่เลือก'], ['category', 'เปลี่ยนหมวดหมู่', 'ย้ายสินค้าที่เลือกไปยังหมวดหมู่เดียวกัน'], ['tags', 'จัดการป้ายกำกับ', 'เพิ่ม นำออก หรือแทนที่ Tags'], ['status', 'เปลี่ยนสถานะ', 'ใช้งานอยู่ ฉบับร่าง หรือเก็บถาวร']]],
      ['ราคาและต้นทุน', [['price', 'แก้ไขราคาขาย', 'ใช้กับทุก SKU หรือเลือกเฉพาะ SKU'], ['cost', 'แก้ไขราคาต้นทุน', 'จำกัดตามสิทธิ์และมี Audit Log']]],
      ['คลังสินค้า', [['stock', 'ปรับจำนวนสต็อก', 'สร้าง Stock Movement แยกตาม SKU']]],
    ]
    return <div className="product-bulk-action-menu" role="menu">{groups.map(([label, items]) => <section key={label} role="group" aria-label={label}><p>{label}</p>{items.map(([key, title, help]) => <button key={key} type="button" role="menuitem" onClick={() => openAction(key)}><strong>{title}</strong><span>{help}</span></button>)}</section>)}<section role="group" aria-label="ขั้นสูง"><p>ขั้นสูง</p><button type="button" role="menuitem" disabled><strong>แก้ไขหลายข้อมูลพร้อมกัน</strong><span>เปิดขั้นตอนแบบแนะนำทีละส่วน</span></button></section></div>
  }

  function productBody() {
    if (!action || !(action in productActionConfig)) return null
    if (action === 'status') return <fieldset className="product-bulk-fieldset"><legend>เลือกค่าใหม่</legend><div className="product-bulk-choice-grid">{[['active', 'ใช้งานอยู่'], ['draft', 'ฉบับร่าง'], ['archived', 'เก็บถาวร']].map(([value, label]) => <label key={value}><input type="radio" name="bulkProductValue" value={value} /><strong>{label}</strong></label>)}</div><div className="product-bulk-warning">การเลือก “เก็บถาวร” จะซ่อนสินค้าจากงานขายใหม่ แต่ยังเก็บประวัติเดิมไว้</div></fieldset>
    const options = action === 'brand' ? [{ id: '', name: 'ไม่มีแบรนด์' }, ...props.brandOptions] : action === 'category' ? props.categoryOptions : props.tagOptions
    const query = productSearch.trim().toLocaleLowerCase('th')
    const filteredOptions = options.filter((option) => !query || option.name.toLocaleLowerCase('th').includes(query))
    const kindLabel = action === 'brand' ? 'แบรนด์' : action === 'category' ? 'หมวดหมู่' : 'ป้ายกำกับ'
    const usageCount = (optionId: string) => props.rows.filter((row) => action === 'brand' ? (row.brand?.id ?? '') === optionId : action === 'category' ? row.category?.id === optionId : row.tags.some((tag) => tag.id === optionId)).length
    const latestOptionId = action === 'brand'
      ? (props.rows.find((row) => row.brand?.id)?.brand?.id ?? '')
      : action === 'category'
        ? (props.rows.find((row) => row.category?.id)?.category?.id ?? '')
        : (props.rows.flatMap((row) => row.tags).find((tag) => tag.id)?.id ?? '')
    const frequentOptionId = options.reduce((best, option) => option.id && usageCount(option.id) > usageCount(best) ? option.id : best, '')
    return <>{action === 'tags' ? <fieldset className="product-bulk-fieldset"><legend>วิธีจัดการป้ายกำกับ</legend><div className="product-bulk-mode-group">{[['add', 'เพิ่มป้ายกำกับ'], ['remove', 'นำป้ายออก'], ['replace', 'แทนที่ทั้งหมด']].map(([value, label], index) => <label key={value}><input type="radio" name="tagMode" value={value} defaultChecked={index === 0} /><span>{label}</span></label>)}</div><p>ค่าเริ่มต้นคือเพิ่มป้าย โดยไม่ลบป้ายเดิมของสินค้า</p></fieldset> : null}<div className="product-bulk-master-picker"><label className="product-bulk-fieldset"><span>ค้นหา{kindLabel}</span><input className="product-bulk-search" type="search" value={productSearch} onChange={(event) => setProductSearch(event.target.value)} placeholder={`พิมพ์ชื่อ${kindLabel}...`} autoComplete="off" /></label><div className="product-bulk-master-results">{filteredOptions.length ? <div className="product-bulk-master-list">{filteredOptions.map((option) => { const count = usageCount(option.id); const badge = option.id && option.id === latestOptionId ? 'ใช้ล่าสุด' : option.id && option.id === frequentOptionId && count > 1 ? 'ใช้บ่อย' : ''; return <div className="product-bulk-master-option" key={option.id || 'none'}><label><input type={action === 'tags' ? 'checkbox' : 'radio'} name={action === 'tags' ? 'tagValue' : 'bulkProductValue'} value={option.id} /><span><strong>{option.name}</strong>{badge ? <span className={`product-bulk-master-badge ${badge === 'ใช้ล่าสุด' ? 'is-latest' : 'is-frequent'}`}>{badge}</span> : null}</span></label><button className="product-bulk-master-info" type="button" aria-label={`${kindLabel} “${option.name}” ใช้กับสินค้า ${count} รายการ`} aria-describedby={masterTooltip?.key === (option.id || 'none') ? 'product-bulk-master-tooltip' : undefined} onMouseEnter={(event) => showMasterTooltip(event.currentTarget, option.id || 'none', `${kindLabel} “${option.name}” ใช้กับสินค้า ${count} รายการ`)} onMouseLeave={() => setMasterTooltip(null)} onFocus={(event) => showMasterTooltip(event.currentTarget, option.id || 'none', `${kindLabel} “${option.name}” ใช้กับสินค้า ${count} รายการ`)} onBlur={() => setMasterTooltip(null)}><IconInfoHexagon size={18} stroke={1.8} aria-hidden="true" /></button></div> })}</div> : <div className="product-bulk-master-empty">ไม่พบ{kindLabel}ที่ค้นหา</div>}</div><div className="product-bulk-master-manage-row"><div className="product-bulk-master-summary"><strong>เลือกแล้ว {selectedProducts.length} สินค้า</strong><span>รวม {selectedSkuCount} SKU</span><span>{kindLabel}ทั้งหมด {options.length}</span></div><button className="button product-grid-button-secondary" type="button" disabled={!props.canManage}>จัดการ{kindLabel}</button></div></div></>
  }

  function skuBody() {
    if (!action || !(action in skuActionConfig)) return null
    const data = formRef.current ? new FormData(formRef.current) : new FormData()
    return <><div className="product-sku-bulk-layout"><section className="product-sku-bulk-panel"><h3>เลือกขอบเขต SKU</h3><p>ค่าเริ่มต้นใช้กับทุก SKU ภายใต้ Product ที่เลือก</p><div className="product-sku-scope-toggle" role="radiogroup"><label><input type="radio" checked={skuScope === 'all'} onChange={() => setSkuScope('all')} /><span>ทุก SKU</span></label><label><input type="radio" checked={skuScope === 'specific'} onChange={() => setSkuScope('specific')} /><span>เลือกเฉพาะ SKU</span></label></div>{skuScope === 'all' ? <div className="product-sku-scope-summary">กำลังแก้ไข SKU ทั้งหมด {skus.length} รายการ</div> : <><label className="field-stack"><span>ค้นหา SKU</span><input type="search" value={skuSearch} onChange={(event) => setSkuSearch(event.target.value)} placeholder="ค้นหาชื่อสินค้า หรือ SKU" /></label><div className="product-sku-scope-list">{visibleSkus.map((sku) => <label key={sku.id}><input type="checkbox" checked={selectedSkuIds.has(sku.id)} onChange={(event) => setSelectedSkuIds((current) => { const next = new Set(current); event.target.checked ? next.add(sku.id) : next.delete(sku.id); return next })} /><strong>{sku.skuCode}</strong><span>{sku.productName}</span></label>)}</div></>}</section><section className="product-sku-bulk-panel"><h3>{skuActionConfig[action as keyof typeof skuActionConfig][0]}</h3><p>{action === 'stock' ? 'ระบุคลัง จำนวน และเหตุผลให้ครบ' : 'เลือกวิธีคำนวณแล้วตรวจตัวอย่างก่อนยืนยัน'}</p><div className="product-sku-bulk-controls">{action === 'stock' ? <><label className="field-stack"><span>สาขา / คลังสินค้า</span><select name="stockLocation" required defaultValue=""><option value="">เลือกคลังสินค้า</option>{props.inventoryLocationOptions.map((location) => <option key={location.id} value={location.id}>{location.code} · {location.name}</option>)}</select></label><label className="field-stack"><span>วิธีปรับสต็อก</span><select name="stockDirection" onChange={() => setPreviewVersion((value) => value + 1)}><option value="increase">ปรับเพิ่ม</option><option value="decrease">ปรับลด</option><option value="set">กำหนดยอดใหม่</option></select></label><label className="field-stack"><span>จำนวน</span><input name="bulkValue" type="number" min="0" step="1" required onInput={() => setPreviewVersion((value) => value + 1)} /></label><label className="field-stack span-all"><span>เหตุผลการปรับ</span><textarea name="stockReason" minLength={3} maxLength={300} required /></label><div className="product-bulk-warning span-all">การยืนยันในระบบจริงต้องสร้าง Stock Movement พร้อมผู้ดำเนินการและ Audit Log ห้ามแก้ยอดคงเหลือตรง ๆ</div></> : <><label className="field-stack"><span>วิธีคำนวณ</span><select name="priceMode" onChange={() => setPreviewVersion((value) => value + 1)}><option value="set">กำหนดราคาใหม่</option><option value="amount">เพิ่ม / ลดเป็นจำนวนเงิน</option><option value="percent">เพิ่ม / ลดเป็นเปอร์เซ็นต์</option></select></label><label className="field-stack"><span>{action === 'cost' ? 'ราคาต้นทุน' : 'ราคาขาย'} (บาท)</span><input name="bulkValue" type="number" min="0" step="0.01" required onInput={() => setPreviewVersion((value) => value + 1)} /></label><label className="field-stack"><span>การปัดเศษ</span><select name="rounding" onChange={() => setPreviewVersion((value) => value + 1)}><option value="none">ไม่ปัดเศษ</option><option value="whole">ปัดเป็นจำนวนเต็ม</option><option value="ten">ปัดเป็นหลักสิบ</option></select></label>{action === 'cost' ? <div className="product-bulk-warning span-all">ข้อมูลราคาต้นทุนจะแสดงและแก้ไขได้เฉพาะผู้มีสิทธิ์ product.cost.manage</div> : null}</>}</div></section></div><section className="product-sku-bulk-panel"><h3>ตัวอย่างก่อนเปลี่ยน</h3><p>ตรวจ SKU ค่าปัจจุบัน และค่าหลังแก้ไขก่อนกดยืนยัน</p><div className="product-sku-preview-wrap"><table><thead><tr><th>สินค้า</th><th>SKU</th><th>ค่าปัจจุบัน</th><th>ค่าหลังแก้ไข</th></tr></thead><tbody>{activeSkus.map((sku) => { const current = action === 'stock' ? sku.stock.onHand ?? 0 : action === 'cost' ? sku.cost.costPrice : sku.profile?.salePrice ?? null; const next = previewValue(sku, data); return <tr key={`${sku.id}:${previewVersion}`}><td>{sku.productName}</td><td>{sku.skuCode}</td><td>{action === 'stock' ? `${current} ${sku.baseUnitCode}` : money(current)}</td><td>{action === 'stock' ? `${next} ${sku.baseUnitCode}` : money(next)}</td></tr> })}</tbody></table></div></section></>
  }

  return <><div className="product-grid-selection-active" aria-live="polite"><div><span>เลือกแล้ว <strong>{selectedProducts.length}</strong> สินค้า</span><span aria-hidden="true">·</span><span>รวม <strong>{selectedSkuCount}</strong> SKU</span></div><div className="product-bulk-actions"><div><button className="button product-grid-button-primary" type="button" aria-haspopup="menu" aria-expanded={menuOpen} onClick={() => setMenuOpen((value) => !value)}>แก้ไขรายการที่เลือก ▾</button>{menuOpen ? actionMenu() : null}</div><button className="button product-grid-button-secondary" type="button" onClick={props.onClear}>ยกเลิกการเลือก</button></div></div>{action ? <div className="product-modal-backdrop product-bulk-edit-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget && !pending) setAction(null) }}><section ref={dialogRef} className={`product-editor-dialog product-bulk-edit-dialog${action in skuActionConfig ? ' product-sku-bulk-dialog' : action === 'status' ? '' : ' product-master-bulk-dialog'}`} role="dialog" aria-modal="true"><header><div><h2>{action in productActionConfig ? productActionConfig[action as keyof typeof productActionConfig][0] : skuActionConfig[action as keyof typeof skuActionConfig][0]}</h2><p>{action in productActionConfig ? productActionConfig[action as keyof typeof productActionConfig][1] : skuActionConfig[action as keyof typeof skuActionConfig][1]}</p></div><button className="product-bulk-edit-close" type="button" aria-label="ปิด" disabled={pending} onClick={() => setAction(null)}>×</button></header><div className="product-bulk-edit-body"><div className="product-bulk-edit-scope"><strong>{selectedProducts.length} สินค้า</strong><span>รวม {selectedSkuCount} SKU</span></div><form ref={formRef} id="product-bulk-edit-form" onSubmit={submit} onInput={() => setPreviewVersion((value) => value + 1)}>{loading ? <div className="product-bulk-loading">กำลังโหลด SKU ทั้งหมด…</div> : action in productActionConfig ? productBody() : skuBody()}{error ? <div className="product-bulk-edit-error" role="alert">{error}</div> : null}</form></div><footer><button className="button product-grid-button-secondary" type="button" disabled={pending} onClick={() => setAction(null)}>ยกเลิก</button><button className="button product-grid-button-primary" type="submit" form="product-bulk-edit-form" disabled={pending || loading}>{pending ? 'กำลังบันทึก…' : 'นำไปใช้กับรายการที่เลือก'}</button></footer></section></div> : null}{masterTooltip ? <div id="product-bulk-master-tooltip" className="product-bulk-master-tooltip" role="tooltip" style={{ left: masterTooltip.left, top: masterTooltip.top }}>{masterTooltip.text}</div> : null}</>
}

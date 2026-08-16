'use client'

import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useEffect, useRef, useState, useTransition, type FormEvent } from 'react'
import { executeFoundationCommandAction } from '@/app/actions/foundation'
import { OperationsDetailSheet, OperationsEmptyState, OperationsStatusBadge } from '@/app/components/operations-ui'
import type { InventoryBalanceReadModel, LocationReadModel, SkuReadModel, StockMovementReadModel, WarehouseReadModel } from '@/lib/foundation/repositories'

type ViewMode = 'warehouses' | 'balances' | 'ledger'
type DialogMode = 'create-warehouse' | 'edit-warehouse' | 'create-location' | 'receive' | 'adjust' | 'transfer' | null
type Branch = { id: string; code: string; name: string; status: string }
type Props = {
  organizationId: string; view: ViewMode; search: string; status: string; movement: string;
  branchId: string; warehouseId: string; locationId: string; skuId: string; initialDialog: 'adjust' | null;
  warehouses: WarehouseReadModel[]; balances: InventoryBalanceReadModel[]; movements: StockMovementReadModel[];
  warehouseOptions: WarehouseReadModel[]; locations: LocationReadModel[]; skuOptions: SkuReadModel[]; branches: Branch[];
  selectedWarehouse: WarehouseReadModel | null; nextCursor: string | null;
  canManageWarehouse: boolean; canReceive: boolean; canAdjust: boolean; canTransfer: boolean;
}

const statusLabels: Record<string, string> = { active: 'ใช้งาน', inactive: 'พักใช้งาน', archived: 'เก็บถาวร' }
const movementLabels: Record<string, string> = { receive: 'รับเข้า', adjustment_in: 'ปรับเพิ่ม', adjustment_out: 'ปรับลด', transfer_in: 'โอนเข้า', transfer_out: 'โอนออก' }
const errorLabels: Record<string, string> = {
  authentication_required: 'Session หมดอายุ กรุณาเข้าสู่ระบบใหม่', tenant_access_denied: 'ไม่มีสิทธิ์เข้าถึง Organization',
  permission_denied: 'ไม่มีสิทธิ์ดำเนินการนี้', branch_scope_denied: 'สาขาต้นทางหรือปลายทางอยู่นอกขอบเขตที่ได้รับมอบหมาย',
  validation_failed: 'ข้อมูลไม่ครบหรือรูปแบบไม่ถูกต้อง', entity_not_found: 'ไม่พบรายการ หรือข้อมูลถูกเปลี่ยนไปแล้ว',
  entity_inactive: 'SKU, Warehouse, Location หรือ Branch ต้องอยู่ในสถานะใช้งาน', version_conflict: 'ข้อมูลถูกแก้ไขแล้ว กรุณารีเฟรช',
  duplicate_warehouse_code: 'Warehouse Code นี้ถูกใช้แล้ว', duplicate_location_code: 'Location Code นี้ถูกใช้แล้วในคลัง',
  insufficient_stock: 'ยอดคงเหลือต้นทางไม่เพียงพอ ระบบไม่อนุญาตให้ Stock ติดลบ',
  command_payload_conflict: 'Command ID ซ้ำกับข้อมูลคนละชุด', invalid_state_transition: 'สถานะหรือยอด Stock ไม่อนุญาตให้ดำเนินการนี้',
  foundation_command_failed: 'ระบบไม่สามารถบันทึกคำสั่งได้ กรุณาลองใหม่',
}

function tone(status: string) { return status === 'active' ? 'success' as const : status === 'inactive' ? 'warning' as const : 'neutral' as const }
function stockTone(quantity: number) { return quantity === 0 ? 'danger' as const : quantity <= 5 ? 'warning' as const : 'success' as const }
function formatDate(value: string) { return new Intl.DateTimeFormat('th-TH', { dateStyle: 'medium', timeStyle: 'short', timeZone: 'Asia/Bangkok' }).format(new Date(value)) }
function quantity(value: number, unit: string) { return `${value.toLocaleString('th-TH', { maximumFractionDigits: 6 })} ${unit}` }
function buildHref(organizationId: string, values: Record<string, string | null | undefined>) {
  const params = new URLSearchParams()
  for (const [key, value] of Object.entries(values)) if (value) params.set(key, value)
  const query = params.toString()
  return `/organizations/${organizationId}/inventory${query ? `?${query}` : ''}`
}

export function InventoryWorkspace(props: Props) {
  const { organizationId, view, search, status, movement, branchId, warehouseId, locationId, skuId, initialDialog, warehouses, balances, movements, warehouseOptions, locations, skuOptions, branches, selectedWarehouse, nextCursor, canManageWarehouse, canReceive, canAdjust, canTransfer } = props
  const router = useRouter()
  const firstField = useRef<HTMLInputElement | HTMLSelectElement>(null)
  const [dialog, setDialog] = useState<DialogMode>(initialDialog)
  const [feedback, setFeedback] = useState<{ tone: 'success' | 'danger'; text: string } | null>(null)
  const [isPending, startTransition] = useTransition()
  const rows = view === 'warehouses' ? warehouses : view === 'balances' ? balances : movements
  const locationMap = new Map(locations.map((item) => [item.id, item]))
  const skuMap = new Map(skuOptions.map((item) => [item.id, item]))
  const warehouseMap = new Map(warehouseOptions.map((item) => [item.id, item]))
  const selectedLocations = selectedWarehouse ? locations.filter((item) => item.warehouseId === selectedWarehouse.id) : []
  const activeLocations = locations.filter((item) => item.status === 'active' && warehouseMap.get(item.warehouseId)?.status === 'active')

  useEffect(() => {
    if (!dialog) return
    if (dialog === 'adjust' && skuId && firstField.current instanceof HTMLSelectElement) {
      firstField.current.value = skuId
    }
    firstField.current?.focus()
    const close = (event: KeyboardEvent) => { if (event.key === 'Escape' && !isPending) setDialog(null) }
    window.addEventListener('keydown', close)
    return () => window.removeEventListener('keydown', close)
  }, [dialog, isPending, skuId])
  useEffect(() => {
    if (feedback?.tone !== 'success') return
    const timer = window.setTimeout(() => setFeedback(null), 4000)
    return () => window.clearTimeout(timer)
  }, [feedback])

  function runCommand(input: Record<string, unknown>) {
    setFeedback(null)
    startTransition(async () => {
      const result = await executeFoundationCommandAction({ ...input, commandId: crypto.randomUUID(), organizationId })
      if (!result.ok) { setFeedback({ tone: 'danger', text: errorLabels[result.error] ?? 'ไม่สามารถดำเนินการได้' }); return }
      setDialog(null)
      setFeedback({ tone: 'success', text: 'บันทึกคำสั่งและ Audit เรียบร้อยแล้ว' })
      router.refresh()
    })
  }

  function submitDialog(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const data = new FormData(event.currentTarget)
    if (dialog === 'create-warehouse') runCommand({ kind: 'entity', commandType: 'warehouse.create', payload: { branch_id: String(data.get('branchId')), code: String(data.get('code')).trim().toUpperCase(), name: String(data.get('name')).trim() } })
    if (dialog === 'edit-warehouse' && selectedWarehouse) runCommand({ kind: 'entity', commandType: 'warehouse.update', payload: { warehouse_id: selectedWarehouse.id, expected_version: selectedWarehouse.version, name: String(data.get('name')).trim() } })
    if (dialog === 'create-location') runCommand({ kind: 'entity', commandType: 'location.create', payload: { warehouse_id: String(data.get('warehouseId')), code: String(data.get('code')).trim().toUpperCase(), name: String(data.get('name')).trim() } })
    if (dialog === 'receive') runCommand({ kind: 'inventory', commandType: 'receive', skuId: String(data.get('skuId')), sourceLocationId: null, destinationLocationId: String(data.get('destinationLocationId')), quantity: Number(data.get('quantity')), reasonCode: 'manual_receive', reasonNote: String(data.get('reasonNote')).trim() || null })
    if (dialog === 'adjust') {
      const direction = String(data.get('direction'))
      const selectedLocation = String(data.get('locationId'))
      runCommand({ kind: 'inventory', commandType: direction, skuId: String(data.get('skuId')), sourceLocationId: direction === 'adjustment_out' ? selectedLocation : null, destinationLocationId: direction === 'adjustment_in' ? selectedLocation : null, quantity: Number(data.get('quantity')), reasonCode: 'stock_count', reasonNote: String(data.get('reasonNote')).trim() })
    }
    if (dialog === 'transfer') runCommand({ kind: 'inventory', commandType: 'transfer', skuId: String(data.get('skuId')), sourceLocationId: String(data.get('sourceLocationId')), destinationLocationId: String(data.get('destinationLocationId')), quantity: Number(data.get('quantity')), reasonCode: 'internal_transfer', reasonNote: String(data.get('reasonNote')).trim() || null })
  }

  function lifecycle(type: 'warehouse.inactivate' | 'warehouse.archive') {
    if (!selectedWarehouse) return
    if (!window.confirm(type.endsWith('archive') ? 'ยืนยันเก็บ Warehouse ถาวร? ต้องมียอดคงเหลือเป็นศูนย์' : 'ยืนยันพักใช้งาน Warehouse นี้?')) return
    runCommand({ kind: 'entity', commandType: type, payload: { warehouse_id: selectedWarehouse.id, expected_version: selectedWarehouse.version } })
  }

  const preserved = { view, q: search, status, branch: branchId, warehouse: warehouseId, location: locationId, sku: skuId, movement }
  const closeDetail = buildHref(organizationId, preserved)
  return <>
    <div className="inventory-toolbar">
      <nav className="product-view-tabs" aria-label="เลือกมุมมอง Warehouse Stock และ Ledger">
        <Link className={view === 'warehouses' ? 'active' : ''} href={buildHref(organizationId, { view: 'warehouses' })}>Warehouse</Link>
        <Link className={view === 'balances' ? 'active' : ''} href={buildHref(organizationId, { view: 'balances' })}>ยอดคงเหลือ</Link>
        <Link className={view === 'ledger' ? 'active' : ''} href={buildHref(organizationId, { view: 'ledger' })}>Movement Ledger</Link>
      </nav>
      <div className="button-row">
        {canManageWarehouse ? <button className="button secondary" type="button" onClick={() => setDialog('create-warehouse')}>เพิ่ม Warehouse</button> : null}
        {canManageWarehouse ? <button className="button secondary" type="button" disabled={!warehouseOptions.some((item) => item.status === 'active')} onClick={() => setDialog('create-location')}>เพิ่ม Location</button> : null}
        {canReceive ? <button className="button" type="button" onClick={() => setDialog('receive')}>รับ Stock</button> : null}
        {canAdjust ? <button className="button secondary" type="button" onClick={() => setDialog('adjust')}>ปรับ Stock</button> : null}
        {canTransfer ? <button className="button secondary" type="button" onClick={() => setDialog('transfer')}>โอน Stock</button> : null}
      </div>
    </div>
    {feedback ? <div className={`product-feedback ${feedback.tone}`} role={feedback.tone === 'danger' ? 'alert' : 'status'}>{feedback.text}</div> : null}

    <form className={`operations-filter-bar inventory-filter-bar ${view}`} method="get" aria-label="กรอง Warehouse และ Stock">
      <input type="hidden" name="view" value={view} />
      {view === 'warehouses' ? <><label className="sr-only" htmlFor="inventory-search">ค้นหา Warehouse</label><input id="inventory-search" name="q" type="search" defaultValue={search} maxLength={160} placeholder="ค้นหา Code หรือชื่อ Warehouse" /><label className="sr-only" htmlFor="inventory-status">สถานะ</label><select id="inventory-status" name="status" defaultValue={status}><option value="">ทุกสถานะ</option><option value="active">ใช้งาน</option><option value="inactive">พักใช้งาน</option><option value="archived">เก็บถาวร</option></select></> : null}
      <label className="sr-only" htmlFor="inventory-branch">สาขา</label><select id="inventory-branch" name="branch" defaultValue={branchId}><option value="">ทุกสาขา</option>{branches.map((item) => <option key={item.id} value={item.id}>{item.code} · {item.name}</option>)}</select>
      {view !== 'warehouses' ? <><label className="sr-only" htmlFor="inventory-warehouse">Warehouse</label><select id="inventory-warehouse" name="warehouse" defaultValue={warehouseId}><option value="">ทุก Warehouse</option>{warehouseOptions.map((item) => <option key={item.id} value={item.id}>{item.code} · {item.name}</option>)}</select><label className="sr-only" htmlFor="inventory-location">Location</label><select id="inventory-location" name="location" defaultValue={locationId}><option value="">ทุก Location</option>{locations.filter((item) => !warehouseId || item.warehouseId === warehouseId).map((item) => <option key={item.id} value={item.id}>{item.code} · {item.name}</option>)}</select><label className="sr-only" htmlFor="inventory-sku">SKU</label><select id="inventory-sku" name="sku" defaultValue={skuId}><option value="">ทุก SKU</option>{skuOptions.map((item) => <option key={item.id} value={item.id}>{item.skuCode} · {item.name}</option>)}</select></> : null}
      {view === 'ledger' ? <><label className="sr-only" htmlFor="inventory-movement">ประเภท Movement</label><select id="inventory-movement" name="movement" defaultValue={movement}><option value="">ทุก Movement</option>{Object.entries(movementLabels).map(([value, label]) => <option value={value} key={value}>{label}</option>)}</select></> : null}
      <button className="button" type="submit">กรอง</button><Link className="button secondary" href={buildHref(organizationId, { view })}>ล้าง</Link>
    </form>

    {!rows.length ? <OperationsEmptyState icon="⌁" title="ยังไม่มีข้อมูลตามมุมมองนี้" description="ลองเปลี่ยนตัวกรอง หรือเริ่มสร้าง Warehouse และรับ Stock" /> : <>
      <div className="inventory-table-wrap"><table className="inventory-data-table"><thead><tr>{view === 'warehouses' ? <><th>Warehouse</th><th>สาขา</th><th>สถานะ</th><th>แก้ไขล่าสุด</th><th><span className="sr-only">รายละเอียด</span></th></> : view === 'balances' ? <><th>SKU</th><th>Warehouse / Location</th><th>On hand</th><th>Allocated</th><th>Available</th><th>สถานะ Stock</th></> : <><th>เวลา</th><th>Movement</th><th>SKU</th><th>Location</th><th>จำนวน</th><th>เหตุผล / Actor</th></>}</tr></thead><tbody>
        {view === 'warehouses' ? warehouses.map((item) => <tr key={item.id}><td><strong className="product-code">{item.code}</strong><small>{item.name}</small></td><td>{item.branchName}</td><td><OperationsStatusBadge tone={tone(item.status)}>{statusLabels[item.status]}</OperationsStatusBadge></td><td>{formatDate(item.updatedAt)}</td><td><Link className="product-row-link" href={buildHref(organizationId, { ...preserved, detail: item.id })}>ดูรายละเอียด</Link></td></tr>) : null}
        {view === 'balances' ? balances.map((item) => <tr key={`${item.skuId}-${item.locationId}`}><td><strong className="product-code">{item.skuCode}</strong><small>{item.skuName}</small></td><td><strong>{item.warehouseName}</strong><small>{item.locationName}</small></td><td>{quantity(item.onHand, item.baseUnitCode)}</td><td>{quantity(item.allocated, item.baseUnitCode)}</td><td><strong>{quantity(item.available, item.baseUnitCode)}</strong></td><td><OperationsStatusBadge tone={stockTone(item.available)}>{item.available === 0 ? 'หมด' : item.available <= 5 ? 'ใกล้หมด' : 'พร้อมขาย'}</OperationsStatusBadge></td></tr>) : null}
        {view === 'ledger' ? movements.map((item) => { const location = locationMap.get(item.locationId); const sku = skuMap.get(item.skuId); return <tr key={item.id}><td>{formatDate(item.occurredAt)}</td><td><OperationsStatusBadge tone={item.quantityDelta > 0 ? 'success' : 'warning'}>{movementLabels[item.movementType] ?? item.movementType}</OperationsStatusBadge></td><td><strong className="product-code">{sku?.skuCode ?? item.skuId.slice(0, 8)}</strong><small>{sku?.name ?? 'SKU'}</small></td><td>{location ? `${location.warehouseName} · ${location.name}` : item.locationId.slice(0, 8)}</td><td className={item.quantityDelta > 0 ? 'stock-positive' : 'stock-negative'}>{item.quantityDelta > 0 ? '+' : ''}{quantity(item.quantityDelta, item.baseUnitCode)}</td><td><strong>{item.reasonCode}</strong><small>{item.reasonNote || `Actor ${item.actorUserId.slice(0, 8)}`}</small></td></tr> }) : null}
      </tbody></table></div>
      <div className="inventory-mobile-list" role="list">{view === 'warehouses' ? warehouses.map((item) => <article role="listitem" key={item.id}><div><strong>{item.code} · {item.name}</strong><OperationsStatusBadge tone={tone(item.status)}>{statusLabels[item.status]}</OperationsStatusBadge></div><p>{item.branchName}</p><Link className="product-row-link" href={buildHref(organizationId, { ...preserved, detail: item.id })}>ดูรายละเอียด</Link></article>) : view === 'balances' ? balances.map((item) => <article role="listitem" key={`${item.skuId}-${item.locationId}`}><div><strong>{item.skuCode}</strong><OperationsStatusBadge tone={stockTone(item.available)}>{item.available === 0 ? 'หมด' : item.available <= 5 ? 'ใกล้หมด' : 'พร้อมขาย'}</OperationsStatusBadge></div><p>{item.warehouseName} · {item.locationName}</p><strong>{quantity(item.available, item.baseUnitCode)} available</strong></article>) : movements.map((item) => <article role="listitem" key={item.id}><div><strong>{movementLabels[item.movementType]}</strong><span className={item.quantityDelta > 0 ? 'stock-positive' : 'stock-negative'}>{item.quantityDelta > 0 ? '+' : ''}{quantity(item.quantityDelta, item.baseUnitCode)}</span></div><p>{skuMap.get(item.skuId)?.skuCode ?? item.skuId.slice(0, 8)} · {locationMap.get(item.locationId)?.name ?? item.locationId.slice(0, 8)}</p><small>{formatDate(item.occurredAt)} · {item.reasonCode}</small></article>)}</div>
    </>}
    {nextCursor ? <nav className="product-pagination" aria-label="หน้าถัดไป"><Link className="button secondary" href={buildHref(organizationId, { ...preserved, cursor: nextCursor })}>ดูรายการถัดไป</Link></nav> : null}

    {selectedWarehouse ? <><Link className="operations-sheet-backdrop" href={closeDetail} aria-label="ปิดรายละเอียด" /><OperationsDetailSheet title={`${selectedWarehouse.code} · ${selectedWarehouse.name}`} description={`Warehouse ใน ${selectedWarehouse.branchName}`} closeAction={<Link className="button secondary compact" href={closeDetail}>ปิด</Link>}><div className="product-detail-stack"><div className="product-detail-status"><OperationsStatusBadge tone={tone(selectedWarehouse.status)}>{statusLabels[selectedWarehouse.status]}</OperationsStatusBadge><span>Version {selectedWarehouse.version}</span></div><dl className="product-detail-list"><div><dt>สาขา</dt><dd>{selectedWarehouse.branchName}</dd></div><div><dt>Locations</dt><dd>{selectedLocations.length} ตำแหน่ง</dd></div><div><dt>แก้ไขล่าสุด</dt><dd>{formatDate(selectedWarehouse.updatedAt)}</dd></div></dl><div className="inventory-location-list">{selectedLocations.map((item) => <div key={item.id}><span><strong>{item.code} · {item.name}</strong><small>{item.isDefault ? 'Default Location' : 'Location'}</small></span><OperationsStatusBadge tone={tone(item.status)}>{statusLabels[item.status]}</OperationsStatusBadge></div>)}</div>{canManageWarehouse && selectedWarehouse.status !== 'archived' ? <div className="button-row"><button className="button secondary" type="button" onClick={() => setDialog('edit-warehouse')}>แก้ไข</button>{selectedWarehouse.status === 'active' ? <button className="button secondary" type="button" disabled={isPending} onClick={() => lifecycle('warehouse.inactivate')}>พักใช้งาน</button> : null}<button className="button danger" type="button" disabled={isPending} onClick={() => lifecycle('warehouse.archive')}>เก็บถาวร</button></div> : null}</div></OperationsDetailSheet></> : null}

    {dialog ? <div className="product-modal-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget && !isPending) setDialog(null) }}><section className="product-editor-dialog" role="dialog" aria-modal="true" aria-labelledby="inventory-dialog-title"><header><div><div className="eyebrow">Warehouse/Inventory command</div><h2 id="inventory-dialog-title">{{ 'create-warehouse': 'เพิ่ม Warehouse', 'edit-warehouse': 'แก้ไข Warehouse', 'create-location': 'เพิ่ม Location', receive: 'รับ Stock เข้า', adjust: 'ปรับยอด Stock', transfer: 'โอน Stock' }[dialog]}</h2></div><button className="button secondary compact" type="button" onClick={() => setDialog(null)} disabled={isPending}>ปิด</button></header><form onSubmit={submitDialog}>
      {dialog === 'create-warehouse' ? <><label className="field-stack">สาขา<select ref={firstField as React.RefObject<HTMLSelectElement>} name="branchId" required defaultValue=""><option value="" disabled>เลือกสาขา</option>{branches.map((item) => <option key={item.id} value={item.id}>{item.code} · {item.name}</option>)}</select></label><div className="form-grid-two"><label className="field-stack">Warehouse Code<input name="code" required maxLength={40} placeholder="MAIN" /></label><label className="field-stack">ชื่อ Warehouse<input name="name" required maxLength={160} /></label></div></> : null}
      {dialog === 'edit-warehouse' ? <label className="field-stack">ชื่อ Warehouse<input ref={firstField as React.RefObject<HTMLInputElement>} name="name" required maxLength={160} defaultValue={selectedWarehouse?.name} /></label> : null}
      {dialog === 'create-location' ? <><label className="field-stack">Warehouse<select ref={firstField as React.RefObject<HTMLSelectElement>} name="warehouseId" required defaultValue={selectedWarehouse?.status === 'active' ? selectedWarehouse.id : ''}><option value="" disabled>เลือก Warehouse</option>{warehouseOptions.filter((item) => item.status === 'active').map((item) => <option key={item.id} value={item.id}>{item.code} · {item.name}</option>)}</select></label><div className="form-grid-two"><label className="field-stack">Location Code<input name="code" required maxLength={40} placeholder="A-01" /></label><label className="field-stack">ชื่อ Location<input name="name" required maxLength={160} /></label></div></> : null}
      {dialog === 'receive' || dialog === 'adjust' || dialog === 'transfer' ? <><label className="field-stack">SKU<select ref={firstField as React.RefObject<HTMLSelectElement>} name="skuId" required defaultValue=""><option value="" disabled>เลือก SKU</option>{skuOptions.map((item) => <option key={item.id} value={item.id}>{item.skuCode} · {item.name}</option>)}</select></label>{dialog === 'receive' ? <label className="field-stack">Location ปลายทาง<select name="destinationLocationId" required defaultValue=""><option value="" disabled>เลือก Location</option>{activeLocations.map((item) => <option key={item.id} value={item.id}>{item.warehouseName} · {item.code} · {item.name}</option>)}</select></label> : null}{dialog === 'adjust' ? <><div className="form-grid-two"><label className="field-stack">ทิศทาง<select name="direction" defaultValue="adjustment_in"><option value="adjustment_in">ปรับเพิ่ม</option><option value="adjustment_out">ปรับลด</option></select></label><label className="field-stack">Location<select name="locationId" required defaultValue=""><option value="" disabled>เลือก Location</option>{activeLocations.map((item) => <option key={item.id} value={item.id}>{item.warehouseName} · {item.code}</option>)}</select></label></div></> : null}{dialog === 'transfer' ? <div className="form-grid-two"><label className="field-stack">ต้นทาง<select name="sourceLocationId" required defaultValue=""><option value="" disabled>เลือกต้นทาง</option>{activeLocations.map((item) => <option key={item.id} value={item.id}>{item.warehouseName} · {item.code}</option>)}</select></label><label className="field-stack">ปลายทาง<select name="destinationLocationId" required defaultValue=""><option value="" disabled>เลือกปลายทาง</option>{activeLocations.map((item) => <option key={item.id} value={item.id}>{item.warehouseName} · {item.code}</option>)}</select></label></div> : null}<label className="field-stack">จำนวน<input name="quantity" type="number" required min="0.000001" step="0.000001" inputMode="decimal" /></label><label className="field-stack">เหตุผล {dialog === 'adjust' ? '(บังคับ)' : '(ถ้ามี)'}<textarea name="reasonNote" required={dialog === 'adjust'} minLength={dialog === 'adjust' ? 3 : undefined} maxLength={500} /></label></> : null}
      {feedback?.tone === 'danger' ? <div className="product-feedback danger" role="alert">{feedback.text}</div> : null}<footer><button className="button secondary" type="button" onClick={() => setDialog(null)} disabled={isPending}>ยกเลิก</button><button className="button" type="submit" disabled={isPending || ((dialog === 'receive' || dialog === 'adjust' || dialog === 'transfer') && (!skuOptions.length || !activeLocations.length))}>{isPending ? 'กำลังบันทึก…' : 'ยืนยันคำสั่ง'}</button></footer>
    </form></section></div> : null}
  </>
}

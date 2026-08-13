'use client'

import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useEffect, useRef, useState, useTransition, type FormEvent } from 'react'
import { executeFoundationCommandAction } from '@/app/actions/foundation'
import {
  OperationsDetailSheet,
  OperationsEmptyState,
  OperationsStatusBadge,
} from '@/app/components/operations-ui'
import type { ProductReadModel, SkuReadModel } from '@/lib/foundation/repositories'

type ViewMode = 'products' | 'skus'
type EditorMode = 'create-product' | 'create-sku' | 'edit-product' | 'edit-sku' | null

type Props = {
  organizationId: string
  view: ViewMode
  search: string
  status: string
  products: ProductReadModel[]
  skus: SkuReadModel[]
  productOptions: ProductReadModel[]
  selectedProduct: ProductReadModel | null
  selectedSku: SkuReadModel | null
  nextCursor: string | null
  canManage: boolean
}

const statusLabels: Record<string, string> = {
  draft: 'ฉบับร่าง',
  active: 'ใช้งาน',
  archived: 'เก็บถาวร',
}

const errorLabels: Record<string, string> = {
  authentication_required: 'Session หมดอายุ กรุณาเข้าสู่ระบบใหม่',
  tenant_access_denied: 'บัญชีนี้ไม่มีสิทธิ์เข้าถึง Organization',
  permission_denied: 'ไม่มีสิทธิ์จัดการ Product/SKU',
  branch_scope_denied: 'รายการนี้อยู่นอกขอบเขตสาขาที่ได้รับมอบหมาย',
  validation_failed: 'ข้อมูลไม่ครบหรือรูปแบบไม่ถูกต้อง',
  entity_not_found: 'ไม่พบรายการ หรือรายการถูกเปลี่ยนไปแล้ว',
  entity_inactive: 'สถานะปัจจุบันไม่อนุญาตให้ดำเนินการนี้',
  version_conflict: 'ข้อมูลถูกแก้ไขโดยผู้ใช้อื่น กรุณารีเฟรชแล้วลองใหม่',
  command_payload_conflict: 'รหัสคำสั่งซ้ำกับข้อมูลคนละชุด',
  duplicate_sku_code: 'SKU Code นี้ถูกใช้แล้วใน Organization',
  duplicate_barcode: 'Barcode นี้ถูกใช้แล้วใน Organization',
  invalid_state_transition: 'ไม่สามารถเปลี่ยนไปยังสถานะที่เลือกได้',
  foundation_command_failed: 'ระบบไม่สามารถบันทึกรายการได้ กรุณาลองใหม่',
}

function statusTone(status: string) {
  if (status === 'active') return 'success' as const
  if (status === 'draft') return 'info' as const
  return 'neutral' as const
}

function formatUpdatedAt(value: string) {
  return new Intl.DateTimeFormat('th-TH', {
    dateStyle: 'medium',
    timeStyle: 'short',
    timeZone: 'Asia/Bangkok',
  }).format(new Date(value))
}

function buildHref(
  organizationId: string,
  values: Record<string, string | null | undefined>,
) {
  const params = new URLSearchParams()
  for (const [key, value] of Object.entries(values)) {
    if (value) params.set(key, value)
  }
  const query = params.toString()
  return `/organizations/${organizationId}/products${query ? `?${query}` : ''}`
}

export function ProductSkuWorkspace({
  organizationId,
  view,
  search,
  status,
  products,
  skus,
  productOptions,
  selectedProduct,
  selectedSku,
  nextCursor,
  canManage,
}: Props) {
  const router = useRouter()
  const firstFieldRef = useRef<HTMLInputElement>(null)
  const [editorMode, setEditorMode] = useState<EditorMode>(null)
  const [feedback, setFeedback] = useState<{ tone: 'success' | 'danger'; text: string } | null>(null)
  const [isPending, startTransition] = useTransition()
  const selectedEntity = selectedProduct ?? selectedSku
  const rows = view === 'products' ? products : skus

  useEffect(() => {
    if (!editorMode) return
    firstFieldRef.current?.focus()
    function closeOnEscape(event: KeyboardEvent) {
      if (event.key === 'Escape' && !isPending) setEditorMode(null)
    }
    window.addEventListener('keydown', closeOnEscape)
    return () => window.removeEventListener('keydown', closeOnEscape)
  }, [editorMode, isPending])

  useEffect(() => {
    if (feedback?.tone !== 'success') return
    const timeout = window.setTimeout(() => setFeedback(null), 4000)
    return () => window.clearTimeout(timeout)
  }, [feedback])

  function openEditor(mode: Exclude<EditorMode, null>) {
    setFeedback(null)
    setEditorMode(mode)
  }

  function runCommand(commandType: string, payload: Record<string, unknown>) {
    setFeedback(null)
    startTransition(async () => {
      const result = await executeFoundationCommandAction({
        kind: 'entity',
        commandId: crypto.randomUUID(),
        organizationId,
        commandType,
        payload,
      })
      if (!result.ok) {
        setFeedback({ tone: 'danger', text: errorLabels[result.error] ?? 'ไม่สามารถดำเนินการได้' })
        return
      }
      setFeedback({ tone: 'success', text: 'บันทึกข้อมูลเรียบร้อยแล้ว' })
      setEditorMode(null)
      router.refresh()
    })
  }

  function submitEditor(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const data = new FormData(event.currentTarget)
    const name = String(data.get('name') ?? '').trim()

    if (editorMode === 'create-product') {
      runCommand('product.create', {
        name,
        description: String(data.get('description') ?? '').trim(),
      })
    } else if (editorMode === 'edit-product' && selectedProduct) {
      runCommand('product.update', {
        product_id: selectedProduct.id,
        expected_version: selectedProduct.version,
        name,
        description: String(data.get('description') ?? '').trim(),
      })
    } else if (editorMode === 'create-sku') {
      runCommand('sku.create', {
        product_id: String(data.get('productId') ?? ''),
        sku_code: String(data.get('skuCode') ?? '').trim(),
        name,
        barcode: String(data.get('barcode') ?? '').trim(),
        sales_code: String(data.get('salesCode') ?? '').trim(),
        base_unit_code: String(data.get('baseUnitCode') ?? '').trim(),
        status: String(data.get('status') ?? 'draft'),
      })
    } else if (editorMode === 'edit-sku' && selectedSku) {
      runCommand('sku.update', {
        sku_id: selectedSku.id,
        expected_version: selectedSku.version,
        name,
        barcode: String(data.get('barcode') ?? '').trim(),
        sales_code: String(data.get('salesCode') ?? '').trim(),
      })
    }
  }

  function runLifecycle(commandType: string, idKey: string, id: string, version: number) {
    const isArchive = commandType.endsWith('.archive')
    if (isArchive && !window.confirm('ยืนยันการเก็บรายการนี้ถาวร? รายการที่มีประวัติจะไม่ถูกลบ')) return
    runCommand(commandType, { [idKey]: id, expected_version: version })
  }

  const closeDetailHref = buildHref(organizationId, { view, q: search, status })
  const nextHref = buildHref(organizationId, { view, q: search, status, cursor: nextCursor })

  return <>
    <div className="product-workspace-toolbar">
      <nav className="product-view-tabs" aria-label="เลือกมุมมอง Product หรือ SKU">
        <Link className={view === 'products' ? 'active' : ''} href={buildHref(organizationId, { view: 'products', q: search, status })} aria-current={view === 'products' ? 'page' : undefined}>Products</Link>
        <Link className={view === 'skus' ? 'active' : ''} href={buildHref(organizationId, { view: 'skus', q: search, status })} aria-current={view === 'skus' ? 'page' : undefined}>SKUs</Link>
      </nav>
      {canManage ? <div className="button-row">
        <button className="button secondary" type="button" onClick={() => openEditor('create-product')}>เพิ่ม Product</button>
        <button className="button" type="button" onClick={() => openEditor('create-sku')} disabled={!productOptions.length}>เพิ่ม SKU</button>
      </div> : null}
    </div>

    {feedback ? <div className={`product-feedback ${feedback.tone}`} role="status">{feedback.text}</div> : null}

    <form className="operations-filter-bar product-filter-bar" method="get" aria-label="ค้นหาและกรอง Product SKU">
      <input type="hidden" name="view" value={view} />
      <label className="sr-only" htmlFor="product-search">ค้นหา</label>
      <input id="product-search" name="q" type="search" defaultValue={search} placeholder={view === 'products' ? 'ค้นหาชื่อ Product' : 'ค้นหา SKU, ชื่อ, Barcode หรือ Sales Code'} maxLength={160} />
      <label className="sr-only" htmlFor="product-status">สถานะ</label>
      <select id="product-status" name="status" defaultValue={status}>
        <option value="">ทุกสถานะ</option>
        <option value="draft">ฉบับร่าง</option>
        <option value="active">ใช้งาน</option>
        <option value="archived">เก็บถาวร</option>
      </select>
      <button className="button" type="submit">ค้นหา</button>
      <Link className="button secondary" href={buildHref(organizationId, { view })}>ล้างตัวกรอง</Link>
    </form>

    {!rows.length ? <OperationsEmptyState
      icon="＋"
      title={search || status ? 'ไม่พบรายการตามตัวกรอง' : view === 'products' ? 'ยังไม่มี Product' : 'ยังไม่มี SKU'}
      description={search || status ? 'ลองเปลี่ยนคำค้นหาหรือสถานะ' : canManage ? 'เริ่มเพิ่มข้อมูลด้วยปุ่มด้านบน' : 'ติดต่อผู้ดูแล Organization เพื่อเพิ่มข้อมูล'}
    /> : <>
      <div className="product-table-wrap">
        <table className="product-data-table">
          <thead><tr>{view === 'products' ? <>
            <th>Product</th><th>สถานะ</th><th>Version</th><th>แก้ไขล่าสุด</th><th><span className="sr-only">รายละเอียด</span></th>
          </> : <>
            <th>SKU</th><th>Product</th><th>รหัสขาย</th><th>สถานะ</th><th>แก้ไขล่าสุด</th><th><span className="sr-only">รายละเอียด</span></th>
          </>}</tr></thead>
          <tbody>{view === 'products' ? products.map((product) => <tr key={product.id}>
            <td><strong>{product.name}</strong><small>{product.description || 'ไม่มีคำอธิบาย'}</small></td>
            <td><OperationsStatusBadge tone={statusTone(product.status)}>{statusLabels[product.status] ?? product.status}</OperationsStatusBadge></td>
            <td className="product-code">v{product.version}</td>
            <td>{formatUpdatedAt(product.updatedAt)}</td>
            <td><Link className="product-row-link" href={buildHref(organizationId, { view, q: search, status, product: product.id })}>ดูรายละเอียด</Link></td>
          </tr>) : skus.map((sku) => <tr key={sku.id}>
            <td><strong className="product-code">{sku.skuCode}</strong><small>{sku.name}</small></td>
            <td>{sku.productName}</td>
            <td><span className="product-code">{sku.salesCode || '—'}</span><small>{sku.barcode || 'ไม่มี Barcode'}</small></td>
            <td><OperationsStatusBadge tone={statusTone(sku.status)}>{statusLabels[sku.status] ?? sku.status}</OperationsStatusBadge></td>
            <td>{formatUpdatedAt(sku.updatedAt)}</td>
            <td><Link className="product-row-link" href={buildHref(organizationId, { view, q: search, status, sku: sku.id })}>ดูรายละเอียด</Link></td>
          </tr>)}</tbody>
        </table>
      </div>

      <div className="product-mobile-list" role="list" aria-label={view === 'products' ? 'รายการ Product' : 'รายการ SKU'}>
        {view === 'products' ? products.map((product) => <article className="product-mobile-card" role="listitem" key={product.id}>
          <div><strong>{product.name}</strong><OperationsStatusBadge tone={statusTone(product.status)}>{statusLabels[product.status] ?? product.status}</OperationsStatusBadge></div>
          <p>{product.description || 'ไม่มีคำอธิบาย'}</p>
          <small>แก้ไข {formatUpdatedAt(product.updatedAt)} · v{product.version}</small>
          <Link className="product-row-link" href={buildHref(organizationId, { view, q: search, status, product: product.id })}>ดูรายละเอียด</Link>
        </article>) : skus.map((sku) => <article className="product-mobile-card" role="listitem" key={sku.id}>
          <div><strong className="product-code">{sku.skuCode}</strong><OperationsStatusBadge tone={statusTone(sku.status)}>{statusLabels[sku.status] ?? sku.status}</OperationsStatusBadge></div>
          <p>{sku.name} · {sku.productName}</p>
          <small>{sku.salesCode || 'ไม่มี Sales Code'} · {sku.barcode || 'ไม่มี Barcode'}</small>
          <Link className="product-row-link" href={buildHref(organizationId, { view, q: search, status, sku: sku.id })}>ดูรายละเอียด</Link>
        </article>)}
      </div>
    </>}

    {nextCursor ? <nav className="product-pagination" aria-label="หน้าถัดไป">
      <Link className="button secondary" href={nextHref}>ดูรายการถัดไป</Link>
    </nav> : null}

    {selectedEntity ? <>
      <Link className="operations-sheet-backdrop" href={closeDetailHref} aria-label="ปิดรายละเอียด" />
      <OperationsDetailSheet
        title={selectedProduct?.name ?? selectedSku?.name ?? 'รายละเอียด'}
        description={selectedProduct ? 'Product detail' : `SKU ${selectedSku?.skuCode ?? ''}`}
        closeAction={<Link className="button secondary compact" href={closeDetailHref} aria-label="ปิดรายละเอียด">ปิด</Link>}
      >
        <div className="product-detail-stack">
          <div className="product-detail-status"><OperationsStatusBadge tone={statusTone(selectedEntity.status)}>{statusLabels[selectedEntity.status] ?? selectedEntity.status}</OperationsStatusBadge><span>Version {selectedEntity.version}</span></div>
          {selectedProduct ? <>
            <dl className="product-detail-list"><div><dt>ชื่อ Product</dt><dd>{selectedProduct.name}</dd></div><div><dt>คำอธิบาย</dt><dd>{selectedProduct.description || '—'}</dd></div><div><dt>แก้ไขล่าสุด</dt><dd>{formatUpdatedAt(selectedProduct.updatedAt)}</dd></div></dl>
            {canManage && selectedProduct.status !== 'archived' ? <div className="button-row">
              <button className="button secondary" type="button" onClick={() => openEditor('edit-product')}>แก้ไข</button>
              {selectedProduct.status === 'draft' ? <button className="button" type="button" disabled={isPending} onClick={() => runLifecycle('product.activate', 'product_id', selectedProduct.id, selectedProduct.version)}>เปิดใช้งาน</button> : null}
              <button className="button danger" type="button" disabled={isPending} onClick={() => runLifecycle('product.archive', 'product_id', selectedProduct.id, selectedProduct.version)}>เก็บถาวร</button>
            </div> : null}
          </> : selectedSku ? <>
            <dl className="product-detail-list"><div><dt>SKU Code</dt><dd className="product-code">{selectedSku.skuCode}</dd></div><div><dt>Product</dt><dd>{selectedSku.productName}</dd></div><div><dt>Sales Code</dt><dd className="product-code">{selectedSku.salesCode || '—'}</dd></div><div><dt>Barcode</dt><dd className="product-code">{selectedSku.barcode || '—'}</dd></div><div><dt>Base Unit</dt><dd>{selectedSku.baseUnitCode}</dd></div><div><dt>แก้ไขล่าสุด</dt><dd>{formatUpdatedAt(selectedSku.updatedAt)}</dd></div></dl>
            {canManage && selectedSku.status !== 'archived' ? <div className="button-row">
              <button className="button secondary" type="button" onClick={() => openEditor('edit-sku')}>แก้ไข</button>
              {selectedSku.status === 'draft' ? <button className="button" type="button" disabled={isPending} onClick={() => runLifecycle('sku.activate', 'sku_id', selectedSku.id, selectedSku.version)}>เปิดใช้งาน</button> : null}
              <button className="button danger" type="button" disabled={isPending} onClick={() => runLifecycle('sku.archive', 'sku_id', selectedSku.id, selectedSku.version)}>เก็บถาวร</button>
            </div> : null}
          </> : null}
        </div>
      </OperationsDetailSheet>
    </> : null}

    {editorMode ? <div className="product-modal-backdrop" role="presentation" onMouseDown={(event) => {
      if (event.target === event.currentTarget && !isPending) setEditorMode(null)
    }}>
      <section className="product-editor-dialog" role="dialog" aria-modal="true" aria-labelledby="product-editor-title">
        <header><div><div className="eyebrow">Product/SKU command</div><h2 id="product-editor-title">{editorMode === 'create-product' ? 'เพิ่ม Product' : editorMode === 'create-sku' ? 'เพิ่ม SKU' : editorMode === 'edit-product' ? 'แก้ไข Product' : 'แก้ไข SKU'}</h2></div><button className="button secondary compact" type="button" disabled={isPending} onClick={() => setEditorMode(null)}>ปิด</button></header>
        <form onSubmit={submitEditor}>
          {(editorMode === 'create-sku') ? <label className="field-stack">Product<select name="productId" required defaultValue={selectedProduct?.id ?? ''}><option value="" disabled>เลือก Product</option>{productOptions.filter((product) => product.status !== 'archived').map((product) => <option key={product.id} value={product.id}>{product.name}</option>)}</select></label> : null}
          {(editorMode === 'create-sku') ? <label className="field-stack">SKU Code<input ref={firstFieldRef} name="skuCode" required maxLength={80} autoComplete="off" placeholder="เช่น SHIRT-BLK-M" /></label> : null}
          <label className="field-stack">ชื่อ<input ref={editorMode === 'create-sku' ? undefined : firstFieldRef} name="name" required maxLength={160} defaultValue={selectedProduct?.name ?? selectedSku?.name ?? ''} /></label>
          {(editorMode === 'create-product' || editorMode === 'edit-product') ? <label className="field-stack">คำอธิบาย<textarea name="description" maxLength={2000} defaultValue={selectedProduct?.description ?? ''} /></label> : null}
          {(editorMode === 'create-sku' || editorMode === 'edit-sku') ? <div className="form-grid-two"><label className="field-stack">Sales Code<input name="salesCode" maxLength={80} defaultValue={selectedSku?.salesCode ?? ''} placeholder="รหัส CF/ขาย" /></label><label className="field-stack">Barcode<input name="barcode" maxLength={128} defaultValue={selectedSku?.barcode ?? ''} inputMode="numeric" /></label></div> : null}
          {editorMode === 'create-sku' ? <div className="form-grid-two"><label className="field-stack">Base Unit<input name="baseUnitCode" required maxLength={32} defaultValue="piece" /></label><label className="field-stack">สถานะ<select name="status" defaultValue="draft"><option value="draft">ฉบับร่าง</option><option value="active">ใช้งาน</option></select></label></div> : null}
          {feedback?.tone === 'danger' ? <div className="product-feedback danger" role="alert">{feedback.text}</div> : null}
          <footer><button className="button secondary" type="button" disabled={isPending} onClick={() => setEditorMode(null)}>ยกเลิก</button><button className="button" type="submit" disabled={isPending}>{isPending ? 'กำลังบันทึก…' : 'บันทึก'}</button></footer>
        </form>
      </section>
    </div> : null}
  </>
}

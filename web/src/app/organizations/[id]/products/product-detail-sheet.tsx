'use client'

import Link from 'next/link'
import { OperationsDetailSheet, OperationsStatusBadge } from '@/app/components/operations-ui'
import { skuCanArchive } from '@/lib/foundation/product-detail-read-model'
import type {
  ProductWorkspaceDetail,
  ProductWorkspaceSkuDetail,
} from '@/lib/foundation/repositories'

type SkuDetail = ProductWorkspaceSkuDetail & { productName: string }

const statusLabels: Record<string, string> = {
  draft: 'ฉบับร่าง', active: 'ใช้งาน', archived: 'เก็บถาวร',
}

function statusTone(status: string) {
  if (status === 'active') return 'success' as const
  if (status === 'draft') return 'info' as const
  return 'neutral' as const
}

function formatDate(value: string) {
  return new Intl.DateTimeFormat('th-TH', {
    dateStyle: 'medium', timeStyle: 'short', timeZone: 'Asia/Bangkok',
  }).format(new Date(value))
}

function stockLabel(sku: ProductWorkspaceSkuDetail) {
  if (sku.stock.mode === 'not-authorized') return 'ไม่มีสิทธิ์ดู Stock'
  if (sku.stock.mode === 'no-balance') return 'ยังไม่มียอด Stock'
  return `${sku.stock.onHand} ${sku.baseUnitCode} · ใช้ได้ ${sku.stock.available}`
}

export function ProductDetailSheet({
  organizationId,
  selectedProduct,
  selectedSku,
  closeHref,
  canManage,
  isPending,
  openEditor,
  requestLifecycle,
}: {
  organizationId: string
  selectedProduct: ProductWorkspaceDetail | null
  selectedSku: SkuDetail | null
  closeHref: string
  canManage: boolean
  isPending: boolean
  openEditor: (mode: 'edit-product' | 'edit-sku') => void
  requestLifecycle: (input: {
    commandType: 'product.activate' | 'product.archive' | 'sku.activate' | 'sku.archive'
    idKey: 'product_id' | 'sku_id'
    id: string
    version: number
    label: string
  }) => void
}) {
  const selectedEntity = selectedProduct ?? selectedSku
  if (!selectedEntity) return null
  return <>
    <Link className="operations-sheet-backdrop" href={closeHref} aria-label="ปิดรายละเอียด" />
    <OperationsDetailSheet
      title={selectedProduct?.name ?? selectedSku?.name ?? 'รายละเอียด'}
      description={selectedProduct ? 'Product detail · ภาพรวม SKU และ Stock' : `SKU ${selectedSku?.skuCode ?? ''}`}
      closeAction={<Link className="button secondary compact" href={closeHref} aria-label="ปิดรายละเอียด">ปิด</Link>}
    >
      <div className="product-detail-stack">
        <div className="product-detail-status">
          <OperationsStatusBadge tone={statusTone(selectedEntity.status)}>{statusLabels[selectedEntity.status] ?? selectedEntity.status}</OperationsStatusBadge>
          <span>Version {selectedEntity.version}</span>
        </div>

        {selectedProduct ? <>
          <section className="product-detail-section" aria-labelledby="product-detail-overview">
            <h3 id="product-detail-overview">ภาพรวม</h3>
            <dl className="product-detail-list">
              <div><dt>ชื่อ Product</dt><dd>{selectedProduct.name}</dd></div>
              <div><dt>คำอธิบาย</dt><dd>{selectedProduct.description || '—'}</dd></div>
              <div><dt>สร้างเมื่อ</dt><dd>{formatDate(selectedProduct.createdAt)}</dd></div>
              <div><dt>แก้ไขล่าสุด</dt><dd>{formatDate(selectedProduct.updatedAt)}</dd></div>
              <div><dt>ผู้สร้าง</dt><dd className="product-code">{selectedProduct.createdByUserId || '—'}</dd></div>
            </dl>
          </section>

          <section className="product-detail-section" aria-labelledby="product-detail-inventory">
            <h3 id="product-detail-inventory">Inventory summary</h3>
            {selectedProduct.stock.mode === 'single-unit' ? <div className="product-detail-metrics">
              <div><span>On hand</span><strong>{selectedProduct.stock.onHand}</strong></div>
              <div><span>Allocated</span><strong>{selectedProduct.stock.allocated}</strong></div>
              <div><span>Available</span><strong>{selectedProduct.stock.available}</strong></div>
            </div> : <p className="product-detail-note">{selectedProduct.stock.mode === 'mixed-units' ? 'Product นี้มีหลาย Base Unit จึงไม่รวมยอดข้ามหน่วย กรุณาดู Stock แยกตาม SKU' : selectedProduct.stock.mode === 'not-authorized' ? 'บัญชีนี้ไม่มีสิทธิ์ inventory.read' : 'ยังไม่มียอด Stock'}</p>}
            {selectedProduct.stock.branchCodes.length ? <p className="product-detail-note">สาขา: {selectedProduct.stock.branchCodes.join(', ')}</p> : null}
          </section>

          <section className="product-detail-section" aria-labelledby="product-detail-skus">
            <div className="product-detail-section-heading"><h3 id="product-detail-skus">SKU / Identifiers ({selectedProduct.skuCount})</h3>{selectedProduct.skuListCapped ? <span>แสดง 200 รายการแรก</span> : null}</div>
            {selectedProduct.skus.length ? <div className="product-detail-sku-list" role="list">
              {selectedProduct.skus.map((sku) => <article key={sku.id} role="listitem" className="product-detail-sku-row">
                <div><strong>{sku.name}</strong><span className="product-code">{sku.skuCode}</span></div>
                <dl><div><dt>รหัส CF</dt><dd className="product-code">{sku.salesCode || '—'}</dd></div><div><dt>Barcode</dt><dd className="product-code">{sku.barcode || '—'}</dd></div><div><dt>Base Unit</dt><dd>{sku.baseUnitCode}</dd></div><div><dt>Stock</dt><dd>{stockLabel(sku)}</dd></div></dl>
                <div><OperationsStatusBadge tone={statusTone(sku.status)}>{statusLabels[sku.status] ?? sku.status}</OperationsStatusBadge><Link href={`/organizations/${organizationId}/products?view=skus&sku=${sku.id}`}>ดู SKU</Link></div>
              </article>)}
            </div> : <p className="product-detail-note">Product นี้ยังไม่มี SKU</p>}
          </section>

          {canManage && selectedProduct.status !== 'archived' ? <div className="button-row product-detail-actions">
            <button className="button secondary" type="button" disabled={isPending} onClick={() => openEditor('edit-product')}>แก้ไข Product</button>
            {selectedProduct.status === 'draft' ? <button className="button" type="button" disabled={isPending} onClick={() => requestLifecycle({ commandType: 'product.activate', idKey: 'product_id', id: selectedProduct.id, version: selectedProduct.version, label: selectedProduct.name })}>เปิดใช้งาน</button> : null}
            <button className="button danger" type="button" disabled={isPending} onClick={() => requestLifecycle({ commandType: 'product.archive', idKey: 'product_id', id: selectedProduct.id, version: selectedProduct.version, label: selectedProduct.name })}>เก็บ Product ถาวร</button>
          </div> : selectedProduct.status === 'archived' ? <div className="product-detail-readonly" role="note">Product ที่เก็บถาวรแล้วเป็นข้อมูลอ่านอย่างเดียวและจะไม่ถูกลบ</div> : null}
        </> : selectedSku ? <>
          <section className="product-detail-section" aria-labelledby="sku-detail-identifiers">
            <h3 id="sku-detail-identifiers">Identifiers</h3>
            <dl className="product-detail-list">
              <div><dt>SKU Code</dt><dd className="product-code">{selectedSku.skuCode}</dd></div>
              <div><dt>Product</dt><dd>{selectedSku.productName}</dd></div>
              <div><dt>Sales Code</dt><dd className="product-code">{selectedSku.salesCode || '—'}</dd></div>
              <div><dt>Barcode</dt><dd className="product-code">{selectedSku.barcode || '—'}</dd></div>
              <div><dt>Base Unit</dt><dd>{selectedSku.baseUnitCode}</dd></div>
              <div><dt>แก้ไขล่าสุด</dt><dd>{formatDate(selectedSku.updatedAt)}</dd></div>
            </dl>
            <p className="product-detail-note">SKU Code และ Base Unit เปลี่ยนไม่ได้ ส่วน Sales Code เปลี่ยนไม่ได้หลังบันทึกครั้งแรก</p>
          </section>
          <section className="product-detail-section" aria-labelledby="sku-detail-stock">
            <h3 id="sku-detail-stock">Inventory summary</h3>
            <p>{stockLabel(selectedSku)}</p>
            {selectedSku.stock.branchCodes.length ? <p className="product-detail-note">สาขา: {selectedSku.stock.branchCodes.join(', ')}</p> : null}
          </section>
          {canManage && selectedSku.status !== 'archived' ? <div className="button-row product-detail-actions">
            <button className="button secondary" type="button" disabled={isPending} onClick={() => openEditor('edit-sku')}>แก้ไข SKU</button>
            {selectedSku.status === 'draft' ? <button className="button" type="button" disabled={isPending} onClick={() => requestLifecycle({ commandType: 'sku.activate', idKey: 'sku_id', id: selectedSku.id, version: selectedSku.version, label: selectedSku.skuCode })}>เปิดใช้งาน</button> : null}
            <button className="button danger" type="button" disabled={isPending || !skuCanArchive(selectedSku.stock)} title={!skuCanArchive(selectedSku.stock) ? selectedSku.stock.mode === 'not-authorized' ? 'ต้องมีสิทธิ์อ่าน Stock ก่อน' : 'ต้องย้ายหรือปรับ Stock ให้ On hand เป็น 0 ก่อน' : undefined} onClick={() => requestLifecycle({ commandType: 'sku.archive', idKey: 'sku_id', id: selectedSku.id, version: selectedSku.version, label: selectedSku.skuCode })}>เก็บ SKU ถาวร</button>
          </div> : selectedSku.status === 'archived' ? <div className="product-detail-readonly" role="note">SKU ที่เก็บถาวรแล้วเป็นข้อมูลอ่านอย่างเดียวและจะไม่ถูกลบ</div> : null}
          {!skuCanArchive(selectedSku.stock) ? <div className="product-detail-blocked" role="note">{selectedSku.stock.mode === 'not-authorized' ? 'ยังเก็บ SKU ถาวรไม่ได้ เพราะบัญชีนี้ไม่มีสิทธิ์ตรวจสอบ Stock' : `ยังเก็บ SKU ถาวรไม่ได้ เพราะ On hand คงเหลือ ${selectedSku.stock.onHand} ${selectedSku.baseUnitCode}`}</div> : null}
        </> : null}
      </div>
    </OperationsDetailSheet>
  </>
}

'use client'

import Image from 'next/image'
import Link from 'next/link'
import { OperationsDetailSheet, OperationsStatusBadge } from '@/app/components/operations-ui'
import { skuCanArchive } from '@/lib/foundation/product-detail-read-model'
import type {
  ProductWorkspaceDetail,
  ProductWorkspacePriceSummary,
  ProductWorkspaceSkuDetail,
  ProductWorkspaceValueSummary,
} from '@/lib/foundation/repositories'

type SkuDetail = ProductWorkspaceSkuDetail & { productName: string }

const statusLabels: Record<string, string> = {
  draft: 'ฉบับร่าง', active: 'ใช้งาน', archived: 'เก็บถาวร',
}

const structureLabels: Record<string, string> = {
  standard: 'สินค้าปกติ', variant: 'มีตัวเลือก / Variant', bundle: 'Bundle / Kit',
}

const quantityBehaviorLabels: Record<string, string> = {
  integer: 'จำนวนเต็ม', decimal: 'ทศนิยม', serialized: 'ติดตามรายชิ้น / Serial',
}

const taxCategoryLabels: Record<string, string> = {
  standard: 'ภาษีมาตรฐาน', exempt: 'ยกเว้นภาษี', zero_rated: 'อัตรา 0%', out_of_scope: 'นอกขอบเขตภาษี',
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

function formatNumber(value: number | null, maximumFractionDigits = 3) {
  if (value === null) return '—'
  return new Intl.NumberFormat('th-TH', { maximumFractionDigits }).format(value)
}

function formatMoney(value: number | null, currencyCode: string | null) {
  if (value === null) return '—'
  if (!currencyCode) return formatNumber(value, 2)
  return new Intl.NumberFormat('th-TH', {
    style: 'currency', currency: currencyCode, minimumFractionDigits: 2, maximumFractionDigits: 2,
  }).format(value)
}

function formatPriceSummary(summary: ProductWorkspacePriceSummary | null) {
  if (!summary || summary.mode === 'not-set') return 'ยังไม่กำหนด'
  if (summary.mode === 'mixed-currency') return 'หลายสกุลเงิน'
  if (summary.mode === 'range') return `${formatMoney(summary.minimum, summary.currencyCode)} – ${formatMoney(summary.maximum, summary.currencyCode)}`
  return formatMoney(summary.minimum, summary.currencyCode)
}

function formatSummary(summary: ProductWorkspaceValueSummary, labels?: Record<string, string>, suffix = '') {
  if (summary.mode === 'not-set') return 'ยังไม่กำหนด'
  if (summary.mode === 'mixed') return 'แตกต่างตาม SKU'
  const value = summary.value
  const label = typeof value === 'string' && labels ? (labels[value] ?? value) : String(value)
  return `${label}${suffix}`
}

function formatDimensions(length: number | null, width: number | null, height: number | null) {
  if (length === null && width === null && height === null) return '—'
  return `${formatNumber(length)} × ${formatNumber(width)} × ${formatNumber(height)} ซม.`
}

function formatFileSize(bytes: number) {
  if (bytes < 1024 * 1024) return `${Math.max(1, Math.round(bytes / 1024))} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

function stockLabel(sku: ProductWorkspaceSkuDetail) {
  if (sku.stock.mode === 'not-authorized') return 'ไม่มีสิทธิ์ดู Stock'
  if (sku.stock.mode === 'no-balance') return 'ยังไม่มียอด Stock'
  return `${formatNumber(sku.stock.onHand)} ${sku.baseUnitCode} · ใช้ได้ ${formatNumber(sku.stock.available)}`
}

function ProductQuickView({ selectedProduct, canReadCost }: { selectedProduct: ProductWorkspaceDetail; canReadCost: boolean }) {
  const sellUnits = selectedProduct.skus.flatMap((sku) => sku.sellUnits.map((unit) => ({ sku, unit })))
  const bundleComponents = selectedProduct.skus.flatMap((sku) => sku.bundleComponents.map((component) => ({ sku, component })))

  return <>
    <section className="product-detail-section product-quick-section" aria-labelledby="product-detail-overview">
      <h3 id="product-detail-overview">ข้อมูลทั่วไป</h3>
      <div className="product-quick-detail-grid">
        <div><span>สินค้า</span><strong>{selectedProduct.name}</strong></div>
        <div><span>หมวดหมู่</span><strong>{selectedProduct.category?.name ?? 'ยังไม่กำหนด'}</strong></div>
        <div><span>แบรนด์</span><strong>{selectedProduct.brand?.name ?? 'ไม่มีแบรนด์'}</strong></div>
        <div><span>รูปแบบสินค้า</span><strong>{structureLabels[selectedProduct.structureType] ?? selectedProduct.structureType}</strong></div>
        <div><span>สถานะ</span><strong><OperationsStatusBadge tone={statusTone(selectedProduct.status)}>{statusLabels[selectedProduct.status] ?? selectedProduct.status}</OperationsStatusBadge></strong></div>
        <div><span>Tags</span><strong>{selectedProduct.tags.length ? selectedProduct.tags.map((tag) => tag.name).join(', ') : '—'}</strong></div>
      </div>
      {selectedProduct.description ? <p className="product-quick-note"><strong>คำอธิบาย:</strong> {selectedProduct.description}</p> : null}
    </section>

    <section className="product-detail-section product-quick-section" aria-labelledby="product-detail-images">
      <div className="product-detail-section-heading"><h3 id="product-detail-images">รูปภาพสินค้า ({selectedProduct.images.length})</h3><span>เรียงตามลำดับที่บันทึก</span></div>
      {selectedProduct.images.length ? <div className="product-quick-image-grid" role="list" aria-label="รูปภาพสินค้า">
        {selectedProduct.images.map((image) => <figure key={image.id} role="listitem" className="product-quick-image">
          <span><Image src={image.signedUrl} alt={image.altText || selectedProduct.name} fill sizes="(max-width: 560px) 42vw, 150px" unoptimized /></span>
          <figcaption>{image.isCover ? <b>ภาพปก</b> : `ภาพที่ ${image.sortOrder + 1}`} · {formatFileSize(image.fileSizeBytes)}</figcaption>
        </figure>)}
      </div> : <p className="product-quick-note">ยังไม่มีรูปภาพที่พร้อมใช้งาน</p>}
    </section>

    <section className="product-detail-section product-quick-section" aria-labelledby="product-detail-skus">
      <div className="product-detail-section-heading"><h3 id="product-detail-skus">SKU / ตัวเลือก ({selectedProduct.skuCount})</h3>{selectedProduct.skuListCapped ? <span>แสดง 200 รายการแรก</span> : null}</div>
      {selectedProduct.skus.length ? <div className="product-quick-table-wrap" tabIndex={0} aria-label="ตาราง SKU เลื่อนได้เมื่อข้อมูลกว้าง">
        <table className="product-quick-table">
          <thead><tr><th scope="col">ตัวเลือก</th><th scope="col">SKU</th><th scope="col">รหัส CF</th><th scope="col">Barcode</th><th scope="col">Base Unit</th><th scope="col">Stock</th></tr></thead>
          <tbody>{selectedProduct.skus.map((sku) => <tr key={sku.id}>
            <td title={sku.name}>{sku.name}</td><td className="product-code" title={sku.skuCode}>{sku.skuCode}</td><td className="product-code" title={sku.salesCode ?? undefined}>{sku.salesCode || '—'}</td><td className="product-code" title={sku.barcode ?? undefined}>{sku.barcode || '—'}</td><td>{sku.baseUnitCode}</td><td>{stockLabel(sku)}</td>
          </tr>)}</tbody>
        </table>
      </div> : <p className="product-quick-note">Product นี้ยังไม่มี SKU</p>}
    </section>

    <section className="product-detail-section product-quick-section" aria-labelledby="product-detail-pricing">
      <h3 id="product-detail-pricing">ราคาและภาษี</h3>
      <div className="product-quick-detail-grid">
        <div><span>ราคาขายรวม</span><strong>{formatPriceSummary(selectedProduct.price)}</strong></div>
        {canReadCost ? <div><span>ราคาต้นทุนรวม</span><strong>{formatPriceSummary(selectedProduct.cost)}</strong></div> : null}
        <div><span>วิธีนับจำนวน</span><strong>{formatSummary(selectedProduct.quantityBehavior, quantityBehaviorLabels)}</strong></div>
        <div><span>ภาษี</span><strong>{formatSummary(selectedProduct.taxCategory, taxCategoryLabels)} · {formatSummary(selectedProduct.taxRate, undefined, '%')}</strong></div>
      </div>
      {selectedProduct.skus.length ? <div className="product-quick-table-wrap" tabIndex={0} aria-label="ตารางราคาและภาษีแยกตาม SKU">
        <table className="product-quick-table product-quick-pricing-table">
          <thead><tr><th scope="col">SKU</th><th scope="col">ราคาขาย</th>{canReadCost ? <th scope="col">ราคาต้นทุน</th> : null}<th scope="col">ภาษี</th><th scope="col">วิธีนับ</th></tr></thead>
          <tbody>{selectedProduct.skus.map((sku) => <tr key={sku.id}>
            <td className="product-code">{sku.skuCode}</td><td>{formatMoney(sku.profile?.salePrice ?? null, sku.profile?.currencyCode ?? null)}</td>{canReadCost ? <td>{sku.cost.mode === 'authorized' ? formatMoney(sku.cost.costPrice, sku.cost.currencyCode) : '—'}</td> : null}<td>{sku.profile ? `${taxCategoryLabels[sku.profile.taxCategory] ?? sku.profile.taxCategory} · ${formatNumber(sku.profile.taxRate)}%` : '—'}</td><td>{sku.profile ? (quantityBehaviorLabels[sku.profile.quantityBehavior] ?? sku.profile.quantityBehavior) : '—'}</td>
          </tr>)}</tbody>
        </table>
      </div> : null}
    </section>

    <section className="product-detail-section product-quick-section" aria-labelledby="product-detail-inventory">
      <h3 id="product-detail-inventory">คลังและการเติมสินค้า</h3>
      {selectedProduct.stock.mode === 'single-unit' ? <div className="product-detail-metrics">
        <div><span>On hand</span><strong>{formatNumber(selectedProduct.stock.onHand)}</strong></div>
        <div><span>Allocated</span><strong>{formatNumber(selectedProduct.stock.allocated)}</strong></div>
        <div><span>Available</span><strong>{formatNumber(selectedProduct.stock.available)}</strong></div>
      </div> : <p className="product-quick-note">{selectedProduct.stock.mode === 'mixed-units' ? 'Product นี้มีหลาย Base Unit จึงไม่รวมยอดข้ามหน่วย กรุณาดู Stock แยกตาม SKU' : selectedProduct.stock.mode === 'not-authorized' ? 'บัญชีนี้ไม่มีสิทธิ์ดู Stock' : 'ยังไม่มียอด Stock'}</p>}
      <div className="product-quick-detail-grid">
        <div><span>สาขาที่มี Balance</span><strong>{selectedProduct.stock.branchCodes.length ? selectedProduct.stock.branchCodes.join(', ') : '—'}</strong></div>
        <div><span>Safety Stock</span><strong>{formatSummary(selectedProduct.safetyStock)}</strong></div>
        <div><span>เติมขั้นต่ำ</span><strong>{formatSummary(selectedProduct.reorderMin)}</strong></div>
        <div><span>เติมสูงสุด</span><strong>{formatSummary(selectedProduct.reorderMax)}</strong></div>
      </div>
    </section>

    <section className="product-detail-section product-quick-section" aria-labelledby="product-detail-physical">
      <h3 id="product-detail-physical">น้ำหนักและขนาด</h3>
      {selectedProduct.skus.length ? <div className="product-quick-profile-list">
        {selectedProduct.skus.map((sku) => <article key={sku.id}>
          <div className="product-quick-profile-heading"><strong>{sku.name}</strong><span className="product-code">{sku.skuCode}</span></div>
          <div className="product-quick-detail-grid">
            <div><span>น้ำหนักสินค้า</span><strong>{sku.profile?.productWeightKg == null ? '—' : `${formatNumber(sku.profile.productWeightKg)} กก.`}</strong></div>
            <div><span>ขนาดสินค้า (ย × ก × ส)</span><strong>{sku.profile ? formatDimensions(sku.profile.productLengthCm, sku.profile.productWidthCm, sku.profile.productHeightCm) : '—'}</strong></div>
            <div><span>น้ำหนักพร้อมกล่อง</span><strong>{sku.profile?.packageWeightKg == null ? '—' : `${formatNumber(sku.profile.packageWeightKg)} กก.`}</strong></div>
            <div><span>ขนาดกล่อง (ย × ก × ส)</span><strong>{sku.profile ? formatDimensions(sku.profile.packageLengthCm, sku.profile.packageWidthCm, sku.profile.packageHeightCm) : '—'}</strong></div>
          </div>
        </article>)}
      </div> : <p className="product-quick-note">ยังไม่มีข้อมูล SKU</p>}
    </section>

    <section className="product-detail-section product-quick-section" aria-labelledby="product-detail-sell-units">
      <h3 id="product-detail-sell-units">หน่วยขายและการบรรจุ ({sellUnits.length})</h3>
      {sellUnits.length ? <div className="product-quick-table-wrap" tabIndex={0} aria-label="ตารางหน่วยขายและการบรรจุ">
        <table className="product-quick-table"><thead><tr><th scope="col">SKU</th><th scope="col">หน่วยขาย</th><th scope="col">รหัสหน่วย</th><th scope="col">เท่ากับ Base Unit</th><th scope="col">Barcode</th><th scope="col">สถานะ</th></tr></thead>
          <tbody>{sellUnits.map(({ sku, unit }) => <tr key={unit.id}><td className="product-code">{sku.skuCode}</td><td>{unit.name}</td><td className="product-code">{unit.unitCode}</td><td>{formatNumber(unit.baseQuantity)} {sku.baseUnitCode}</td><td className="product-code">{unit.barcode || '—'}</td><td>{statusLabels[unit.status] ?? unit.status}</td></tr>)}</tbody>
        </table>
      </div> : <p className="product-quick-note">ใช้ Base Unit ของแต่ละ SKU โดยยังไม่มีหน่วยขายเพิ่มเติม</p>}
    </section>

    <section className="product-detail-section product-quick-section" aria-labelledby="product-detail-bundle">
      <h3 id="product-detail-bundle">Bundle / Kit ({bundleComponents.length})</h3>
      {bundleComponents.length ? <div className="product-quick-table-wrap" tabIndex={0} aria-label="ตารางส่วนประกอบ Bundle">
        <table className="product-quick-table"><thead><tr><th scope="col">Bundle SKU</th><th scope="col">SKU ส่วนประกอบ</th><th scope="col">ชื่อส่วนประกอบ</th><th scope="col">จำนวน</th></tr></thead>
          <tbody>{bundleComponents.map(({ sku, component }) => <tr key={`${sku.id}-${component.componentSkuId}`}><td className="product-code">{sku.skuCode}</td><td className="product-code">{component.componentSkuCode}</td><td>{component.componentSkuName}</td><td>{formatNumber(component.componentQuantity)}</td></tr>)}</tbody>
        </table>
      </div> : <p className="product-quick-note">สินค้านี้ไม่มีส่วนประกอบ Bundle / Kit</p>}
    </section>

    <section className="product-detail-section product-quick-section" aria-labelledby="product-detail-metadata">
      <h3 id="product-detail-metadata">ข้อมูลกำกับ</h3>
      <div className="product-quick-detail-grid">
        <div><span>สร้างเมื่อ</span><strong>{formatDate(selectedProduct.createdAt)}</strong></div>
        <div><span>แก้ไขล่าสุด</span><strong>{formatDate(selectedProduct.updatedAt)}</strong></div>
        <div><span>ผู้สร้าง</span><strong>{selectedProduct.createdByDisplayName || '—'}</strong></div>
        <div><span>Version</span><strong>{selectedProduct.version}</strong></div>
      </div>
      {selectedProduct.internalNote ? <p className="product-quick-note product-quick-internal-note"><strong>หมายเหตุภายใน:</strong> {selectedProduct.internalNote}</p> : null}
    </section>
  </>
}

export function ProductDetailSheet({
  organizationId,
  selectedProduct,
  selectedSku,
  closeHref,
  canManage,
  canReadCost,
  isPending,
  openEditor,
  requestLifecycle,
}: {
  organizationId: string
  selectedProduct: ProductWorkspaceDetail | null
  selectedSku: SkuDetail | null
  closeHref: string
  canManage: boolean
  canReadCost: boolean
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
      description={selectedProduct ? `${selectedProduct.category?.name ?? 'ยังไม่กำหนดหมวดหมู่'} · ${selectedProduct.brand?.name ?? 'ไม่มีแบรนด์'} · ${statusLabels[selectedProduct.status] ?? selectedProduct.status}` : `SKU ${selectedSku?.skuCode ?? ''}`}
      closeAction={<Link className="product-detail-close-icon" href={closeHref} aria-label="ปิดรายละเอียด" title="ปิดรายละเอียด"><span aria-hidden="true">×</span></Link>}
    >
      <div className="product-detail-stack">
        {selectedProduct ? <>
          <ProductQuickView selectedProduct={selectedProduct} canReadCost={canReadCost} />
          {canManage && selectedProduct.status !== 'archived' ? <div className="button-row product-detail-actions">
            <button className="button secondary" type="button" disabled={isPending} onClick={() => openEditor('edit-product')}>แก้ไข Product</button>
            {selectedProduct.status === 'draft' ? <button className="button" type="button" disabled={isPending} onClick={() => requestLifecycle({ commandType: 'product.activate', idKey: 'product_id', id: selectedProduct.id, version: selectedProduct.version, label: selectedProduct.name })}>เปิดใช้งาน</button> : null}
            <button className="button danger" type="button" disabled={isPending} onClick={() => requestLifecycle({ commandType: 'product.archive', idKey: 'product_id', id: selectedProduct.id, version: selectedProduct.version, label: selectedProduct.name })}>เก็บ Product ถาวร</button>
          </div> : selectedProduct.status === 'archived' ? <div className="product-detail-readonly" role="note">Product ที่เก็บถาวรแล้วเป็นข้อมูลอ่านอย่างเดียวและจะไม่ถูกลบ</div> : null}
        </> : selectedSku ? <>
          <div className="product-detail-status"><OperationsStatusBadge tone={statusTone(selectedSku.status)}>{statusLabels[selectedSku.status] ?? selectedSku.status}</OperationsStatusBadge><span>Version {selectedSku.version}</span></div>
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
            <h3 id="sku-detail-stock">Inventory summary</h3><p>{stockLabel(selectedSku)}</p>
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

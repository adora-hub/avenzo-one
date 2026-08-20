import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import test from 'node:test'

const read = (path) => readFile(new URL(path, import.meta.url), 'utf8')
const formPath = '../src/app/organizations/[id]/products/new/unified-product-creation-form.tsx'

test('R7.2.3C renders the approved SKU heading and name assistant composition', async () => {
  const form = await read(formPath)
  assert.match(form, /structure === 'variant' \? 'SKU Variant และตัวเลือกสินค้า' : 'SKU แรกและรหัสสินค้า'/)
  assert.match(form, /SKU คือรายการที่ขายและนับ Stock จริง/)
  assert.match(form, /useProductNameForSku/)
  assert.match(form, /ใช้ชื่อเดียวกับสินค้า/)
  assert.match(form, /product-auto-fill-choice/)
  assert.match(form, /ระบบจะนำชื่อสินค้ามาใส่ให้อัตโนมัติ/)
})

test('R7.2.3C adds the approved identifier information guides and modes', async () => {
  const form = await read(formPath)
  for (const label of ['ชื่อรุ่น / ตัวเลือกสินค้า', 'รหัสสินค้า (SKU)', 'รหัสขาย / รหัส CF ประจำสินค้า', 'Barcode / รหัสสแกน', 'หน่วยนับสต๊อก (Base Unit)']) {
    assert.ok(form.includes(`ProductInfoGuide label="${label}"`))
  }
  for (const mode of ['manual', 'same-sku', 'sequence', 'manufacturer', 'internal-sku', 'internal-sales', 'none']) {
    assert.match(form, new RegExp(`value="${mode}"`))
  }
  assert.match(form, /applySalesCodeMode/)
  assert.match(form, /applyBarcodeMode/)
})

test('R7.2.3C renders a bounded Sales Code sequence preview without claiming reservation', async () => {
  const form = await read(formPath)
  assert.match(form, /function formatSalesSequence/)
  assert.match(form, /salesSequencePrefix/)
  assert.match(form, /salesSequenceStart/)
  assert.match(form, /salesSequenceDigits/)
  assert.match(form, /รหัสปัจจุบัน → รหัสถัดไป/)
  assert.match(form, /Preview ยังไม่จองเลข/)
  assert.match(form, /Server จะตรวจ Unique ใน transaction/)
})

test('R7.2.3C renders identifier advisory, Base Unit policy and truthful Draft status', async () => {
  const form = await read(formPath)
  assert.match(form, /product-identifier-assistant/)
  assert.match(form, /ตรวจสอบรหัส/)
  assert.match(form, /Server transaction เป็นผู้ยืนยัน Unique ขั้นสุดท้าย/)
  assert.match(form, /product-base-unit-policy/)
  assert.match(form, /value="set">set — ชุด/)
  assert.match(form, /value="case">case — ลัง/)
  assert.match(form, /product-initial-status-summary/)
  assert.match(form, /สถานะหลังสร้าง/)
  assert.match(form, /ฉบับร่าง/)
  assert.doesNotMatch(form, /name="initialStatus"/)
})

test('R7.2.3C renders the SKU staging surface while preserving the initial-SKU command boundary', async () => {
  const form = await read(formPath)
  assert.match(form, /product-sku-staging/)
  assert.match(form, /คิวสินค้าที่รอสร้าง/)
  assert.match(form, /เก็บสินค้าและสร้างรายการถัดไป/)
  assert.match(form, /storeCurrentSkuDraft/)
  assert.match(form, /Atomic command ปัจจุบันสร้างได้ครั้งละ 1 SKU/)
  assert.match(form, /product-sku-staging-table/)
  assert.match(form, /product-sku-staging-icon-action/)
  assert.doesNotMatch(form, /errors\.push\('รูปสินค้าอย่างน้อย 1 ภาพ'\)/)
  assert.match(form, /สามารถบันทึกก่อนแล้วเพิ่มรูปภายหลังได้/)
  assert.match(form, /'product\.create_with_variants' : 'product\.create_with_initial_sku'/)
  assert.doesNotMatch(form, /commandType: 'sku\.create'/)
})

test('R7.2.3C applies the approved desktop and responsive component layout', async () => {
  const styles = await read('../src/app/globals.css')
  assert.match(styles, /\.product-sales-sequence \{[^}]*grid-template-columns: 1fr 1fr 1fr 1\.3fr/)
  assert.match(styles, /\.product-identifier-assistant/)
  assert.match(styles, /\.product-sku-staging-table \{ width: max-content; min-width: 100%;/)
  assert.match(styles, /@media \(max-width: 760px\)[\s\S]*\.product-variant-name-assistant, \.product-sales-sequence \{ grid-template-columns: repeat\(2, minmax\(0, 1fr\)\); \}/)
  assert.match(styles, /@media \(max-width: 480px\)[\s\S]*\.product-variant-name-assistant, \.product-sales-sequence \{ grid-template-columns: 1fr; \}/)
})

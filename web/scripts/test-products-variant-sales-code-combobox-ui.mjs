import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import test from 'node:test'

const root = new URL('../', import.meta.url)
const read = (path) => readFile(new URL(path, root), 'utf8')

test('Variant sales-code sequence asks only for Prefix and presents the usable range', async () => {
  const builder = await read('src/app/organizations/[id]/products/new/variant-creation-builder.tsx')

  assert.match(builder, /ตั้งค่าการรันรหัสต่อเนื่อง/)
  assert.match(builder, /กำหนดเฉพาะ Prefix/)
  assert.match(builder, /ช่วงรหัสที่จะใช้/)
  assert.match(builder, /รหัสถัดไปหลังชุดนี้/)
  assert.doesNotMatch(builder, /<span>เลขเริ่มต้นที่ว่าง<\/span>/)
  assert.doesNotMatch(builder, /<span>จำนวนหลัก<\/span>/)
})

test('SKU and sales-code settings use paired vertical cards on desktop', async () => {
  const [builder, css] = await Promise.all([
    read('src/app/organizations/[id]/products/new/variant-creation-builder.tsx'),
    read('src/app/globals.css'),
  ])

  assert.match(builder, /product-variant-code-settings-pair/)
  assert.equal((builder.match(/product-variant-code-settings-card/g) ?? []).length, 2)
  assert.match(css, /\.product-variant-code-settings-pair \{[^}]+grid-template-columns: repeat\(2, minmax\(0, 1fr\)\)/)
  assert.match(css, /\.product-variant-code-settings-card \.product-variant-sku-settings-grid \{ grid-template-columns: 1fr; \}/)
  assert.match(css, /\.product-variant-code-settings-card \.product-variant-sales-settings-grid \{ grid-template-columns: 1fr; \}/)
  assert.match(css, /\.product-variant-code-settings-card \.product-variant-sales-sequence-controls \{ grid-template-columns: 1fr; \}/)
  assert.match(css, /@media \(max-width: 760px\)[\s\S]+\.product-variant-code-settings-pair \{ grid-template-columns: 1fr; \}/)
})

test('SKU sequence recommendation appears only when the entered sequence is already behind the database high-water mark', async () => {
  const [builder, css] = await Promise.all([
    read('src/app/organizations/[id]/products/new/variant-creation-builder.tsx'),
    read('src/app/globals.css'),
  ])

  assert.match(builder, /skuProductSequence < recommendedProductSequence/)
  assert.match(builder, /serverSequencePreview\.status === 'ready' && skuSequenceConflict/)
  assert.match(builder, /เลขลำดับ .* ใช้ได้/)
  assert.match(builder, /เลขลำดับ Product .* ถูกใช้แล้ว/)
  assert.match(builder, /ใช้เลขแนะนำ/)
  assert.match(builder, /ระบบจะไม่เปลี่ยนค่าที่กรอก/)
  assert.match(builder, /onClick=\{\(\) => setSkuProductSequence\(recommendedProductSequence\)\}/)
  assert.match(builder, /skuSequenceConflict \? 'danger' : identifierCheck\.tone/)
  assert.match(builder, /disabled=\{disabled \|\| isIdentifierChecking \|\| skuSequenceConflict\}/)
  assert.match(css, /\.product-variant-sequence-status \{[^}]+height: 42px/)
  assert.match(css, /\.product-variant-sequence-status\.success/)
})

test('Variant sales-code preview responds immediately and reuses a recent authoritative result', async () => {
  const builder = await read('src/app/organizations/[id]/products/new/variant-creation-builder.tsx')

  assert.match(builder, /VARIANT_SALES_CODE_PREVIEW_DEBOUNCE_MS = 120/)
  assert.match(builder, /VARIANT_SALES_CODE_PREVIEW_CACHE_TTL_MS = 30_000/)
  assert.match(builder, /variantSalesCodePreviewCache\.get\(cacheKey\)/)
  assert.match(builder, /formatGlobalSalesCode\(requestedPrefix, salesCodeStart\)/)
  assert.match(builder, /ตัวอย่างชั่วคราว · กำลังยืนยันกับระบบ/)
  assert.match(builder, /setSalesCodeStart\(1\); setSalesCodePrefix/)
  assert.doesNotMatch(builder, /salesCodeMode === 'sequence' && salesCodePreview\.status !== 'ready'/)
  assert.match(builder, /visibleSalesCodeMatch = salesCodePreview\.firstCode\?\.match/)
  assert.match(builder, /visibleSalesCodeStart \+ sequenceIndex\+\+/)
})

test('Variant Barcode wording and behavior match the standard product modes', async () => {
  const builder = await read('src/app/organizations/[id]/products/new/variant-creation-builder.tsx')

  for (const label of [
    'ยังไม่กำหนด Barcode',
    'ใช้รหัสสินค้า (SKU) เป็น Barcode',
    'ใช้รหัสขาย / รหัส CF เป็น Barcode',
    'สร้าง Barcode ภายในแบบต่อเนื่อง',
  ]) assert.match(builder, new RegExp(label.replace(/[()]/g, '\\$&')))

  assert.match(builder, /bulkBarcode === 'sales'[\s\S]+\? salesCode/)
})

test('Product creation custom combobox follows the shared visual and keyboard contract', async () => {
  const [component, css] = await Promise.all([
    read('src/app/organizations/[id]/products/new/product-creation-combobox.tsx'),
    read('src/app/globals.css'),
  ])

  assert.match(component, /role="combobox"/)
  assert.match(component, /role="listbox"/)
  assert.match(component, /role="option"/)
  for (const key of ['ArrowDown', 'ArrowUp', 'Home', 'End', 'Enter', 'Escape', 'Tab']) {
    assert.match(component, new RegExp(`event\\.key === '${key}'`))
  }
  assert.match(css, /\.product-creation-combobox-trigger \{[^}]+height: 42px/)
  assert.match(css, /\.product-creation-combobox-options \{[^}]+background: var\(--surface-elevated\)/)
  assert.match(css, /\[aria-selected="true"\][^{]+\{[^}]+background: var\(--surface-subtle\)/)
  assert.doesNotMatch(css, /\.product-creation-combobox-options[^}]+#(?:0d6efd|007bff|2563eb)/i)
})

test('Variant identifier suggestions can be applied together and are rechecked automatically', async () => {
  const [builder, css] = await Promise.all([
    read('src/app/organizations/[id]/products/new/variant-creation-builder.tsx'),
    read('src/app/globals.css'),
  ])

  assert.match(builder, /function useAllIdentifierSuggestions\(\)/)
  assert.match(builder, /suggestedIdentifierCollisions\.filter\(\(collision\) => collision\.key === item\.key/)
  assert.match(builder, /ใช้รหัสแนะนำทั้งหมด \(\{suggestedIdentifierCollisions\.length\}\)/)
  assert.match(builder, /เลือกใช้ทีละรหัส หรือกดใช้ทั้งหมด แล้วระบบจะตรวจฐานข้อมูลซ้ำให้อัตโนมัติ/)
  assert.match(builder, /Signature represents every identifier field; recheck after each edit/)
  assert.match(builder, /product-variant-use-all-suggestions/)
  assert.match(builder, /product-variant-identifier-suggestion-list/)
  assert.match(css, /\.product-variant-identifier-suggestions-head \{[^}]+grid-template-columns: auto minmax\(0, 1fr\) auto;[^}]+align-items: center/)
  assert.match(css, /\.product-variant-identifier-suggestion-list \{[^}]+align-items: center/)
  assert.match(css, /\.product-variant-use-all-suggestions \{[^}]+height: 38px;[^}]+font-size: 12px;[^}]+font-weight: 600/)
  assert.match(css, /\.product-variant-use-all-suggestions:not\(:disabled\):hover \{[^}]+background: #5e5e5e/)
})

import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import test from 'node:test'

const read = (path) => readFile(new URL(path, import.meta.url), 'utf8')
const formPath = '../src/app/organizations/[id]/products/new/unified-product-creation-form.tsx'

test('R7.2.3A adds every approved information guide without changing the command boundary', async () => {
  const form = await read(formPath)
  assert.match(form, /function ProductInfoGuide/)
  for (const label of ['ชื่อสินค้า', 'รูปแบบสินค้า', 'Stock ของสินค้านี้นับอย่างไร\\?']) {
    assert.match(form, new RegExp(`ProductInfoGuide label="${label}"`))
  }
  assert.match(form, /'product\.create_with_variants' : 'product\.create_with_initial_sku'/)
  assert.doesNotMatch(form, /commandType: 'product\.create'/)
})

test('product information guides open only from the icon and preserve approved content', async () => {
  const [form, styles] = await Promise.all([read(formPath), read('../src/app/globals.css')])
  assert.equal((form.match(/<ProductInfoGuide /g) ?? []).length, 9)
  assert.equal((form.match(/<ProductInfoGuide [^>]*description=/g) ?? []).length, 9)
  assert.equal((form.match(/<ProductInfoGuide [^>]*example=/g) ?? []).length, 9)
  assert.doesNotMatch(form, /onPointerEnter=\{\(\) => openGuide\(false\)\}/)
  assert.doesNotMatch(form, /onFocus=\{\(\) => openGuide\(false\)\}/)
  assert.match(form, /if \(open && pinned\) closeGuide\(\)/)
  assert.match(form, /document\.addEventListener\('pointerdown', handlePointerDown\)/)
  assert.match(form, /document\.addEventListener\('keydown', handleEscape\)/)
  assert.match(form, /aria-expanded=\{open\}/)
  assert.match(form, /aria-describedby=\{open \? popoverId : undefined\}/)
  assert.match(form, /role="tooltip"/)
  assert.match(form, /hidden=\{!open\}/)
  assert.match(form, /visibility: positioned \? 'visible' : 'hidden'/)
  assert.match(form, /useLayoutEffect\(\(\) => \{/)
  assert.doesNotMatch(form, /requestAnimationFrame\(updatePosition\)/)
  for (const id of ['productName', 'quantityBehavior', 'skuCode', 'salesCode', 'barcode', 'salePrice']) {
    assert.match(form, new RegExp(`htmlFor="${id}"`))
    assert.match(form, new RegExp(`id="${id}"`))
  }
  assert.doesNotMatch(form, /<label[^>]*>[^<]*<span className="product-label-with-info">[^\n]*<ProductInfoGuide/)
  assert.match(styles, /\.product-info-popover \{[^}]*position: fixed[^}]*z-index: 150/)
  assert.match(styles, /\.product-info-example/)
  assert.match(styles, /\.product-info-guide\[aria-expanded="true"\]/)
  assert.doesNotMatch(styles, /\.product-info-guide::before/)
  assert.match(styles, /\.product-identifier-assistant-head > \.button, \.product-sku-staging-actions > \.product-primary-action \{[^}]*min-height: 32px[^}]*font-size: 12px[^}]*font-weight: 400/)
})

test('R7.2.3A uses edit-icon master controls and the approved select treatment', async () => {
  const [form, styles] = await Promise.all([read(formPath), read('../src/app/globals.css')])
  assert.match(form, /MasterDataManager organizationId=\{organizationId\} kind="category"/)
  assert.match(form, /MasterDataManager organizationId=\{organizationId\} kind="brand"/)
  assert.match(form, /MasterDataManager organizationId=\{organizationId\} kind="tag"/)
  assert.match(styles, /\.product-select-control select[^}]*padding-right: 38px/)
  assert.match(styles, /\.product-select-control::after[^}]*right: 14px[^}]*width: 6px[^}]*height: 6px/)
  assert.match(styles, /\.product-select-control \{[^}]*align-self: start[^}]*height: fit-content/)
  assert.match(styles, /\.product-form-grid label, \.product-form-field[^}]*align-content: start/)
  assert.equal((form.match(/<select(?:\s|>)/g) ?? []).length, (form.match(/<span className="product-select-control"><select(?:\s|>)/g) ?? []).length)
  assert.match(styles, /\.product-inline-icon svg/)
})

test('R7.2.3A renders quantity guidance and examples from the approved mockup', async () => {
  const [form, styles] = await Promise.all([read(formPath), read('../src/app/globals.css')])
  assert.match(form, /product-quantity-examples/)
  assert.match(styles, /\.product-field-heading-line \{[^}]*min-height: 31px/)
  assert.match(styles, /\.product-base-unit-field > \.product-label-with-info \{ min-height: 31px; \}/)
  assert.match(form, /ต่างหู 1 คู่, เสื้อ 2 ชิ้น, สินค้า 3 แพ็ค/)
  assert.match(form, /ข้าวสาร 0\.50 kg/)
  assert.match(form, /น้ำหอม 1\.25 litre/)
  assert.match(form, /ส่วนหน่วยที่ใช้จริงเลือกใน Base Unit/)
})

test('R7.2.3A renders saved-tag navigation, tag editor and bounded internal product note', async () => {
  const [form, styles] = await Promise.all([read(formPath), read('../src/app/globals.css')])
  assert.match(form, /product-saved-tags-navigation/)
  assert.match(form, /เลือก Tags ที่บันทึกไว้/)
  assert.match(form, /product-tag-editor/)
  assert.match(form, /maxLength=\{40\}/)
  assert.match(form, /slice\(0, 12\)/)
  assert.match(form, /name="internalNote" maxLength=\{1000\}/)
  assert.match(form, /หมายเหตุภายในสำหรับทีมงาน ไม่แสดงให้ลูกค้า/)
  assert.doesNotMatch(form, /<textarea name="description"/)
  assert.match(styles, /\.product-tag-chip/)
  assert.match(styles, /\.product-saved-tags-menu/)
})

test('R7.2.3A keeps the approved connected button group and mobile stacking', async () => {
  const styles = await read('../src/app/globals.css')
  assert.match(styles, /\.product-segmented-control \{[^}]*gap: 0/)
  assert.match(styles, /\.product-segmented-control label \+ label \{ margin-left: -1px; \}/)
  assert.match(styles, /\.product-segmented-control label \+ label \{ margin-top: -1px; margin-left: 0; \}/)
})

test('product and SKU names use the same readable input typography', async () => {
  const styles = await read('../src/app/globals.css')
  assert.match(styles, /\.product-form-grid #productName, \.product-form-grid #skuName \{ font-size: 16px; font-weight: 500; \}/)
})

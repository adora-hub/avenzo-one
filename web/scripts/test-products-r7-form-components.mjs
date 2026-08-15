import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import test from 'node:test'

const read = (path) => readFile(new URL(path, import.meta.url), 'utf8')
const formPath = '../src/app/organizations/[id]/products/new/unified-product-creation-form.tsx'

test('R7.2.3A adds the three approved information guides without changing the command boundary', async () => {
  const form = await read(formPath)
  assert.match(form, /function ProductInfoGuide/)
  for (const label of ['ชื่อสินค้า', 'รูปแบบสินค้า', 'วิธีนับจำนวน']) {
    assert.match(form, new RegExp(`ProductInfoGuide label="${label}"`))
  }
  assert.match(form, /commandType: 'product\.create_with_initial_sku'/)
  assert.doesNotMatch(form, /commandType: 'product\.create'/)
})

test('R7.2.3A uses edit-icon master controls and the approved select treatment', async () => {
  const [form, styles] = await Promise.all([read(formPath), read('../src/app/globals.css')])
  assert.match(form, /MasterDataManager organizationId=\{organizationId\} kind="category"/)
  assert.match(form, /MasterDataManager organizationId=\{organizationId\} kind="brand"/)
  assert.match(form, /MasterDataManager organizationId=\{organizationId\} kind="tag"/)
  assert.match(styles, /\.product-select-control::after[^}]*right: 12px/)
  assert.match(styles, /\.product-inline-icon svg/)
})

test('R7.2.3A renders quantity guidance and examples from the approved mockup', async () => {
  const form = await read(formPath)
  assert.match(form, /product-quantity-examples/)
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

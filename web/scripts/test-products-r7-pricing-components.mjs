import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import test from 'node:test'

const read = (path) => readFile(new URL(path, import.meta.url), 'utf8')
const formPath = '../src/app/organizations/[id]/products/new/unified-product-creation-form.tsx'

test('R7.2.3D renders the approved pricing heading and three-field composition', async () => {
  const form = await read(formPath)
  assert.match(form, /<h2>ราคาและภาษี<\/h2>/)
  assert.match(form, /ราคานี้เป็น Default price ของ SKU แรก ไม่ใช่ราคาทุกสาขาตลอดไป/)
  assert.match(form, /<small>Pricing<\/small>/)
  assert.match(form, /product-form-grid three product-pricing-grid/)
  assert.doesNotMatch(form, /<span>ภาษี \(%\)<\/span>/)
})

test('R7.2.3D applies bounded Sale and Cost fields with THB suffixes', async () => {
  const form = await read(formPath)
  const pricingSection = form.slice(form.indexOf('<section id="pricing"'), form.indexOf('<section id="physical"'))
  assert.match(form, /name="salePrice" type="number" min="0" max="999999999\.99" step="0\.01"[^>]*required/)
  assert.match(form, /name="costPrice" type="number" min="0" max="999999999\.99" step="0\.01"/)
  assert.match(form, /ProductInfoGuide label="ราคาขาย"/)
  assert.equal((pricingSection.match(/product-input-with-suffix/g) ?? []).length, 2)
  assert.match(form, /ข้อมูลจำกัดสิทธิ์; ไม่ใช่ต้นทุนบัญชีจริง/)
})

test('R7.2.3D maps approved Tax Category choices to the existing tax-rate contract', async () => {
  const form = await read(formPath)
  for (const choice of ['standard', 'zero', 'exempt']) assert.match(form, new RegExp(`<option value="${choice}">`))
  assert.match(form, /name="taxRate" value=\{taxCategory === 'standard' \? '7' : '0'\}/)
  assert.match(form, /tax_category: formString\(data, 'taxCategory'\)/)
  assert.match(form, /tax_rate: optionalNumber\(data\.get\('taxRate'\)\)/)
})

test('R7.2.3D renders Tax-inclusive choice without changing the atomic command schema', async () => {
  const form = await read(formPath)
  assert.match(form, /name="taxInclusive" type="checkbox" defaultChecked/)
  assert.match(form, /ราคาขายรวมภาษีแล้ว/)
  assert.match(form, /Invoice จะเก็บ Tax snapshot ณ เวลาขาย/)
  assert.doesNotMatch(form, /tax_inclusive:/)
  assert.match(form, /commandType: 'product\.create_with_initial_sku'/)
})

test('R7.2.3D applies approved suffix, checkbox and responsive styles', async () => {
  const styles = await read('../src/app/globals.css')
  assert.match(styles, /\.product-input-with-suffix \{[^}]*position: relative/)
  assert.match(styles, /\.product-input-with-suffix > span \{[^}]*right: 12px/)
  assert.match(styles, /\.product-pricing-grid \.product-tax-inclusive \{[^}]*grid-column: span 2/)
  assert.match(styles, /@media \(max-width: 760px\)[\s\S]*\.product-pricing-grid \.product-tax-inclusive \{ grid-column: 1; \}/)
})

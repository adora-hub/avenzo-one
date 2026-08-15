import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import test from 'node:test'

const read = (path) => readFile(new URL(path, import.meta.url), 'utf8')
const formPath = '../src/app/organizations/[id]/products/new/unified-product-creation-form.tsx'

test('R7.2.3F renders the approved Section 6 heading and packaging switch', async () => {
  const form = await read(formPath)
  assert.match(form, /<h2>หน่วยบรรจุและ Bundle<\/h2>/)
  assert.match(form, /ทดลองขายยกแพ็ก\/ลัง หรือรวมหลาย SKU โดย Stock ยัง resolve เป็น Component SKU/)
  assert.match(form, /<small>Future contract<\/small>/)
  assert.match(form, /ขายหลายหน่วยบรรจุ/)
  assert.match(form, /name="packagingEnabled" type="checkbox" checked=\{packagingEnabled\}/)
})

test('R7.2.3F renders the approved packaging table, conversion preview and presets', async () => {
  const form = await read(formPath)
  for (const heading of ['ชื่อหน่วยขาย', 'Unit Code', 'ตัวคูณ Base Unit', 'การตัด Stock', 'Barcode', 'Sales Code', 'ราคาขาย']) {
    assert.match(form, new RegExp(`<th>${heading}</th>`))
  }
  assert.match(form, /sellUnits\.map/)
  assert.match(form, /ขาย 2 → ตัด/)
  for (const preset of ["'pair'", "'pack'", "'box'", "'case'", "'custom'"]) assert.match(form, new RegExp(`addSellUnitPreset\\(${preset}\\)`))
  assert.match(form, /Base Unit คือหน่วยที่ Stock เก็บจริง/)
})

test('R7.2.3F discloses unsupported per-unit Sales Code and price instead of persisting fake data', async () => {
  const form = await read(formPath)
  assert.match(form, /R7\.1 ยังไม่รองรับ Sales Code แยกต่อ Sell Unit/)
  assert.match(form, /R7\.1 ยังไม่รองรับราคาแยกต่อ Sell Unit/)
  assert.doesNotMatch(form, /sell_units:[\s\S]{0,450}sales_code:/)
  assert.doesNotMatch(form, /sell_units:[\s\S]{0,450}sale_price:/)
})

test('R7.2.3F renders Virtual and Pre-assembled modes plus a multi-component editor', async () => {
  const form = await read(formPath)
  assert.match(form, /value="virtual">Virtual Bundle — ตัด Component ตอนขาย/)
  assert.match(form, /value="assembled">Pre-assembled — ประกอบเป็น Stock ชุด/)
  assert.match(form, /bundleComponents\.map/)
  assert.match(form, /＋ เพิ่ม Component SKU/)
  assert.match(form, /Bundle ต้องมีอย่างน้อย 2 Components/)
  assert.match(form, /Pre-assembled Bundle ยังต้องใช้ Assembly Command/)
})

test('R7.2.3F validates unit conversion, identifier duplication and component integrity', async () => {
  const form = await read(formPath)
  for (const message of ['ตัวคูณหน่วยขายต้องมากกว่า 1', 'สินค้าที่นับจำนวนเต็มต้องใช้ตัวคูณเป็นจำนวนเต็ม', 'Unit Code ของหน่วยขายต้องไม่ซ้ำกัน', 'Barcode ของหน่วยขายต้องไม่ซ้ำกัน', 'Bundle มี Component SKU ซ้ำ', 'จำนวน Component ต้องมากกว่า 0']) {
    assert.match(form, new RegExp(message))
  }
  assert.match(form, /packagingBundleValidationErrors\(payload\.quantity_behavior\)/)
})

test('R7.2.3F maps supported multiple rows to the existing atomic payload only', async () => {
  const form = await read(formPath)
  assert.match(form, /sell_units: packagingEnabled \? sellUnits\.map/)
  assert.match(form, /unit_code: unit\.unitCode\.toLowerCase\(\), name: unit\.name\.trim\(\)/)
  assert.match(form, /bundle_components: structure === 'bundle' \? bundleComponents\.map/)
  assert.match(form, /sku_id: component\.skuId, quantity: component\.quantity/)
  assert.match(form, /commandType: 'product\.create_with_initial_sku'/)
  assert.doesNotMatch(form, /commandType: 'sku\.sell_units\.replace'/)
  assert.doesNotMatch(form, /commandType: 'sku\.bundle\.replace'/)
})

test('R7.2.3F applies approved switch, editor table and horizontal overflow styles', async () => {
  const styles = await read('../src/app/globals.css')
  assert.match(styles, /\.product-switch-row/)
  assert.match(styles, /\.product-switch input:checked \+ span/)
  assert.match(styles, /\.product-editor-scroll \{[^}]*overflow-x: auto/)
  assert.match(styles, /\.product-editor-table \{[^}]*min-width: 1120px/)
  assert.match(styles, /\.product-bundle-table \{ min-width: 720px; \}/)
  assert.match(styles, /\.product-packaging-presets/)
})

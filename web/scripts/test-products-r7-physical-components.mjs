import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import test from 'node:test'

const read = (path) => readFile(new URL(path, import.meta.url), 'utf8')
const formPath = '../src/app/organizations/[id]/products/new/unified-product-creation-form.tsx'

test('R7.2.3E renders the approved physical heading and accessible two-tab contract', async () => {
  const form = await read(formPath)
  assert.match(form, /<h2>น้ำหนักและขนาด<\/h2>/)
  assert.match(form, /ข้อมูลสำหรับขนส่ง คำนวณพื้นที่ และเลือกบรรจุภัณฑ์/)
  assert.match(form, /<small>SKU \/ Packaging<\/small>/)
  assert.match(form, /role="tablist" aria-label="ชนิดน้ำหนักและขนาด"/)
  assert.match(form, /id="productPhysicalTab"[^>]*role="tab"/)
  assert.match(form, /id="boxPhysicalTab"[^>]*role="tab"/)
  assert.match(form, /role="tabpanel" aria-labelledby="productPhysicalTab"/)
  assert.match(form, /role="tabpanel" aria-labelledby="boxPhysicalTab"/)
})

test('R7.2.3E renders bounded product measurements with kg and cm suffixes', async () => {
  const form = await read(formPath)
  assert.match(form, /น้ำหนักสินค้า \(Net\)/)
  assert.match(form, /name="productWeightKg" type="number" min="0" max="100000" step="0\.001"/)
  for (const field of ['productLengthCm', 'productWidthCm', 'productHeightCm']) {
    assert.match(form, new RegExp(`name="${field}" type="number" min="0" max="100000" step="0\\.1"`))
  }
  assert.match(form, /ขนาดสินค้าใช้วางแผนพื้นที่และเลือกบรรจุภัณฑ์ ไม่รวมวัสดุห่อหรือกล่องจัดส่ง/)
})

test('R7.2.3E renders bounded package measurements and the Packaging Level disclosure', async () => {
  const form = await read(formPath)
  assert.match(form, /น้ำหนักรวมกล่อง \(Gross\)/)
  assert.match(form, /name="packageWeightKg" type="number" min="0" max="100000" step="0\.001"/)
  for (const field of ['packageLengthCm', 'packageWidthCm', 'packageHeightCm']) {
    assert.match(form, new RegExp(`name="${field}" type="number" min="0" max="100000" step="0\\.1"`))
  }
  assert.match(form, /ถ้ามีหลายหน่วยบรรจุ ระบบจริงควรเก็บน้ำหนักและขนาดกล่องแยกต่อ Packaging Level/)
})

test('R7.2.3E enforces all approved cross-field comparisons before the atomic command', async () => {
  const form = await read(formPath)
  assert.match(form, /function physicalValidationErrors/)
  for (const message of ['Gross Weight ต้องไม่น้อยกว่า Net Weight', 'กล่องต้องไม่สั้นกว่าสินค้า', 'กล่องต้องไม่แคบกว่าสินค้า', 'กล่องต้องไม่เตี้ยกว่าสินค้า']) {
    assert.match(form, new RegExp(message))
  }
  assert.match(form, /const physicalErrors = physicalValidationErrors\(data\)/)
  assert.match(form, /setPhysicalTab\('box'\)/)
  assert.ok(form.indexOf('const physicalErrors = physicalValidationErrors(data)') < form.indexOf("commandType: 'product.create_with_initial_sku'"))
})

test('R7.2.3E preserves the existing physical payload and command boundary', async () => {
  const form = await read(formPath)
  for (const key of ['product_weight_kg', 'product_length_cm', 'product_width_cm', 'product_height_cm', 'package_weight_kg', 'package_length_cm', 'package_width_cm', 'package_height_cm']) {
    assert.match(form, new RegExp(`${key}: optionalNumber`))
  }
  assert.match(form, /commandType: 'product\.create_with_initial_sku'/)
  assert.doesNotMatch(form, /commandType: 'sku\.profile\.upsert'/)
})

test('R7.2.3E applies approved tab, panel, note and responsive styles', async () => {
  const styles = await read('../src/app/globals.css')
  assert.match(styles, /\.product-physical-tabs \{[^}]*display: inline-flex/)
  assert.match(styles, /\.product-physical-tab\[aria-selected="true"\]/)
  assert.match(styles, /\.product-physical-panel\[hidden\] \{ display: none; \}/)
  assert.match(styles, /\.product-inline-note\.warning/)
  assert.match(styles, /@media \(max-width: 760px\)[\s\S]*\.product-physical-tabs \{ width: 100%; \}/)
})

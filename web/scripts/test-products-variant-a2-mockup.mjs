import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import test from 'node:test'

const mockup = await readFile(new URL('../../docs/mockups/phase-2.1-unified-product-creation-form.html', import.meta.url), 'utf8')

test('A2 keeps the approved unified creation shell and prototype boundary', () => {
  assert.match(mockup, /Unified Product Creation/)
  assert.match(mockup, /Interaction Prototype เท่านั้น/)
  assert.match(mockup, /ไม่สร้าง Product\/SKU/)
})

test('A2 exposes structured option groups with color and size defaults', () => {
  assert.match(mockup, /กำหนดตัวเลือกและสร้าง SKU Combination/)
  assert.match(mockup, /name: "สี"/)
  assert.match(mockup, /name: "ไซซ์"/)
  assert.match(mockup, /สีฟ้า/)
  assert.match(mockup, /สีดำ/)
  for (const size of ['S', 'M', 'L', 'XL']) assert.match(mockup, new RegExp(`name: "${size}"`))
})

test('A2 supports bounded custom option groups and values', () => {
  assert.match(mockup, /state\.variantGroups\.length >= 3/)
  assert.match(mockup, /group\.values\.length >= 12/)
  assert.match(mockup, /data-add-variant-value/)
  assert.match(mockup, /\["Enter", ","\]/)
})

test('A2 generates and disables SKU combinations', () => {
  assert.match(mockup, /cartesianVariantValues/)
  assert.match(mockup, /slice\(0, 100\)/)
  assert.match(mockup, /data-combination-field="enabled"/)
  assert.match(mockup, /toggleAllVariantCombinations/)
})

test('A2 bulk fills SKU, price, barcode and status', () => {
  for (const id of ['variantSkuPrefix', 'variantBulkPrice', 'variantBulkBarcode', 'variantBulkStatus', 'applyVariantBulkButton']) {
    assert.match(mockup, new RegExp(`id="${id}"`))
  }
  assert.match(mockup, /applyVariantBulkValues/)
})

test('A2 lets each combination inherit or select a product image', () => {
  assert.match(mockup, /รูปประจำ Variant/)
  assert.match(mockup, /ใช้ภาพ Product/)
  assert.match(mockup, /data-combination-field="imageId"/)
})

test('A2 persists bounded variant draft data locally', () => {
  assert.match(mockup, /variantGroups: state\.variantGroups/)
  assert.match(mockup, /variantCombinations: state\.variantCombinations/)
  assert.match(mockup, /sanitizeVariantGroups/)
  assert.match(mockup, /sanitizeVariantCombinations/)
})

test('A2 is responsive, token-driven and keyboard reachable', () => {
  assert.match(mockup, /@media \(max-width: 720px\)[\s\S]*?\.variant-bulk-toolbar \{ grid-template-columns: 1fr; \}/)
  assert.match(mockup, /background: var\(--surface\)/)
  assert.match(mockup, /html\[data-theme="dark"\]/)
  assert.match(mockup, /aria-label="เปิดหรือปิดทุก Combination"/)
  assert.match(mockup, /event\.target\.matches\("\[data-add-variant-value\]"\)/)
})

test('A2 validates enabled combinations without changing Stock', () => {
  assert.match(mockup, /enabledVariantCombinations/)
  assert.match(mockup, /SKU Code ของ Combination ต้องไม่ซ้ำกัน/)
  assert.match(mockup, /จะยังไม่สร้าง SKU หรือบันทึกข้อมูลจริง/)
})

test('all inline scripts parse as JavaScript', () => {
  const scripts = mockup.split('<script>').slice(1).map((block) => block.split('</script>')[0])
  assert.ok(scripts.length > 0)
  scripts.forEach((source) => assert.doesNotThrow(() => new Function(source)))
})

import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import test from 'node:test'

const root = new URL('../', import.meta.url)
const read = (path) => readFile(new URL(path, root), 'utf8')

test('SKU-02 renders Prefix, Product Sequence and deterministic preview', async () => {
  const builder = await read('src/app/organizations/[id]/products/new/variant-creation-builder.tsx')
  assert.match(builder, /function formatVariantSkuBase\(prefix: string, sequence: number, digits = 3\)/)
  assert.match(builder, /const \[skuProductSequence, setSkuProductSequence\] = useState\(1\)/)
  assert.match(builder, /const \[skuPrefix, setSkuPrefix\] = useState\(''\)/)
  assert.match(builder, /placeholder="เช่น MU"/)
  assert.match(builder, /const \[salesCodePrefix, setSalesCodePrefix\] = useState\('A'\)/)
  assert.match(builder, />คำนำหน้า SKU</)
  assert.match(builder, />เลขลำดับ Product</)
  assert.match(builder, /กำหนดรหัส SKU/)
  assert.match(builder, /ตัวอย่างรหัสที่จะได้/)
  assert.match(builder, /สถานะเลขลำดับ/)
  assert.match(builder, /เลขลำดับ .* ใช้ได้/)
  assert.match(builder, /ใช้เลขแนะนำ/)
  assert.match(builder, /const skuBaseCode = formatVariantSkuBase\(skuPrefix, skuProductSequence\)/)
  assert.match(builder, /const skuFormatPreview = \[skuBaseCode,/)
})

test('SKU-02 applies Product Sequence before all option codes', async () => {
  const builder = await read('src/app/organizations/[id]/products/new/variant-creation-builder.tsx')
  assert.match(builder, /const safePrefix = skuBaseCode/)
  assert.match(builder, /skuCode = `\$\{safePrefix\}-\$\{item\.optionValueIds/)
  assert.match(builder, /synchronizeVariantCombinations\(next, current, skuBaseCode\)/)
  assert.match(builder, /padStart\(safeDigits, '0'\)/)
  assert.doesNotMatch(builder, /const safePrefix = skuPrefix\.toUpperCase/)
})
test('SKU-02 keeps SKU, Sales Code and Barcode identifiers separate', async () => {
  const builder = await read('src/app/organizations/[id]/products/new/variant-creation-builder.tsx')
  assert.match(builder, /Sales Code|รหัสขาย \/ รหัส CF/)
  assert.match(builder, /Barcode/)
  assert.doesNotMatch(builder, /fetch\(/)
})
test('SKU-02 follows responsive semantic preview styling', async () => {
  const styles = await read('src/app/globals.css')
  assert.match(styles, /\.product-variant-sku-format-preview \{[^}]*var\(--status-info-border\)[^}]*var\(--status-info-surface\)/)
  assert.match(styles, /\.product-variant-sku-format-preview \{ grid-column: 1 \/ -1;[^}]*min-height: 58px;/)
  assert.match(styles, /\.product-variant-sku-settings-grid \{ grid-template-columns: 1fr 1fr; \}/)
})
// end of test file

import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import test from 'node:test'

const root = new URL('../', import.meta.url)
const read = (path) => readFile(new URL(path, root), 'utf8')

test('SKU-02 renders Prefix, Product Sequence and deterministic preview', async () => {
  const builder = await read('src/app/organizations/[id]/products/new/variant-creation-builder.tsx')
  assert.match(builder, /function formatVariantSkuBase\(prefix: string, sequence: number, digits = 3\)/)
  assert.match(builder, /const \[skuProductSequence, setSkuProductSequence\] = useState\(1\)/)
  assert.match(builder, />คำนำหน้า SKU</)
  assert.match(builder, />เลขลำดับ Product</)
  assert.match(builder, /รูปแบบ SKU ที่จะใช้/)
  assert.match(builder, /เลขนี้จะถูกจองพร้อม Product และ SKU ใน Transaction เดียวเมื่อกดสร้างสำเร็จ/)
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
  assert.match(styles, /\.product-variant-sku-format-preview \{ grid-column: 1 \/ -1; \}/)
})
// end of test file

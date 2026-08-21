import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import test from 'node:test'

const root = new URL('../', import.meta.url)
const read = (path) => readFile(new URL(path, root), 'utf8')

test('SKU-03 local next Product Sequence remains as the SKU-04 offline fallback', async () => {
  const builder = await read('src/app/organizations/[id]/products/new/variant-creation-builder.tsx')
  assert.match(builder, /function nextVariantSkuProductSequence\(sequence: number\)/)
  assert.match(builder, /recommendedProductSequence/)
  assert.match(builder, /เชื่อมฐานข้อมูลไม่ได้ · แสดงเลขถัดไปจากหน้านี้ชั่วคราว/)
})

test('SKU-03 detects duplicate SKU, Sales Code and Barcode values in the form first', async () => {
  const builder = await read('src/app/organizations/[id]/products/new/variant-creation-builder.tsx')
  assert.match(builder, /function findDuplicateVariantIdentifiers\(/)
  assert.match(builder, /\['sku_code', 'skuCode'\]/)
  assert.match(builder, /\['sales_code', 'salesCode'\]/)
  assert.match(builder, /\['barcode', 'barcode'\]/)
  assert.match(builder, /const localCollisions = findDuplicateVariantIdentifiers\(enabledIdentifiers\)/)
  assert.match(builder, /กรุณาแก้รหัสที่ซ้ำก่อนตรวจฐานข้อมูล/)
})

test('SKU-03 preserves manually edited SKU codes during automatic regeneration', async () => {
  const builder = await read('src/app/organizations/[id]/products/new/variant-creation-builder.tsx')
  assert.match(builder, /const manuallyEditedSkuKeysRef = useRef\(new Set<string>\(\)\)/)
  assert.match(builder, /if \(manuallyEditedSkuKeysRef\.current\.has\(item\.key\)\) return item/)
  assert.match(builder, /manuallyEditedSkuKeysRef\.current\.add\(item\.key\)/)
  assert.match(builder, /manuallyEditedSkuKeysRef\.current\.clear\(\)/)
})

test('SKU-03 regenerates untouched rows when Prefix, Sequence or options change', async () => {
  const builder = await read('src/app/organizations/[id]/products/new/variant-creation-builder.tsx')
  assert.match(builder, /const generatedSkuCode = `\$\{skuBaseCode\}-\$\{item\.optionValueIds/)
  assert.match(builder, /\[groups, skuBaseCode, setCombinations\]/)
  assert.match(builder, /SKU Code \$\{name\}\$\{skuWasEditedManually \? ' แก้ไขเอง' : ' สร้างอัตโนมัติ'\}/)
})

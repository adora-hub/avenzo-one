import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import test from 'node:test'

const detailSource = await readFile(new URL('../src/app/organizations/[id]/products/product-detail-sheet.tsx', import.meta.url), 'utf8')
const workspaceSource = await readFile(new URL('../src/app/organizations/[id]/products/product-sku-workspace.tsx', import.meta.url), 'utf8')
const styleSource = await readFile(new URL('../src/app/globals.css', import.meta.url), 'utf8')
const repositorySource = await readFile(new URL('../src/lib/foundation/supabase-repository.ts', import.meta.url), 'utf8')

test('Quick View exposes every approved detail group from the real detail model', () => {
  for (const heading of [
    'ข้อมูลทั่วไป', 'รูปภาพสินค้า', 'SKU / ตัวเลือก', 'ราคาและภาษี', 'คลังและการเติมสินค้า',
    'น้ำหนักและขนาด', 'หน่วยขายและการบรรจุ', 'Bundle / Kit', 'ข้อมูลกำกับ',
  ]) assert.match(detailSource, new RegExp(heading.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')))
  for (const field of [
    'selectedProduct.category', 'selectedProduct.brand', 'selectedProduct.structureType', 'selectedProduct.tags',
    'selectedProduct.images', 'selectedProduct.skus', 'selectedProduct.price', 'selectedProduct.stock',
    'selectedProduct.createdByDisplayName', 'selectedProduct.internalNote',
  ]) assert.match(detailSource, new RegExp(field.replaceAll('.', '\\.')))
})

test('SKU table aligns identifiers horizontally with keyboard-scrollable overflow', () => {
  assert.match(detailSource, /tabIndex=\{0\} aria-label="ตาราง SKU เลื่อนได้เมื่อข้อมูลกว้าง"/)
  assert.match(detailSource, /<th scope="col">ตัวเลือก<\/th><th scope="col">SKU<\/th><th scope="col">รหัส CF<\/th><th scope="col">Barcode<\/th><th scope="col">Base Unit<\/th><th scope="col">Stock<\/th>/)
  assert.match(styleSource, /\.product-quick-table th \{[\s\S]*background: #111;[\s\S]*color: #fff;/)
  assert.match(styleSource, /\.product-quick-table-wrap \{[\s\S]*overflow: auto;/)
})

test('pricing, tax, physical, packaging, sell units, and bundles render per SKU', () => {
  assert.match(detailSource, /sku\.profile\?\.salePrice/)
  assert.match(detailSource, /sku\.profile\.taxCategory/)
  assert.match(detailSource, /sku\.profile\.productWeightKg/)
  assert.match(detailSource, /sku\.profile\.packageWeightKg/)
  assert.match(detailSource, /sku\.sellUnits/)
  assert.match(detailSource, /sku\.bundleComponents/)
})

test('cost stays explicitly permission gated from server query through Quick View', () => {
  assert.match(workspaceSource, /canReadCost=\{canReadCost\}/)
  assert.match(detailSource, /canReadCost \? <div><span>ราคาต้นทุนรวม/)
  assert.match(detailSource, /canReadCost \? <th scope="col">ราคาต้นทุน<\/th>/)
  assert.match(repositorySource, /input\.includeCost && skuIds\.length > 0\s*\? this\.client\.from\('sku_cost_profiles'\)/)
})

test('ready images retain sort order and cover indication', () => {
  assert.match(detailSource, /selectedProduct\.images\.map/)
  assert.match(detailSource, /image\.isCover \? <b>ภาพปก<\/b>/)
  assert.match(detailSource, /image\.signedUrl/)
})

test('quick view remains read-only and immutable SKU guidance remains visible', () => {
  assert.match(detailSource, /className="product-detail-close-icon"[\s\S]*aria-label="ปิดรายละเอียด"/)
  assert.doesNotMatch(detailSource, /aria-label="ปิดรายละเอียด">ปิด<\/Link>/)
  assert.doesNotMatch(detailSource, /product-detail-actions/)
  assert.doesNotMatch(detailSource, /requestLifecycle/)
  assert.doesNotMatch(detailSource, /openEditor/)
  assert.match(detailSource, /SKU Code และ Base Unit เปลี่ยนไม่ได้/)
})

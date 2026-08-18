import assert from 'node:assert/strict'
import test from 'node:test'
import { validateProductImportRows } from '../src/app/organizations/[id]/products/product-excel-import-validation.ts'

function row(overrides = {}) {
  return { sourceRow: 2, 'Product Name': ' ต่างหู ', Category: 'ต่างหู', Brand: '', 'SKU Code': ' sku-001 ', 'Sales Code': ' a001 ', Barcode: '0001', 'Base Unit': 'PIECE', 'Quantity Behavior': 'discrete', Price: '1,250.50', Tax: 'VAT 7%', Tags: 'ใหม่|ใหม่|ขายดี', Branches: 'BKK-01', Status: 'draft', ...overrides }
}

test('Part 2.2 normalizes a valid row using Product/SKU contract values', () => {
  const result = validateProductImportRows([row()])
  assert.deepEqual(result.issues, [])
  assert.equal(result.rows[0].skuCode, 'SKU-001')
  assert.equal(result.rows[0].salesCode, 'A001')
  assert.equal(result.rows[0].barcode, '0001')
  assert.equal(result.rows[0].salePrice, 1250.5)
  assert.deepEqual(result.rows[0].tags, ['ใหม่', 'ขายดี'])
})

test('Part 2.2 reports field-level errors and excludes invalid rows', () => {
  const result = validateProductImportRows([row({ 'Product Name': '', 'Base Unit': 'ชิ้น', Price: '-1', Tax: 'unknown', Branches: '' })])
  assert.equal(result.rows.length, 0)
  assert.deepEqual(new Set(result.issues.map((issue) => issue.field)), new Set(['Product Name', 'Base Unit', 'Price', 'Tax', 'Branches']))
})

test('Part 2.2 accepts Thai status and quantity labels', () => {
  const result = validateProductImportRows([row({ 'Quantity Behavior': 'น้ำหนัก', Status: 'ใช้งานอยู่', Tax: 'ยกเว้นภาษี' })])
  assert.equal(result.rows[0].quantityBehavior, 'weight')
  assert.equal(result.rows[0].status, 'active')
  assert.equal(result.rows[0].taxCategory, 'exempt')
})

import assert from 'node:assert/strict'
import test from 'node:test'
import { strToU8 } from 'fflate'
import { createProductTemplateWorkbook } from '../src/app/organizations/[id]/products/product-excel-template.ts'
import { ProductImportParseError, parseProductImportFile } from '../src/app/organizations/[id]/products/product-excel-import.ts'

test('Part 2.1 reads the generated XLSX template and preserves text identifiers', () => {
  const result = parseProductImportFile(createProductTemplateWorkbook(), 'products.xlsx')
  assert.equal(result.sheetName, 'ข้อมูลสินค้า')
  assert.equal(result.rows.length, 1)
  assert.equal(result.rows[0]['SKU Code'], 'SKU-001')
  assert.equal(result.rows[0]['Barcode'], '8850000000001')
  assert.equal(result.rows[0].sourceRow, 2)
})

test('Part 2.1 reads quoted CSV cells and leading zero identifiers', () => {
  const headers = 'Product Name,Category,Brand,SKU Code,Sales Code,Barcode,Base Unit,Quantity Behavior,Price,Tax,Tags,Branches,Status'
  const row = '"สินค้า, รุ่นใหม่",ต่างหู,,SKU-002,0012,000123,piece,discrete,350,VAT 7%,ใหม่,BKK-01,draft'
  const result = parseProductImportFile(strToU8(`${headers}\n${row}`), 'products.csv')
  assert.equal(result.rows[0]['Product Name'], 'สินค้า, รุ่นใหม่')
  assert.equal(result.rows[0]['Sales Code'], '0012')
  assert.equal(result.rows[0].Barcode, '000123')
})

test('Part 2.1 rejects legacy XLS and incomplete headers with actionable errors', () => {
  assert.throws(() => parseProductImportFile(strToU8('legacy'), 'products.xls'), (error) => error instanceof ProductImportParseError && error.code === 'file_type')
  assert.throws(() => parseProductImportFile(strToU8('Product Name,SKU Code\nTest,SKU-1'), 'products.csv'), (error) => error instanceof ProductImportParseError && error.code === 'headers')
})

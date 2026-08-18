import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import test from 'node:test'

const sourceUrl = new URL('../src/app/organizations/[id]/products/products-data-grid.tsx', import.meta.url)
const cssUrl = new URL('../src/app/globals.css', import.meta.url)

test('Excel import Phase 1 remains a local-only, accessible five-part UI flow', async () => {
  const [source, css] = await Promise.all([
    readFile(sourceUrl, 'utf8'),
    readFile(cssUrl, 'utf8'),
  ])

  assert.match(source, /role="dialog" aria-modal="true" aria-labelledby="product-excel-import-title"/)
  assert.match(source, /นำเข้าสินค้าด้วย Excel/)
  assert.match(source, /ดาวน์โหลด Template/)
  assert.match(source, /อัปเดตข้อมูลเดิม/)
  assert.match(source, /ข้ามรายการที่ซ้ำ/)
  assert.match(source, /รองรับ \.xlsx, \.xls และ \.csv ขนาดไม่เกิน 10 MB/)
  assert.match(source, /UI Preview เท่านั้น · ไม่ได้อ่านเนื้อหาไฟล์และยังไม่นำข้อมูลเข้าระบบ/)
  assert.match(source, /ยืนยันแบบจำลอง/)
  assert.match(source, /ไม่มีข้อมูลสินค้า สต็อก หรือฐานข้อมูลถูกเปลี่ยนแปลง/)
  assert.match(source, /excelImportStep === 'setup'/)
  assert.match(source, /excelImportStep === 'preview'/)
  assert.doesNotMatch(source, /function importProductsFromExcel|executeExcelImport|uploadExcelImport/)

  assert.match(css, /\.product-excel-import-dialog\s*\{/)
  assert.match(css, /\.product-excel-import-dialog > footer/)
  assert.match(css, /\.product-excel-import-preview-table table/)
  assert.match(css, /@media \(max-width: 640px\)/)
})

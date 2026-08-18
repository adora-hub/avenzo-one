import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import test from 'node:test'

const dialogUrl = new URL('../src/app/organizations/[id]/products/product-excel-import-dialog-live.tsx', import.meta.url)
const gridUrl = new URL('../src/app/organizations/[id]/products/products-data-grid.tsx', import.meta.url)
const cssUrl = new URL('../src/app/globals.css', import.meta.url)

test('Excel import is an accessible live workflow that preserves the approved Phase 1 design', async () => {
  const [dialog, grid, css] = await Promise.all([
    readFile(dialogUrl, 'utf8'),
    readFile(gridUrl, 'utf8'),
    readFile(cssUrl, 'utf8'),
  ])

  assert.match(grid, /<ProductExcelImportDialogLive/)
  assert.match(dialog, /role="dialog" aria-modal="true" aria-labelledby="product-excel-import-title"/)
  assert.match(dialog, /นำเข้าสินค้าด้วย Excel/)
  assert.match(dialog, /ดาวน์โหลด Template/)
  assert.match(dialog, /รองรับ \.xlsx และ \.csv ขนาดไม่เกิน 10 MB/)
  assert.match(dialog, /ตรวจสอบไฟล์/)
  assert.match(dialog, /ยืนยันนำเข้า/)
  assert.match(dialog, /ขั้นตอนนี้ไม่เขียน Stock/)
  assert.match(dialog, /step === 'setup'/)
  assert.match(dialog, /step === 'preview'/)
  assert.match(dialog, /step === 'importing'/)
  assert.match(dialog, /step === 'complete'/)

  assert.match(css, /\.product-excel-import-dialog\s*\{/)
  assert.match(css, /\.product-excel-import-dialog > footer/)
  assert.match(css, /\.product-excel-import-preview-table table/)
  assert.match(css, /@media \(max-width: 640px\)/)
})
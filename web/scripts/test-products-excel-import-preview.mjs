import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import test from 'node:test'

const source = await readFile(new URL('../src/app/organizations/[id]/products/product-excel-import-dialog-live.tsx', import.meta.url), 'utf8')

test('Part 2.4 preview parses and validates the selected file', () => {
  assert.match(source, /file\.arrayBuffer\(\)/)
  assert.match(source, /parseProductImportFile/)
  assert.match(source, /validateProductImportRows/)
  assert.match(source, /findProductImportFileDuplicates/)
})

test('Part 2.4 checks organization identifiers before showing preview', () => {
  assert.match(source, /checkProductImportIdentifiersAction/)
  assert.match(source, /existing: new Set/)
  assert.match(source, /พร้อมเพิ่ม/)
  assert.match(source, /รหัสขัดแย้ง/)
  assert.match(source, /ต้องแก้รหัสซ้ำก่อนนำเข้า/)
  assert.match(source, /ระบบจะสร้าง Sales Code อัตโนมัติ/)
  assert.match(source, /proposedSalesCodeRange/)
})

test('Part 2.4 shows preview before the user confirms import', () => {
  assert.match(source, /step === 'preview'/)
  assert.match(source, /ยังไม่บันทึกฐานข้อมูล/)
  assert.match(source, /ยืนยันนำเข้า/)
})

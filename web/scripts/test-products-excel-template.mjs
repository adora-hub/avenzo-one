import assert from 'node:assert/strict'
import test from 'node:test'
import { strFromU8, unzipSync } from 'fflate'
import { createProductTemplateWorkbook } from '../src/app/organizations/[id]/products/product-excel-template.ts'

test('product template is a two-sheet xlsx workbook with a Thai guide', () => {
  const workbook = createProductTemplateWorkbook()
  const files = unzipSync(workbook)
  const workbookXml = strFromU8(files['xl/workbook.xml'])
  const guideXml = strFromU8(files['xl/worksheets/sheet2.xml'])

  assert.match(workbookXml, /sheet name="ข้อมูลสินค้า"/)
  assert.match(workbookXml, /sheet name="คู่มือภาษาไทย"/)
  assert.match(guideXml, /คำแปลภาษาไทย/)
  assert.match(guideXml, /รหัสขาย \/ รหัส CF/)
  assert.match(guideXml, /draft = ฉบับร่าง/)
  assert.ok(files['xl/styles.xml'])
})

import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import test from 'node:test'

const source = await readFile(new URL('../src/app/organizations/[id]/products/product-excel-import-dialog-live.tsx', import.meta.url), 'utf8')

test('GSC-07 imports sequential all-or-nothing batches of at most 50 rows and reports progress', () => {
  assert.match(source, /index \+= 50/)
  assert.match(source, /readyRows\.slice\(index, index \+ 50\)/)
  assert.match(source, /batchCommandId:/)
  assert.match(source, /ชุดที่ไม่สำเร็จถูกย้อนกลับทั้งหมด/)
  assert.match(source, /setProcessed/)
  assert.match(source, /<progress/)
  assert.match(source, /aria-live="polite"/)
})

test('Part 2.6 shows created skipped and failed totals', () => {
  assert.match(source, /สร้างสำเร็จ/)
  assert.match(source, /ข้ามรายการเดิม/)
  assert.match(source, /ไม่สำเร็จ/)
  assert.match(source, /router\.refresh\(\)/)
})

test('Part 2.6 exports a UTF-8 CSV report for failures and warnings', () => {
  assert.match(source, /downloadErrorReport/)
  assert.match(source, /\\uFEFF/)
  assert.match(source, /avenzo-product-import-report\.csv/)
})

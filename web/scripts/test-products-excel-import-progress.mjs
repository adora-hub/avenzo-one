import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import test from 'node:test'

const source = await readFile(new URL('../src/app/organizations/[id]/products/product-excel-import-dialog-live.tsx', import.meta.url), 'utf8')

test('Part 2.6 imports sequential batches of at most 25 rows and reports progress', () => {
  assert.match(source, /index \+= 25/)
  assert.match(source, /readyRows\.slice\(index, index \+ 25\)/)
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

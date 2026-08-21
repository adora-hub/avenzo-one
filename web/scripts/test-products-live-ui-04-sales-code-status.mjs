import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import test from 'node:test'

const root = new URL('../', import.meta.url)
const read = (path) => readFile(new URL(path, root), 'utf8')

test('Live-UI-04 renders the complete Sales Code status table', async () => {
  const ui = await read('src/app/organizations/[id]/products/live-sale/live-sale-reservation-ui.tsx')
  for (const text of ['สถานะรหัสในชุด', 'รหัสขาย', 'รหัสถัดไป', 'ใช้แล้ว', 'จองไว้', 'ข้าม', 'ดำเนินการ']) {
    assert.match(ui, new RegExp(text))
  }
  assert.match(ui, /reservationCodes\.map/)
  assert.match(ui, /live-sale-code-table/)
})

test('Live-UI-04 searches and filters codes without backend access', async () => {
  const ui = await read('src/app/organizations/[id]/products/live-sale/live-sale-reservation-ui.tsx')
  assert.match(ui, /ค้นหารหัสหรือชื่อสินค้า/)
  assert.match(ui, /setCodeFilter/)
  assert.match(ui, /filteredCodeRows/)
  assert.match(ui, /ทุกสถานะ/)
  assert.doesNotMatch(ui, /createClient|createServerClient|supabase|fetch\(|server action|use server/)
})

test('Live-UI-04 skip and restore behavior advances the local next code', async () => {
  const ui = await read('src/app/organizations/[id]/products/live-sale/live-sale-reservation-ui.tsx')
  assert.match(ui, /function skipSalesCode/)
  assert.match(ui, /function restoreSalesCode/)
  assert.match(ui, /!quickItemByCode\.has\(code\) && !skippedCodeSet\.has\(code\)/)
  assert.match(ui, /ข้ามรหัส/)
  assert.match(ui, /นำกลับมาใช้/)
})

test('Live-UI-04 follows the shared table and responsive standards', async () => {
  const css = await read('src/app/globals.css')
  assert.match(css, /\.live-sale-code-table-wrap \{[^}]*overflow: auto[^}]*border: 1px solid/s)
  assert.match(css, /\.live-sale-code-table th \{[^}]*position: sticky[^}]*background: #0c0f12/s)
  assert.match(css, /\.live-sale-code-table th, \.live-sale-code-table td \{[^}]*border-right:[^}]*border-bottom:/s)
  assert.match(css, /@media \(max-width: 600px\)[\s\S]*\.live-sale-code-status-toolbar \{ grid-template-columns: 1fr;/)
})

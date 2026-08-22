import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import test from 'node:test'

const tablePath = new URL('../src/app/organizations/[id]/products/live-sale/rapid-entry/rapid-entry-table.tsx', import.meta.url)
const stylesPath = new URL('../src/app/globals.css', import.meta.url)

test('Rapid-UI-08 ignores untouched rows and requires price and stock for active rows', async () => {
  const source = await readFile(tablePath, 'utf8')
  assert.match(source, /function rowHasEntry\(row: RapidRowDraft\)/)
  assert.match(source, /if \(!rowHasEntry\(row\)\) return \[\]/)
  assert.match(source, /field === 'price' && !row\.price/)
  assert.match(source, /field === 'stock' && !row\.stock/)
})

test('Rapid-UI-08 exposes clear empty, invalid, ready and selected-ready row states', async () => {
  const source = await readFile(tablePath, 'utf8')
  assert.match(source, /label: 'ยังไม่กรอก'/)
  assert.match(source, /label: 'ต้องแก้ไข'/)
  assert.match(source, /label: 'พร้อมสร้าง'/)
  assert.match(source, /label: 'เลือกพร้อมสร้าง'/)
  assert.match(source, /className: 'is-selected-ready'/)
})

test('Rapid-UI-08 provides validation counters and error navigation', async () => {
  const source = await readFile(tablePath, 'utf8')
  const styles = await readFile(stylesPath, 'utf8')
  assert.match(source, /live-sale-rapid-section-title[\s\S]*aria-hidden="true">4<\/span>[\s\S]*ตรวจสอบก่อนสร้าง/)
  assert.match(source, /เลือกเฉพาะรายการพร้อมสร้าง/)
  assert.match(source, /ตรวจและสร้างรายการ/)
  assert.match(styles, /\.live-sale-rapid-validation-actions\s*>\s*button\s*\{[^}]*height:\s*42px;[^}]*min-height:\s*42px;/s)
  assert.match(source, /ไปยังจุดแรกที่ต้องแก้/)
  assert.match(source, /scrollIntoView\(\{ block: 'center', inline: 'center', behavior: 'smooth' \}\)/)
  assert.match(styles, /\.live-sale-rapid-validation-summary/)
  assert.match(styles, /\.live-sale-rapid-validation-counters/)
})

test('Rapid-UI-08 previews only selected ready rows and does not claim partial success', async () => {
  const source = await readFile(tablePath, 'utf8')
  assert.match(source, /const selectedReadyRows = selectedRows\.filter\(\(row\) => rowIsReady\(row, categoryOptions\)\)/)
  assert.match(source, /ตัวอย่างก่อนส่งสร้าง/)
  assert.match(source, /พร้อมส่งต่อ \{selectedReadyRows\.length\} รายการ/)
  assert.match(source, /แถวว่างจะไม่ถูกนำมารวมในขั้นตอนนี้/)
  assert.match(source, /ไม่มีรายการสำเร็จบางส่วน/)
  assert.doesNotMatch(source, /status:\s*['"]partial['"]/)
})

test('Rapid-UI-08 sends writes only through authenticated server actions', async () => {
  const source = await readFile(tablePath, 'utf8')
  assert.match(source, /executeGlobalSalesCodeCreationAction/)
  assert.match(source, /executeRapidInitialStockWorkflowAction/)
  assert.doesNotMatch(source, /fetch\(|supabase|\.insert\(|\.update\(|\.rpc\(/)
})

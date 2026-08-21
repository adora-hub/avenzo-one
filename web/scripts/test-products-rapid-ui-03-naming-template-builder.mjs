import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import test from 'node:test'

const root = new URL('../', import.meta.url)
const read = (path) => readFile(new URL(path, root), 'utf8')

test('Rapid-UI-03 connects the selected Prefix range to the Naming Template Builder', async () => {
  const setup = await read('src/app/organizations/[id]/products/live-sale/rapid-entry/rapid-entry-setup-workspace.tsx')
  const prefix = await read('src/app/organizations/[id]/products/live-sale/rapid-entry/rapid-prefix-assistant.tsx')
  assert.match(setup, /useState<RapidRangeSelection \| null>/)
  assert.match(setup, /<RapidPrefixAssistant canManage=\{editorEnabled\} onRangeSelect=\{handleRangeSelect\}/)
  assert.match(setup, /<RapidNamingTemplateBuilder selectedRange=\{selectedRange\}/)
  assert.match(prefix, /onRangeSelect\?\.\(suggestion\)/)
})

test('Rapid-UI-03 provides all approved naming presets and tokens', async () => {
  const builder = await read('src/app/organizations/[id]/products/live-sale/rapid-entry/rapid-naming-template-builder.tsx')
  for (const label of ['ใช้รหัสอย่างเดียว', 'ชื่อ Live + รหัส', 'Campaign + รหัส', 'กำหนดรูปแบบเอง']) assert.match(builder, new RegExp(label.replace('+', '\\+')))
  for (const token of ['{code}', '{campaign}', '{date}', '{branch}', '{seller}']) assert.match(builder, new RegExp(token.replace(/[{}]/g, '\\$&')))
  assert.match(builder, /useState<NamingPreset>\('campaign-code'\)/)
})

test('Rapid-UI-03 enforces the code token and previews first three plus final names', async () => {
  const builder = await read('src/app/organizations/[id]/products/live-sale/rapid-entry/rapid-naming-template-builder.tsx')
  assert.match(builder, /if \(trimmed\.includes\('\{code\}'\)\) return trimmed/)
  assert.match(builder, /return `\$\{trimmed\}-\{code\}`/)
  assert.match(builder, /selectedRange\.start \+ 1, selectedRange\.start \+ 2, selectedRange\.end/)
  assert.match(builder, /แสดง 3 รายการแรกและรายการสุดท้าย/)
})

test('Rapid-UI-03 validates bounded names and explains manual row override safety', async () => {
  const builder = await read('src/app/organizations/[id]/products/live-sale/rapid-entry/rapid-naming-template-builder.tsx')
  assert.match(builder, /MAX_PRODUCT_NAME_LENGTH = 120/)
  assert.match(builder, /duplicateCount/)
  assert.match(builder, /แก้ไขเฉพาะรายการ/)
  assert.match(builder, /จะไม่ถูก Template ใหม่เขียนทับโดยไม่ถาม/)
  assert.doesNotMatch(builder, /fetch\(|supabase|executeFoundationCommandAction/)
})

test('Rapid-UI-03 follows accessible radio and semantic Design System states', async () => {
  const builder = await read('src/app/organizations/[id]/products/live-sale/rapid-entry/rapid-naming-template-builder.tsx')
  const styles = await read('src/app/globals.css')
  assert.match(builder, /<fieldset className="live-sale-naming-presets"/)
  assert.match(builder, /type="radio" name="rapidNamingPreset"/)
  assert.match(builder, /role="alert"/)
  assert.match(styles, /\.live-sale-naming-presets label\.is-selected \{[^}]*var\(--focus-ring\)/)
  assert.match(styles, /\.live-sale-naming-error \{[^}]*var\(--status-danger-border\)/)
})

test('Rapid-UI-10A keeps naming labels and important guidance on one line', async () => {
  const builder = await read('src/app/organizations/[id]/products/live-sale/rapid-entry/rapid-naming-template-builder.tsx')
  assert.match(builder, /live-sale-rapid-section-title[\s\S]*aria-hidden="true">2<[\s\S]*ตั้งชื่อสินค้า/)
  assert.match(builder, /<legend><span>รูปแบบชื่อสินค้า <b>\*<\/b><\/span><RapidInfoHint/)
  assert.match(builder, /live-sale-rapid-field-label[\s\S]*ชื่อ Live \/ Campaign <b>\*<\/b>[\s\S]*RapidInfoHint/)
  assert.doesNotMatch(builder, /ขั้นตอนที่ 2 · ตั้งชื่อสินค้า/)
})

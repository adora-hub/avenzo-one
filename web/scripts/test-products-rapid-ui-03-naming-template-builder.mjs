import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import test from 'node:test'

const root = new URL('../', import.meta.url)
const read = (path) => readFile(new URL(path, root), 'utf8')

test('Rapid-UI-03 connects the selected Prefix range to the Naming Template Builder', async () => {
  const setup = await read('src/app/organizations/[id]/products/live-sale/rapid-entry/rapid-entry-setup-workspace.tsx')
  const prefix = await read('src/app/organizations/[id]/products/live-sale/rapid-entry/rapid-prefix-assistant.tsx')
  assert.match(setup, /useState<RapidRangeSelection \| null>/)
  assert.match(setup, /<RapidPrefixAssistant organizationId=\{organizationId\} canManage=\{editorEnabled\} reservedRange=\{selectedRange\} onRangeSelect=\{handleRangeSelect\}/)
  assert.match(setup, /<RapidNamingTemplateBuilder selectedRange=\{selectedRange\}/)
  assert.match(prefix, /onRangeSelect\?\.\(reservedRange\)/)
})

test('Rapid-UI-03 provides all approved naming presets and tokens', async () => {
  const builder = await read('src/app/organizations/[id]/products/live-sale/rapid-entry/rapid-naming-template-builder.tsx')
  for (const label of ['ใช้รหัสอย่างเดียว', 'ชื่อ Live + รหัส', 'Campaign + รหัส', 'กำหนดรูปแบบเอง']) assert.match(builder, new RegExp(label.replace('+', '\\+')))
  for (const token of ['{code}', '{campaign}', '{date}', '{branch}', '{seller}']) assert.match(builder, new RegExp(token.replace(/[{}]/g, '\\$&')))
  assert.match(builder, /useState<NamingPreset>\('campaign-code'\)/)
})

test('Rapid-UI-03 enforces the code token while keeping bounded-name validation', async () => {
  const builder = await read('src/app/organizations/[id]/products/live-sale/rapid-entry/rapid-naming-template-builder.tsx')
  assert.match(builder, /if \(trimmed\.includes\('\{code\}'\)\) return trimmed/)
  assert.match(builder, /return `\$\{trimmed\}-\{code\}`/)
  assert.match(builder, /selectedRange\.start \+ 1, selectedRange\.start \+ 2, selectedRange\.end/)
  assert.match(builder, /MAX_PRODUCT_NAME_LENGTH = 120/)
})

test('Rapid-UI-03 validates bounded names without backend writes', async () => {
  const builder = await read('src/app/organizations/[id]/products/live-sale/rapid-entry/rapid-naming-template-builder.tsx')
  assert.match(builder, /MAX_PRODUCT_NAME_LENGTH = 120/)
  assert.match(builder, /duplicateCount/)
  assert.doesNotMatch(builder, /fetch\(|supabase|executeFoundationCommandAction/)
})

test('Rapid-UI-10C uses one accessible Combobox and removes redundant preview surfaces', async () => {
  const builder = await read('src/app/organizations/[id]/products/live-sale/rapid-entry/rapid-naming-template-builder.tsx')
  const styles = await read('src/app/globals.css')
  const combobox = await read('src/app/organizations/[id]/products/live-sale/rapid-entry/rapid-select-combobox.tsx')
  assert.match(builder, /<label className="live-sale-naming-mode-field" htmlFor="rapidNamingPreset">/)
  assert.match(builder, /<RapidSelectCombobox id="rapidNamingPreset"/)
  assert.match(combobox, /role="combobox"[\s\S]*aria-haspopup="listbox"[\s\S]*aria-expanded=\{open\}/)
  assert.match(combobox, /role="option" aria-selected=/)
  assert.match(builder, /role="alert"/)
  assert.match(styles, /\.rapid-select-combobox-trigger \{[^}]*height: 40px;[^}]*gap: 12px;[^}]*padding: 0 12px;/)
  assert.match(styles, /\.rapid-select-combobox-options \{[^}]*background: var\(--surface-elevated\);[^}]*box-shadow:/)
  assert.match(styles, /\[role="option"\]\[aria-selected="true"\][^}]*background: var\(--surface-subtle\)/)
  assert.match(styles, /\.live-sale-naming-builder \{[^}]*z-index: 4;[^}]*overflow: visible;/)
  assert.match(styles, /\.live-sale-naming-error \{[^}]*var\(--status-danger-border\)/)
  assert.doesNotMatch(builder, /Template ที่ระบบจะใช้/)
  assert.doesNotMatch(builder, /ตัวอย่างชื่อก่อนสร้างตาราง/)
  assert.doesNotMatch(builder, /live-sale-naming-preview/)
})

test('Rapid-UI-10A keeps naming labels and important guidance on one line', async () => {
  const builder = await read('src/app/organizations/[id]/products/live-sale/rapid-entry/rapid-naming-template-builder.tsx')
  assert.match(builder, /live-sale-rapid-section-title[\s\S]*aria-hidden="true">2<[\s\S]*ตั้งชื่อสินค้า/)
  assert.match(builder, /live-sale-rapid-field-label[\s\S]*รูปแบบชื่อสินค้า <b>\*<\/b>[\s\S]*RapidInfoHint/)
  assert.match(builder, /live-sale-rapid-field-label[\s\S]*ชื่อ Live \/ Campaign <b>\*<\/b>[\s\S]*RapidInfoHint/)
  assert.doesNotMatch(builder, /ขั้นตอนที่ 2 · ตั้งชื่อสินค้า/)
})

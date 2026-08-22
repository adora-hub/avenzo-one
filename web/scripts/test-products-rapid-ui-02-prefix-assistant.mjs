import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import test from 'node:test'

const root = new URL('../', import.meta.url)
const read = (path) => readFile(new URL(path, root), 'utf8')

test('GSC-06 upgrades Rapid-UI-02 to authenticated authoritative preview', async () => {
  const shell = await read('src/app/organizations/[id]/products/live-sale/rapid-entry/rapid-entry-workspace-shell.tsx')
  const setup = await read('src/app/organizations/[id]/products/live-sale/rapid-entry/rapid-entry-setup-workspace.tsx')
  const assistant = await read('src/app/organizations/[id]/products/live-sale/rapid-entry/rapid-prefix-assistant.tsx')
  assert.match(shell, /<RapidEntrySetupWorkspace organizationId=\{organizationId\} actorUserId=\{actorUserId\} canManage=\{canManage\}/)
  assert.match(setup, /<RapidPrefixAssistant organizationId=\{organizationId\} canManage=\{editorEnabled\}/)
  assert.match(assistant, /^'use client'/)
  assert.match(assistant, /previewGlobalSalesCodeRangeAction/)
  assert.doesNotMatch(assistant, /UI Simulation|suggestionFor\(|prefix === 'A' \? 119/)
})

test('Rapid-UI-02 checks automatically after 450ms and normalizes Prefix', async () => {
  const assistant = await read('src/app/organizations/[id]/products/live-sale/rapid-entry/rapid-prefix-assistant.tsx')
  assert.match(assistant, /window\.setTimeout\([\s\S]*?, 450\)/)
  assert.match(assistant, /normalizeGlobalSalesCodePrefix/)
  assert.match(assistant, /\^\[A-Z\]\{1,3\}\$/)
  assert.match(assistant, /requestSequenceRef/)
})

test('GSC-06 renders the authoritative 50-code range returned by the server', async () => {
  const assistant = await read('src/app/organizations/[id]/products/live-sale/rapid-entry/rapid-prefix-assistant.tsx')
  assert.match(assistant, /const RANGE_SIZE = 50/)
  assert.match(assistant, /result\.data\.startNumber/)
  assert.match(assistant, /result\.data\.endNumber/)
  assert.match(assistant, /จองช่วงนี้ 3 ชั่วโมง/)
  assert.match(assistant, /reserveGlobalSalesCodeRangeAction/)
})

test('reserved range remains the single authority for Step 2 and the 50-row table', async () => {
  const assistant = await read('src/app/organizations/[id]/products/live-sale/rapid-entry/rapid-prefix-assistant.tsx')
  assert.match(assistant, /if \(status !== 'reserved' \|\| suggestion\?\.reserved !== true\) return[\s\S]*onRangeSelect\?\.\(suggestion\)/)
  assert.match(assistant, /const selectedRange = status === 'reserved' && suggestion\?\.reserved === true[\s\S]*rangeLabel\(suggestion\)/)
  assert.doesNotMatch(assistant, /const \[selectedRange, setSelectedRange\]/)
})

test('Rapid-BE-02A restores the current actor active reservation after refresh', async () => {
  const page = await read('src/app/organizations/[id]/products/live-sale/rapid-entry/page.tsx')
  const shell = await read('src/app/organizations/[id]/products/live-sale/rapid-entry/rapid-entry-workspace-shell.tsx')
  const setup = await read('src/app/organizations/[id]/products/live-sale/rapid-entry/rapid-entry-setup-workspace.tsx')
  const assistant = await read('src/app/organizations/[id]/products/live-sale/rapid-entry/rapid-prefix-assistant.tsx')
  assert.match(page, /from\('sales_code_reservation_batches'\)/)
  assert.match(page, /eq\('created_by', user\.id\)/)
  assert.match(page, /eq\('status', 'active'\)/)
  assert.match(page, /gt\('expires_at', new Date\(\)\.toISOString\(\)\)/)
  assert.match(page, /activeReservation=\{activeReservation\}/)
  assert.match(shell, /activeReservation=\{activeReservation\}/)
  assert.match(setup, /useState<RapidRangeSelection \| null>\(activeReservation\)/)
  assert.match(setup, /reservedRange=\{selectedRange\}/)
  assert.match(assistant, /if \(reservedRange\?\.reserved === true && reservedRange\.prefix === prefix\) return/)
})

test('GSC-06 covers loading, ready, timeout, error and permission states', async () => {
  const assistant = await read('src/app/organizations/[id]/products/live-sale/rapid-entry/rapid-prefix-assistant.tsx')
  for (const state of ['checking', 'ready', 'timeout', 'error', 'denied']) assert.match(assistant, new RegExp(`status === '${state}'`))
  assert.match(assistant, /withGlobalSalesCodePreviewTimeout/)
  assert.match(assistant, /ลองตรวจอีกครั้ง/)
  assert.match(assistant, /ไม่มีสิทธิ์ตรวจและจองรหัสขาย/)
})

test('Rapid-UI-02 uses accessible status announcements and Design System controls', async () => {
  const assistant = await read('src/app/organizations/[id]/products/live-sale/rapid-entry/rapid-prefix-assistant.tsx')
  const styles = await read('src/app/globals.css')
  assert.match(assistant, /aria-live="polite"/)
  assert.match(assistant, /aria-describedby="rapidPrefixHelp rapidPrefixStatus"/)
  assert.match(styles, /\.live-sale-prefix-input-wrap input \{[^}]*height: 44px;[^}]*min-height: 44px;/)
  assert.match(styles, /\.live-sale-prefix-result\.is-ready \{[^}]*var\(--status-success-border\)/)
  assert.match(styles, /\.live-sale-prefix-result\.is-error \{[^}]*var\(--status-danger-border\)/)
})

test('Rapid-UI-10A uses the approved numbered section header and inline required label guidance', async () => {
  const assistant = await read('src/app/organizations/[id]/products/live-sale/rapid-entry/rapid-prefix-assistant.tsx')
  const infoHint = await read('src/app/organizations/[id]/products/live-sale/rapid-entry/rapid-info-hint.tsx')
  const styles = await read('src/app/globals.css')
  assert.match(assistant, /live-sale-rapid-section-title[\s\S]*aria-hidden="true">1<[\s\S]*ค้นหาช่วงรหัสขาย/)
  assert.match(assistant, /live-sale-rapid-field-label[\s\S]*Prefix รหัสขาย <b>\*<\/b>[\s\S]*RapidInfoHint/)
  assert.match(infoHint, /role="tooltip"/)
  assert.match(infoHint, /onClick=\{\(\) => setOpen\(true\)\}/)
  assert.match(infoHint, /event\.key === 'Escape'[\s\S]*setOpen\(false\)/)
  assert.match(styles, /\.live-sale-rapid-info-hint > \[role="tooltip"\] \{[^}]*top: calc\(50% - 10px\);[^}]*left: calc\(100% \+ 8px\);[^}]*transform: translateY\(-50%\);/)
  assert.match(styles, /\.live-sale-rapid-info-hint > \[role="tooltip"\]::after \{[^}]*top: calc\(50% \+ 10px\);[^}]*right: 100%;[^}]*border-right-color: #111;/)
  assert.match(infoHint, /aria-expanded=\{open\}/)
  assert.match(styles, /\.live-sale-rapid-section-title > span \{[^}]*width: 25px;[^}]*height: 25px;/)
  assert.match(styles, /\.live-sale-rapid-section-title h3 \{[^}]*font-size: 18px;/)
  assert.match(styles, /\.live-sale-prefix-control label \{[^}]*font-size: 14px;/)
  assert.match(styles, /\.live-sale-rapid-field-label > label[\s\S]*display: inline-flex;[\s\S]*white-space: nowrap;/)
  assert.match(styles, /\.live-sale-prefix-result\.is-ready > \.button \{[^}]*grid-column: 2;[^}]*grid-row: 1 \/ 3;[^}]*align-self: center;/)
  assert.match(styles, /\.live-sale-rapid-section-title > div \{[^}]*display: flex;[^}]*align-items: baseline;[^}]*flex-wrap: wrap;/)
  assert.match(styles, /\.live-sale-rapid-section-title p::before \{ content: '\('; \}/)
  assert.match(styles, /\.live-sale-rapid-section-title p::after \{ content: '\)'; \}/)
})

test('Rapid-UI-10B keeps Step 1 compact without shrinking standard controls', async () => {
  const styles = await read('src/app/globals.css')
  assert.match(styles, /\.live-sale-prefix-layout \{[^}]*grid-template-columns: minmax\(260px, \.75fr\) minmax\(420px, 1\.25fr\);[^}]*gap: 12px;[^}]*padding: 12px 16px;/)
  assert.match(styles, /\.live-sale-prefix-result \{[^}]*min-height: 94px;[^}]*padding: 10px 12px;/)
  assert.match(styles, /\.live-sale-prefix-input-wrap input \{[^}]*height: 44px;[^}]*min-height: 44px;/)
  assert.match(styles, /\.live-sale-prefix-result \.button \{[^}]*height: 34px;[^}]*min-height: 34px;/)
})

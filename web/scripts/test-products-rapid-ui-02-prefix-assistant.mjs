import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import test from 'node:test'

const root = new URL('../', import.meta.url)
const read = (path) => readFile(new URL(path, root), 'utf8')

test('Rapid-UI-02 composes a client-only Prefix assistant without backend calls', async () => {
  const shell = await read('src/app/organizations/[id]/products/live-sale/rapid-entry/rapid-entry-workspace-shell.tsx')
  const setup = await read('src/app/organizations/[id]/products/live-sale/rapid-entry/rapid-entry-setup-workspace.tsx')
  const assistant = await read('src/app/organizations/[id]/products/live-sale/rapid-entry/rapid-prefix-assistant.tsx')
  assert.match(shell, /<RapidEntrySetupWorkspace organizationId=\{organizationId\} actorUserId=\{actorUserId\} canManage=\{canManage\}/)
  assert.match(setup, /<RapidPrefixAssistant canManage=\{editorEnabled\}/)
  assert.match(assistant, /^'use client'/)
  assert.match(assistant, /UI Simulation/)
  assert.doesNotMatch(assistant, /fetch\(|supabase|executeFoundationCommandAction/)
})

test('Rapid-UI-02 checks automatically after 450ms and normalizes Prefix', async () => {
  const assistant = await read('src/app/organizations/[id]/products/live-sale/rapid-entry/rapid-prefix-assistant.tsx')
  assert.match(assistant, /window\.setTimeout\([\s\S]*?, 450\)/)
  assert.match(assistant, /toUpperCase\(\)\.slice\(0, 8\)/)
  assert.match(assistant, /\^\[A-Z0-9-\]\{1,8\}\$/)
  assert.match(assistant, /requestSequenceRef/)
})

test('Rapid-UI-02 deterministically recommends A120 through A169', async () => {
  const assistant = await read('src/app/organizations/[id]/products/live-sale/rapid-entry/rapid-prefix-assistant.tsx')
  assert.match(assistant, /prefix === 'A' \? 119/)
  assert.match(assistant, /const RANGE_SIZE = 50/)
  assert.match(assistant, /start \+ RANGE_SIZE - 1/)
  assert.match(assistant, /ใช้ช่วงที่แนะนำ/)
})

test('Rapid-UI-02 covers loading, ready, conflict, error and permission states', async () => {
  const assistant = await read('src/app/organizations/[id]/products/live-sale/rapid-entry/rapid-prefix-assistant.tsx')
  for (const state of ['checking', 'ready', 'conflict', 'error', 'denied']) assert.match(assistant, new RegExp(`status === '${state}'`))
  assert.match(assistant, /จำลอง Conflict/)
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
  assert.match(styles, /\.live-sale-prefix-result\.is-conflict \{[^}]*var\(--status-warning-border\)/)
  assert.match(styles, /\.live-sale-prefix-result\.is-error \{[^}]*var\(--status-danger-border\)/)
})

test('Rapid-UI-10A uses the approved numbered section header and inline required label guidance', async () => {
  const assistant = await read('src/app/organizations/[id]/products/live-sale/rapid-entry/rapid-prefix-assistant.tsx')
  const infoHint = await read('src/app/organizations/[id]/products/live-sale/rapid-entry/rapid-info-hint.tsx')
  const styles = await read('src/app/globals.css')
  assert.match(assistant, /live-sale-rapid-section-title[\s\S]*aria-hidden="true">1<[\s\S]*ค้นหาช่วงรหัสขาย/)
  assert.match(assistant, /live-sale-rapid-field-label[\s\S]*Prefix รหัสขาย <b>\*<\/b>[\s\S]*RapidInfoHint/)
  assert.match(infoHint, /role="tooltip"/)
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

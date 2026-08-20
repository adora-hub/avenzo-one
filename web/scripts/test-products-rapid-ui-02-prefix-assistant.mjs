import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import test from 'node:test'

const root = new URL('../', import.meta.url)
const read = (path) => readFile(new URL(path, root), 'utf8')

test('Rapid-UI-02 composes a client-only Prefix assistant without backend calls', async () => {
  const shell = await read('src/app/organizations/[id]/products/live-sale/rapid-entry/rapid-entry-workspace-shell.tsx')
  const setup = await read('src/app/organizations/[id]/products/live-sale/rapid-entry/rapid-entry-setup-workspace.tsx')
  const assistant = await read('src/app/organizations/[id]/products/live-sale/rapid-entry/rapid-prefix-assistant.tsx')
  assert.match(shell, /<RapidEntrySetupWorkspace canManage=\{canManage\}/)
  assert.match(setup, /<RapidPrefixAssistant canManage=\{canManage\}/)
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

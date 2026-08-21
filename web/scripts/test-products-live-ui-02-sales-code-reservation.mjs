import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import test from 'node:test'

const root = new URL('../', import.meta.url)
const read = (path) => readFile(new URL(path, root), 'utf8')

test('Live-UI-02 implements a client-side reservation dialog without backend writes', async () => {
  const ui = await read('src/app/organizations/[id]/products/live-sale/live-sale-reservation-ui.tsx')
  assert.match(ui, /^'use client'/)
  assert.match(ui, /จองชุด Sales Code/)
  assert.match(ui, /ทดลองจอง \{Math\.max\(draft\.count, 0\)\} รหัส/)
  assert.match(ui, /setReservation\(\{ \.\.\.draft \}\)/)
  assert.doesNotMatch(ui, /createClient|createServerClient|supabase|fetch\(|server action|use server/)
})

test('Live-UI-02 previews prefix, range, count and next code with approved limits', async () => {
  const ui = await read('src/app/organizations/[id]/products/live-sale/live-sale-reservation-ui.tsx')
  assert.match(ui, /prefix: 'B'/)
  assert.match(ui, /start: 1/)
  assert.match(ui, /count: 50/)
  assert.match(ui, /digits: 3/)
  assert.match(ui, /draft\.start \+ draft\.count - 1/)
  assert.match(ui, /draft\.start \+ Math\.max\(draft\.count, 1\)/)
  assert.match(ui, /จำนวนรหัสต้องอยู่ระหว่าง 1–500 รหัส/)
})

test('Live-UI-02 follows dialog accessibility and permission boundaries', async () => {
  const ui = await read('src/app/organizations/[id]/products/live-sale/live-sale-reservation-ui.tsx')
  assert.match(ui, /role="dialog"/)
  assert.match(ui, /aria-modal="true"/)
  assert.match(ui, /aria-labelledby="liveSaleReservationTitle"/)
  assert.match(ui, /aria-describedby="liveSaleReservationDescription"/)
  assert.match(ui, /event\.key === 'Escape'/)
  assert.match(ui, /event\.key !== 'Tab'/)
  assert.match(ui, /triggerRef\.current\?\.focus\(\)/)
  assert.match(ui, /disabled=\{!canManage\}/)
})

test('Live-UI-02 uses shared design tokens and responsive modal layout', async () => {
  const css = await read('src/app/globals.css')
  assert.match(css, /\.live-sale-dialog \{[^}]*width: min\(680px, calc\(100vw - 32px\)\)/s)
  assert.match(css, /\.live-sale-dialog-body \{[^}]*overflow-y: auto/s)
  assert.match(css, /\.live-sale-dialog-footer \.button \{[^}]*height: 40px; min-height: 40px/s)
  assert.match(css, /\.live-sale-reservation-form input, \.live-sale-reservation-form select \{[^}]*height: 42px; min-height: 42px/s)
  assert.match(css, /@media \(max-width: 600px\)[\s\S]*\.live-sale-dialog \{ width: 100%/)
  assert.match(css, /\.live-sale-range-preview \{[^}]*var\(--status-info-border\)[^}]*var\(--status-info-surface\)/s)
  assert.match(css, /\.live-sale-reservation-error \{[^}]*var\(--status-danger-border\)[^}]*var\(--status-danger-surface\)/s)
  assert.match(css, /\.live-sale-page \.button:not\(\.secondary\) \{[^}]*#aae600[^}]*#000[^}]*#aae600/s)
  assert.match(css, /\.live-sale-page \.button:not\(\.secondary\):not\(:disabled\):hover \{[^}]*#d6e600[^}]*#000[^}]*#d6e600/s)
  assert.match(css, /\.live-sale-preview-badge \{[^}]*#000[^}]*#aae600/s)
})

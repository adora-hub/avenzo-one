import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import test from 'node:test'

const base = '../src/app/organizations/[id]/products/live-sale/rapid-entry/'

test('Rapid-Draft-01 uses the approved fixed three-hour reservation contract', async () => {
  const server = await readFile(new URL('../src/lib/foundation/global-sales-code-reservation.server.ts', import.meta.url), 'utf8')
  const migration = await readFile(new URL('../../supabase/migrations/20260821115026_phase_gsc_04_global_allocator_range_rollover.sql', import.meta.url), 'utf8')
  assert.match(server, /"ttl_hours": 3/)
  assert.match(server, /server_reserve_global_sales_code_range/)
  assert.match(migration, /now\(\) \+ interval '3 hours'/)
  assert.match(migration, /pg_advisory_xact_lock/)
})

test('Rapid-Draft-01 persists reservation authority with the browser draft without extending expiry', async () => {
  const draft = await readFile(new URL(`${base}rapid-entry-browser-draft.ts`, import.meta.url), 'utf8')
  const table = await readFile(new URL(`${base}rapid-entry-table.tsx`, import.meta.url), 'utf8')
  assert.match(draft, /reservationBatchId/)
  assert.match(draft, /reservationCommandId/)
  assert.match(draft, /expiresAt/)
  assert.match(table, /range: selectedRange/)
  assert.doesNotMatch(table, /expiresAt: new Date/)
})

test('Rapid-Draft-01 warns before expiry, preserves data and blocks final review after expiry', async () => {
  const helper = await readFile(new URL(`${base}rapid-reservation-window.ts`, import.meta.url), 'utf8')
  const setup = await readFile(new URL(`${base}rapid-entry-setup-workspace.tsx`, import.meta.url), 'utf8')
  const table = await readFile(new URL(`${base}rapid-entry-table.tsx`, import.meta.url), 'utf8')
  assert.match(helper, /30 \* 60 \* 1000/)
  assert.match(helper, /10 \* 60 \* 1000/)
  assert.match(setup, /หมดเวลาจองรหัสแล้ว — ข้อมูลที่กรอกไม่หาย/)
  assert.match(table, /reservationExpired/)
  assert.match(table, /กรุณาล้าง Draft และจองช่วงรหัสใหม่ก่อนสร้างสินค้า/)
})

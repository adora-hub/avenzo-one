import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import test from 'node:test'
import { fileURLToPath } from 'node:url'
import path from 'node:path'

const scriptDirectory = path.dirname(fileURLToPath(import.meta.url))
const repositoryRoot = path.resolve(scriptDirectory, '..', '..')
const [fulfillment, page, styles] = await Promise.all([
  readFile(path.join(repositoryRoot, 'web', 'src', 'app', 'components', 'billing-transfer-proof-fulfillment.tsx'), 'utf8'),
  readFile(path.join(repositoryRoot, 'web', 'src', 'app', 'platform-admin', 'billing', 'transfer-proofs', 'page.tsx'), 'utf8'),
  readFile(path.join(repositoryRoot, 'web', 'src', 'app', 'globals.css'), 'utf8'),
])

test('fulfillment cards explain the current workflow in Thai', () => {
  assert.match(page, /Phase 1\.1\.3\.8\.5\.3\.3/)
  assert.match(fulfillment, /พร้อมยืนยันรับชำระ/)
  assert.match(fulfillment, /รอผู้อนุมัติคนที่ 2/)
  assert.match(fulfillment, /พร้อมให้คุณอนุมัติคนที่ 2/)
  assert.match(fulfillment, /ผู้ตรวจหลักฐานคนแรก/)
})

test('approval route explains policy threshold and risk', () => {
  assert.match(fulfillment, /single_admin_limit/)
  assert.match(fulfillment, /สูงกว่าวงเงินผู้อนุมัติคนเดียว/)
  assert.match(fulfillment, /รายการถูกระบุว่ามีสัญญาณเสี่ยง/)
  assert.match(fulfillment, /Policy Version/)
})

test('technical statuses have human-readable Thai labels', () => {
  assert.match(fulfillment, /pending: 'รอชำระ'/)
  assert.match(fulfillment, /active: 'ใช้งานปกติ'/)
  assert.match(fulfillment, /grace: 'ช่วงผ่อนผัน'/)
  assert.match(fulfillment, /suspended: 'พักการใช้งานชั่วคราว'/)
})

test('workflow status is responsive and does not expose server secrets', () => {
  assert.match(styles, /\.transfer-workflow-status/)
  assert.match(styles, /\.transfer-workflow-status\.pending/)
  assert.doesNotMatch(fulfillment + page, /SUPABASE_SECRET_KEY|service_role|sb_secret_/)
})

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

test('page identifies the approved workflow actions phase', () => {
  assert.match(page, /Phase 1\.1\.3\.8\.5\.3\.3/)
  assert.match(page, /ดูประวัติการอนุมัติแบบเรียงตามเวลา/)
})

test('action resolver covers the four human-readable permission states', () => {
  assert.match(fulfillment, /function fulfillmentAction/)
  assert.match(fulfillment, /ยอดไม่ตรง — ยังยืนยันไม่ได้/)
  assert.match(fulfillment, /รอ Platform Admin คนที่ 2/)
  assert.match(fulfillment, /ตรวจทานและอนุมัติคนที่ 2/)
  assert.match(fulfillment, /ตรวจสอบและยืนยันรับชำระ/)
})

test('unsafe actions stay disabled before opening confirmation', () => {
  assert.match(fulfillment, /if \(!fulfillmentAction\(item, currentUserId\)\.canStart\) return/)
  assert.match(fulfillment, /disabled=\{!action\.canStart\}/)
  assert.match(fulfillment, /onClick=\{\(\) => beginFulfillment\(item\)\}/)
})

test('server remains the source of truth and no secret reaches the browser', () => {
  assert.match(fulfillment, /platform_fulfill_billing_transfer_proof/)
  assert.match(fulfillment, /second_platform_admin_required/)
  assert.doesNotMatch(fulfillment + page, /SUPABASE_SECRET_KEY|service_role|sb_secret_/)
})

test('action panel has ready, waiting, blocked and responsive presentation', () => {
  assert.match(styles, /\.transfer-action-panel/)
  assert.match(styles, /\.transfer-action-panel\.waiting/)
  assert.match(styles, /\.transfer-action-panel\.blocked/)
  assert.match(styles, /\.transfer-action-copy/)
  assert.match(styles, /\.transfer-action-panel \.button \{ width: 100%; \}/)
})

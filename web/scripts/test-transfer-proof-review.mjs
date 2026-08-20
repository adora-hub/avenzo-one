import test from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
import path from 'node:path'

const scriptDirectory = path.dirname(fileURLToPath(import.meta.url))
const repositoryRoot = path.resolve(scriptDirectory, '..', '..')
const migrationPath = path.join(repositoryRoot, 'supabase', 'migrations', '20260810230000_phase_1_1_3_8_3_transfer_proof_review.sql')
const componentPath = path.join(repositoryRoot, 'web', 'src', 'app', 'components', 'billing-transfer-proof-review.tsx')
const pagePath = path.join(repositoryRoot, 'web', 'src', 'app', 'platform-admin', 'billing', 'transfer-proofs', 'page.tsx')

const [migration, component, page] = await Promise.all([
  readFile(migrationPath, 'utf8'),
  readFile(componentPath, 'utf8'),
  readFile(pagePath, 'utf8'),
])

test('review RPC requires AAL2 Platform Admin and a meaningful reason', () => {
  assert.match(migration, /if not private\.is_platform_admin\(\)/)
  assert.match(migration, /platform_admin_aal2_required/)
  assert.match(migration, /length\(btrim\(coalesce\(p_reason, ''\)\)\) not between 3 and 500/)
})

test('review is serialized, idempotent, and accepts only one proof per invoice', () => {
  assert.match(migration, /where review_command_id = p_command_id/)
  assert.match(migration, /where id = p_proof_id\s+for update/)
  assert.match(migration, /billing_transfer_proofs_one_accepted_per_invoice_key/)
  assert.match(migration, /where status = 'accepted'/)
  assert.match(migration, /where id = v_proof\.id and status in \('submitted', 'under_review'\)/)
})

test('private evidence is opened with a short-lived signed URL', () => {
  assert.match(component, /createSignedUrl\(item\.storage_path, 120\)/)
  assert.doesNotMatch(component, /SUPABASE_SECRET_KEY|service_role|sb_secret_/)
  assert.match(component, /เปิดไฟล์หลักฐาน/)
})

test('review UI has explicit confirmation and audit reason', () => {
  assert.match(component, /ตรวจสอบครั้งสุดท้าย/)
  assert.match(component, /เหตุผลสำหรับ Audit Log/)
  assert.match(component, /ยืนยันรับรองหลักฐาน/)
  assert.match(component, /ยืนยันปฏิเสธหลักฐาน/)
  assert.match(page, /หลักฐานผ่าน ≠ ชำระสำเร็จ/)
})

test('phase never mutates payments, invoices, or subscriptions', () => {
  assert.doesNotMatch(migration, /update\s+public\.billing_invoices/i)
  assert.doesNotMatch(migration, /insert\s+into\s+public\.billing_payments/i)
  assert.doesNotMatch(migration, /update\s+public\.organization_subscriptions/i)
})

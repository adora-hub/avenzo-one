import test from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
import path from 'node:path'

const scriptDirectory = path.dirname(fileURLToPath(import.meta.url))
const repositoryRoot = path.resolve(scriptDirectory, '..', '..')
const migrationPath = path.join(repositoryRoot, 'supabase', 'migrations', '20260810213000_phase_1_1_3_8_2_private_slip_upload.sql')
const componentPath = path.join(repositoryRoot, 'web', 'src', 'app', 'components', 'billing-transfer-proof-upload.tsx')
const organizationPagePath = path.join(repositoryRoot, 'web', 'src', 'app', 'organizations', '[id]', 'page.tsx')

const [migration, component, organizationPage] = await Promise.all([
  readFile(migrationPath, 'utf8'),
  readFile(componentPath, 'utf8'),
  readFile(organizationPagePath, 'utf8'),
])

test('uses a private bucket with strict file constraints', () => {
  assert.match(migration, /'billing-transfer-proofs'[\s\S]*?false,[\s\S]*?5242880/)
  for (const mimeType of ['image/jpeg', 'image/png', 'image/webp', 'application/pdf']) {
    assert.match(migration, new RegExp(mimeType.replace('/', '\\/')))
  }
})

test('binds uploads to the prepared owner path and verifies the object before submission', () => {
  assert.match(migration, /p\.storage_path = name/)
  assert.match(migration, /p\.uploaded_by = \(select auth\.uid\(\)\)/)
  assert.match(migration, /customer_finalize_billing_transfer_proof/)
  assert.match(migration, /from storage\.objects/)
  assert.match(migration, /status = 'submitted'/)
})

test('customer UI preserves the upload sequence and warns that evidence is not payment', () => {
  const prepare = component.indexOf("customer_prepare_billing_transfer_proof")
  const upload = component.indexOf(".upload(proof.storage_path")
  const finalize = component.indexOf("customer_finalize_billing_transfer_proof")

  assert.ok(prepare >= 0 && upload > prepare && finalize > upload)
  assert.match(component, /แนบหลักฐานแล้ว ≠ ชำระสำเร็จ/)
  assert.match(component, /Invoice จะยังคงเป็น “รอชำระ”/)
})

test('customer UI derives payment state from fulfillment evidence instead of a hardcoded badge', () => {
  assert.match(organizationPage, /fulfilled_payment_id, fulfilled_at/)
  assert.match(organizationPage, /payment_number/)
  assert.match(component, /fulfilled_payment_id/)
  assert.match(component, /ยืนยันรับชำระสำเร็จ/)
  assert.match(component, /หลักฐานผ่าน · รอยืนยันรับชำระ/)
  assert.doesNotMatch(component, /<span className="status pending">รอชำระ<\/span>/)
})

test('customer UI uses the standard select and drag-and-drop file controls', () => {
  assert.match(component, /system-select-control/)
  assert.match(component, /system-select-arrow/)
  assert.match(component, /system-file-drop-zone/)
  assert.match(component, /onDrop=\{dropFile\}/)
  assert.match(component, /onDragOver=/)
  assert.match(component, /ลากไฟล์มาวางที่นี่/)
  assert.match(component, /ลบไฟล์/)
})

test('phase migration never mutates invoice, payment, or subscription state', () => {
  assert.doesNotMatch(migration, /update\s+public\.billing_invoices/i)
  assert.doesNotMatch(migration, /update\s+public\.billing_payments/i)
  assert.doesNotMatch(migration, /update\s+public\.organization_subscriptions/i)
})

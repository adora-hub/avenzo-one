import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { test } from 'node:test'
import { fileURLToPath } from 'node:url'
import path from 'node:path'

const scriptDirectory = path.dirname(fileURLToPath(import.meta.url))
const repositoryRoot = path.resolve(scriptDirectory, '..', '..')
const migrationPath = path.join(repositoryRoot, 'supabase', 'migrations', '20260810233000_phase_1_1_3_8_4_transfer_fulfillment.sql')
const componentPath = path.join(repositoryRoot, 'web', 'src', 'app', 'components', 'billing-transfer-proof-fulfillment.tsx')
const pagePath = path.join(repositoryRoot, 'web', 'src', 'app', 'platform-admin', 'billing', 'transfer-proofs', 'page.tsx')

const [migration, component, page] = await Promise.all([
  readFile(migrationPath, 'utf8'),
  readFile(componentPath, 'utf8'),
  readFile(pagePath, 'utf8'),
])

test('fulfillment requires AAL2 Platform Admin and a different reviewer account', () => {
  assert.match(migration, /if not private\.is_platform_admin\(\)/)
  assert.match(migration, /platform_admin_aal2_required/)
  assert.match(migration, /if v_proof\.reviewed_by = v_actor/)
  assert.match(migration, /second_platform_admin_required/)
})

test('fulfillment is serialized and idempotent', () => {
  assert.match(migration, /where fulfillment_command_id = p_command_id/)
  assert.match(migration, /where id = p_proof_id\s+for update/)
  assert.match(migration, /billing_transfer_proofs_fulfillment_command_key/)
  assert.match(migration, /billing_transfer_proofs_fulfilled_payment_key/)
  assert.match(migration, /billing_payments_transfer_proof_key/)
})

test('financial checks run before any payment mutation', () => {
  const exactAmountCheck = migration.indexOf('transfer_amount_must_equal_invoice_total')
  const paymentInsert = migration.indexOf('insert into public.billing_payments')
  assert.ok(exactAmountCheck > -1)
  assert.ok(paymentInsert > exactAmountCheck)
  assert.match(migration, /if v_invoice\.status <> 'pending'/)
  assert.match(migration, /if v_subscription\.lifecycle_status <> 'active'/)
  assert.match(migration, /invoice_subscription_plan_version_mismatch/)
})

test('payment, invoice, subscription, event, and proof are changed in one RPC transaction', () => {
  assert.match(migration, /insert into public\.billing_payments/)
  assert.match(migration, /update public\.billing_invoices\s+set status = 'paid'/)
  assert.match(migration, /update public\.organization_subscriptions/)
  assert.match(migration, /insert into public\.subscription_events/)
  assert.match(migration, /update public\.billing_transfer_proofs\s+set fulfillment_command_id/)
  assert.doesNotMatch(migration, /commit\s*;/i)
})

test('browser UI uses only authenticated RPC and explicit final confirmation', () => {
  assert.match(component, /platform_fulfill_billing_transfer_proof/)
  assert.match(component, /crypto\.randomUUID\(\)/)
  assert.match(component, /transfer-fulfillment-confirmation/)
  assert.doesNotMatch(component, /SUPABASE_SECRET_KEY|service_role|sb_secret_/)
  assert.match(page, /platform_billing_transfer_fulfillment_queue_v2/)
  assert.match(page, /Phase 1\.1\.3\.8\.5\.3\.3/)
})

import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import test from 'node:test'
import { fileURLToPath } from 'node:url'
import path from 'node:path'

const scriptDirectory = path.dirname(fileURLToPath(import.meta.url))
const repositoryRoot = path.resolve(scriptDirectory, '..', '..')
const [migration, joinFixMigration, review, fulfillment, page] = await Promise.all([
  readFile(path.join(repositoryRoot, 'supabase', 'migrations', '20260811003000_phase_1_1_3_8_5_2_enforce_transfer_approval_policy.sql'), 'utf8'),
  readFile(path.join(repositoryRoot, 'supabase', 'migrations', '20260811005000_phase_1_1_3_8_5_2_fix_fulfillment_queue_version_label.sql'), 'utf8'),
  readFile(path.join(repositoryRoot, 'web', 'src', 'app', 'components', 'billing-transfer-proof-review.tsx'), 'utf8'),
  readFile(path.join(repositoryRoot, 'web', 'src', 'app', 'components', 'billing-transfer-proof-fulfillment.tsx'), 'utf8'),
  readFile(path.join(repositoryRoot, 'web', 'src', 'app', 'platform-admin', 'billing', 'transfer-proofs', 'page.tsx'), 'utf8'),
])

test('risk classification is explicit, validated, and audited', () => {
  assert.match(migration, /add column risk_flagged boolean not null default false/)
  assert.match(migration, /transfer_proof_risk_reason_invalid/)
  assert.match(migration, /platform_review_billing_transfer_proof_v2/)
  assert.match(review, /p_risk_flagged/)
  assert.match(review, /riskReason\.trim\(\)\.length < 3/)
})

test('server computes one-person or two-person approval from policy', () => {
  assert.match(migration, /v_invoice\.total_amount > v_policy\.single_admin_limit/)
  assert.match(migration, /v_policy\.require_two_person_on_risk and v_proof\.risk_flagged/)
  assert.match(migration, /v_required_count = 2 and v_proof\.reviewed_by = v_actor/)
  assert.match(migration, /second_platform_admin_required/)
})

test('fulfillment queue joins plan versions through the canonical plan code', () => {
  assert.match(joinFixMigration, /join public\.subscription_plans plan on plan\.code = v\.plan_code/)
  assert.match(joinFixMigration, /plan\.code, v\.id, v\.label, v\.grace_period_days/)
  assert.doesNotMatch(joinFixMigration, /plan\.id = v\.plan_id/)
  assert.doesNotMatch(joinFixMigration, /v\.name/)
})

test('fulfillment remains AAL2, atomic, serialized, and idempotent', () => {
  assert.match(migration, /private\.is_platform_admin\(\)/)
  assert.match(migration, /for update/)
  assert.match(migration, /pg_advisory_xact_lock/)
  assert.match(migration, /where fulfillment_command_id = p_command_id/)
  assert.match(migration, /insert into public\.billing_payments/)
  assert.match(migration, /update public\.billing_invoices\s+set status = 'paid'/)
  assert.match(migration, /update public\.organization_subscriptions/)
  assert.doesNotMatch(migration, /commit\s*;/i)
})

test('policy decision is snapshotted for later audit', () => {
  assert.match(migration, /'approval_policy_version', v_policy\.version/)
  assert.match(migration, /'approval_required_count', v_required_count/)
  assert.match(migration, /approval_policy_version = v_policy\.version/)
  assert.match(migration, /approval_required_count = v_required_count/)
})

test('UI clearly presents the enforced approval route', () => {
  assert.match(page, /platform_billing_transfer_fulfillment_queue_v2/)
  assert.match(page, /Phase 1\.1\.3\.8\.5\.3\.3/)
  assert.match(fulfillment, /approval_required_count === 2/)
  assert.match(fulfillment, /ผู้ดูแล 2 คน/)
  assert.match(fulfillment, /ผู้ดูแล 1 คน/)
  assert.doesNotMatch(review + fulfillment, /SUPABASE_SECRET_KEY|service_role|sb_secret_/)
})

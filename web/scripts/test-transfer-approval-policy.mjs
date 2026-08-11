import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import test from 'node:test'

const migration = await readFile('../supabase/migrations/20260811001000_phase_1_1_3_8_5_1_transfer_approval_policy.sql', 'utf8')
const page = await readFile('src/app/platform-admin/billing/transfer-proofs/page.tsx', 'utf8')
const component = await readFile('src/app/components/billing-transfer-approval-policy.tsx', 'utf8')

test('policy tables are private-by-default and audited', () => {
  assert.match(migration, /enable row level security/)
  assert.match(migration, /revoke all on table public\.billing_transfer_approval_policies from public, anon, authenticated/)
  assert.match(migration, /private\.billing_transfer_approval_policy_events/)
  assert.match(migration, /command_id uuid not null unique/)
})

test('only AAL2 Super Admin can update with version conflict protection', () => {
  assert.match(migration, /private\.is_platform_super_admin\(\)/)
  assert.match(migration, /approval_policy_version_conflict/)
  assert.match(migration, /p_expected_version bigint/)
})

test('policy remains configuration-only until phase 8.5.2', () => {
  assert.match(migration, /Enforcement begins in Phase 1\.1\.3\.8\.5\.2/)
  assert.doesNotMatch(migration, /create or replace function public\.platform_fulfill_billing_transfer_proof/)
})

test('UI explains thresholds and uses review-before-save', () => {
  assert.match(page, /BillingTransferApprovalPolicy/)
  assert.match(component, /วงเงินสูงสุดที่อนุมัติคนเดียวได้/)
  assert.match(component, /ตรวจสอบก่อนบันทึก/)
  assert.match(component, /ยืนยันบันทึกนโยบาย/)
  assert.match(component, /ยังไม่เปลี่ยนขั้นตอนรับชำระใน Phase นี้/)
})

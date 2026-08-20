import test from 'node:test'
import assert from 'node:assert/strict'
import { buildLiveReleaseGateReport } from '../src/lib/billing/live-release-gate.ts'

const safeChecks = {
  production_readiness_complete: true,
  approval_valid: true,
  tester_allowed: true,
  amount_valid: true,
  amount_within_limit: true,
  count_within_limit: true,
  total_within_limit: true,
  reference_valid: true,
  live_credentials_configured: true,
  environment_locked: true,
  emergency_stop_active: true,
  pilot_disabled: true,
  code_test_only: true,
}

function fixture() {
  const generatedAt = '2026-08-10T05:00:00.000Z'
  return {
    readiness: { id: 'ready-1', manual_status: 'manual_complete', created_at: generatedAt },
    control: { state: 'review_ready', emergency_stop: true, version: 4, updated_at: generatedAt },
    policy: { pilot_enabled: false, version: 3, max_amount_per_charge: 100, max_total_amount: 300, max_successful_charges: 3 },
    approval: {
      id: 'approval-1',
      status: 'approved',
      policy_version: 3,
      max_amount_per_charge: 100,
      max_total_amount: 300,
      max_successful_charges: 3,
      tester_count: 1,
      requested_by: 'admin-1',
      reviewed_by: 'admin-2',
      expires_at: '2026-08-11T05:00:00.000Z',
    },
    activeAdminCount: 2,
    activeTesterCount: 1,
    environment: {
      environmentLocked: true,
      codeTestOnly: true,
      acceptsRealMoney: false,
      liveSecretConfigured: true,
      liveWebhookConfigured: true,
    },
    dryRuns: [
      { id: 'audit-1', command_id: 'command-1', reference: 'CONTRACT-NOT-ALLOWED-1234', real_charge: false, checks: { ...safeChecks, tester_allowed: false } },
      { id: 'audit-2', command_id: 'command-2', reference: 'CONTRACT-OVER-LIMIT-1234', real_charge: false, checks: { ...safeChecks, amount_within_limit: false } },
      { id: 'audit-3', command_id: 'command-3', reference: 'CONTRACT-DUPLICATE-1234', real_charge: false, checks: safeChecks },
    ],
    generatedBy: 'admin@example.com',
    generatedAt,
  }
}

test('passes only when all release evidence is complete and safe', () => {
  const report = buildLiveReleaseGateReport(fixture())
  assert.equal(report.passed, true)
  assert.equal(report.decision, 'evidence_complete')
  assert.equal(report.realMoneyAllowed, false)
  assert.equal(report.checks.length, 10)
})

test('blocks when emergency stop is disabled', () => {
  const input = fixture()
  input.control.emergency_stop = false
  const report = buildLiveReleaseGateReport(input)
  assert.equal(report.passed, false)
  assert.equal(report.decision, 'blocked')
  assert.equal(report.checks.find((check) => check.key === 'emergency_stop')?.passed, false)
})

test('blocks expired or same-person approval', () => {
  const input = fixture()
  input.approval.reviewed_by = input.approval.requested_by
  input.approval.expires_at = '2026-08-09T05:00:00.000Z'
  const report = buildLiveReleaseGateReport(input)
  assert.equal(report.checks.find((check) => check.key === 'two_person_approval')?.passed, false)
})

test('blocks missing abuse evidence and any real-charge marker', () => {
  const input = fixture()
  input.dryRuns = [{ ...input.dryRuns[2], real_charge: true }]
  const report = buildLiveReleaseGateReport(input)
  assert.equal(report.passed, false)
  assert.equal(report.checks.find((check) => check.key === 'contract_evidence')?.passed, false)
  assert.equal(report.checks.find((check) => check.key === 'no_real_charge')?.passed, false)
  assert.equal(report.realMoneyAllowed, false)
})

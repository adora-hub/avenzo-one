import assert from 'node:assert/strict'
import test from 'node:test'
import {
  allLiveEligibilityChecksPass,
  evaluateLiveEligibilityAuthorization,
  parseLiveEligibilityRequest,
} from '../src/lib/billing/live-eligibility-contract.ts'

const validBody = {
  commandId: '4f63c0b6-a17f-4f5a-9a1d-fba1e876b96e',
  testerEmail: ' Tester@Example.com ',
  amount: 50,
  reference: ' LIVE-CONTRACT-001 ',
}

test('accepts and normalizes a valid dry-run request', () => {
  assert.deepEqual(parseLiveEligibilityRequest(validBody), {
    commandId: validBody.commandId,
    testerEmail: 'tester@example.com',
    amount: 50,
    reference: 'LIVE-CONTRACT-001',
  })
})

test('rejects malformed, non-positive and short-reference requests', () => {
  assert.equal(parseLiveEligibilityRequest({ ...validBody, commandId: 'not-a-uuid' }), null)
  assert.equal(parseLiveEligibilityRequest({ ...validBody, amount: 0 }), null)
  assert.equal(parseLiveEligibilityRequest({ ...validBody, reference: 'short' }), null)
})

test('rejects unauthenticated and non-AAL2 callers', () => {
  assert.deepEqual(evaluateLiveEligibilityAuthorization({ userId: null, email: null, adminStatus: null, currentLevel: null }), {
    allowed: false,
    status: 401,
    error: 'authentication_required',
  })
  assert.deepEqual(evaluateLiveEligibilityAuthorization({ userId: 'user-1', email: 'admin@example.com', adminStatus: 'active', currentLevel: 'aal1' }), {
    allowed: false,
    status: 403,
    error: 'platform_admin_aal2_required',
  })
})

test('allows only an active AAL2 Platform Admin', () => {
  assert.deepEqual(evaluateLiveEligibilityAuthorization({ userId: 'user-1', email: 'admin@example.com', adminStatus: 'active', currentLevel: 'aal2' }), {
    allowed: true,
    userId: 'user-1',
    email: 'admin@example.com',
  })
})

test('fails eligibility when tester is unauthorized or amount exceeds limit', () => {
  const passingChecks = {
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
  assert.equal(allLiveEligibilityChecksPass(passingChecks), true)
  assert.equal(allLiveEligibilityChecksPass({ ...passingChecks, tester_allowed: false }), false)
  assert.equal(allLiveEligibilityChecksPass({ ...passingChecks, amount_within_limit: false }), false)
})

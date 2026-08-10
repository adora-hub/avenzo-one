import test from 'node:test'
import assert from 'node:assert/strict'
import { buildLiveWebhookConnectivityEvidence } from '../src/lib/billing/live-webhook-connectivity-evidence.ts'

const event = {
  provider_event_id: 'evt_live_evidence_123',
  event_type: 'checkout.session.completed',
  environment: 'production',
  payload_sha256: 'a'.repeat(64),
  livemode: true,
  processing_status: 'blocked_by_emergency_stop',
  provider_created_at: '2026-08-10T04:00:00.000Z',
  received_at: '2026-08-10T04:00:01.000Z',
}

function fixture() {
  return {
    endpointUrl: 'https://app.avenzoone.com/api/billing/stripe/live-webhook',
    liveSecretConfigured: true,
    liveWebhookConfigured: true,
    emergencyStopActive: true,
    liveWebhookMode: 'verify_and_quarantine',
    acceptsRealMoney: false,
    latestEvent: event,
  }
}

test('verifies only a signed live event that is quarantined safely', () => {
  const result = buildLiveWebhookConnectivityEvidence(fixture())
  assert.equal(result.status, 'verified')
  assert.equal(result.passed, true)
  assert.equal(result.passedCount, 6)
  assert.equal(result.realMoneyAllowed, false)
})

test('waits honestly when infrastructure is ready but no live event exists', () => {
  const result = buildLiveWebhookConnectivityEvidence({ ...fixture(), latestEvent: null })
  assert.equal(result.status, 'waiting_for_live_event')
  assert.equal(result.passed, false)
  assert.equal(result.realMoneyAllowed, false)
})

test('blocks localhost, invalid hashes, non-live events and disabled emergency stop', () => {
  const result = buildLiveWebhookConnectivityEvidence({
    ...fixture(),
    endpointUrl: 'http://localhost:3000/api/billing/stripe/live-webhook',
    emergencyStopActive: false,
    latestEvent: { ...event, livemode: false, payload_sha256: 'invalid' },
  })
  assert.equal(result.status, 'blocked')
  assert.equal(result.passed, false)
  assert.equal(result.checks.find((check) => check.key === 'signed_live_event')?.passed, false)
  assert.equal(result.checks.find((check) => check.key === 'quarantine')?.passed, false)
})

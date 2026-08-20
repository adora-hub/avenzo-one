import test from 'node:test'
import assert from 'node:assert/strict'
import { buildLiveExecutorDesignReport } from '../src/lib/billing/live-executor-design.ts'

function safeInput(requestedMode) {
  return {
    requestedMode,
    environmentLocked: true,
    emergencyStopActive: true,
    pilotDisabled: true,
    generatedAt: '2026-08-10T07:00:00.000Z',
    generatedBy: 'admin@example.com',
  }
}

test('defaults to disabled and never permits a real charge', () => {
  const report = buildLiveExecutorDesignReport(safeInput(undefined))
  assert.equal(report.decision, 'design_review_ready')
  assert.equal(report.mode, 'disabled')
  assert.equal(report.realMoneyAllowed, false)
  assert.equal(report.stripeApiInvocationAllowed, false)
  assert.equal(report.checkoutEndpointExists, false)
  assert.equal(report.plannedStages.every((stage) => stage.enabled === false), true)
})

test('shadow mode still blocks Stripe Live API invocation', () => {
  const report = buildLiveExecutorDesignReport(safeInput('shadow'))
  assert.equal(report.mode, 'shadow')
  assert.equal(report.serverEnforcedBlock, true)
  assert.equal(report.stripeApiInvocationAllowed, false)
})

test('rejects live or unknown feature flag values', () => {
  for (const value of ['live', 'enabled', 'true', '1']) {
    const report = buildLiveExecutorDesignReport(safeInput(value))
    assert.equal(report.decision, 'blocked')
    assert.equal(report.mode, 'disabled')
    assert.equal(report.checks.find((check) => check.key === 'feature_flag')?.passed, false)
    assert.equal(report.realMoneyAllowed, false)
  }
})

test('blocks design review when any runtime safety control is open', () => {
  const report = buildLiveExecutorDesignReport({
    ...safeInput('disabled'),
    environmentLocked: false,
    emergencyStopActive: false,
    pilotDisabled: false,
  })
  assert.equal(report.decision, 'blocked')
  assert.equal(report.checks.filter((check) => !check.passed).length, 3)
  assert.equal(report.fulfillmentAuthority, 'verified_live_webhook_only')
  assert.equal(report.idempotencyRequired, true)
})

import test from 'node:test'
import assert from 'node:assert/strict'
import { buildShadowExecutorPlan, isShadowExecutorMode, parseShadowExecutorRequest } from '../src/lib/billing/live-shadow-executor-contract.ts'

function passingChecks() {
  return {
    feature_flag_shadow: true,
    source_dry_run_eligible: true,
    actor_active: true,
    production_readiness_complete: true,
    approval_valid: true,
    tester_allowed: true,
    amount_within_current_limits: true,
    volume_within_current_limits: true,
    environment_locked: true,
    emergency_stop_active: true,
    pilot_disabled: true,
    external_call_blocked: true,
  }
}

test('reserves a shadow command while permanently blocking Stripe and real money', () => {
  const commandId = '9e1be2ad-6f3e-4e2b-bfd0-7269af024657'
  const plan = buildShadowExecutorPlan(commandId, passingChecks())
  assert.equal(plan.decision, 'reserved')
  assert.equal(plan.idempotencyKey, `avenzo-shadow:${commandId}`)
  assert.equal(plan.realMoneyAllowed, false)
  assert.equal(plan.stripeApiCalled, false)
  assert.equal(plan.checkoutSessionId, null)
  assert.deepEqual(plan.stages.slice(3).map((stage) => stage.status), ['blocked', 'blocked', 'blocked'])
})

test('blocks reservation if any safety check fails', () => {
  const checks = { ...passingChecks(), emergency_stop_active: false }
  const plan = buildShadowExecutorPlan('9e1be2ad-6f3e-4e2b-bfd0-7269af024657', checks)
  assert.equal(plan.decision, 'blocked')
  assert.equal(plan.stripeApiCalled, false)
})

test('accepts only the shadow feature flag', () => {
  assert.equal(isShadowExecutorMode('shadow'), true)
  for (const value of [undefined, 'disabled', 'live', 'enabled', 'true']) assert.equal(isShadowExecutorMode(value), false)
})

test('validates command, dry-run and audit reason', () => {
  const valid = parseShadowExecutorRequest({
    commandId: '9e1be2ad-6f3e-4e2b-bfd0-7269af024657',
    dryRunId: '96c8a971-4e3a-48d1-a05b-c6f25e4efe18',
    reason: 'ทดสอบคำสั่ง Shadow แบบไม่รับเงินจริง',
  })
  assert.ok(valid)
  assert.equal(parseShadowExecutorRequest({ ...valid, reason: 'สั้น' }), null)
  assert.equal(parseShadowExecutorRequest({ ...valid, commandId: 'invalid' }), null)
})

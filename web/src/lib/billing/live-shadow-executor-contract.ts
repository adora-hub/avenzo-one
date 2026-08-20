export type ShadowExecutorCheckKey =
  | 'feature_flag_shadow'
  | 'source_dry_run_eligible'
  | 'actor_active'
  | 'production_readiness_complete'
  | 'approval_valid'
  | 'tester_allowed'
  | 'amount_within_current_limits'
  | 'volume_within_current_limits'
  | 'environment_locked'
  | 'emergency_stop_active'
  | 'pilot_disabled'
  | 'external_call_blocked'

export type ShadowExecutorChecks = Record<ShadowExecutorCheckKey, boolean>

export type ShadowExecutorStage = {
  order: number
  key: 'authorize' | 'reserve' | 'recheck' | 'stripe_checkout' | 'payment_attempt' | 'webhook_fulfillment'
  label: string
  status: 'verified' | 'reserved' | 'simulated' | 'blocked'
}

export type ShadowExecutorPlan = {
  phase: '1.1.3.7.5.6'
  mode: 'shadow'
  decision: 'reserved' | 'blocked'
  idempotencyKey: string
  realMoneyAllowed: false
  stripeApiCalled: false
  checkoutSessionId: null
  checks: ShadowExecutorChecks
  stages: ShadowExecutorStage[]
}

export function isShadowExecutorMode(value?: string) {
  return value?.trim().toLowerCase() === 'shadow'
}

export function buildShadowExecutorPlan(commandId: string, checks: ShadowExecutorChecks): ShadowExecutorPlan {
  const decision = Object.values(checks).every(Boolean) ? 'reserved' : 'blocked'
  return {
    phase: '1.1.3.7.5.6',
    mode: 'shadow',
    decision,
    idempotencyKey: `avenzo-shadow:${commandId}`,
    realMoneyAllowed: false,
    stripeApiCalled: false,
    checkoutSessionId: null,
    checks,
    stages: [
      { order: 1, key: 'authorize', label: 'ตรวจ Platform Admin และ MFA ระดับ AAL2', status: 'verified' },
      { order: 2, key: 'reserve', label: 'จอง Command ID และ Idempotency Key', status: 'reserved' },
      { order: 3, key: 'recheck', label: 'จำลองตรวจ Release Gate, Approval, วงเงิน และ Kill Switch ซ้ำ', status: 'simulated' },
      { order: 4, key: 'stripe_checkout', label: 'สร้าง Stripe Live Checkout Session', status: 'blocked' },
      { order: 5, key: 'payment_attempt', label: 'สร้าง Payment Attempt แบบ Production', status: 'blocked' },
      { order: 6, key: 'webhook_fulfillment', label: 'ยืนยันผลจาก Live Webhook', status: 'blocked' },
    ],
  }
}

export function parseShadowExecutorRequest(value: unknown) {
  if (!value || typeof value !== 'object') return null
  const body = value as Record<string, unknown>
  const commandId = typeof body.commandId === 'string' ? body.commandId.trim() : ''
  const dryRunId = typeof body.dryRunId === 'string' ? body.dryRunId.trim() : ''
  const reason = typeof body.reason === 'string' ? body.reason.trim() : ''
  const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i
  if (!uuid.test(commandId) || !uuid.test(dryRunId) || reason.length < 10 || reason.length > 500) return null
  return { commandId, dryRunId, reason }
}

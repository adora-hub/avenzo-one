import 'server-only'

export type BillingLiveSafetyState = 'locked' | 'review_ready'

export type BillingLiveSafetyControl = {
  provider: 'stripe'
  state: BillingLiveSafetyState
  emergency_stop: true
  reason: string
  version: number
  updated_by_email: string | null
  updated_at: string
}

export type BillingLiveSafetyEvent = {
  id: string
  action: 'lock' | 'mark_review_ready' | 'rollback'
  previous_state: BillingLiveSafetyState
  next_state: BillingLiveSafetyState
  reason: string
  actor_email: string
  created_at: string
}

export type BillingLiveRolloutPolicy = {
  provider: 'stripe'
  pilot_enabled: false
  max_amount_per_charge: number
  max_total_amount: number
  max_successful_charges: number
  reason: string
  version: number
  updated_by_email: string | null
  updated_at: string
}

export type BillingLiveTester = {
  id: string
  email: string
  active: boolean
  reason: string
  updated_by_email: string
  updated_at: string
}

export type BillingLiveRolloutEvent = {
  id: string
  action: 'policy_update' | 'tester_allow' | 'tester_revoke' | 'preview_check' | 'rollback'
  tester_email: string | null
  requested_amount: number | null
  allowed: boolean | null
  reason: string
  actor_email: string
  created_at: string
}

export type BillingLiveRolloutEvaluation = {
  allowed: boolean
  phase: '1.1.3.7.3'
  pilot_enabled: boolean
  emergency_stop_clear: boolean
  tester_allowed: boolean
  amount_valid: boolean
  amount_within_limit: boolean
  count_within_limit: boolean
  total_within_limit: boolean
  max_amount_per_charge: number
  max_total_amount: number
  max_successful_charges: number
  successful_amount: number
  successful_charges: number
  requested_amount: number
}

export type BillingLiveActivationStatus = 'pending' | 'approved' | 'rejected' | 'canceled' | 'expired'

export type BillingLiveActivationRequest = {
  id: string
  provider: 'stripe'
  status: BillingLiveActivationStatus
  policy_version: number
  max_amount_per_charge: number
  max_total_amount: number
  max_successful_charges: number
  tester_count: number
  request_reason: string
  requested_by: string
  requested_by_email: string
  requested_at: string
  expires_at: string
  reviewed_by: string | null
  reviewed_by_email: string | null
  review_reason: string | null
  reviewed_at: string | null
}

export type BillingLiveActivationEvent = {
  id: string
  request_id: string
  action: 'request' | 'approve' | 'reject' | 'cancel' | 'expire'
  reason: string
  actor_email: string
  created_at: string
}

export type BillingLiveWebhookInboxEvent = {
  id: string
  provider_event_id: string
  event_type: string
  processing_status: 'blocked_by_emergency_stop'
  provider_created_at: string
  received_at: string
}

export type BillingLiveDryRunChecks = {
  production_readiness_complete: boolean
  approval_valid: boolean
  tester_allowed: boolean
  amount_valid: boolean
  amount_within_limit: boolean
  count_within_limit: boolean
  total_within_limit: boolean
  reference_valid: boolean
  live_credentials_configured: boolean
  environment_locked: boolean
  emergency_stop_active: boolean
  pilot_disabled: boolean
  code_test_only: boolean
}

export type BillingLiveCheckoutDryRun = {
  id: string
  command_id: string
  provider: 'stripe'
  environment: 'production_dry_run'
  tester_email: string
  requested_amount: number
  reference: string
  eligible: boolean
  real_charge: false
  checks: BillingLiveDryRunChecks
  policy_version: number
  approval_request_id: string | null
  actor_email: string
  created_at: string
}

export function inspectLiveSafetyEnvironment(env: NodeJS.ProcessEnv = process.env) {
  const testSecretConfigured = Boolean(env.STRIPE_SECRET_KEY?.startsWith('sk_test_'))
  const testWebhookConfigured = Boolean(env.STRIPE_WEBHOOK_SECRET?.startsWith('whsec_'))
  const liveSecretConfigured = Boolean(env.STRIPE_LIVE_SECRET_KEY?.startsWith('sk_live_'))
  const liveWebhookConfigured = Boolean(env.STRIPE_LIVE_WEBHOOK_SECRET?.startsWith('whsec_'))
  const environmentLocked = env.STRIPE_LIVE_ACTIVATION !== 'enabled'

  return {
    testSecretConfigured,
    testWebhookConfigured,
    liveSecretConfigured,
    liveWebhookConfigured,
    environmentLocked,
    codeTestOnly: true,
    acceptsRealMoney: false,
    liveWebhookMode: 'verify_and_quarantine' as const,
  }
}

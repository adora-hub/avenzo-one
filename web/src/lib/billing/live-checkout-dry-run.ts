import 'server-only'

import { inspectLiveSafetyEnvironment, type BillingLiveCheckoutDryRun, type BillingLiveDryRunChecks } from '@/lib/billing/live-safety'
import { allLiveEligibilityChecksPass } from '@/lib/billing/live-eligibility-contract'
import { createAdminClient } from '@/lib/supabase/admin'

type Input = {
  commandId: string
  actorUserId: string
  actorEmail: string
  testerEmail: string
  amount: number
  reference: string
}

export async function evaluateAndRecordLiveCheckoutDryRun(input: Input): Promise<BillingLiveCheckoutDryRun> {
  const admin = createAdminClient()
  const testerEmail = input.testerEmail.trim().toLowerCase()
  const reference = input.reference.trim()

  const { data: existing, error: existingError } = await admin
    .from('billing_live_checkout_dry_runs')
    .select('*')
    .eq('command_id', input.commandId)
    .maybeSingle()
  if (existingError) throw existingError
  if (existing) return existing as BillingLiveCheckoutDryRun

  const [actorResult, controlResult, policyResult, testerResult, readinessResult, approvalResult, testerCountResult, successfulAttemptsResult] = await Promise.all([
    admin.from('platform_admins').select('status').eq('user_id', input.actorUserId).maybeSingle(),
    admin.from('billing_live_safety_controls').select('state, emergency_stop').eq('provider', 'stripe').maybeSingle(),
    admin.from('billing_live_rollout_policies').select('version, pilot_enabled, max_amount_per_charge, max_total_amount, max_successful_charges').eq('provider', 'stripe').maybeSingle(),
    admin.from('billing_live_testers').select('active').eq('provider', 'stripe').eq('email', testerEmail).maybeSingle(),
    admin.from('billing_production_readiness_reviews').select('manual_status').order('created_at', { ascending: false }).limit(1).maybeSingle(),
    admin.from('billing_live_activation_requests').select('id, status, policy_version, max_amount_per_charge, max_total_amount, max_successful_charges, tester_count, expires_at').eq('provider', 'stripe').eq('status', 'approved').order('reviewed_at', { ascending: false }).limit(1).maybeSingle(),
    admin.from('billing_live_testers').select('id', { count: 'exact', head: true }).eq('provider', 'stripe').eq('active', true),
    admin.from('billing_payment_attempts').select('amount').eq('provider', 'stripe').eq('environment', 'production').eq('status', 'succeeded'),
  ])

  const queryError = [actorResult, controlResult, policyResult, testerResult, readinessResult, approvalResult, testerCountResult, successfulAttemptsResult].find((result) => result.error)?.error
  if (queryError) throw queryError
  if (actorResult.data?.status !== 'active') throw new Error('platform_admin_required')
  if (!controlResult.data || !policyResult.data) throw new Error('billing_live_configuration_missing')

  const control = controlResult.data
  const policy = policyResult.data
  const approval = approvalResult.data
  const environment = inspectLiveSafetyEnvironment()
  const successfulAttempts = successfulAttemptsResult.data ?? []
  const successfulAmount = successfulAttempts.reduce((total, attempt) => total + Number(attempt.amount), 0)
  const activeTesterCount = testerCountResult.count ?? 0
  const amountValid = Number.isFinite(input.amount) && input.amount > 0
  const approvalValid = Boolean(
    approval
      && new Date(approval.expires_at).getTime() > Date.now()
      && Number(approval.policy_version) === Number(policy.version)
      && Number(approval.max_amount_per_charge) === Number(policy.max_amount_per_charge)
      && Number(approval.max_total_amount) === Number(policy.max_total_amount)
      && Number(approval.max_successful_charges) === Number(policy.max_successful_charges)
      && Number(approval.tester_count) === activeTesterCount,
  )

  const checks: BillingLiveDryRunChecks = {
    production_readiness_complete: readinessResult.data?.manual_status === 'manual_complete',
    approval_valid: approvalValid,
    tester_allowed: testerResult.data?.active === true,
    amount_valid: amountValid,
    amount_within_limit: amountValid && input.amount <= Number(policy.max_amount_per_charge),
    count_within_limit: successfulAttempts.length < Number(policy.max_successful_charges),
    total_within_limit: amountValid && successfulAmount + input.amount <= Number(policy.max_total_amount),
    reference_valid: reference.length >= 10 && reference.length <= 120,
    live_credentials_configured: environment.liveSecretConfigured && environment.liveWebhookConfigured,
    environment_locked: environment.environmentLocked,
    emergency_stop_active: control.emergency_stop === true,
    pilot_disabled: policy.pilot_enabled === false,
    code_test_only: environment.codeTestOnly && environment.acceptsRealMoney === false,
  }
  const eligible = allLiveEligibilityChecksPass(checks)

  const { data, error } = await admin.from('billing_live_checkout_dry_runs').insert({
    command_id: input.commandId,
    provider: 'stripe',
    environment: 'production_dry_run',
    tester_email: testerEmail,
    requested_amount: input.amount,
    reference,
    eligible,
    real_charge: false,
    checks,
    policy_version: policy.version,
    approval_request_id: approval?.id ?? null,
    actor_user_id: input.actorUserId,
    actor_email: input.actorEmail,
  }).select('*').single()
  if (error) throw error
  return data as BillingLiveCheckoutDryRun
}

import 'server-only'

import { buildShadowExecutorPlan, isShadowExecutorMode, type ShadowExecutorChecks } from '@/lib/billing/live-shadow-executor-contract'
import { inspectLiveSafetyEnvironment, type BillingLiveShadowCommand } from '@/lib/billing/live-safety'
import { createAdminClient } from '@/lib/supabase/admin'

type Input = {
  commandId: string
  dryRunId: string
  reason: string
  actorUserId: string
  actorEmail: string
}

export async function reserveShadowExecutorCommand(input: Input): Promise<BillingLiveShadowCommand> {
  const admin = createAdminClient()
  const { data: existing, error: existingError } = await admin
    .from('billing_live_shadow_commands')
    .select('*')
    .or(`command_id.eq.${input.commandId},source_dry_run_id.eq.${input.dryRunId}`)
    .limit(1)
    .maybeSingle()
  if (existingError) throw existingError
  if (existing) return existing as BillingLiveShadowCommand

  const [actorResult, dryRunResult, controlResult, policyResult, readinessResult, activeAdminResult, successfulAttemptsResult] = await Promise.all([
    admin.from('platform_admins').select('status').eq('user_id', input.actorUserId).maybeSingle(),
    admin.from('billing_live_checkout_dry_runs').select('*').eq('id', input.dryRunId).maybeSingle(),
    admin.from('billing_live_safety_controls').select('state, emergency_stop').eq('provider', 'stripe').maybeSingle(),
    admin.from('billing_live_rollout_policies').select('version, pilot_enabled, max_amount_per_charge, max_total_amount, max_successful_charges').eq('provider', 'stripe').maybeSingle(),
    admin.from('billing_production_readiness_reviews').select('manual_status').order('created_at', { ascending: false }).limit(1).maybeSingle(),
    admin.from('platform_admins').select('id', { count: 'exact', head: true }).eq('status', 'active'),
    admin.from('billing_payment_attempts').select('amount').eq('provider', 'stripe').eq('environment', 'production').eq('status', 'succeeded'),
  ])
  const firstError = [actorResult, dryRunResult, controlResult, policyResult, readinessResult, activeAdminResult, successfulAttemptsResult].find((result) => result.error)?.error
  if (firstError) throw firstError
  if (!dryRunResult.data) throw new Error('billing_live_dry_run_not_found')
  if (!controlResult.data || !policyResult.data) throw new Error('billing_live_configuration_missing')

  const dryRun = dryRunResult.data
  const policy = policyResult.data
  const environment = inspectLiveSafetyEnvironment()
  const [testerResult, approvalResult] = await Promise.all([
    admin.from('billing_live_testers').select('active').eq('provider', 'stripe').eq('email', dryRun.tester_email).maybeSingle(),
    dryRun.approval_request_id
      ? admin.from('billing_live_activation_requests').select('id, status, policy_version, max_amount_per_charge, max_total_amount, max_successful_charges, expires_at').eq('id', dryRun.approval_request_id).maybeSingle()
      : Promise.resolve({ data: null, error: null }),
  ])
  const dependentError = testerResult.error ?? approvalResult.error
  if (dependentError) throw dependentError

  const successfulAttempts = successfulAttemptsResult.data ?? []
  const successfulAmount = successfulAttempts.reduce((total, attempt) => total + Number(attempt.amount), 0)
  const approval = approvalResult.data
  const approvalValid = Boolean(
    approval
      && approval.status === 'approved'
      && new Date(approval.expires_at).getTime() > Date.now()
      && Number(approval.policy_version) === Number(policy.version)
      && Number(approval.max_amount_per_charge) === Number(policy.max_amount_per_charge)
      && Number(approval.max_total_amount) === Number(policy.max_total_amount)
      && Number(approval.max_successful_charges) === Number(policy.max_successful_charges),
  )
  const amount = Number(dryRun.requested_amount)
  const checks: ShadowExecutorChecks = {
    feature_flag_shadow: isShadowExecutorMode(process.env.STRIPE_LIVE_EXECUTOR_MODE),
    source_dry_run_eligible: dryRun.eligible === true && dryRun.real_charge === false,
    actor_active: actorResult.data?.status === 'active' && (activeAdminResult.count ?? 0) >= 2,
    production_readiness_complete: readinessResult.data?.manual_status === 'manual_complete' && controlResult.data.state === 'review_ready',
    approval_valid: approvalValid,
    tester_allowed: testerResult.data?.active === true,
    amount_within_current_limits: amount > 0 && amount <= Number(policy.max_amount_per_charge),
    volume_within_current_limits: successfulAttempts.length < Number(policy.max_successful_charges) && successfulAmount + amount <= Number(policy.max_total_amount),
    environment_locked: environment.environmentLocked,
    emergency_stop_active: controlResult.data.emergency_stop === true,
    pilot_disabled: policy.pilot_enabled === false,
    external_call_blocked: environment.codeTestOnly && environment.acceptsRealMoney === false,
  }
  const plan = buildShadowExecutorPlan(input.commandId, checks)

  const { data, error } = await admin.from('billing_live_shadow_commands').insert({
    command_id: input.commandId,
    source_dry_run_id: dryRun.id,
    provider: 'stripe',
    executor_mode: 'shadow',
    status: plan.decision,
    idempotency_key: plan.idempotencyKey,
    tester_email: dryRun.tester_email,
    requested_amount: amount,
    reference: dryRun.reference,
    reason: input.reason.trim(),
    policy_version: policy.version,
    approval_request_id: dryRun.approval_request_id,
    checks,
    stage_snapshot: plan.stages,
    real_charge: false,
    stripe_api_called: false,
    checkout_session_id: null,
    actor_user_id: input.actorUserId,
    actor_email: input.actorEmail,
  }).select('*').single()
  if (error) throw error
  return data as BillingLiveShadowCommand
}

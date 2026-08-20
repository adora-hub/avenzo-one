import { NextResponse } from 'next/server'
import { evaluateLiveEligibilityAuthorization } from '@/lib/billing/live-eligibility-contract'
import { buildLiveReleaseGateReport } from '@/lib/billing/live-release-gate'
import { inspectLiveSafetyEnvironment, type BillingLiveDryRunChecks } from '@/lib/billing/live-safety'
import { createAdminClient } from '@/lib/supabase/admin'
import { createClient } from '@/lib/supabase/server'

export const runtime = 'nodejs'

export async function POST() {
  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    const [adminResult, aalResult] = await Promise.all([
      user ? supabase.from('platform_admins').select('status').eq('user_id', user.id).maybeSingle() : Promise.resolve({ data: null }),
      supabase.auth.mfa.getAuthenticatorAssuranceLevel(),
    ])
    const authorization = evaluateLiveEligibilityAuthorization({
      userId: user?.id,
      email: user?.email,
      adminStatus: adminResult.data?.status,
      currentLevel: aalResult.data?.currentLevel,
    })
    if (!authorization.allowed) return NextResponse.json({ error: authorization.error }, { status: authorization.status })

    const admin = createAdminClient()
    const [readinessResult, controlResult, policyResult, approvalResult, adminsResult, testersResult, dryRunsResult] = await Promise.all([
      admin.from('billing_production_readiness_reviews').select('id, manual_status, created_at').order('created_at', { ascending: false }).limit(1).maybeSingle(),
      admin.from('billing_live_safety_controls').select('state, emergency_stop, version, updated_at').eq('provider', 'stripe').maybeSingle(),
      admin.from('billing_live_rollout_policies').select('pilot_enabled, version, max_amount_per_charge, max_total_amount, max_successful_charges').eq('provider', 'stripe').maybeSingle(),
      admin.from('billing_live_activation_requests').select('id, status, policy_version, max_amount_per_charge, max_total_amount, max_successful_charges, tester_count, requested_by, reviewed_by, expires_at').eq('provider', 'stripe').eq('status', 'approved').order('reviewed_at', { ascending: false }).limit(1).maybeSingle(),
      admin.from('platform_admins').select('user_id', { count: 'exact', head: true }).eq('status', 'active'),
      admin.from('billing_live_testers').select('id', { count: 'exact', head: true }).eq('provider', 'stripe').eq('active', true),
      admin.from('billing_live_checkout_dry_runs').select('id, command_id, reference, real_charge, checks').order('created_at', { ascending: false }).limit(200),
    ])
    const queryError = [readinessResult, controlResult, policyResult, approvalResult, adminsResult, testersResult, dryRunsResult].find((result) => result.error)?.error
    if (queryError) throw queryError

    const report = buildLiveReleaseGateReport({
      readiness: readinessResult.data,
      control: controlResult.data,
      policy: policyResult.data,
      approval: approvalResult.data,
      activeAdminCount: adminsResult.count ?? 0,
      activeTesterCount: testersResult.count ?? 0,
      environment: inspectLiveSafetyEnvironment(),
      dryRuns: (dryRunsResult.data ?? []).map((run) => ({ ...run, checks: run.checks as BillingLiveDryRunChecks })),
      generatedBy: authorization.email,
      generatedAt: new Date().toISOString(),
    })
    return NextResponse.json({ report })
  } catch (error) {
    console.error('Live release gate failed', error)
    return NextResponse.json({ error: 'live_release_gate_failed' }, { status: 500 })
  }
}

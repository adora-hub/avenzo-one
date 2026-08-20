import { NextResponse } from 'next/server'
import { buildLiveExecutorDesignReport } from '@/lib/billing/live-executor-design'
import { evaluateLiveEligibilityAuthorization } from '@/lib/billing/live-eligibility-contract'
import { inspectLiveSafetyEnvironment } from '@/lib/billing/live-safety'
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

    const [controlResult, policyResult] = await Promise.all([
      supabase.from('billing_live_safety_controls').select('emergency_stop').eq('provider', 'stripe').maybeSingle(),
      supabase.from('billing_live_rollout_policies').select('pilot_enabled').eq('provider', 'stripe').maybeSingle(),
    ])
    const queryError = controlResult.error ?? policyResult.error
    if (queryError) throw queryError

    const environment = inspectLiveSafetyEnvironment()
    const report = buildLiveExecutorDesignReport({
      requestedMode: process.env.STRIPE_LIVE_EXECUTOR_MODE,
      environmentLocked: environment.environmentLocked,
      emergencyStopActive: controlResult.data?.emergency_stop === true,
      pilotDisabled: policyResult.data?.pilot_enabled === false,
      generatedAt: new Date().toISOString(),
      generatedBy: authorization.email,
    })
    return NextResponse.json({ report })
  } catch (error) {
    console.error('Live executor design review failed', error)
    return NextResponse.json({ error: 'live_executor_design_review_failed' }, { status: 500 })
  }
}

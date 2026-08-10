import { NextResponse } from 'next/server'
import { evaluateAndRecordLiveCheckoutDryRun } from '@/lib/billing/live-checkout-dry-run'
import { evaluateLiveEligibilityAuthorization, parseLiveEligibilityRequest } from '@/lib/billing/live-eligibility-contract'
import { createClient } from '@/lib/supabase/server'

export const runtime = 'nodejs'

export async function POST(request: Request) {
  try {
    const body = parseLiveEligibilityRequest(await request.json())
    if (!body) {
      return NextResponse.json({ error: 'invalid_live_dry_run_request' }, { status: 400 })
    }

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

    const dryRun = await evaluateAndRecordLiveCheckoutDryRun({
      commandId: body.commandId,
      actorUserId: authorization.userId,
      actorEmail: authorization.email,
      testerEmail: body.testerEmail,
      amount: body.amount,
      reference: body.reference,
    })
    return NextResponse.json({ dryRun })
  } catch (error) {
    console.error('Live checkout dry-run failed', error)
    const message = error instanceof Error ? error.message : ''
    const safeError = ['platform_admin_required', 'billing_live_configuration_missing'].includes(message)
      ? message
      : 'live_checkout_dry_run_failed'
    return NextResponse.json({ error: safeError }, { status: 500 })
  }
}

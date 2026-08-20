import { NextResponse } from 'next/server'
import { evaluateLiveEligibilityAuthorization } from '@/lib/billing/live-eligibility-contract'
import { parseShadowExecutorRequest } from '@/lib/billing/live-shadow-executor-contract'
import { reserveShadowExecutorCommand } from '@/lib/billing/live-shadow-executor'
import { createClient } from '@/lib/supabase/server'

export const runtime = 'nodejs'

export async function POST(request: Request) {
  try {
    const body = parseShadowExecutorRequest(await request.json())
    if (!body) return NextResponse.json({ error: 'invalid_shadow_executor_request' }, { status: 400 })

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

    const command = await reserveShadowExecutorCommand({
      ...body,
      actorUserId: authorization.userId,
      actorEmail: authorization.email,
    })
    return NextResponse.json({ command })
  } catch (error) {
    console.error('Shadow executor reservation failed', error)
    const message = error instanceof Error ? error.message : ''
    const safeError = ['billing_live_dry_run_not_found', 'billing_live_configuration_missing'].includes(message)
      ? message
      : 'shadow_executor_reservation_failed'
    return NextResponse.json({ error: safeError }, { status: 500 })
  }
}

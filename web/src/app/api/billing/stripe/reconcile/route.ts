import { NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { createClient } from '@/lib/supabase/server'
import { retrieveStripeActualFeeBySessionId } from '@/lib/stripe/reconciliation'

export const runtime = 'nodejs'

export async function POST(request: Request) {
  try {
    const body = await request.json() as { attemptId?: string }
    if (!body.attemptId) return NextResponse.json({ error: 'payment_attempt_not_found' }, { status: 400 })

    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: 'authentication_required' }, { status: 401 })

    const [adminResult, aalResult] = await Promise.all([
      supabase.from('platform_admins').select('status').eq('user_id', user.id).maybeSingle(),
      supabase.auth.mfa.getAuthenticatorAssuranceLevel(),
    ])
    if (adminResult.data?.status !== 'active' || aalResult.data?.currentLevel !== 'aal2') {
      return NextResponse.json({ error: 'platform_admin_aal2_required' }, { status: 403 })
    }

    const admin = createAdminClient()
    const { data: attempt, error: attemptError } = await admin.from('billing_payment_attempts')
      .select('id, provider, environment, provider_session_id, status')
      .eq('id', body.attemptId)
      .maybeSingle()
    if (attemptError || !attempt) return NextResponse.json({ error: 'payment_attempt_not_found' }, { status: 404 })
    if (attempt.provider !== 'stripe' || attempt.environment !== 'sandbox' || !attempt.provider_session_id?.startsWith('cs_test_')) {
      return NextResponse.json({ error: 'stripe_test_attempt_required' }, { status: 400 })
    }
    if (attempt.status !== 'succeeded') {
      return NextResponse.json({ error: 'stripe_successful_attempt_required' }, { status: 409 })
    }

    const actual = await retrieveStripeActualFeeBySessionId(attempt.provider_session_id)
    if (actual.fee === null || actual.net === null) {
      return NextResponse.json({ error: 'stripe_fee_not_available' }, { status: 409 })
    }

    const { error: updateError } = await admin.from('billing_payment_attempts').update({
      provider_fee_actual: actual.fee,
      provider_net_amount: actual.net,
      updated_at: new Date().toISOString(),
    }).eq('id', attempt.id)
    if (updateError) throw updateError

    return NextResponse.json({ fee: actual.fee, net: actual.net })
  } catch (error) {
    console.error('Stripe test fee reconciliation failed', error)
    return NextResponse.json({ error: 'stripe_reconciliation_failed' }, { status: 500 })
  }
}

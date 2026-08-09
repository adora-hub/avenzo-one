import { NextResponse } from 'next/server'
import type { StripePaymentMethod } from '@/lib/billing/stripe-fees'
import { createClient } from '@/lib/supabase/server'
import { createStripeTestCheckout } from '@/lib/stripe/test-checkout'

export const runtime = 'nodejs'

function isPaymentMethod(value: unknown): value is StripePaymentMethod {
  return value === 'card' || value === 'promptpay'
}

export async function POST(request: Request) {
  try {
    const body = await request.json() as { invoiceId?: string; paymentMethod?: unknown; commandId?: string }
    if (!body.invoiceId || !body.commandId || !isPaymentMethod(body.paymentMethod)) {
      return NextResponse.json({ error: 'invalid_checkout_request' }, { status: 400 })
    }

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

    const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? new URL(request.url).origin
    const result = await createStripeTestCheckout({
      invoiceId: body.invoiceId,
      paymentMethod: body.paymentMethod,
      commandId: body.commandId,
      actorUserId: user.id,
      actorEmail: user.email,
      appUrl,
    })
    return NextResponse.json({ url: result.url })
  } catch (error) {
    const message = error instanceof Error ? error.message : ''
    const safeError = ['stripe_test_key_not_configured', 'stripe_test_key_required'].includes(message)
      ? message
      : 'stripe_checkout_failed'
    console.error('Stripe test checkout failed', error)
    return NextResponse.json({ error: safeError }, { status: 500 })
  }
}

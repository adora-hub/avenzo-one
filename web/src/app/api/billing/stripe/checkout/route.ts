import { randomUUID } from 'node:crypto'
import { NextResponse } from 'next/server'
import { calculateStripeFeeSnapshot, type StripePaymentMethod } from '@/lib/billing/stripe-fees'
import { createAdminClient } from '@/lib/supabase/admin'
import { createClient } from '@/lib/supabase/server'
import { getStripeTestClient } from '@/lib/stripe/server'

export const runtime = 'nodejs'

function isPaymentMethod(value: unknown): value is StripePaymentMethod {
  return value === 'card' || value === 'promptpay'
}

function toStripeAmount(value: number) {
  return Math.round(value * 100)
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

    const admin = createAdminClient()
    const { data: existing } = await admin.from('billing_payment_attempts')
      .select('provider_session_id').eq('command_id', body.commandId).maybeSingle()
    const stripe = getStripeTestClient()
    if (existing?.provider_session_id?.startsWith('cs_test_')) {
      const session = await stripe.checkout.sessions.retrieve(existing.provider_session_id)
      return NextResponse.json({ url: session.url })
    }

    const { data: invoice, error: invoiceError } = await admin.from('billing_invoices')
      .select('id, invoice_number, organization_id, total_amount, currency, status')
      .eq('id', body.invoiceId).maybeSingle()
    if (invoiceError || !invoice) return NextResponse.json({ error: 'invoice_not_found' }, { status: 404 })
    if (!['pending', 'failed'].includes(invoice.status)) return NextResponse.json({ error: 'invoice_not_payable' }, { status: 409 })
    if (invoice.currency !== 'THB' || Number(invoice.total_amount) <= 0) return NextResponse.json({ error: 'stripe_test_requires_positive_thb_invoice' }, { status: 400 })

    const invoiceAmount = Number(invoice.total_amount)
    const fee = calculateStripeFeeSnapshot(invoiceAmount, body.paymentMethod)
    const attemptId = randomUUID()
    const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? new URL(request.url).origin
    const { data: customer } = await admin.from('billing_customer_profiles').select('email').eq('organization_id', invoice.organization_id).maybeSingle()

    const session = await stripe.checkout.sessions.create({
      mode: 'payment',
      payment_method_types: [body.paymentMethod],
      client_reference_id: attemptId,
      customer_email: customer?.email || user.email,
      line_items: [{
        quantity: 1,
        price_data: {
          currency: 'thb',
          unit_amount: toStripeAmount(fee.customerChargeAmount),
          product_data: { name: `AVENZO ONE · ${invoice.invoice_number}`, description: 'Subscription Invoice — Stripe Test Mode' },
        },
      }],
      metadata: { attempt_id: attemptId, invoice_id: invoice.id, environment: 'sandbox', fee_policy: 'avenzo_absorbs' },
      success_url: `${appUrl}/billing/checkout/success?session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${appUrl}/billing/checkout/cancel?invoice=${invoice.id}`,
    }, { idempotencyKey: `avenzo-checkout-${body.commandId}` })

    const { error: attemptError } = await admin.from('billing_payment_attempts').insert({
      id: attemptId,
      command_id: body.commandId,
      invoice_id: invoice.id,
      organization_id: invoice.organization_id,
      provider: 'stripe',
      environment: 'sandbox',
      provider_session_id: session.id,
      idempotency_key: body.commandId,
      status: 'pending',
      amount: invoiceAmount,
      currency: invoice.currency,
      payment_method: fee.paymentMethod,
      fee_rate_bps: fee.feeRateBps,
      fee_fixed_amount: fee.feeFixedAmount,
      estimated_provider_fee: fee.estimatedProviderFee,
      customer_fee_amount: fee.customerFeeAmount,
      customer_charge_amount: fee.customerChargeAmount,
      metadata: { source: 'stripe_test_checkout', real_charge: false, fee_policy: 'avenzo_absorbs' },
      created_by: user.id,
    })
    if (attemptError) throw attemptError

    return NextResponse.json({ url: session.url })
  } catch (error) {
    const message = error instanceof Error ? error.message : ''
    const safeError = ['stripe_test_key_not_configured', 'stripe_test_key_required'].includes(message)
      ? message
      : 'stripe_checkout_failed'
    console.error('Stripe test checkout failed', error)
    return NextResponse.json({ error: safeError }, { status: 500 })
  }
}

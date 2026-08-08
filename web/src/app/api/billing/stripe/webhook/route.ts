import { createHash } from 'node:crypto'
import { NextResponse } from 'next/server'
import type Stripe from 'stripe'
import { createAdminClient } from '@/lib/supabase/admin'
import { getStripeTestClient, getStripeWebhookSecret } from '@/lib/stripe/server'
import { retrieveStripeActualFee } from '@/lib/stripe/reconciliation'

export const runtime = 'nodejs'

function eventResult(event: Stripe.Event, session: Stripe.Checkout.Session) {
  if (event.type === 'checkout.session.expired') return 'expired'
  if (event.type === 'checkout.session.async_payment_failed') return 'failed'
  if (event.type === 'checkout.session.async_payment_succeeded') return 'succeeded'
  if (event.type === 'checkout.session.completed' && session.payment_status === 'paid') return 'succeeded'
  return null
}

export async function POST(request: Request) {
  const rawBody = await request.text()
  const signature = request.headers.get('stripe-signature')
  if (!signature) return NextResponse.json({ error: 'stripe_signature_required' }, { status: 400 })

  let event: Stripe.Event
  try {
    event = getStripeTestClient().webhooks.constructEvent(rawBody, signature, getStripeWebhookSecret())
  } catch {
    return NextResponse.json({ error: 'invalid_stripe_signature' }, { status: 400 })
  }
  if (event.livemode) return NextResponse.json({ error: 'live_stripe_events_are_disabled' }, { status: 400 })
  if (!event.type.startsWith('checkout.session.')) return NextResponse.json({ received: true, ignored: true })

  const session = event.data.object as Stripe.Checkout.Session
  const result = eventResult(event, session)
  if (!result) return NextResponse.json({ received: true, ignored: true })

  const occurredAt = new Date(event.created * 1000).toISOString()
  const hash = createHash('sha256').update(rawBody).digest('hex')
  const actual = result === 'succeeded'
    ? await retrieveStripeActualFee(session)
    : { fee: null, net: null, balanceTransactionId: null }
  const admin = createAdminClient()
  const { error } = await admin.rpc('server_process_stripe_test_event', {
    p_provider_event_id: event.id,
    p_provider_session_id: session.id,
    p_result_status: result,
    p_occurred_at: occurredAt,
    p_payload_sha256: hash,
    p_provider_fee_actual: actual.fee,
    p_provider_net_amount: actual.net,
    p_metadata: {
      payment_status: session.payment_status,
      stripe_livemode: false,
      actual_fee_available: actual.fee !== null,
      balance_transaction_id: actual.balanceTransactionId,
    },
  })
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ received: true })
}

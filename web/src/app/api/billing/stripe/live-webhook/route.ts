import { createHash } from 'node:crypto'
import { NextResponse } from 'next/server'
import type Stripe from 'stripe'
import { createAdminClient } from '@/lib/supabase/admin'
import { getStripeLiveClient, getStripeLiveWebhookSecret } from '@/lib/stripe/server'

export const runtime = 'nodejs'

export async function POST(request: Request) {
  const rawBody = await request.text()
  const signature = request.headers.get('stripe-signature')
  if (!signature) return NextResponse.json({ error: 'stripe_signature_required' }, { status: 400 })

  let event: Stripe.Event
  try {
    event = getStripeLiveClient().webhooks.constructEvent(rawBody, signature, getStripeLiveWebhookSecret())
  } catch (error) {
    const message = error instanceof Error ? error.message : ''
    const configurationError = message === 'stripe_live_key_not_configured'
      || message === 'stripe_live_key_required'
      || message === 'stripe_live_webhook_secret_not_configured'
    return NextResponse.json(
      { error: configurationError ? message : 'invalid_stripe_signature' },
      { status: configurationError ? 503 : 400 },
    )
  }

  if (!event.livemode) {
    return NextResponse.json({ error: 'test_event_sent_to_live_webhook' }, { status: 400 })
  }

  const admin = createAdminClient()
  const payloadHash = createHash('sha256').update(rawBody).digest('hex')
  const providerCreatedAt = new Date(event.created * 1000).toISOString()
  const { error } = await admin.from('billing_live_webhook_inbox').upsert({
    provider: 'stripe',
    environment: 'production',
    provider_event_id: event.id,
    event_type: event.type,
    payload_sha256: payloadHash,
    livemode: true,
    processing_status: 'blocked_by_emergency_stop',
    provider_created_at: providerCreatedAt,
  }, { onConflict: 'provider_event_id', ignoreDuplicates: true })

  if (error) {
    console.error(JSON.stringify({
      level: 'error',
      message: 'stripe_live_webhook_quarantine_failed',
      eventId: event.id,
      eventType: event.type,
      code: error.code,
    }))
    return NextResponse.json({ error: 'live_webhook_quarantine_failed' }, { status: 500 })
  }

  console.log(JSON.stringify({
    level: 'info',
    message: 'stripe_live_webhook_quarantined',
    eventId: event.id,
    eventType: event.type,
  }))
  return NextResponse.json({ received: true, processing: 'blocked_by_emergency_stop' })
}

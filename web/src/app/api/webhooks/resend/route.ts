import { NextResponse } from 'next/server'
import { Webhook } from 'svix'
import { createAdminClient } from '@/lib/supabase/admin'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const supportedEvents = new Set([
  'email.sent',
  'email.delivery_delayed',
  'email.delivered',
  'email.failed',
  'email.bounced',
  'email.complained',
  'email.suppressed',
])

type ResendWebhookEvent = {
  type?: string
  created_at?: string
  data?: {
    email_id?: string
    tags?: Record<string, string>
    bounce?: { type?: string; subType?: string }
  }
}
export async function POST(request: Request) {
  const secret = process.env.RESEND_WEBHOOK_SECRET
  if (!secret) return NextResponse.json({ error: 'webhook_not_configured' }, { status: 503 })

  const eventId = request.headers.get('svix-id')
  const timestamp = request.headers.get('svix-timestamp')
  const signature = request.headers.get('svix-signature')
  if (!eventId || !timestamp || !signature) {
    return NextResponse.json({ error: 'invalid_webhook_signature' }, { status: 400 })
  }

  const payload = await request.text()
  let event: ResendWebhookEvent
  try {
    event = new Webhook(secret).verify(payload, {
      'svix-id': eventId,
      'svix-timestamp': timestamp,
      'svix-signature': signature,
    }) as ResendWebhookEvent
  } catch {
    return NextResponse.json({ error: 'invalid_webhook_signature' }, { status: 400 })
  }

  if (!event.type || !supportedEvents.has(event.type)) {
    return NextResponse.json({ received: true, ignored: true })
  }

  const providerMessageId = event.data?.email_id
  const occurredAt = event.created_at
  if (!providerMessageId || !occurredAt || Number.isNaN(Date.parse(occurredAt))) {
    return NextResponse.json({ error: 'invalid_webhook_payload' }, { status: 400 })
  }

  const payloadSummary = {
    notification_type: event.data?.tags?.notification_type ?? null,
    organization_id: event.data?.tags?.organization_id ?? null,
    bounce_type: event.data?.bounce?.type ?? null,
    bounce_subtype: event.data?.bounce?.subType ?? null,
  }

  const admin = createAdminClient()
  const { data, error } = await admin.rpc('worker_record_resend_webhook', {
    p_event_id: eventId,
    p_event_type: event.type,
    p_provider_message_id: providerMessageId,
    p_occurred_at: occurredAt,
    p_payload_summary: payloadSummary,
  })
  if (error) {
    console.error('resend_webhook_processing_failed', error.code)
    return NextResponse.json({ error: 'webhook_processing_failed' }, { status: 500 })
  }

  return NextResponse.json({ received: true, result: data })
}

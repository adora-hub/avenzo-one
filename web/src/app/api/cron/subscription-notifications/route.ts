import { NextResponse } from 'next/server'
import { processSubscriptionNotifications } from '@/lib/subscription-notification-worker'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function GET(request: Request) {
  const startedAt = Date.now()
  const requestId = request.headers.get('x-vercel-id')
  const cronSecret = process.env.CRON_SECRET
  if (!cronSecret || request.headers.get('authorization') !== `Bearer ${cronSecret}`) {
    console.warn(JSON.stringify({ level: 'warning', message: 'subscription_notification_cron_unauthorized', route: '/api/cron/subscription-notifications', requestId }))
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
  }

  console.log(JSON.stringify({ level: 'info', message: 'subscription_notification_cron_started', route: '/api/cron/subscription-notifications', requestId }))
  try {
    const result = await processSubscriptionNotifications('cron')
    console.log(JSON.stringify({ level: 'info', message: 'subscription_notification_cron_completed', route: '/api/cron/subscription-notifications', requestId, runId: result.runId, durationMs: Date.now() - startedAt, sent: result.sent, failed: result.failed }))
    return NextResponse.json(result)
  } catch (error) {
    const message = error instanceof Error ? error.message : 'worker_failed'
    console.error(JSON.stringify({ level: 'error', message: 'subscription_notification_cron_failed', route: '/api/cron/subscription-notifications', requestId, error: message, durationMs: Date.now() - startedAt }))
    return NextResponse.json({ error: message }, { status: 500 })
  }
}

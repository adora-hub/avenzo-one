import { NextResponse } from 'next/server'
import { processSubscriptionNotifications } from '@/lib/subscription-notification-worker'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function GET(request: Request) {
  const cronSecret = process.env.CRON_SECRET
  if (!cronSecret || request.headers.get('authorization') !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
  }

  try {
    return NextResponse.json(await processSubscriptionNotifications())
  } catch (error) {
    const message = error instanceof Error ? error.message : 'worker_failed'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}

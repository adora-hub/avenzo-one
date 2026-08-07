import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { processSubscriptionNotifications } from '@/lib/subscription-notification-worker'

export const runtime = 'nodejs'

export async function POST() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'authentication_required' }, { status: 401 })

  const [adminResult, assuranceResult] = await Promise.all([
    supabase.from('platform_admins').select('status').eq('user_id', user.id).maybeSingle(),
    supabase.auth.mfa.getAuthenticatorAssuranceLevel(),
  ])
  if (adminResult.data?.status !== 'active' || assuranceResult.data?.currentLevel !== 'aal2') {
    return NextResponse.json({ error: 'platform_admin_aal2_required' }, { status: 403 })
  }

  try {
    return NextResponse.json(await processSubscriptionNotifications())
  } catch (error) {
    const message = error instanceof Error ? error.message : 'worker_failed'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}

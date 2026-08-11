import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { sendCurrentSessionSecurityEmail } from '@/lib/session-security-email'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function POST(request: Request) {
  let body: { type?: string }
  try {
    body = await request.json() as { type?: string }
  } catch {
    return NextResponse.json({ error: 'invalid_request' }, { status: 400 })
  }

  if (body.type !== 'new_device_login') {
    return NextResponse.json({ error: 'unsupported_notification_type' }, { status: 400 })
  }

  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user?.email) {
    return NextResponse.json({ error: 'authentication_required' }, { status: 401 })
  }

  const result = await sendCurrentSessionSecurityEmail(
    supabase,
    user.email,
    'new_device_login',
  )

  return NextResponse.json({ accepted: true, status: result.status })
}

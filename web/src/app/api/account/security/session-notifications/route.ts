import { NextResponse } from 'next/server'
import { createClient as createSupabaseClient } from '@supabase/supabase-js'
import { createClient as createServerClient } from '@/lib/supabase/server'
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

  const authorization = request.headers.get('authorization')
  const accessToken = authorization?.startsWith('Bearer ')
    ? authorization.slice('Bearer '.length).trim()
    : ''
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY
  const supabase = accessToken && url && key
    ? createSupabaseClient(url, key, {
        auth: { autoRefreshToken: false, persistSession: false },
        global: { headers: { Authorization: `Bearer ${accessToken}` } },
      })
    : await createServerClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user?.email) {
    return NextResponse.json({ error: 'authentication_required' }, { status: 401 })
  }

  const result = await sendCurrentSessionSecurityEmail(
    supabase,
    user.email,
    'new_device_login',
  )

  return NextResponse.json({
    accepted: true,
    status: result.status,
    errorCode: result.safeCode ?? null,
  })
}

import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

type SessionRequest = {
  accessToken?: string
  refreshToken?: string
  register?: boolean
}

function noStoreJson(body: unknown, status = 200) {
  return NextResponse.json(body, {
    status,
    headers: { 'Cache-Control': 'private, no-store, max-age=0' },
  })
}

export async function POST(request: Request) {
  const body = await request.json().catch(() => null) as SessionRequest | null
  if (!body?.accessToken || !body.refreshToken) {
    return noStoreJson({ error: { code: 'invalid_session', message: 'Auth session tokens are required' } }, 400)
  }

  const supabase = await createClient()
  const { data, error } = await supabase.auth.setSession({
    access_token: body.accessToken,
    refresh_token: body.refreshToken,
  })

  if (error || !data.user) {
    return noStoreJson({
      error: {
        code: error?.code ?? 'invalid_session',
        message: error?.message ?? 'Unable to establish the auth session',
      },
    }, 401)
  }

  const registration = body.register
    ? await supabase.rpc('app_register_current_session')
    : null

  return noStoreJson({
    userId: data.user.id,
    registered: body.register ? !registration?.error : false,
  })
}

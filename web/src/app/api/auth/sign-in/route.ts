import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

type SignInRequest = {
  email?: string
  password?: string
  next?: string
}

function noStoreJson(body: unknown, status = 200) {
  return NextResponse.json(body, {
    status,
    headers: { 'Cache-Control': 'private, no-store, max-age=0' },
  })
}

function safeNextPath(value: string | undefined) {
  return value?.startsWith('/') && !value.startsWith('//') ? value : '/dashboard'
}

export async function POST(request: Request) {
  const body = await request.json().catch(() => null) as SignInRequest | null
  const email = body?.email?.trim().toLowerCase()
  const password = body?.password

  if (!email || !password) {
    return noStoreJson({ error: { code: 'invalid_credentials', message: 'Email and password are required' } }, 400)
  }

  const supabase = await createClient()
  const { data, error } = await supabase.auth.signInWithPassword({ email, password })

  if (error || !data.user) {
    const authServiceUnavailable = !error?.code
      && /fetch failed|network|unable to connect/i.test(error?.message ?? '')

    return noStoreJson({
      error: {
        code: authServiceUnavailable ? 'auth_service_unreachable' : error?.code ?? 'invalid_credentials',
        message: authServiceUnavailable
          ? 'Authentication service is temporarily unreachable'
          : error?.message ?? 'Invalid login credentials',
      },
    }, authServiceUnavailable ? 503 : 401)
  }

  const nextPath = safeNextPath(body?.next)
  const [platformAdminResult, assuranceResult] = await Promise.all([
    supabase.from('platform_admins').select('status').eq('user_id', data.user.id).maybeSingle(),
    supabase.auth.mfa.getAuthenticatorAssuranceLevel(),
  ])
  const isPlatformAdmin = platformAdminResult.data?.status === 'active'
  const requiresMfa = isPlatformAdmin
    && assuranceResult.data?.nextLevel === 'aal2'
    && assuranceResult.data.currentLevel !== 'aal2'

  if (requiresMfa) {
    const destination = body?.next ? nextPath : '/platform-admin'
    return noStoreJson({
      destination: `/auth/mfa?next=${encodeURIComponent(destination)}`,
      registered: false,
    })
  }

  const registration = await supabase.rpc('app_register_current_session')
  const destination = isPlatformAdmin && !body?.next ? '/platform-admin' : nextPath

  return noStoreJson({
    destination,
    registered: !registration.error,
  })
}

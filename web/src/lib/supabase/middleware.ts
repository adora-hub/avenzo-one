import { createServerClient } from '@supabase/ssr'
import { NextResponse, type NextRequest } from 'next/server'
import { resolveAppSessionLogoutReason } from '@/lib/session-activity'

type CurrentSessionStatusRow = {
  registered: boolean
  idle_expired: boolean
  absolute_expired: boolean
  revoked: boolean
}

function privateNoStore(response: NextResponse) {
  response.headers.set('Cache-Control', 'private, no-store, max-age=0')
  response.headers.set('Pragma', 'no-cache')
  return response
}

function copyResponseCookies(source: NextResponse, target: NextResponse) {
  source.cookies.getAll().forEach((cookie) => {
    target.cookies.set(cookie.name, cookie.value, cookie)
  })
  return target
}

function firstStatusRow(data: unknown): CurrentSessionStatusRow | null {
  if (Array.isArray(data)) return (data[0] as CurrentSessionStatusRow | undefined) ?? null
  if (data && typeof data === 'object') return data as CurrentSessionStatusRow
  return null
}

export async function updateSession(request: NextRequest) {
  let response = NextResponse.next({ request })
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY

  if (!url || !key) return response

  const supabase = createServerClient(url, key, {
    cookies: {
      getAll() { return request.cookies.getAll() },
      setAll(cookiesToSet) {
        cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value))
        response = NextResponse.next({ request })
        cookiesToSet.forEach(({ name, value, options }) => response.cookies.set(name, value, options))
      },
    },
  })

  const { data } = await supabase.auth.getClaims()
  const pathname = request.nextUrl.pathname
  const isPublic = pathname === '/'
    || pathname === '/privacy'
    || pathname === '/terms'
    || pathname.startsWith('/auth')
    || pathname.startsWith('/ui-kit')
  const isApi = pathname.startsWith('/api/')

  if (!data?.claims && !isPublic && !isApi) {
    const redirectUrl = request.nextUrl.clone()
    const requestedPath = `${request.nextUrl.pathname}${request.nextUrl.search}`
    redirectUrl.pathname = '/'
    redirectUrl.search = ''
    redirectUrl.searchParams.set('next', requestedPath)
    return privateNoStore(NextResponse.redirect(redirectUrl))
  }

  if (data?.claims && !isPublic) {
    const { data: statusData, error: statusError } = await supabase.rpc('app_current_session_status')
    const status = statusError ? null : firstStatusRow(statusData)
    const reason = status?.registered
      ? resolveAppSessionLogoutReason({
          revoked: status.revoked,
          absoluteExpired: status.absolute_expired,
          idleExpired: status.idle_expired,
        })
      : null

    if (reason) {
      await supabase.auth.signOut({ scope: 'local' })

      if (isApi) {
        const expiredResponse = NextResponse.json(
          { error: 'session_expired', reason },
          { status: 401 },
        )
        return privateNoStore(copyResponseCookies(response, expiredResponse))
      }

      const redirectUrl = request.nextUrl.clone()
      redirectUrl.pathname = '/'
      redirectUrl.search = ''
      redirectUrl.searchParams.set('session', reason)
      return privateNoStore(copyResponseCookies(response, NextResponse.redirect(redirectUrl)))
    }

    return privateNoStore(response)
  }

  return response
}

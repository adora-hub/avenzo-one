import { createServerClient } from '@supabase/ssr'
import { NextResponse, type NextRequest } from 'next/server'

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
  const isPublic = pathname === '/' || pathname.startsWith('/auth')
  const isApi = pathname.startsWith('/api/')

  if (!data?.claims && !isPublic && !isApi) {
    const redirectUrl = request.nextUrl.clone()
    const requestedPath = `${request.nextUrl.pathname}${request.nextUrl.search}`
    redirectUrl.pathname = '/'
    redirectUrl.search = ''
    redirectUrl.searchParams.set('next', requestedPath)
    return NextResponse.redirect(redirectUrl)
  }

  return response
}

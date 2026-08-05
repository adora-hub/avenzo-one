import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

export async function GET(request: Request) {
  const { searchParams, origin } = new URL(request.url)
  const code = searchParams.get('code')

  if (code) {
    const supabase = await createClient()
    await supabase.auth.exchangeCodeForSession(code)
  }

  const next = searchParams.get('next')
  const safeNext = next && next.startsWith('/') && !next.startsWith('//') ? next : '/dashboard'
  return NextResponse.redirect(`${origin}${safeNext}`)
}

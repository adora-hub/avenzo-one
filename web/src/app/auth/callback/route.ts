import { NextResponse } from 'next/server'
import type { EmailOtpType } from '@supabase/supabase-js'
import { registerCurrentAppSession, reportSessionRegistrationFailure } from '@/lib/session-registration'
import { createClient } from '@/lib/supabase/server'

export async function GET(request: Request) {
  const { searchParams, origin } = new URL(request.url)
  const code = searchParams.get('code')
  const tokenHash = searchParams.get('token_hash')
  const type = searchParams.get('type')
  const supabase = await createClient()

  let authSucceeded = false
  if (code) {
    const { error } = await supabase.auth.exchangeCodeForSession(code)
    authSucceeded = !error
  } else if (tokenHash && type) {
    // Supabase invite/confirmation emails can return a token_hash instead
    // of a PKCE code. Verify it here so the invitee gets a session.
    const { error } = await supabase.auth.verifyOtp({
      token_hash: tokenHash,
      type: type as EmailOtpType,
    })
    authSucceeded = !error
  }

  if (authSucceeded) {
    const registration = await registerCurrentAppSession(supabase)
    reportSessionRegistrationFailure('auth-callback', registration)
  }

  const next = searchParams.get('next')
  const safeNext = next && next.startsWith('/') && !next.startsWith('//') ? next : '/dashboard'
  return NextResponse.redirect(`${origin}${safeNext}`)
}

import { NextResponse } from 'next/server'
import type { EmailOtpType } from '@supabase/supabase-js'
import { registerCurrentAppSession, reportSessionRegistrationFailure } from '@/lib/session-registration'
import { createClient } from '@/lib/supabase/server'

export async function GET(request: Request) {
  const { searchParams, origin } = new URL(request.url)
  const code = searchParams.get('code')
  const tokenHash = searchParams.get('token_hash')
  const type = searchParams.get('type')
  const next = searchParams.get('next')
  const safeNext = next && next.startsWith('/') && !next.startsWith('//') ? next : '/dashboard'
  const isPasswordRecovery = safeNext === '/auth/set-password' || type === 'recovery'
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

  if (authSucceeded && !isPasswordRecovery) {
    const registration = await registerCurrentAppSession(supabase)
    reportSessionRegistrationFailure('auth-callback', registration)
  }

  if (!authSucceeded && isPasswordRecovery && (code || tokenHash)) {
    return NextResponse.redirect(`${origin}/auth/set-password?error=recovery_link_invalid`)
  }

  return NextResponse.redirect(`${origin}${safeNext}`)
}

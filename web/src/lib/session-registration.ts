import type { SupabaseClient } from '@supabase/supabase-js'

export type AppSessionRegistrationResult = {
  registered: boolean
  errorMessage: string | null
}

/**
 * Registers the authenticated caller's current Supabase session.
 *
 * Phase 1.2.2.1 records the session only. A registration failure must not
 * replace a successful Supabase login with an application login failure.
 */
export async function registerCurrentAppSession(
  supabase: Pick<SupabaseClient, 'rpc'>,
): Promise<AppSessionRegistrationResult> {
  try {
    const { error } = await supabase.rpc('app_register_current_session')

    if (error) {
      return { registered: false, errorMessage: error.message }
    }

    return { registered: true, errorMessage: null }
  } catch (error) {
    return {
      registered: false,
      errorMessage: error instanceof Error ? error.message : 'unknown_session_registration_error',
    }
  }
}

export function reportSessionRegistrationFailure(
  context: 'auth-callback' | 'hash-session' | 'mfa-challenge' | 'password-login',
  result: AppSessionRegistrationResult,
) {
  if (result.registered) return

  console.error('[session-registration] registration failed', {
    context,
    message: result.errorMessage,
  })
}

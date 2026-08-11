import { createClient } from '@/lib/supabase/browser'

export type SessionSecurityNotificationRequestResult = {
  accepted: boolean
  status: 'sent' | 'skipped' | 'failed' | null
  errorCode: string | null
}

export async function requestNewDeviceLoginNotification(): Promise<SessionSecurityNotificationRequestResult> {
  try {
    const supabase = createClient()
    const { data: { session }, error: sessionError } = await supabase.auth.getSession()
    if (sessionError || !session?.access_token) {
      return {
        accepted: false,
        status: null,
        errorCode: sessionError?.name ?? 'authenticated_session_missing',
      }
    }

    const response = await fetch('/api/account/security/session-notifications', {
      method: 'POST',
      credentials: 'same-origin',
      cache: 'no-store',
      headers: {
        Authorization: `Bearer ${session.access_token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ type: 'new_device_login' }),
    })
    const body = await response.json().catch(() => ({})) as {
      accepted?: boolean
      status?: 'sent' | 'skipped' | 'failed'
      error?: string
      errorCode?: string | null
    }

    if (!response.ok) {
      return {
        accepted: false,
        status: null,
        errorCode: body.error ?? `notification_http_${response.status}`,
      }
    }

    return {
      accepted: body.accepted === true,
      status: body.status ?? null,
      errorCode: body.errorCode ?? null,
    }
  } catch (error) {
    return {
      accepted: false,
      status: null,
      errorCode: error instanceof Error ? error.name : 'notification_request_failed',
    }
  }
}

export function reportSessionSecurityNotificationFailure(
  context: 'hash-session' | 'mfa-challenge' | 'password-login' | 'session-heartbeat',
  result: SessionSecurityNotificationRequestResult,
) {
  if (result.accepted && result.status !== 'failed') return

  console.warn('[session-security-email] notification request did not send', {
    context,
    status: result.status,
    code: result.errorCode,
  })
}

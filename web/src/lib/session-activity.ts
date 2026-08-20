import type { SupabaseClient } from '@supabase/supabase-js'
import type { AppSessionPolicyTier } from '@/lib/session-policy'

export const SESSION_HEARTBEAT_MIN_INTERVAL_MS = 60_000

type SessionHeartbeatRpcRow = {
  registered: boolean
  heartbeat_recorded: boolean
  policy_tier: AppSessionPolicyTier
  policy_version: number
  warning_seconds: number
  server_time: string
  started_at: string | null
  last_seen_at: string | null
  idle_expires_at: string | null
  absolute_expires_at: string | null
  idle_expired: boolean
  absolute_expired: boolean
  revoked: boolean
}

export type AppSessionActivityStatus = {
  registered: boolean
  heartbeatRecorded: boolean
  policyTier: AppSessionPolicyTier
  policyVersion: number
  warningSeconds: number
  serverTime: string
  startedAt: string | null
  lastSeenAt: string | null
  idleExpiresAt: string | null
  absoluteExpiresAt: string | null
  idleExpired: boolean
  absoluteExpired: boolean
  revoked: boolean
}

export type AppSessionActivityResult = {
  status: AppSessionActivityStatus | null
  errorMessage: string | null
}

export type AppSessionExpiryKind = 'idle' | 'absolute' | 'revoked'
export type AppSessionLogoutReason = 'idle_timeout' | 'absolute_timeout' | 'revoked'

export type AppSessionExpiryState = {
  kind: AppSessionExpiryKind
  expiresAt: string | null
  remainingSeconds: number
  warningSeconds: number
  showWarning: boolean
  expired: boolean
}

export function resolveAppSessionLogoutReason(input: {
  revoked: boolean
  absoluteExpired: boolean
  idleExpired: boolean
}): AppSessionLogoutReason | null {
  if (input.revoked) return 'revoked'
  if (input.absoluteExpired) return 'absolute_timeout'
  if (input.idleExpired) return 'idle_timeout'
  return null
}

export function expiryKindToLogoutReason(
  kind: AppSessionExpiryKind,
): AppSessionLogoutReason {
  if (kind === 'revoked') return 'revoked'
  return kind === 'absolute' ? 'absolute_timeout' : 'idle_timeout'
}

export function getAppSessionLogoutMessage(reason: string | null): string | null {
  if (reason === 'idle_timeout') {
    return 'ออกจากระบบเนื่องจากไม่มีการใช้งานตามเวลาที่กำหนด กรุณาเข้าสู่ระบบใหม่'
  }
  if (reason === 'absolute_timeout') {
    return 'Session ครบอายุสูงสุดแล้ว กรุณาเข้าสู่ระบบใหม่'
  }
  if (reason === 'revoked') {
    return 'Session นี้ถูกยกเลิกแล้ว กรุณาเข้าสู่ระบบใหม่'
  }
  return null
}

function timestampMs(value: string | null): number | null {
  if (!value) return null
  const parsed = Date.parse(value)
  return Number.isFinite(parsed) ? parsed : null
}

export function calculateAppSessionExpiryState(
  status: AppSessionActivityStatus,
  observedAtMs: number,
  nowMs: number,
): AppSessionExpiryState | null {
  const warningSeconds = Math.max(0, Math.floor(status.warningSeconds))

  if (status.revoked) {
    return {
      kind: 'revoked',
      expiresAt: null,
      remainingSeconds: 0,
      warningSeconds,
      showWarning: true,
      expired: true,
    }
  }

  const serverTimeMs = timestampMs(status.serverTime)
  const idleExpiryMs = timestampMs(status.idleExpiresAt)
  const absoluteExpiryMs = timestampMs(status.absoluteExpiresAt)
  if (serverTimeMs === null || (idleExpiryMs === null && absoluteExpiryMs === null)) return null

  const elapsedSinceObservationMs = Math.max(0, nowMs - observedAtMs)
  const estimatedServerNowMs = serverTimeMs + elapsedSinceObservationMs
  const useAbsolute = absoluteExpiryMs !== null && (
    idleExpiryMs === null || absoluteExpiryMs <= idleExpiryMs
  )
  const kind: AppSessionExpiryKind = useAbsolute ? 'absolute' : 'idle'
  const expiryMs = useAbsolute ? absoluteExpiryMs : idleExpiryMs
  if (expiryMs === null) return null

  const remainingSeconds = Math.max(0, Math.ceil((expiryMs - estimatedServerNowMs) / 1_000))
  const expired = status.idleExpired
    || status.absoluteExpired
    || remainingSeconds === 0

  return {
    kind,
    expiresAt: new Date(expiryMs).toISOString(),
    remainingSeconds,
    warningSeconds,
    showWarning: expired || remainingSeconds <= warningSeconds,
    expired,
  }
}

function firstRpcRow(data: unknown): SessionHeartbeatRpcRow | null {
  if (Array.isArray(data)) return (data[0] as SessionHeartbeatRpcRow | undefined) ?? null
  if (data && typeof data === 'object') return data as SessionHeartbeatRpcRow
  return null
}

export async function touchCurrentAppSession(
  supabase: Pick<SupabaseClient, 'rpc'>,
): Promise<AppSessionActivityResult> {
  try {
    const { data, error } = await supabase.rpc('app_touch_current_session')

    if (error) return { status: null, errorMessage: error.message }

    const row = firstRpcRow(data)
    if (!row) return { status: null, errorMessage: 'session_heartbeat_result_missing' }

    return {
      status: {
        registered: row.registered,
        heartbeatRecorded: row.heartbeat_recorded,
        policyTier: row.policy_tier,
        policyVersion: row.policy_version,
        warningSeconds: row.warning_seconds,
        serverTime: row.server_time,
        startedAt: row.started_at,
        lastSeenAt: row.last_seen_at,
        idleExpiresAt: row.idle_expires_at,
        absoluteExpiresAt: row.absolute_expires_at,
        idleExpired: row.idle_expired,
        absoluteExpired: row.absolute_expired,
        revoked: row.revoked,
      },
      errorMessage: null,
    }
  } catch (error) {
    return {
      status: null,
      errorMessage: error instanceof Error ? error.message : 'unknown_session_heartbeat_error',
    }
  }
}

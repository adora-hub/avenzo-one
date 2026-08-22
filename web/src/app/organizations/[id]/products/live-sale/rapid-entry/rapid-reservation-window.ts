export const RAPID_RESERVATION_HOURS = 3
export const RAPID_RESERVATION_WARNING_MS = 30 * 60 * 1000
export const RAPID_RESERVATION_CRITICAL_MS = 10 * 60 * 1000

export type RapidReservationWindowState = 'active' | 'warning' | 'critical' | 'expired'

export function resolveRapidReservationWindow(expiresAt: string, nowMs: number) {
  const expiresAtMs = Date.parse(expiresAt)
  if (!Number.isFinite(expiresAtMs)) return { state: 'expired' as const, remainingMs: 0, expiresAtMs: 0 }
  const remainingMs = Math.max(0, expiresAtMs - nowMs)
  const state: RapidReservationWindowState = remainingMs <= 0
    ? 'expired'
    : remainingMs <= RAPID_RESERVATION_CRITICAL_MS
      ? 'critical'
      : remainingMs <= RAPID_RESERVATION_WARNING_MS
        ? 'warning'
        : 'active'
  return { state, remainingMs, expiresAtMs }
}

export function formatRapidReservationRemaining(remainingMs: number) {
  if (remainingMs <= 0) return 'หมดเวลาแล้ว'
  const totalMinutes = Math.max(1, Math.ceil(remainingMs / 60_000))
  const hours = Math.floor(totalMinutes / 60)
  const minutes = totalMinutes % 60
  return hours ? `${hours} ชม. ${minutes} นาที` : `${minutes} นาที`
}

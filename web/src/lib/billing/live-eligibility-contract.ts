import type { BillingLiveDryRunChecks } from '@/lib/billing/live-safety'

export type LiveEligibilityRequest = {
  commandId: string
  testerEmail: string
  amount: number
  reference: string
}

export type LiveEligibilityAuthorizationInput = {
  userId: string | null | undefined
  email: string | null | undefined
  adminStatus: string | null | undefined
  currentLevel: string | null | undefined
}

export type LiveEligibilityAuthorization =
  | { allowed: true; userId: string; email: string }
  | { allowed: false; status: 401 | 403; error: 'authentication_required' | 'platform_admin_aal2_required' }

export type LiveEligibilityContractCase = {
  key: 'no_aal2' | 'tester_not_allowed' | 'amount_over_limit' | 'duplicate_command'
  label: string
  passed: boolean
  detail: string
  auditIds: string[]
}

export type LiveEligibilityContractReport = {
  passed: boolean
  realChargeCreated: false
  executedAt: string
  cases: LiveEligibilityContractCase[]
}

export function parseLiveEligibilityRequest(body: unknown): LiveEligibilityRequest | null {
  if (!body || typeof body !== 'object') return null
  const raw = body as Record<string, unknown>
  const commandId = typeof raw.commandId === 'string' ? raw.commandId.trim() : ''
  const testerEmail = typeof raw.testerEmail === 'string' ? raw.testerEmail.trim().toLowerCase() : ''
  const amount = typeof raw.amount === 'number' ? raw.amount : Number.NaN
  const reference = typeof raw.reference === 'string' ? raw.reference.trim() : ''

  const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i
  if (
    !uuidPattern.test(commandId)
    || !testerEmail
    || !Number.isFinite(amount)
    || amount <= 0
    || reference.length < 10
    || reference.length > 120
  ) return null

  return { commandId, testerEmail, amount, reference }
}

export function evaluateLiveEligibilityAuthorization(input: LiveEligibilityAuthorizationInput): LiveEligibilityAuthorization {
  if (!input.userId || !input.email) {
    return { allowed: false, status: 401, error: 'authentication_required' }
  }
  if (input.adminStatus !== 'active' || input.currentLevel !== 'aal2') {
    return { allowed: false, status: 403, error: 'platform_admin_aal2_required' }
  }
  return { allowed: true, userId: input.userId, email: input.email }
}

export function allLiveEligibilityChecksPass(checks: BillingLiveDryRunChecks) {
  return Object.values(checks).every(Boolean)
}

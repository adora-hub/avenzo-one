export type AppSessionPolicyTier = 'privileged' | 'organization'

export type AppSessionPolicy = {
  policyTier: AppSessionPolicyTier
  idleTimeoutSeconds: number
  absoluteTimeoutSeconds: number
  warningSeconds: number
  version: number
}

export const SESSION_POLICY_COPY: Record<AppSessionPolicyTier, {
  label: string
  description: string
}> = {
  privileged: {
    label: 'บัญชีสิทธิ์สูง',
    description: 'Super Admin และ Platform Admin',
  },
  organization: {
    label: 'บัญชีองค์กร',
    description: 'Owner, Admin, Staff และ Viewer',
  },
}

export const SESSION_POLICY_BASELINE: Record<AppSessionPolicyTier, Omit<AppSessionPolicy, 'policyTier'>> = {
  privileged: {
    idleTimeoutSeconds: 30 * 60,
    absoluteTimeoutSeconds: 8 * 60 * 60,
    warningSeconds: 5 * 60,
    version: 1,
  },
  organization: {
    idleTimeoutSeconds: 8 * 60 * 60,
    absoluteTimeoutSeconds: 7 * 24 * 60 * 60,
    warningSeconds: 5 * 60,
    version: 1,
  },
}

export function isAppSessionPolicyTier(value: unknown): value is AppSessionPolicyTier {
  return value === 'privileged' || value === 'organization'
}

export function sessionDurationLabel(seconds: number) {
  if (seconds % 86400 === 0) return `${seconds / 86400} วัน`
  if (seconds % 3600 === 0) return `${seconds / 3600} ชั่วโมง`
  if (seconds % 60 === 0) return `${seconds / 60} นาที`
  return `${seconds} วินาที`
}

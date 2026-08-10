import type { BillingLiveDryRunChecks } from '@/lib/billing/live-safety'

export type LiveReleaseGateCheckKey =
  | 'production_readiness'
  | 'safety_review_ready'
  | 'emergency_stop'
  | 'pilot_disabled'
  | 'live_credentials'
  | 'platform_admins'
  | 'testers'
  | 'two_person_approval'
  | 'contract_evidence'
  | 'no_real_charge'

export type LiveReleaseGateCheck = {
  key: LiveReleaseGateCheckKey
  label: string
  passed: boolean
  detail: string
  evidenceIds: string[]
}

export type LiveReleaseGateInput = {
  readiness: { id: string; manual_status: string; created_at: string } | null
  control: { state: string; emergency_stop: boolean; version: number; updated_at: string } | null
  policy: {
    pilot_enabled: boolean
    version: number
    max_amount_per_charge: number
    max_total_amount: number
    max_successful_charges: number
  } | null
  approval: {
    id: string
    status: string
    policy_version: number
    max_amount_per_charge: number
    max_total_amount: number
    max_successful_charges: number
    tester_count: number
    requested_by: string
    reviewed_by: string | null
    expires_at: string
  } | null
  activeAdminCount: number
  activeTesterCount: number
  environment: {
    environmentLocked: boolean
    codeTestOnly: boolean
    acceptsRealMoney: boolean
    liveSecretConfigured: boolean
    liveWebhookConfigured: boolean
  }
  dryRuns: Array<{
    id: string
    command_id: string
    reference: string
    real_charge: boolean
    checks: BillingLiveDryRunChecks
  }>
  generatedBy: string
  generatedAt: string
}

export type LiveReleaseGateReport = {
  phase: '1.1.3.7.5.4'
  passed: boolean
  decision: 'evidence_complete' | 'blocked'
  realMoneyAllowed: false
  executorDevelopmentRequiresSeparateApproval: true
  generatedAt: string
  generatedBy: string
  checks: LiveReleaseGateCheck[]
}

function sameNumber(left: unknown, right: unknown) {
  return Number(left) === Number(right)
}

export function buildLiveReleaseGateReport(input: LiveReleaseGateInput): LiveReleaseGateReport {
  const contractRuns = input.dryRuns.filter((run) => run.reference.startsWith('CONTRACT-'))
  const unauthorized = contractRuns.find((run) => run.reference.startsWith('CONTRACT-NOT-ALLOWED-') && run.checks.tester_allowed === false)
  const overLimit = contractRuns.find((run) => run.reference.startsWith('CONTRACT-OVER-LIMIT-') && run.checks.amount_within_limit === false)
  const duplicate = contractRuns.find((run) => run.reference.startsWith('CONTRACT-DUPLICATE-'))
  const duplicateRows = duplicate ? contractRuns.filter((run) => run.command_id === duplicate.command_id) : []
  const contractEvidenceIds = [unauthorized?.id, overLimit?.id, duplicate?.id].filter((id): id is string => Boolean(id))
  const contractEvidenceComplete = Boolean(unauthorized && overLimit && duplicate && duplicateRows.length === 1)
  const approval = input.approval
  const policy = input.policy
  const approvalValid = Boolean(
    approval
      && policy
      && approval.status === 'approved'
      && approval.reviewed_by
      && approval.requested_by !== approval.reviewed_by
      && new Date(approval.expires_at).getTime() > new Date(input.generatedAt).getTime()
      && sameNumber(approval.policy_version, policy.version)
      && sameNumber(approval.max_amount_per_charge, policy.max_amount_per_charge)
      && sameNumber(approval.max_total_amount, policy.max_total_amount)
      && sameNumber(approval.max_successful_charges, policy.max_successful_charges)
      && sameNumber(approval.tester_count, input.activeTesterCount),
  )
  const allDryRunsSafe = input.dryRuns.length > 0 && input.dryRuns.every((run) => run.real_charge === false)

  const checks: LiveReleaseGateCheck[] = [
    {
      key: 'production_readiness',
      label: 'ตรวจความพร้อม Production ครบ',
      passed: input.readiness?.manual_status === 'manual_complete',
      detail: input.readiness?.manual_status === 'manual_complete' ? 'พบผลตรวจความพร้อมที่ผู้ดูแลยืนยันครบแล้ว' : 'ยังไม่พบผลตรวจความพร้อมที่ครบถ้วน',
      evidenceIds: input.readiness ? [input.readiness.id] : [],
    },
    {
      key: 'safety_review_ready',
      label: 'สถานะพร้อมทบทวน',
      passed: input.control?.state === 'review_ready' && input.environment.environmentLocked,
      detail: input.control?.state === 'review_ready' ? 'Safety Control พร้อมทบทวนและ Environment ยังล็อกอยู่' : 'Safety Control ยังไม่อยู่สถานะพร้อมทบทวน',
      evidenceIds: [],
    },
    {
      key: 'emergency_stop',
      label: 'Emergency Stop ยังทำงาน',
      passed: input.control?.emergency_stop === true,
      detail: input.control?.emergency_stop ? 'ระบบยังบังคับหยุดการรับเงินจริง' : 'Emergency Stop ถูกปิด ต้องหยุดการตรวจทันที',
      evidenceIds: [],
    },
    {
      key: 'pilot_disabled',
      label: 'Limited Live Pilot ยังปิด',
      passed: input.policy?.pilot_enabled === false,
      detail: input.policy?.pilot_enabled === false ? 'Pilot ยังไม่เปิดใช้งาน' : 'Pilot เปิดอยู่ ต้องย้อนกลับก่อนดำเนินการ',
      evidenceIds: [],
    },
    {
      key: 'live_credentials',
      label: 'Credentials ฝั่ง Server พร้อม',
      passed: input.environment.liveSecretConfigured && input.environment.liveWebhookConfigured,
      detail: input.environment.liveSecretConfigured && input.environment.liveWebhookConfigured ? 'พบ Live Secret และ Live Webhook Secret โดยไม่เปิดเผยค่า' : 'ยังตั้งค่า Live Secret หรือ Live Webhook Secret ไม่ครบ',
      evidenceIds: [],
    },
    {
      key: 'platform_admins',
      label: 'Platform Admin อย่างน้อย 2 บัญชี',
      passed: input.activeAdminCount >= 2,
      detail: `มี Platform Admin ที่ใช้งานอยู่ ${input.activeAdminCount} บัญชี`,
      evidenceIds: [],
    },
    {
      key: 'testers',
      label: 'มีผู้ทดสอบที่ได้รับอนุญาต',
      passed: input.activeTesterCount >= 1,
      detail: `มีผู้ทดสอบที่ใช้งานอยู่ ${input.activeTesterCount} บัญชี`,
      evidenceIds: [],
    },
    {
      key: 'two_person_approval',
      label: 'หลักฐานอนุมัติสองคนยังใช้ได้',
      passed: approvalValid,
      detail: approvalValid ? 'ผู้ขอและผู้อนุมัติเป็นคนละบัญชี Snapshot ตรงกับกติกาปัจจุบันและยังไม่หมดอายุ' : 'ไม่พบคำอนุมัติที่ครบเงื่อนไขหรือ Snapshot ไม่ตรงกับกติกาปัจจุบัน',
      evidenceIds: approval ? [approval.id] : [],
    },
    {
      key: 'contract_evidence',
      label: 'Contract & Abuse-case มีหลักฐานครบ',
      passed: contractEvidenceComplete,
      detail: contractEvidenceComplete ? 'พบหลักฐาน Tester นอก Allowlist, ยอดเกินวงเงิน และ Command ซ้ำเพียงหนึ่งแถว' : 'ยังไม่พบหลักฐาน Contract ครบทั้งสามกลุ่ม',
      evidenceIds: contractEvidenceIds,
    },
    {
      key: 'no_real_charge',
      label: 'ไม่มีรายการรับเงินจริง',
      passed: allDryRunsSafe && input.environment.codeTestOnly && input.environment.acceptsRealMoney === false,
      detail: allDryRunsSafe ? `ตรวจ Dry-run ${input.dryRuns.length} รายการ ทุกแถวเป็น real_charge=false และโค้ดยัง Test-only` : 'ยังไม่มี Dry-run ให้ตรวจหรือพบสถานะไม่ปลอดภัย',
      evidenceIds: input.dryRuns.map((run) => run.id),
    },
  ]
  const passed = checks.every((check) => check.passed)
  return {
    phase: '1.1.3.7.5.4',
    passed,
    decision: passed ? 'evidence_complete' : 'blocked',
    realMoneyAllowed: false,
    executorDevelopmentRequiresSeparateApproval: true,
    generatedAt: input.generatedAt,
    generatedBy: input.generatedBy,
    checks,
  }
}

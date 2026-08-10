export type LiveExecutorMode = 'disabled' | 'shadow'

export type LiveExecutorDesignInput = {
  requestedMode?: string
  environmentLocked: boolean
  emergencyStopActive: boolean
  pilotDisabled: boolean
  generatedAt: string
  generatedBy: string
}

export type LiveExecutorDesignCheck = {
  key: 'feature_flag' | 'environment_lock' | 'emergency_stop' | 'pilot' | 'executor_lock' | 'webhook_fulfillment'
  label: string
  passed: boolean
  detail: string
}

export type LiveExecutorDesignReport = {
  phase: '1.1.3.7.5.5'
  decision: 'design_review_ready' | 'blocked'
  mode: LiveExecutorMode
  requestedMode: string
  featureFlagKey: 'STRIPE_LIVE_EXECUTOR_MODE'
  serverEnforcedBlock: true
  realMoneyAllowed: false
  stripeApiInvocationAllowed: false
  checkoutEndpointExists: false
  idempotencyRequired: true
  fulfillmentAuthority: 'verified_live_webhook_only'
  generatedAt: string
  generatedBy: string
  checks: LiveExecutorDesignCheck[]
  plannedStages: Array<{ order: number; name: string; enabled: false }>
}

export function buildLiveExecutorDesignReport(input: LiveExecutorDesignInput): LiveExecutorDesignReport {
  const requestedMode = input.requestedMode?.trim().toLowerCase() || 'disabled'
  const mode: LiveExecutorMode = requestedMode === 'shadow' ? 'shadow' : 'disabled'
  const recognizedMode = requestedMode === 'disabled' || requestedMode === 'shadow'

  const checks: LiveExecutorDesignCheck[] = [
    {
      key: 'feature_flag',
      label: 'Feature Flag อยู่ในโหมดปลอดภัย',
      passed: recognizedMode,
      detail: recognizedMode
        ? `STRIPE_LIVE_EXECUTOR_MODE=${mode} และไม่มีค่า live ใน Phase นี้`
        : `ค่า ${requestedMode} ไม่ได้รับอนุญาต ระบบบังคับกลับเป็น disabled`,
    },
    {
      key: 'environment_lock',
      label: 'Environment Lock ยังทำงาน',
      passed: input.environmentLocked,
      detail: input.environmentLocked ? 'STRIPE_LIVE_ACTIVATION ยังไม่เปิด' : 'พบการเปิด Environment Live ให้หยุดการพัฒนาทันที',
    },
    {
      key: 'emergency_stop',
      label: 'Emergency Stop ยังเปิด',
      passed: input.emergencyStopActive,
      detail: input.emergencyStopActive ? 'ฐานข้อมูลยังบังคับหยุดการรับเงินจริง' : 'Emergency Stop ถูกปิด ไม่ผ่านข้อกำหนด Phase นี้',
    },
    {
      key: 'pilot',
      label: 'Limited Live Pilot ยังปิด',
      passed: input.pilotDisabled,
      detail: input.pilotDisabled ? 'ยังไม่มีผู้ใช้ที่สามารถเริ่มรายการเงินจริง' : 'Pilot เปิดอยู่โดยไม่ได้รับอนุญาตสำหรับ Phase นี้',
    },
    {
      key: 'executor_lock',
      label: 'Executor ถูกล็อกในโค้ด',
      passed: true,
      detail: 'ไม่มี Checkout Endpoint จริง และไม่มีการอนุญาตเรียก Stripe Live API',
    },
    {
      key: 'webhook_fulfillment',
      label: 'กำหนด Webhook เป็นผู้ยืนยันผลเพียงทางเดียว',
      passed: true,
      detail: 'เมื่อพัฒนาในอนาคต ห้าม Success URL เปลี่ยน Invoice หรือ Subscription โดยตรง',
    },
  ]

  return {
    phase: '1.1.3.7.5.5',
    decision: checks.every((check) => check.passed) ? 'design_review_ready' : 'blocked',
    mode,
    requestedMode,
    featureFlagKey: 'STRIPE_LIVE_EXECUTOR_MODE',
    serverEnforcedBlock: true,
    realMoneyAllowed: false,
    stripeApiInvocationAllowed: false,
    checkoutEndpointExists: false,
    idempotencyRequired: true,
    fulfillmentAuthority: 'verified_live_webhook_only',
    generatedAt: input.generatedAt,
    generatedBy: input.generatedBy,
    checks,
    plannedStages: [
      { order: 1, name: 'ตรวจ Platform Admin, AAL2 และ Tester Allowlist ใหม่ทุกคำสั่ง', enabled: false },
      { order: 2, name: 'จอง Command ID และ Idempotency Key ในฐานข้อมูล', enabled: false },
      { order: 3, name: 'ตรวจ Release Gate, Approval Snapshot, วงเงิน และ Kill Switch ซ้ำ', enabled: false },
      { order: 4, name: 'สร้าง Stripe Live Checkout Session ฝั่ง Server', enabled: false },
      { order: 5, name: 'บันทึก Payment Attempt แบบ production โดยไม่ถือว่าชำระแล้ว', enabled: false },
      { order: 6, name: 'ยืนยันผลจาก Live Webhook ที่ตรวจลายเซ็นแล้วเท่านั้น', enabled: false },
    ],
  }
}

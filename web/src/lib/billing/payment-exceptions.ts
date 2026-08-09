export type PaymentExceptionKind =
  | 'webhook_failed'
  | 'invoice_mismatch'
  | 'reconciliation_pending'
  | 'payment_failed'
  | 'payment_expired'
  | 'payment_canceled'
  | 'payment_stale'

export type PaymentExceptionSeverity = 'critical' | 'warning' | 'info'
export type PaymentExceptionSlaStatus = 'on_track' | 'due_soon' | 'overdue'

export type PaymentException = {
  attemptId: string
  invoiceId: string
  organizationId: string
  kind: PaymentExceptionKind
  severity: PaymentExceptionSeverity
  title: string
  description: string
  invoiceNumber: string
  invoiceStatus: string
  organizationName: string
  provider: string
  paymentMethod: string | null
  amount: number
  currency: string
  occurredAt: string
  failureCode: string | null
  slaTargetMinutes: number
  slaDueAt: string
  slaStatus: PaymentExceptionSlaStatus
  slaRemainingMinutes: number
}

export type PaymentExceptionAttempt = {
  id: string
  invoice_id: string
  organization_id: string
  provider: string
  status: string
  payment_method: string | null
  amount: number | string
  currency: string
  failure_code: string | null
  failure_message: string | null
  provider_fee_actual: number | string | null
  provider_net_amount: number | string | null
  created_at: string
  updated_at: string
}

export type PaymentExceptionEvent = {
  attempt_id: string
  processing_status: string
  error_code: string | null
  received_at: string
}

export type PaymentExceptionInvoice = {
  id: string
  invoice_number: string
  organization_id: string
  status: string
}

const severityOrder: Record<PaymentExceptionSeverity, number> = {
  critical: 0,
  warning: 1,
  info: 2,
}

const slaTargetMinutes: Record<PaymentExceptionKind, number> = {
  webhook_failed: 15,
  invoice_mismatch: 15,
  reconciliation_pending: 240,
  payment_failed: 60,
  payment_expired: 240,
  payment_canceled: 1440,
  payment_stale: 240,
}

function resolveSla(kind: PaymentExceptionKind, occurredAt: string, now: number) {
  const targetMinutes = slaTargetMinutes[kind]
  const dueAtMs = new Date(occurredAt).getTime() + targetMinutes * 60_000
  const remainingMinutes = Math.ceil((dueAtMs - now) / 60_000)
  const dueSoonMinutes = Math.max(10, Math.ceil(targetMinutes * 0.25))
  return {
    slaTargetMinutes: targetMinutes,
    slaDueAt: new Date(dueAtMs).toISOString(),
    slaStatus: remainingMinutes <= 0 ? 'overdue' as const : remainingMinutes <= dueSoonMinutes ? 'due_soon' as const : 'on_track' as const,
    slaRemainingMinutes: remainingMinutes,
  }
}

function resolveIssue(
  attempt: PaymentExceptionAttempt,
  invoice: PaymentExceptionInvoice,
  latestEvent: PaymentExceptionEvent | undefined,
  now: number,
) {
  if (latestEvent?.processing_status === 'failed') {
    return {
      kind: 'webhook_failed' as const,
      severity: 'critical' as const,
      title: 'Webhook ประมวลผลไม่สำเร็จ',
      description: 'ระบบรับข้อมูลจากผู้ให้บริการแล้ว แต่ยังประมวลผลรายการไม่สำเร็จ',
      failureCode: latestEvent.error_code,
      occurredAt: latestEvent.received_at,
    }
  }

  if (attempt.status === 'succeeded' && invoice.status !== 'paid') {
    return {
      kind: 'invoice_mismatch' as const,
      severity: 'critical' as const,
      title: 'ยอดชำระสำเร็จแต่ Invoice ยังไม่ชำระ',
      description: 'สถานะจาก Payment Gateway ไม่ตรงกับสถานะ Invoice ต้องตรวจสอบก่อนดำเนินการต่อ',
      failureCode: 'invoice_payment_state_mismatch',
      occurredAt: attempt.updated_at,
    }
  }

  if (attempt.status === 'succeeded' && attempt.provider === 'stripe' && (attempt.provider_fee_actual === null || attempt.provider_net_amount === null)) {
    return {
      kind: 'reconciliation_pending' as const,
      severity: 'warning' as const,
      title: 'รอตรวจค่าธรรมเนียมจริง',
      description: 'ชำระสำเร็จแล้ว แต่ยังไม่บันทึกค่าธรรมเนียมจริงหรือยอดสุทธิจาก Stripe',
      failureCode: 'stripe_fee_reconciliation_pending',
      occurredAt: attempt.updated_at,
    }
  }

  // A later successful attempt can settle an invoice after an earlier attempt failed.
  // Do not keep that earlier terminal attempt in the open queue once the invoice is paid.
  if (invoice.status === 'paid') return null

  const terminalIssues = {
    failed: {
      kind: 'payment_failed' as const,
      severity: 'critical' as const,
      title: 'การชำระเงินไม่สำเร็จ',
      description: attempt.failure_message || 'Payment Gateway แจ้งว่าการชำระเงินไม่สำเร็จ',
    },
    expired: {
      kind: 'payment_expired' as const,
      severity: 'warning' as const,
      title: 'รายการชำระเงินหมดเวลา',
      description: attempt.failure_message || 'ลูกค้าไม่ได้ชำระเงินภายในเวลาที่กำหนด',
    },
    canceled: {
      kind: 'payment_canceled' as const,
      severity: 'info' as const,
      title: 'ยกเลิกการชำระเงิน',
      description: attempt.failure_message || 'รายการ Checkout ถูกยกเลิกก่อนชำระสำเร็จ',
    },
  }
  const terminalIssue = terminalIssues[attempt.status as keyof typeof terminalIssues]
  if (terminalIssue) return { ...terminalIssue, failureCode: attempt.failure_code, occurredAt: attempt.updated_at }

  const staleAfterMs = 30 * 60 * 1000
  if (attempt.status === 'pending' && now - new Date(attempt.created_at).getTime() >= staleAfterMs) {
    return {
      kind: 'payment_stale' as const,
      severity: 'warning' as const,
      title: 'รอชำระเงินนานเกินกำหนด',
      description: 'Checkout ยังไม่จบและไม่มีผลลัพธ์เกิน 30 นาที',
      failureCode: 'payment_attempt_stale',
      occurredAt: attempt.updated_at,
    }
  }

  return null
}

export function buildPaymentExceptions({
  attempts,
  events,
  invoices,
  organizationNames,
  now = Date.now(),
}: {
  attempts: PaymentExceptionAttempt[]
  events: PaymentExceptionEvent[]
  invoices: PaymentExceptionInvoice[]
  organizationNames: Map<string, string>
  now?: number
}) {
  const invoicesById = new Map(invoices.map((invoice) => [invoice.id, invoice]))
  const latestEventsByAttempt = new Map<string, PaymentExceptionEvent>()
  for (const event of events) {
    const current = latestEventsByAttempt.get(event.attempt_id)
    if (!current || new Date(event.received_at).getTime() > new Date(current.received_at).getTime()) {
      latestEventsByAttempt.set(event.attempt_id, event)
    }
  }

  const exceptions: PaymentException[] = []
  for (const attempt of attempts) {
    const invoice = invoicesById.get(attempt.invoice_id)
    if (!invoice) continue
    const issue = resolveIssue(attempt, invoice, latestEventsByAttempt.get(attempt.id), now)
    if (!issue) continue
    exceptions.push({
      attemptId: attempt.id,
      invoiceId: attempt.invoice_id,
      organizationId: attempt.organization_id,
      kind: issue.kind,
      severity: issue.severity,
      title: issue.title,
      description: issue.description,
      invoiceNumber: invoice.invoice_number,
      invoiceStatus: invoice.status,
      organizationName: organizationNames.get(attempt.organization_id) ?? attempt.organization_id,
      provider: attempt.provider,
      paymentMethod: attempt.payment_method,
      amount: Number(attempt.amount),
      currency: attempt.currency,
      occurredAt: issue.occurredAt,
      failureCode: issue.failureCode,
      ...resolveSla(issue.kind, issue.occurredAt, now),
    })
  }

  return [...exceptions].sort((left, right) => {
    if (left.slaStatus === 'overdue' && right.slaStatus !== 'overdue') return -1
    if (right.slaStatus === 'overdue' && left.slaStatus !== 'overdue') return 1
    const severityDifference = severityOrder[left.severity] - severityOrder[right.severity]
    return severityDifference || new Date(right.occurredAt).getTime() - new Date(left.occurredAt).getTime()
  })
}

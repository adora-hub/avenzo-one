import { createHash } from 'node:crypto'
import { NextResponse } from 'next/server'
import type { StripePaymentMethod } from '@/lib/billing/stripe-fees'
import { createAdminClient } from '@/lib/supabase/admin'
import { createClient } from '@/lib/supabase/server'
import { retrieveStripeActualFee, retrieveStripeActualFeeBySessionId } from '@/lib/stripe/reconciliation'
import { getStripeTestClient } from '@/lib/stripe/server'
import { createStripeTestCheckout } from '@/lib/stripe/test-checkout'

export const runtime = 'nodejs'

type ExceptionAction = 'reconcile_fee' | 'refresh_provider_status' | 'retry_checkout'

const allowedActions = new Set<ExceptionAction>(['reconcile_fee', 'refresh_provider_status', 'retry_checkout'])
const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i

function safeErrorCode(error: unknown) {
  const value = error instanceof Error ? error.message : ''
  const known = new Set([
    'payment_attempt_not_found', 'stripe_test_attempt_required', 'stripe_successful_attempt_required',
    'stripe_fee_not_available', 'invoice_not_found', 'invoice_not_payable', 'canceled_invoice_is_final',
    'stripe_test_requires_positive_thb_invoice', 'payment_attempt_not_retryable', 'provider_result_pending',
  ])
  return known.has(value) ? value : 'payment_exception_action_failed'
}

function isPaymentMethod(value: unknown): value is StripePaymentMethod {
  return value === 'card' || value === 'promptpay'
}

export async function POST(request: Request) {
  let commandRecordId: string | null = null
  const admin = createAdminClient()

  try {
    const body = await request.json() as {
      attemptId?: string
      action?: string
      commandId?: string
      reason?: string
      paymentMethod?: unknown
    }
    const reason = body.reason?.trim() ?? ''
    if (!body.attemptId || !uuidPattern.test(body.attemptId) || !body.commandId || !uuidPattern.test(body.commandId)
      || !body.action || !allowedActions.has(body.action as ExceptionAction) || reason.length < 3 || reason.length > 500) {
      return NextResponse.json({ error: 'invalid_payment_exception_command' }, { status: 400 })
    }
    const action = body.action as ExceptionAction

    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: 'authentication_required' }, { status: 401 })

    const [platformAdminResult, aalResult] = await Promise.all([
      supabase.from('platform_admins').select('status').eq('user_id', user.id).maybeSingle(),
      supabase.auth.mfa.getAuthenticatorAssuranceLevel(),
    ])
    if (platformAdminResult.data?.status !== 'active' || aalResult.data?.currentLevel !== 'aal2') {
      return NextResponse.json({ error: 'platform_admin_aal2_required' }, { status: 403 })
    }

    const { data: existingCommand } = await admin.from('billing_payment_exception_commands')
      .select('id, status, result, error_code').eq('command_id', body.commandId).maybeSingle()
    if (existingCommand?.status === 'succeeded') return NextResponse.json(existingCommand.result)
    if (existingCommand?.status === 'pending') return NextResponse.json({ error: 'payment_exception_command_in_progress' }, { status: 409 })
    if (existingCommand?.status === 'failed') return NextResponse.json({ error: existingCommand.error_code ?? 'payment_exception_action_failed' }, { status: 409 })

    const { data: attempt, error: attemptError } = await admin.from('billing_payment_attempts')
      .select('id, invoice_id, organization_id, provider, environment, provider_session_id, status, payment_method, metadata, created_at')
      .eq('id', body.attemptId).maybeSingle()
    if (attemptError || !attempt) return NextResponse.json({ error: 'payment_attempt_not_found' }, { status: 404 })
    if (attempt.provider !== 'stripe' || attempt.environment !== 'sandbox' || !attempt.provider_session_id?.startsWith('cs_test_')) {
      return NextResponse.json({ error: 'stripe_test_attempt_required' }, { status: 400 })
    }

    const { data: commandRecord, error: commandError } = await admin.from('billing_payment_exception_commands').insert({
      command_id: body.commandId,
      attempt_id: attempt.id,
      invoice_id: attempt.invoice_id,
      organization_id: attempt.organization_id,
      action,
      reason,
      actor_user_id: user.id,
      actor_email: user.email ?? 'unknown@local.invalid',
    }).select('id').single()
    if (commandError || !commandRecord) throw commandError ?? new Error('payment_exception_command_not_recorded')
    commandRecordId = commandRecord.id

    let result: Record<string, unknown>

    if (action === 'reconcile_fee') {
      if (attempt.status !== 'succeeded') throw new Error('stripe_successful_attempt_required')
      const actual = await retrieveStripeActualFeeBySessionId(attempt.provider_session_id)
      if (actual.fee === null || actual.net === null) throw new Error('stripe_fee_not_available')
      const metadata = typeof attempt.metadata === 'object' && attempt.metadata !== null ? attempt.metadata as Record<string, unknown> : {}
      const { error: updateError } = await admin.from('billing_payment_attempts').update({
        provider_fee_actual: actual.fee,
        provider_net_amount: actual.net,
        metadata: { ...metadata, last_exception_command_id: body.commandId, last_exception_reason: reason, last_exception_actor_user_id: user.id },
        updated_at: new Date().toISOString(),
      }).eq('id', attempt.id)
      if (updateError) throw updateError
      result = { outcome: 'reconciled', fee: actual.fee, net: actual.net }
    } else if (action === 'refresh_provider_status') {
      const stripe = getStripeTestClient()
      const session = await stripe.checkout.sessions.retrieve(attempt.provider_session_id)
      const metadata = {
        source: 'payment_exception_refresh',
        command_id: body.commandId,
        reason,
        actor_user_id: user.id,
        stripe_livemode: false,
      }

      if (session.payment_status === 'paid') {
        const actual = await retrieveStripeActualFee(session)
        if (attempt.status === 'pending') {
          const eventId = `manual_refresh_${body.commandId}`
          const { error: processError } = await admin.rpc('server_process_stripe_test_event', {
            p_provider_event_id: eventId,
            p_provider_session_id: attempt.provider_session_id,
            p_result_status: 'succeeded',
            p_occurred_at: new Date().toISOString(),
            p_payload_sha256: createHash('sha256').update(`${eventId}:succeeded`).digest('hex'),
            p_provider_fee_actual: actual.fee,
            p_provider_net_amount: actual.net,
            p_metadata: metadata,
          })
          if (processError) throw processError
        } else if (attempt.status === 'succeeded') {
          const { error: repairError } = await admin.rpc('server_repair_stripe_test_invoice_from_attempt', {
            p_attempt_id: attempt.id,
            p_command_id: body.commandId,
            p_actor_user_id: user.id,
            p_reason: reason,
          })
          if (repairError) throw repairError
        }
        result = { outcome: 'provider_confirmed_paid' }
      } else if (session.status === 'expired' && attempt.status === 'pending') {
        const eventId = `manual_refresh_${body.commandId}`
        const { error: processError } = await admin.rpc('server_process_stripe_test_event', {
          p_provider_event_id: eventId,
          p_provider_session_id: attempt.provider_session_id,
          p_result_status: 'expired',
          p_occurred_at: new Date().toISOString(),
          p_payload_sha256: createHash('sha256').update(`${eventId}:expired`).digest('hex'),
          p_provider_fee_actual: null,
          p_provider_net_amount: null,
          p_metadata: metadata,
        })
        if (processError) throw processError
        result = { outcome: 'provider_confirmed_expired' }
      } else {
        result = { outcome: 'provider_result_pending' }
      }
    } else {
      const stale = attempt.status === 'pending' && Date.now() - new Date(attempt.created_at).getTime() >= 30 * 60 * 1000
      if (!['failed', 'expired', 'canceled'].includes(attempt.status) && !stale) throw new Error('payment_attempt_not_retryable')
      const paymentMethod = isPaymentMethod(body.paymentMethod)
        ? body.paymentMethod
        : isPaymentMethod(attempt.payment_method) ? attempt.payment_method : 'promptpay'
      const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? new URL(request.url).origin
      const checkout = await createStripeTestCheckout({
        invoiceId: attempt.invoice_id,
        paymentMethod,
        commandId: body.commandId,
        actorUserId: user.id,
        actorEmail: user.email,
        appUrl,
        source: 'payment_exception_retry',
        reason,
      })
      result = { outcome: 'checkout_created', url: checkout.url, attemptId: checkout.attemptId }
    }

    const { error: completeError } = await admin.from('billing_payment_exception_commands').update({
      status: 'succeeded',
      result,
      completed_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    }).eq('id', commandRecordId)
    if (completeError) throw completeError

    return NextResponse.json(result)
  } catch (error) {
    const errorCode = safeErrorCode(error)
    if (commandRecordId) {
      await admin.from('billing_payment_exception_commands').update({
        status: 'failed',
        error_code: errorCode,
        result: { error: errorCode },
        completed_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      }).eq('id', commandRecordId)
    }
    console.error('Payment exception action failed', { commandRecordId, error })
    return NextResponse.json({ error: errorCode }, { status: errorCode === 'stripe_fee_not_available' || errorCode === 'provider_result_pending' ? 409 : 500 })
  }
}

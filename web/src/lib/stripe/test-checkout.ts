import 'server-only'

import { randomUUID } from 'node:crypto'
import { calculateStripeFeeSnapshot, type StripePaymentMethod } from '@/lib/billing/stripe-fees'
import { createAdminClient } from '@/lib/supabase/admin'
import { getStripeTestClient } from '@/lib/stripe/server'

function toStripeAmount(value: number) {
  return Math.round(value * 100)
}

export async function createStripeTestCheckout({
  invoiceId,
  paymentMethod,
  commandId,
  actorUserId,
  actorEmail,
  appUrl,
  source = 'stripe_test_checkout',
  reason,
}: {
  invoiceId: string
  paymentMethod: StripePaymentMethod
  commandId: string
  actorUserId: string
  actorEmail?: string | null
  appUrl: string
  source?: string
  reason?: string
}) {
  const admin = createAdminClient()
  const stripe = getStripeTestClient()
  const { data: existing } = await admin.from('billing_payment_attempts')
    .select('id, provider_session_id').eq('command_id', commandId).maybeSingle()

  if (existing?.provider_session_id?.startsWith('cs_test_')) {
    const session = await stripe.checkout.sessions.retrieve(existing.provider_session_id)
    return { url: session.url, attemptId: existing.id }
  }

  const { data: invoice, error: invoiceError } = await admin.from('billing_invoices')
    .select('id, invoice_number, organization_id, total_amount, currency, status')
    .eq('id', invoiceId).maybeSingle()
  if (invoiceError || !invoice) throw new Error('invoice_not_found')
  if (!['pending', 'failed'].includes(invoice.status)) throw new Error('invoice_not_payable')
  if (invoice.currency !== 'THB' || Number(invoice.total_amount) <= 0) throw new Error('stripe_test_requires_positive_thb_invoice')

  const invoiceAmount = Number(invoice.total_amount)
  const fee = calculateStripeFeeSnapshot(invoiceAmount, paymentMethod)
  const attemptId = randomUUID()
  const { data: customer } = await admin.from('billing_customer_profiles')
    .select('email').eq('organization_id', invoice.organization_id).maybeSingle()

  const session = await stripe.checkout.sessions.create({
    mode: 'payment',
    payment_method_types: [paymentMethod],
    client_reference_id: attemptId,
    customer_email: customer?.email || actorEmail || undefined,
    line_items: [{
      quantity: 1,
      price_data: {
        currency: 'thb',
        unit_amount: toStripeAmount(fee.customerChargeAmount),
        product_data: { name: `AVENZO ONE · ${invoice.invoice_number}`, description: 'Subscription Invoice — Stripe Test Mode' },
      },
    }],
    metadata: { attempt_id: attemptId, invoice_id: invoice.id, environment: 'sandbox', fee_policy: 'avenzo_absorbs' },
    success_url: `${appUrl}/billing/checkout/success?session_id={CHECKOUT_SESSION_ID}`,
    cancel_url: `${appUrl}/billing/checkout/cancel?invoice=${invoice.id}`,
  }, { idempotencyKey: `avenzo-checkout-${commandId}` })

  const { error: attemptError } = await admin.from('billing_payment_attempts').insert({
    id: attemptId,
    command_id: commandId,
    invoice_id: invoice.id,
    organization_id: invoice.organization_id,
    provider: 'stripe',
    environment: 'sandbox',
    provider_session_id: session.id,
    idempotency_key: commandId,
    status: 'pending',
    amount: invoiceAmount,
    currency: invoice.currency,
    payment_method: fee.paymentMethod,
    fee_rate_bps: fee.feeRateBps,
    fee_fixed_amount: fee.feeFixedAmount,
    estimated_provider_fee: fee.estimatedProviderFee,
    customer_fee_amount: fee.customerFeeAmount,
    customer_charge_amount: fee.customerChargeAmount,
    metadata: { source, real_charge: false, fee_policy: 'avenzo_absorbs', reason: reason || null },
    created_by: actorUserId,
  })
  if (attemptError) throw attemptError

  return { url: session.url, attemptId }
}

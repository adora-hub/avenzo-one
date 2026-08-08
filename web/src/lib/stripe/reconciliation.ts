import 'server-only'

import type Stripe from 'stripe'
import { getStripeTestClient } from './server'

export type StripeActualFee = {
  fee: number | null
  net: number | null
  balanceTransactionId: string | null
}

export async function retrieveStripeActualFee(session: Stripe.Checkout.Session): Promise<StripeActualFee> {
  if (typeof session.payment_intent !== 'string') {
    return { fee: null, net: null, balanceTransactionId: null }
  }

  try {
    const paymentIntent = await getStripeTestClient().paymentIntents.retrieve(session.payment_intent, {
      expand: ['latest_charge.balance_transaction'],
    })
    if (!paymentIntent.latest_charge || typeof paymentIntent.latest_charge === 'string') {
      return { fee: null, net: null, balanceTransactionId: null }
    }

    const balanceTransaction = paymentIntent.latest_charge.balance_transaction
    if (!balanceTransaction || typeof balanceTransaction === 'string') {
      return { fee: null, net: null, balanceTransactionId: null }
    }

    return {
      fee: balanceTransaction.fee / 100,
      net: balanceTransaction.net / 100,
      balanceTransactionId: balanceTransaction.id,
    }
  } catch {
    return { fee: null, net: null, balanceTransactionId: null }
  }
}

export async function retrieveStripeActualFeeBySessionId(sessionId: string) {
  const session = await getStripeTestClient().checkout.sessions.retrieve(sessionId)
  return retrieveStripeActualFee(session)
}

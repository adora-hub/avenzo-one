import 'server-only'

import Stripe from 'stripe'

let stripeClient: Stripe | null = null

export function getStripeTestClient() {
  const secretKey = process.env.STRIPE_SECRET_KEY
  if (!secretKey) throw new Error('stripe_test_key_not_configured')
  if (!secretKey.startsWith('sk_test_')) throw new Error('stripe_test_key_required')

  if (!stripeClient) stripeClient = new Stripe(secretKey)
  return stripeClient
}
export function getStripeWebhookSecret() {
  const secret = process.env.STRIPE_WEBHOOK_SECRET
  if (!secret?.startsWith('whsec_')) throw new Error('stripe_webhook_secret_not_configured')
  return secret
}

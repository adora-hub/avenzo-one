import 'server-only'

import Stripe from 'stripe'

let stripeTestClient: Stripe | null = null
let stripeLiveClient: Stripe | null = null

export function getStripeTestClient() {
  const secretKey = process.env.STRIPE_SECRET_KEY
  if (!secretKey) throw new Error('stripe_test_key_not_configured')
  if (!secretKey.startsWith('sk_test_')) throw new Error('stripe_test_key_required')

  if (!stripeTestClient) stripeTestClient = new Stripe(secretKey)
  return stripeTestClient
}

export function getStripeTestWebhookSecret() {
  const secret = process.env.STRIPE_WEBHOOK_SECRET
  if (!secret?.startsWith('whsec_')) throw new Error('stripe_webhook_secret_not_configured')
  return secret
}

export function getStripeLiveClient() {
  const secretKey = process.env.STRIPE_LIVE_SECRET_KEY
  if (!secretKey) throw new Error('stripe_live_key_not_configured')
  if (!secretKey.startsWith('sk_live_')) throw new Error('stripe_live_key_required')

  if (!stripeLiveClient) stripeLiveClient = new Stripe(secretKey)
  return stripeLiveClient
}

export function getStripeLiveWebhookSecret() {
  const secret = process.env.STRIPE_LIVE_WEBHOOK_SECRET
  if (!secret?.startsWith('whsec_')) throw new Error('stripe_live_webhook_secret_not_configured')
  return secret
}

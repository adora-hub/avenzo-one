import 'server-only'

export type ReadinessCheck = {
  id: string
  label: string
  detail: string
  passed: boolean
}

function isProductionHttpsUrl(value: string | undefined) {
  if (!value) return false
  try {
    const url = new URL(value)
    return url.protocol === 'https:' && url.hostname === 'app.avenzoone.com'
  } catch {
    return false
  }
}

export function inspectBillingProductionEnvironment(env: NodeJS.ProcessEnv = process.env) {
  const stripeKey = env.STRIPE_SECRET_KEY ?? ''
  const keyMode = stripeKey.startsWith('sk_test_')
    ? 'test'
    : stripeKey.startsWith('sk_live_')
      ? 'live'
      : 'missing'
  const liveActivationLocked = env.STRIPE_LIVE_ACTIVATION !== 'enabled'

  return {
    keyMode,
    liveActivationLocked,
    checks: [
      {
        id: 'production_url',
        label: 'โดเมน Production ถูกต้อง',
        detail: isProductionHttpsUrl(env.NEXT_PUBLIC_APP_URL)
          ? 'ใช้ https://app.avenzoone.com สำหรับ Success, Cancel และ Callback'
          : 'ต้องกำหนด NEXT_PUBLIC_APP_URL เป็น https://app.avenzoone.com',
        passed: isProductionHttpsUrl(env.NEXT_PUBLIC_APP_URL),
      },
      {
        id: 'test_key_lock',
        label: 'ยังล็อก Stripe Test Mode',
        detail: keyMode === 'test'
          ? 'Server ใช้ Test Secret และยังไม่สามารถสร้างรายการเงินจริงได้'
          : 'Secret ปัจจุบันไม่ใช่ Test Key กรุณาหยุดและตรวจ Environment',
        passed: keyMode === 'test',
      },
      {
        id: 'test_webhook_secret',
        label: 'ตั้งค่า Webhook Signing Secret',
        detail: env.STRIPE_WEBHOOK_SECRET?.startsWith('whsec_')
          ? 'มี Signing Secret ฝั่ง Server โดยไม่เปิดเผยค่า'
          : 'ยังไม่พบ STRIPE_WEBHOOK_SECRET ที่ถูกต้อง',
        passed: Boolean(env.STRIPE_WEBHOOK_SECRET?.startsWith('whsec_')),
      },
      {
        id: 'live_kill_switch',
        label: 'สวิตช์เปิดเงินจริงยังปิดอยู่',
        detail: liveActivationLocked
          ? 'STRIPE_LIVE_ACTIVATION ยังไม่ถูกเปิด ระบบจึงอยู่ในสถานะปลอดภัย'
          : 'พบคำสั่งเปิด Live Activation ก่อนผ่าน Gate ให้ปิดทันที',
        passed: liveActivationLocked,
      },
    ] satisfies ReadinessCheck[],
  }
}

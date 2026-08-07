export type SubscriptionDisplayStatus = 'trial' | 'active' | 'grace' | 'suspended' | 'expired' | 'canceled'

export const subscriptionStatusLabels: Record<SubscriptionDisplayStatus, { label: string; description: string }> = {
  trial: { label: 'ช่วงทดลองใช้ฟรี', description: 'กำลังใช้สิทธิ์ทดลองของแพ็กเกจ' },
  active: { label: 'ใช้งานปกติ', description: 'Subscription พร้อมใช้งาน' },
  grace: { label: 'ช่วงผ่อนผัน', description: 'หมดอายุแล้ว แต่ยังใช้งานได้ชั่วคราว' },
  suspended: { label: 'พักการใช้งานชั่วคราว', description: 'ถูกระงับเพื่อตรวจสอบหรือรอดำเนินการ' },
  expired: { label: 'หมดอายุ', description: 'สิทธิ์การใช้งานของ Subscription สิ้นสุดแล้ว' },
  canceled: { label: 'ยกเลิกแล้ว', description: 'Subscription นี้ถูกยกเลิก' },
}

export const subscriptionEventLabels: Record<string, string> = {
  provision: 'เริ่ม Subscription',
  renew: 'ต่ออายุ',
  adjust: 'เปลี่ยนแพ็กเกจ/ปรับสิทธิ์',
  suspend: 'พักการใช้งาน',
  resume: 'เปิดใช้งานต่อ',
  cancel: 'ยกเลิก',
}

export const subscriptionAccessStateLabels: Record<string, string> = {
  trial: 'ช่วงทดลองใช้ฟรี',
  active: 'ใช้งานปกติ',
  grace: 'ช่วงผ่อนผัน',
  suspended: 'พักการใช้งานชั่วคราว',
  expired: 'หมดอายุ',
  canceled: 'ยกเลิกแล้ว',
  blocked_by_platform: 'ถูกระงับโดย Platform',
  legacy: 'แพ็กเกจระบบเดิม',
}

export function subscriptionAccessStateLabel(state: string) {
  return subscriptionAccessStateLabels[state] ?? state
}

export function getSubscriptionDisplayStatus(subscription: {
  lifecycle_status: string
  expires_at: string
  grace_ends_at: string
  metadata?: Record<string, unknown> | null
}, now = new Date()): SubscriptionDisplayStatus {
  if (subscription.lifecycle_status === 'suspended') return 'suspended'
  if (subscription.lifecycle_status === 'canceled') return 'canceled'

  const trialEndsAt = typeof subscription.metadata?.trial_ends_at === 'string'
    ? new Date(subscription.metadata.trial_ends_at)
    : null
  if (trialEndsAt && !Number.isNaN(trialEndsAt.getTime()) && now < trialEndsAt) return 'trial'
  if (now < new Date(subscription.expires_at)) return 'active'
  if (now < new Date(subscription.grace_ends_at)) return 'grace'
  return 'expired'
}

export function subscriptionErrorMessage(message: string) {
  const errors: Record<string, string> = {
    platform_admin_aal2_required: 'ต้องยืนยัน MFA ก่อนจัดการ Subscription',
    subscription_command_id_required: 'ไม่พบรหัสคำสั่ง กรุณาลองใหม่',
    current_subscription_required: 'ไม่พบ Subscription ปัจจุบันขององค์กรนี้',
    subscription_already_exists: 'องค์กรนี้มี Subscription ที่ใช้งานอยู่แล้ว',
    active_subscription_required: 'คำสั่งนี้ใช้ได้เฉพาะ Subscription ที่กำลังใช้งาน',
    suspended_subscription_required: 'คำสั่งนี้ใช้ได้เฉพาะ Subscription ที่พักการใช้งานอยู่',
    active_plan_version_required: 'ต้องเลือก Plan Version ที่เปิดใช้งานอยู่',
    lifecycle_action_plan_change_forbidden: 'การพัก เปิดต่อ หรือยกเลิก ไม่สามารถเปลี่ยน Plan พร้อมกันได้',
    invalid_subscription_dates: 'วันที่ Subscription ไม่ถูกต้อง',
    subscription_reason_required: 'กรุณาระบุเหตุผลอย่างน้อย 3 ตัวอักษร',
  }
  const key = Object.keys(errors).find((item) => message.includes(item))
  return key ? errors[key] : message
}

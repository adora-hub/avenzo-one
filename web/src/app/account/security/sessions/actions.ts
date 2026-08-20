'use server'

import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'
import { sendCurrentSessionSecurityEmail } from '@/lib/session-security-email'

export type RevokeDeviceSessionResult = {
  success: boolean
  message: string
}

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i

function friendlyRevokeError(message: string) {
  if (message.includes('cannot_revoke_current_session')) {
    return 'ไม่สามารถออกจากระบบอุปกรณ์ที่กำลังใช้งานผ่านปุ่มนี้ได้'
  }
  if (message.includes('session_not_found_or_not_owned')) {
    return 'ไม่พบ Session นี้ หรือ Session ไม่ได้เป็นของบัญชีคุณ'
  }
  if (message.includes('authentication_required')) {
    return 'Session ปัจจุบันหมดอายุแล้ว กรุณาเข้าสู่ระบบใหม่'
  }
  return 'ออกจากระบบอุปกรณ์นี้ไม่สำเร็จ กรุณาลองใหม่อีกครั้ง'
}

export async function revokeDeviceSession(
  appSessionId: string,
): Promise<RevokeDeviceSessionResult> {
  if (!UUID_PATTERN.test(appSessionId)) {
    return { success: false, message: 'รหัส Session ไม่ถูกต้อง' }
  }

  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { success: false, message: 'กรุณาเข้าสู่ระบบใหม่' }

  const { error } = await supabase.rpc('app_revoke_my_session', {
    p_app_session_id: appSessionId,
  })

  if (error) return { success: false, message: friendlyRevokeError(error.message) }

  revalidatePath('/account/security/sessions')
  return { success: true, message: 'ออกจากระบบอุปกรณ์ที่เลือกแล้ว' }
}

export async function revokeOtherDeviceSessions(): Promise<RevokeDeviceSessionResult> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { success: false, message: 'กรุณาเข้าสู่ระบบใหม่' }

  const { data, error } = await supabase.rpc('app_revoke_my_other_sessions')
  if (error) return { success: false, message: friendlyRevokeError(error.message) }

  const revokedCount = typeof data === 'number' ? data : Number(data ?? 0)
  if (revokedCount > 0 && user.email) {
    await sendCurrentSessionSecurityEmail(
      supabase,
      user.email,
      'other_sessions_revoked',
    )
  }
  revalidatePath('/account/security/sessions')
  return {
    success: true,
    message: revokedCount > 0
      ? `ออกจากระบบอุปกรณ์อื่นแล้ว ${revokedCount} อุปกรณ์ อุปกรณ์นี้ยังใช้งานต่อได้`
      : 'ไม่มีอุปกรณ์อื่นที่กำลังใช้งานอยู่',
  }
}

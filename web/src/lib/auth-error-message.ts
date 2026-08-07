type AuthErrorLike = {
  code?: string
  message?: string
}

const authErrorMessages: Record<string, string> = {
  anonymous_provider_disabled: 'ระบบไม่อนุญาตให้เข้าใช้งานแบบไม่ระบุตัวตน',
  bad_code_verifier: 'ลิงก์ยืนยันไม่ถูกต้อง กรุณาขอลิงก์ใหม่อีกครั้ง',
  email_address_invalid: 'รูปแบบอีเมลไม่ถูกต้อง กรุณาตรวจสอบอีกครั้ง',
  email_address_not_authorized: 'อีเมลนี้ยังไม่ได้รับอนุญาตให้ใช้งานระบบ',
  email_exists: 'อีเมลนี้มีบัญชีอยู่แล้ว กรุณาเข้าสู่ระบบหรือใช้เมนูลืมรหัสผ่าน',
  email_not_confirmed: 'กรุณายืนยันอีเมลก่อนเข้าสู่ระบบ',
  flow_state_expired: 'ขั้นตอนยืนยันหมดอายุแล้ว กรุณาเริ่มใหม่อีกครั้ง',
  flow_state_not_found: 'ไม่พบขั้นตอนยืนยันนี้ กรุณาเริ่มใหม่อีกครั้ง',
  hook_timeout: 'ระบบยืนยันใช้เวลานานเกินไป กรุณาลองใหม่ภายหลัง',
  invalid_credentials: 'อีเมลหรือรหัสผ่านไม่ถูกต้อง',
  invite_not_found: 'ไม่พบคำเชิญนี้ หรือคำเชิญอาจถูกยกเลิกแล้ว',
  manual_linking_disabled: 'ระบบยังไม่อนุญาตให้เชื่อมบัญชีด้วยวิธีนี้',
  mfa_factor_name_conflict: 'มี Authenticator ชื่อนี้อยู่แล้ว กรุณารีเฟรชหน้าแล้วตรวจสอบสถานะอีกครั้ง',
  mfa_factor_not_found: 'ไม่พบ Authenticator นี้ กรุณาเริ่มตั้งค่าใหม่',
  mfa_ip_address_mismatch: 'เครือข่ายเปลี่ยนระหว่างการยืนยัน กรุณาเริ่มตรวจสอบใหม่อีกครั้ง',
  mfa_challenge_expired: 'รหัสยืนยันหมดอายุแล้ว กรุณาขอรหัสใหม่',
  mfa_verification_failed: 'รหัสยืนยันไม่ถูกต้อง กรุณาตรวจสอบอีกครั้ง',
  over_email_send_rate_limit: 'ส่งอีเมลบ่อยเกินไป กรุณารอสักครู่แล้วลองใหม่',
  over_request_rate_limit: 'ส่งคำขอบ่อยเกินไป กรุณารอสักครู่แล้วลองใหม่',
  otp_expired: 'ลิงก์หรือรหัสยืนยันหมดอายุแล้ว กรุณาขอใหม่อีกครั้ง',
  same_password: 'รหัสผ่านใหม่ต้องไม่ซ้ำกับรหัสผ่านเดิม',
  signup_disabled: 'ระบบปิดรับการสร้างบัญชีใหม่ชั่วคราว',
  user_already_exists: 'อีเมลนี้มีบัญชีอยู่แล้ว กรุณาเข้าสู่ระบบหรือใช้เมนูลืมรหัสผ่าน',
  user_banned: 'บัญชีนี้ถูกระงับการใช้งาน กรุณาติดต่อผู้ดูแลระบบ',
  user_not_found: 'ไม่พบบัญชีผู้ใช้นี้',
  weak_password: 'รหัสผ่านยังไม่ผ่านเงื่อนไขความปลอดภัย กรุณาตรวจสอบรายการด้านล่าง',
}

function asAuthError(error: unknown): AuthErrorLike {
  return typeof error === 'object' && error !== null ? error as AuthErrorLike : {}
}

export function isExistingAccountError(error: unknown) {
  const { code = '', message = '' } = asAuthError(error)
  return code === 'user_already_exists'
    || code === 'email_exists'
    || /already registered|already exists|user already/i.test(message)
}

export function getThaiAuthError(error: unknown) {
  const { code = '', message = '' } = asAuthError(error)
  if (authErrorMessages[code]) return authErrorMessages[code]
  if (/invalid login credentials/i.test(message)) return authErrorMessages.invalid_credentials
  if (/email not confirmed/i.test(message)) return authErrorMessages.email_not_confirmed
  if (/rate limit|too many requests/i.test(message)) return authErrorMessages.over_request_rate_limit
  if (/password/i.test(message) && /weak|characters|strength/i.test(message)) return authErrorMessages.weak_password
  if (isExistingAccountError(error)) return authErrorMessages.user_already_exists
  return 'ไม่สามารถดำเนินการได้ กรุณาลองใหม่อีกครั้ง หรือติดต่อผู้ดูแลระบบ'
}

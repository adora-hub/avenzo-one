import 'server-only'

import type { SupabaseClient } from '@supabase/supabase-js'

export type SessionSecurityNotificationType =
  | 'new_device_login'
  | 'other_sessions_revoked'

type ClaimedSessionSecurityEmail = {
  delivery_id: string
  security_event_id: string
  notification_type: SessionSecurityNotificationType
  event_created_at: string
  device_label: string | null
  browser_name: string | null
  operating_system: string | null
  revoked_count: number
}

export type SessionSecurityEmailResult = {
  status: 'sent' | 'skipped' | 'failed'
  safeCode?: string
}

function escapeHtml(value: string) {
  return value.replace(/[&<>'"]/g, (character) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;',
  })[character] ?? character)
}

function formatThaiDate(value: string) {
  return new Intl.DateTimeFormat('th-TH', {
    dateStyle: 'long',
    timeStyle: 'short',
    timeZone: 'Asia/Bangkok',
  }).format(new Date(value))
}

function emailFrame(title: string, content: string, sessionsUrl: string) {
  return `<!doctype html><html lang="th"><body style="margin:0;background:#f4f7fb;font-family:'Noto Sans Thai',Arial,sans-serif;color:#10203a"><div style="max-width:600px;margin:0 auto;padding:32px 20px"><div style="background:#fff;border:1px solid #dce4f0;border-radius:18px;padding:32px"><div style="color:#315cf6;font-size:12px;font-weight:700;letter-spacing:.12em">AVENZO ONE SECURITY</div><h1 style="font-size:25px;margin:12px 0">${escapeHtml(title)}</h1>${content}<a href="${escapeHtml(sessionsUrl)}" style="display:inline-block;padding:12px 20px;border-radius:10px;background:#315cf6;color:#fff;text-decoration:none;font-weight:700">ตรวจสอบอุปกรณ์และ Session</a></div></div></body></html>`
}

function createSecurityEmail(
  notification: ClaimedSessionSecurityEmail,
  appUrl: string,
) {
  const sessionsUrl = `${appUrl.replace(/\/$/, '')}/account/security/sessions`
  const occurredAt = formatThaiDate(notification.event_created_at)
  const unknown = 'ไม่ทราบ'
  const device = notification.device_label
    || [notification.browser_name, notification.operating_system].filter(Boolean).join(' บน ')
    || 'ไม่ทราบอุปกรณ์'

  if (notification.notification_type === 'other_sessions_revoked') {
    const count = Math.max(1, Number(notification.revoked_count || 0))
    const title = 'ออกจากระบบบนอุปกรณ์อื่นแล้ว'
    return {
      subject: `[AVENZO ONE] ${title}`,
      text: `${title} ${count} อุปกรณ์\nเวลา: ${occurredAt}\n\nหากคุณไม่ได้เป็นผู้ดำเนินการ ให้เปลี่ยนรหัสผ่านทันทีและตรวจสอบอุปกรณ์ที่เข้าสู่ระบบ: ${sessionsUrl}`,
      html: emailFrame(
        title,
        `<p style="font-size:16px;line-height:1.7">ระบบออกจากบัญชีของคุณบนอุปกรณ์อื่น <strong>${count} อุปกรณ์</strong></p><p style="font-size:16px;line-height:1.7">เวลา: <strong>${escapeHtml(occurredAt)}</strong></p><div style="margin:22px 0;padding:16px;border-radius:12px;background:#fff4f2;color:#9f2d20">หากคุณไม่ได้เป็นผู้ดำเนินการ โปรดเปลี่ยนรหัสผ่านทันทีและตรวจสอบอุปกรณ์ที่เข้าสู่ระบบ</div>`,
        sessionsUrl,
      ),
    }
  }

  const title = 'มีการเข้าสู่ระบบจากอุปกรณ์ใหม่'
  return {
    subject: `[AVENZO ONE] ${title}`,
    text: `${title}\nอุปกรณ์: ${device}\nเบราว์เซอร์: ${notification.browser_name || unknown}\nระบบปฏิบัติการ: ${notification.operating_system || unknown}\nเวลา: ${occurredAt}\n\nหากไม่ใช่คุณ ให้ตรวจสอบและออกจากระบบอุปกรณ์ดังกล่าวทันที: ${sessionsUrl}`,
    html: emailFrame(
      title,
      `<p style="font-size:16px;line-height:1.7">อุปกรณ์: <strong>${escapeHtml(device)}</strong><br>เบราว์เซอร์: <strong>${escapeHtml(notification.browser_name || unknown)}</strong><br>ระบบปฏิบัติการ: <strong>${escapeHtml(notification.operating_system || unknown)}</strong><br>เวลา: <strong>${escapeHtml(occurredAt)}</strong></p><div style="margin:22px 0;padding:16px;border-radius:12px;background:#fff4f2;color:#9f2d20">หากไม่ใช่คุณ โปรดตรวจสอบและออกจากระบบอุปกรณ์ดังกล่าวทันที</div>`,
      sessionsUrl,
    ),
  }
}

async function completeDelivery(
  supabase: Pick<SupabaseClient, 'rpc'>,
  deliveryId: string,
  success: boolean,
  providerMessageId?: string,
  safeErrorCode?: string,
) {
  const { error } = await supabase.rpc('app_complete_my_session_security_email', {
    p_delivery_id: deliveryId,
    p_success: success,
    p_provider_message_id: providerMessageId ?? null,
    p_safe_error_code: safeErrorCode ?? null,
  })
  if (error) {
    console.warn('[session-security-email] completion failed', { code: error.code })
  }
}

export async function sendCurrentSessionSecurityEmail(
  supabase: Pick<SupabaseClient, 'rpc'>,
  recipientEmail: string,
  notificationType: SessionSecurityNotificationType,
): Promise<SessionSecurityEmailResult> {
  try {
    const { data, error } = await supabase.rpc('app_claim_my_session_security_email', {
      p_notification_type: notificationType,
    })
    if (error) {
      console.warn('[session-security-email] claim failed', { code: error.code })
      return { status: 'failed', safeCode: 'claim_failed' }
    }

    const claim = (Array.isArray(data) ? data[0] : data) as ClaimedSessionSecurityEmail | null
    if (!claim?.delivery_id) return { status: 'skipped' }

    const apiKey = process.env.RESEND_API_KEY
    const fromEmail = process.env.RESEND_FROM_EMAIL
    const appUrl = process.env.NEXT_PUBLIC_APP_URL
    if (!apiKey || !fromEmail || !appUrl) {
      await completeDelivery(supabase, claim.delivery_id, false, undefined, 'configuration_incomplete')
      return { status: 'failed', safeCode: 'configuration_incomplete' }
    }

    const email = createSecurityEmail(claim, appUrl)
    const response = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
        'Idempotency-Key': `session-security/${claim.security_event_id}`,
      },
      body: JSON.stringify({
        from: `AVENZO ONE <${fromEmail}>`,
        to: [recipientEmail],
        subject: email.subject,
        html: email.html,
        text: email.text,
        tags: [{ name: 'notification_type', value: notificationType }],
      }),
    })
    const responseBody = await response.json().catch(() => ({})) as { id?: string }
    if (!response.ok || !responseBody.id) {
      const safeCode = `resend_http_${response.status}`
      await completeDelivery(supabase, claim.delivery_id, false, undefined, safeCode)
      return { status: 'failed', safeCode }
    }

    await completeDelivery(supabase, claim.delivery_id, true, responseBody.id)
    return { status: 'sent' }
  } catch (error) {
    console.warn('[session-security-email] delivery failed safely', {
      code: error instanceof Error ? error.name : 'unknown_error',
    })
    return { status: 'failed', safeCode: 'unexpected_delivery_error' }
  }
}

import 'server-only'

import { createAdminClient } from '@/lib/supabase/admin'

type ClaimedNotification = {
  queue_id: string
  recipient_user_id: string
  organization_id: string
  organization_name: string
  organization_timezone: string
  rule_name_th: string
  template_key: string
  scheduled_for: string
  attempt_number: number
  lock_token: string
  payload: Record<string, unknown>
  dedupe_key: string
}

export type NotificationWorkerResult = {
  mode: 'preview' | 'live'
  generated: number
  due: number
  claimed: number
  sent: number
  retrying: number
  failed: number
  errors: string[]
}

function escapeHtml(value: string) {
  return value.replace(/[&<>'"]/g, (character) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;',
  })[character] ?? character)
}

function formatThaiDate(value: string, timezone: string) {
  return new Intl.DateTimeFormat('th-TH', {
    dateStyle: 'long', timeStyle: 'short', timeZone: timezone || 'Asia/Bangkok',
  }).format(new Date(value))
}

function createEmail(notification: ClaimedNotification, appUrl: string) {
  const organization = escapeHtml(notification.organization_name)
  const eventName = escapeHtml(notification.rule_name_th)
  const scheduled = escapeHtml(formatThaiDate(notification.scheduled_for, notification.organization_timezone))
  const dashboardUrl = `${appUrl.replace(/\/$/, '')}/dashboard`
  const subject = `[AVENZO ONE] ${notification.rule_name_th} — ${notification.organization_name}`
  const text = `${notification.rule_name_th}\n\nOrganization: ${notification.organization_name}\nวันที่ตามกำหนด: ${formatThaiDate(notification.scheduled_for, notification.organization_timezone)}\n\nตรวจสอบ Subscription: ${dashboardUrl}`
  const html = `<!doctype html><html lang="th"><body style="margin:0;background:#f4f7fb;font-family:'Noto Sans Thai',Arial,sans-serif;color:#10203a"><div style="max-width:600px;margin:0 auto;padding:32px 20px"><div style="background:#fff;border:1px solid #dce4f0;border-radius:18px;padding:32px"><div style="color:#315cf6;font-size:12px;font-weight:700;letter-spacing:.12em">AVENZO ONE</div><h1 style="font-size:26px;margin:12px 0">${eventName}</h1><p style="font-size:16px;line-height:1.7">Organization: <strong>${organization}</strong></p><p style="font-size:16px;line-height:1.7">วันที่ตามกำหนด: <strong>${scheduled}</strong></p><a href="${escapeHtml(dashboardUrl)}" style="display:inline-block;margin-top:16px;padding:12px 20px;border-radius:10px;background:#315cf6;color:#fff;text-decoration:none;font-weight:700">ตรวจสอบ Subscription</a><p style="margin-top:28px;color:#61708a;font-size:13px">อีเมลนี้เป็นการแจ้งเตือนอัตโนมัติจาก AVENZO ONE</p></div></div></body></html>`
  return { subject, text, html }
}

async function completeNotification(
  notification: ClaimedNotification,
  success: boolean,
  details: { providerMessageId?: string; errorCode?: string; errorMessage?: string; responseSummary?: Record<string, unknown> },
) {
  const admin = createAdminClient()
  const { data, error } = await admin.rpc('worker_complete_subscription_notification', {
    p_queue_id: notification.queue_id,
    p_lock_token: notification.lock_token,
    p_success: success,
    p_provider_message_id: details.providerMessageId ?? null,
    p_error_code: details.errorCode ?? null,
    p_error_message: details.errorMessage ?? null,
    p_response_summary: details.responseSummary ?? {},
  })
  if (error) throw new Error(`complete_failed:${error.message}`)
  return String(data)
}

export async function processSubscriptionNotifications(): Promise<NotificationWorkerResult> {
  const admin = createAdminClient()
  const mode = process.env.SUBSCRIPTION_NOTIFICATION_DELIVERY_MODE === 'live' ? 'live' : 'preview'
  const result: NotificationWorkerResult = { mode, generated: 0, due: 0, claimed: 0, sent: 0, retrying: 0, failed: 0, errors: [] }

  const { data: generated, error: generateError } = await admin.rpc('worker_generate_subscription_notification_queue')
  if (generateError) throw new Error(`queue_generation_failed:${generateError.message}`)
  result.generated = Number(generated ?? 0)

  const { data: due, error: dueError } = await admin.rpc('worker_count_due_subscription_notifications')
  if (dueError) throw new Error(`queue_count_failed:${dueError.message}`)
  result.due = Number(due ?? 0)
  if (mode === 'preview' || result.due === 0) return result

  const resendApiKey = process.env.RESEND_API_KEY
  const fromEmail = process.env.RESEND_FROM_EMAIL
  const appUrl = process.env.NEXT_PUBLIC_APP_URL
  if (!resendApiKey || !fromEmail || !appUrl) {
    throw new Error('live_delivery_configuration_incomplete')
  }

  const workerId = `next-${crypto.randomUUID()}`
  const { data: claimedData, error: claimError } = await admin.rpc('worker_claim_subscription_notifications', {
    p_worker_id: workerId,
    p_limit: 10,
  })
  if (claimError) throw new Error(`queue_claim_failed:${claimError.message}`)
  const claimed = (claimedData ?? []) as ClaimedNotification[]
  result.claimed = claimed.length

  for (const notification of claimed) {
    try {
      const { data: recipientData, error: recipientError } = await admin.auth.admin.getUserById(notification.recipient_user_id)
      const recipientEmail = recipientData.user?.email
      if (recipientError || !recipientEmail) throw new Error('active_owner_email_not_found')

      const email = createEmail(notification, appUrl)
      const response = await fetch('https://api.resend.com/emails', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${resendApiKey}`,
          'Content-Type': 'application/json',
          'Idempotency-Key': `subscription-notification/${notification.queue_id}`,
        },
        body: JSON.stringify({
          from: `AVENZO ONE <${fromEmail}>`,
          to: [recipientEmail],
          subject: email.subject,
          html: email.html,
          text: email.text,
          tags: [
            { name: 'notification_type', value: notification.template_key },
            { name: 'organization_id', value: notification.organization_id },
          ],
        }),
      })
      const responseBody = await response.json().catch(() => ({})) as { id?: string; name?: string; message?: string }
      if (!response.ok || !responseBody.id) {
        const error = new Error(responseBody.message || `resend_http_${response.status}`)
        Object.assign(error, { code: responseBody.name || `http_${response.status}` })
        throw error
      }

      await completeNotification(notification, true, {
        providerMessageId: responseBody.id,
        responseSummary: { http_status: response.status },
      })
      result.sent += 1
    } catch (error) {
      const message = error instanceof Error ? error.message : 'delivery_failed'
      const code = error instanceof Error && 'code' in error ? String(error.code) : 'delivery_error'
      try {
        const outcome = await completeNotification(notification, false, {
          errorCode: code,
          errorMessage: message,
          responseSummary: { safe_error: code },
        })
        if (outcome === 'failed') result.failed += 1
        else result.retrying += 1
      } catch (completionError) {
        result.failed += 1
        result.errors.push(completionError instanceof Error ? completionError.message : 'completion_failed')
      }
      result.errors.push(`${notification.queue_id}:${code}`)
    }
  }

  return result
}

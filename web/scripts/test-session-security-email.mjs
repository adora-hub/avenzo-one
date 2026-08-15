import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import test from 'node:test'

const migration = await readFile('../supabase/migrations/20260811170000_phase_1_2_2_5_5_session_security_email_alerts.sql', 'utf8')
const claimFixMigration = await readFile('../supabase/migrations/20260811173000_phase_1_2_2_5_5_fix_session_security_email_claim.sql', 'utf8')
const helper = await readFile('src/lib/session-security-email.ts', 'utf8')
const route = await readFile('src/app/api/account/security/session-notifications/route.ts', 'utf8')
const heartbeat = await readFile('src/app/components/session-activity-heartbeat.tsx', 'utf8')
const actions = await readFile('src/app/account/security/sessions/actions.ts', 'utf8')
const notificationClient = await readFile('src/lib/session-security-notification-client.ts', 'utf8')
const mfaForm = await readFile('src/app/components/mfa-challenge-form.tsx', 'utf8')
const authForm = await readFile('src/app/components/auth-form.tsx', 'utf8')

test('delivery ledger is private, RLS protected, and idempotent by security event', () => {
  assert.match(migration, /create table if not exists private\.app_session_security_email_deliveries/)
  assert.match(migration, /security_event_id uuid not null unique/)
  assert.match(migration, /alter table private\.app_session_security_email_deliveries enable row level security/)
  assert.match(migration, /revoke all on table private\.app_session_security_email_deliveries from public, anon, authenticated/)
  assert.match(claimFixMigration, /on conflict on constraint app_session_security_email_deliveries_security_event_id_key/)
  assert.match(claimFixMigration, /returning delivery\.id into v_delivery_id/)
  assert.doesNotMatch(claimFixMigration, /on conflict \(security_event_id\)/)
})

test('claim and completion RPCs are bound to authenticated user and current session', () => {
  assert.match(migration, /v_user_id uuid := auth\.uid\(\)/)
  assert.match(migration, /auth\.jwt\(\) ->> 'session_id'/)
  assert.match(migration, /e\.user_id = v_user_id/)
  assert.match(migration, /e\.session_id = v_session_id/)
  assert.match(migration, /d\.user_id = v_user_id/)
  assert.match(migration, /d\.status = 'processing'/)
  assert.match(migration, /grant execute on function public\.app_claim_my_session_security_email\(text\) to authenticated/)
  assert.match(migration, /grant execute on function public\.app_complete_my_session_security_email\(uuid, boolean, text, text\) to authenticated/)
})

test('revoke-all creates one summary event only when another device was revoked', () => {
  assert.match(migration, /if v_revoked_count > 0 and v_current\.id is not null then/)
  assert.match(migration, /'session_other_devices_revoked_summary'/)
  assert.match(migration, /'revoked_count', v_revoked_count/)
})

test('email sender is server-only, uses Resend securely, and never throws into the user flow', () => {
  assert.match(helper, /import 'server-only'/)
  assert.match(helper, /process\.env\.RESEND_API_KEY/)
  assert.match(helper, /process\.env\.RESEND_FROM_EMAIL/)
  assert.match(helper, /process\.env\.NEXT_PUBLIC_APP_URL/)
  assert.match(helper, /https:\/\/api\.resend\.com\/emails/)
  assert.match(helper, /'Idempotency-Key': `session-security\/\$\{claim\.security_event_id\}`/)
  assert.match(helper, /catch \(error\)[\s\S]*return \{ status: 'failed', safeCode: 'unexpected_delivery_error' \}/)
  assert.doesNotMatch(helper, /console\.(?:log|warn|error)\([^\n]*(?:apiKey|recipientEmail)/)
})

test('new-device route accepts only authenticated new-device notifications', () => {
  assert.match(route, /body\.type !== 'new_device_login'/)
  assert.match(route, /supabase\.auth\.getUser\(\)/)
  assert.match(route, /status: 401/)
  assert.match(route, /sendCurrentSessionSecurityEmail\([\s\S]*'new_device_login'/)
  assert.match(route, /request\.headers\.get\('authorization'\)/)
  assert.match(route, /Authorization: `Bearer \$\{accessToken\}`/)
})

test('heartbeat waits for completed MFA and requests email only after device metadata registration succeeds', () => {
  const assuranceIndex = heartbeat.indexOf('await supabase.auth.mfa.getAuthenticatorAssuranceLevel()')
  const completedIndex = heartbeat.indexOf('assurance.data.currentLevel === assurance.data.nextLevel')
  const updateIndex = heartbeat.indexOf('await updateCurrentSessionDeviceMetadata')
  const recordedIndex = heartbeat.indexOf('deviceMetadataRecorded = true')
  const notifyIndex = heartbeat.indexOf('await requestNewDeviceLoginNotification()')
  assert.ok(
    assuranceIndex >= 0
      && completedIndex > assuranceIndex
      && updateIndex > completedIndex
      && recordedIndex > updateIndex
      && notifyIndex > recordedIndex,
  )
  assert.match(heartbeat, /if \(!authenticationComplete\)[\s\S]*return/)
  assert.match(heartbeat, /reportSessionSecurityNotificationFailure\('session-heartbeat', notification\)/)
})

test('successful login paths await the notification request after session registration and before redirect', () => {
  assert.match(notificationClient, /supabase\.auth\.getSession\(\)/)
  assert.match(notificationClient, /Authorization: `Bearer \$\{session\.access_token\}`/)
  assert.match(notificationClient, /credentials: 'same-origin'/)
  assert.match(notificationClient, /cache: 'no-store'/)

  const mfaRegistrationIndex = mfaForm.indexOf('await registerCurrentAppSession(supabase)')
  const mfaNotificationIndex = mfaForm.indexOf('await requestNewDeviceLoginNotification()')
  const mfaRedirectIndex = mfaForm.indexOf('window.location.assign(nextPath)')
  assert.ok(
    mfaRegistrationIndex >= 0
      && mfaNotificationIndex > mfaRegistrationIndex
      && mfaRedirectIndex > mfaNotificationIndex,
  )
  assert.match(mfaForm, /if \(registration\.registered\)[\s\S]*await requestNewDeviceLoginNotification\(\)/)
  assert.match(authForm, /if \(result\.registered\)[\s\S]*await requestNewDeviceLoginNotification\(\)/)
})

test('revoke-all email is sent only after a successful non-empty revoke operation', () => {
  assert.match(actions, /if \(revokedCount > 0 && user\.email\)/)
  assert.match(actions, /sendCurrentSessionSecurityEmail\([\s\S]*'other_sessions_revoked'/)
  assert.ok(actions.indexOf("rpc('app_revoke_my_other_sessions')") < actions.indexOf('await sendCurrentSessionSecurityEmail'))
})

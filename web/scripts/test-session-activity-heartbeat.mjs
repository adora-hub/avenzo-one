import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import test from 'node:test'

const migration = await readFile(
  '../supabase/migrations/20260811133000_phase_1_2_2_2_session_activity_heartbeat.sql',
  'utf8',
)
const helper = await readFile('src/lib/session-activity.ts', 'utf8')
const component = await readFile('src/app/components/session-activity-heartbeat.tsx', 'utf8')
const layout = await readFile('src/app/layout.tsx', 'utf8')

test('heartbeat RPC is bound to the authenticated user and JWT session', () => {
  assert.match(migration, /v_user_id uuid := auth\.uid\(\)/)
  assert.match(migration, /auth\.jwt\(\) ->> 'session_id'/)
  assert.match(migration, /session_owner_mismatch/)
  assert.match(migration, /grant execute on function public\.app_touch_current_session\(\) to authenticated/)
  assert.match(migration, /revoke all on function public\.app_touch_current_session\(\) from public, anon/)
})

test('database throttles writes and never revives an inactive session', () => {
  assert.match(migration, /interval '60 seconds'/)
  assert.match(migration, /not v_idle_expired/)
  assert.match(migration, /not v_absolute_expired/)
  assert.match(migration, /not v_revoked/)
  assert.match(migration, /idle_expires_at = least/)
  assert.doesNotMatch(migration, /set absolute_expires_at/)
})

test('client helper maps the heartbeat status without exposing credentials', () => {
  assert.match(helper, /supabase\.rpc\('app_touch_current_session'\)/)
  assert.match(helper, /heartbeatRecorded: row\.heartbeat_recorded/)
  assert.doesNotMatch(helper, /service_role|secret_key|access_token/i)
})

test('global client heartbeat is activity-aware and throttled', () => {
  assert.match(component, /SESSION_HEARTBEAT_MIN_INTERVAL_MS/)
  assert.match(component, /activityPending/)
  assert.match(component, /document\.visibilityState === 'hidden'/)
  assert.match(component, /addEventListener\(eventName, markActivity, \{ passive: true \}\)/)
  assert.match(component, /removeEventListener\(eventName, markActivity\)/)
  assert.match(component, /clearInterval\(intervalId\)/)
})

test('heartbeat remains globally mounted and reports inactive session evidence', () => {
  assert.match(layout, /<SessionActivityHeartbeat \/>/)
  assert.match(component, /inactive session observed/)
})

test('heartbeat requests the security email only after device metadata is registered', () => {
  const metadataRecordedAt = component.indexOf('deviceMetadataRecorded = true')
  const notificationRequestedAt = component.indexOf('await requestNewDeviceLoginNotification()')

  assert.ok(metadataRecordedAt >= 0)
  assert.ok(notificationRequestedAt > metadataRecordedAt)
  assert.match(component, /reportSessionSecurityNotificationFailure\('session-heartbeat', notification\)/)
  assert.doesNotMatch(component, /fetch\('\/api\/account\/security\/session-notifications'/)
})

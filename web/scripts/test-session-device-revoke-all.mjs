import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import test from 'node:test'

const migration = await readFile('../supabase/migrations/20260811161000_phase_1_2_2_5_3_revoke_other_sessions.sql', 'utf8')
const action = await readFile('src/app/account/security/sessions/actions.ts', 'utf8')
const component = await readFile('src/app/account/security/sessions/session-device-list.tsx', 'utf8')
const middleware = await readFile('src/lib/supabase/middleware.ts', 'utf8')

test('bulk revoke RPC is owner scoped and always excludes the current session', () => {
  assert.match(migration, /where s\.user_id = v_user_id/)
  assert.match(migration, /s\.session_id <> v_current_session_id/)
  assert.match(migration, /s\.revoked_at is null/)
  assert.match(migration, /s\.idle_expires_at > now\(\)/)
  assert.match(migration, /s\.absolute_expires_at > now\(\)/)
  assert.match(migration, /for update/)
})

test('bulk revoke RPC is authenticated-only and appends private audit per target', () => {
  assert.match(migration, /security definer/)
  assert.match(migration, /revoke all on function public\.app_revoke_my_other_sessions\(\) from public, anon/)
  assert.match(migration, /grant execute on function public\.app_revoke_my_other_sessions\(\) to authenticated/)
  assert.match(migration, /insert into private\.app_session_security_events/)
  assert.match(migration, /'session_other_devices_revoked'/)
  assert.match(migration, /'current_session_excluded', true/)
})

test('server action re-authenticates and accepts no browser-supplied target or reason', () => {
  assert.match(action, /export async function revokeOtherDeviceSessions\(\)/)
  assert.match(action, /supabase\.auth\.getUser\(\)/)
  assert.match(action, /rpc\('app_revoke_my_other_sessions'\)/)
  assert.doesNotMatch(action, /app_revoke_my_other_sessions'[\s\S]*p_user_id/)
  assert.match(migration, /v_reason constant text := 'Signed out all other devices from AVENZO session device management'/)
})

test('UI shows an explicit bulk confirmation and states the current device is preserved', () => {
  assert.match(component, /activeOtherCount/)
  assert.match(component, /ยืนยันออกจากระบบอีก \{activeOtherCount\} อุปกรณ์หรือไม่/)
  assert.match(component, /อุปกรณ์ที่คุณกำลังใช้งานอยู่นี้จะไม่ถูกนำออกจากระบบ/)
  assert.match(component, /ยืนยันออกจากระบบทั้งหมด/)
  assert.match(component, /useTransition/)
})

test('revoked app sessions remain enforced by middleware', () => {
  assert.match(middleware, /status\.revoked/)
  assert.match(middleware, /supabase\.auth\.signOut\(\{ scope: 'local' \}\)/)
})

import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import test from 'node:test'

const migration = await readFile('../supabase/migrations/20260811160000_phase_1_2_2_5_2_revoke_single_session.sql', 'utf8')
const action = await readFile('src/app/account/security/sessions/actions.ts', 'utf8')
const component = await readFile('src/app/account/security/sessions/session-device-list.tsx', 'utf8')
const middleware = await readFile('src/lib/supabase/middleware.ts', 'utf8')

test('revoke RPC is restricted to an owned non-current session', () => {
  assert.match(migration, /where s\.id = p_app_session_id\s+and s\.user_id = v_user_id/)
  assert.match(migration, /if v_target\.session_id = v_current_session_id then/)
  assert.match(migration, /cannot_revoke_current_session/)
  assert.match(migration, /session_not_found_or_not_owned/)
  assert.match(migration, /revoke all on function public\.app_revoke_my_session\(uuid\) from public, anon/)
  assert.match(migration, /grant execute on function public\.app_revoke_my_session\(uuid\) to authenticated/)
})

test('revoke RPC records an append-only private audit event', () => {
  assert.match(migration, /insert into private\.app_session_security_events/)
  assert.match(migration, /'session_device_revoked'/)
  assert.match(migration, /'target_app_session_id'/)
})

test('server action authenticates again and does not accept a user-supplied reason', () => {
  assert.match(action, /supabase\.auth\.getUser\(\)/)
  assert.match(action, /app_revoke_my_session/)
  assert.doesNotMatch(action, /p_reason/)
  assert.match(migration, /v_reason constant text := 'Signed out from AVENZO session device management'/)
})

test('UI protects the current device and requires explicit confirmation', () => {
  assert.match(component, /!session\.is_current && session\.session_state === 'active'/)
  assert.match(component, /ยืนยันออกจากระบบอุปกรณ์นี้หรือไม่/)
  assert.match(component, /ยืนยันออกจากระบบ/)
  assert.match(component, /useTransition/)
})

test('middleware enforces revoked app sessions on the next protected request', () => {
  assert.match(middleware, /status\.revoked/)
  assert.match(middleware, /supabase\.auth\.signOut\(\{ scope: 'local' \}\)/)
})

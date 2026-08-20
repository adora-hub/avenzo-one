import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import test from 'node:test'

const migration = await readFile(
  '../supabase/migrations/20260811120000_phase_1_2_1_session_policy_foundation.sql',
  'utf8',
)
const policy = await readFile('src/lib/session-policy.ts', 'utf8')

test('session policy tiers use the approved idle, absolute and warning windows', () => {
  assert.match(migration, /\('privileged', 1800, 28800, 300\)/)
  assert.match(migration, /\('organization', 28800, 604800, 300\)/)
  assert.match(policy, /idleTimeoutSeconds: 30 \* 60/)
  assert.match(policy, /absoluteTimeoutSeconds: 7 \* 24 \* 60 \* 60/)
})

test('session state and audit evidence remain private-by-default', () => {
  assert.match(migration, /alter table private\.app_sessions enable row level security/)
  assert.match(migration, /revoke all on table private\.app_sessions from public, anon, authenticated/)
  assert.match(migration, /private\.app_session_security_events/)
  assert.match(migration, /session_registered/)
})

test('RPCs are scoped to the authenticated caller current JWT session', () => {
  assert.match(migration, /auth\.jwt\(\) ->> 'session_id'/)
  assert.match(migration, /s\.user_id = v_user_id/)
  assert.match(migration, /raise exception 'authentication_required'/)
  assert.match(migration, /raise exception 'session_owner_mismatch'/)
})

test('phase 1.2.1 explicitly does not enforce expiration', () => {
  assert.match(migration, /Server-side expiration enforcement begins in Phase 1\.2\.2/)
  assert.match(migration, /'enforcement_enabled', false/)
  assert.doesNotMatch(migration, /auth\.sessions[\s\S]*delete/)
})

import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import test from 'node:test'
import {
  expiryKindToLogoutReason,
  getAppSessionLogoutMessage,
  resolveAppSessionLogoutReason,
} from '../src/lib/session-activity.ts'

const middleware = await readFile('src/lib/supabase/middleware.ts', 'utf8')
const heartbeat = await readFile('src/app/components/session-activity-heartbeat.tsx', 'utf8')
const authForm = await readFile('src/app/components/auth-form.tsx', 'utf8')

test('resolves one stable logout reason with revocation taking priority', () => {
  assert.equal(resolveAppSessionLogoutReason({
    revoked: true,
    absoluteExpired: true,
    idleExpired: true,
  }), 'revoked')
  assert.equal(resolveAppSessionLogoutReason({
    revoked: false,
    absoluteExpired: true,
    idleExpired: true,
  }), 'absolute_timeout')
  assert.equal(resolveAppSessionLogoutReason({
    revoked: false,
    absoluteExpired: false,
    idleExpired: true,
  }), 'idle_timeout')
  assert.equal(resolveAppSessionLogoutReason({
    revoked: false,
    absoluteExpired: false,
    idleExpired: false,
  }), null)
})

test('maps countdown expiry kinds to safe login reasons', () => {
  assert.equal(expiryKindToLogoutReason('idle'), 'idle_timeout')
  assert.equal(expiryKindToLogoutReason('absolute'), 'absolute_timeout')
  assert.equal(expiryKindToLogoutReason('revoked'), 'revoked')
})

test('provides clear Thai feedback after forced logout', () => {
  assert.match(getAppSessionLogoutMessage('idle_timeout') ?? '', /ไม่มีการใช้งาน/)
  assert.match(getAppSessionLogoutMessage('absolute_timeout') ?? '', /อายุสูงสุด/)
  assert.match(getAppSessionLogoutMessage('revoked') ?? '', /ถูกยกเลิก/)
  assert.equal(getAppSessionLogoutMessage('unknown'), null)
  assert.match(authForm, /getAppSessionLogoutMessage/)
})

test('middleware enforces registered session status server-side and prevents caching', () => {
  assert.match(middleware, /app_current_session_status/)
  assert.match(middleware, /resolveAppSessionLogoutReason/)
  assert.match(middleware, /signOut\(\{ scope: 'local' \}\)/)
  assert.match(middleware, /session_expired/)
  assert.match(middleware, /private, no-store/)
  assert.match(middleware, /searchParams\.set\('session', reason\)/)
})

test('client expiry signs out only the current device and replaces browser history once', () => {
  assert.match(heartbeat, /logoutStartedRef/)
  assert.match(heartbeat, /signOut\(\{ scope: 'local' \}\)/)
  assert.match(heartbeat, /window\.location\.replace/)
  assert.match(heartbeat, /กำลังออกจากระบบ/)
  assert.doesNotMatch(heartbeat, /window\.location\.assign\(`\/\?session=/)
})

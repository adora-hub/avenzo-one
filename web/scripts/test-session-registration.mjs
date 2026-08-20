import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import test from 'node:test'

const helper = await readFile('src/lib/session-registration.ts', 'utf8')
const authForm = await readFile('src/app/components/auth-form.tsx', 'utf8')
const passwordSignIn = await readFile('src/app/api/auth/sign-in/route.ts', 'utf8')
const hashSession = await readFile('src/app/api/auth/session/route.ts', 'utf8')
const mfaForm = await readFile('src/app/components/mfa-challenge-form.tsx', 'utf8')
const callback = await readFile('src/app/auth/callback/route.ts', 'utf8')

test('shared helper registers the current authenticated session through the approved RPC', () => {
  assert.match(helper, /supabase\.rpc\('app_register_current_session'\)/)
  assert.match(helper, /registered: false/)
  assert.match(helper, /registered: true/)
})

test('password and hash-session login paths register before redirecting', () => {
  assert.match(passwordSignIn, /supabase\.rpc\('app_register_current_session'\)/)
  assert.match(passwordSignIn, /registered: !registration\.error/)
  assert.match(hashSession, /supabase\.auth\.setSession/)
  assert.match(hashSession, /supabase\.rpc\('app_register_current_session'\)/)
  assert.match(authForm, /fetch\('\/api\/auth\/session'/)
  assert.match(authForm, /if \(result\.registered\) \{[\s\S]*requestNewDeviceLoginNotification\(\)[\s\S]*window\.location\.assign\(result\.destination\)/)
})

test('password login does not misreport an auth network outage as invalid credentials', () => {
  assert.match(passwordSignIn, /auth_service_unreachable/)
  assert.match(passwordSignIn, /authServiceUnavailable \? 503 : 401/)
})

test('platform admin registers only after a successful MFA verification', () => {
  const verifiedAt = mfaForm.indexOf('challengeAndVerify')
  const registeredAt = mfaForm.indexOf('registerCurrentAppSession(supabase)')
  const notifiedAt = mfaForm.indexOf('requestNewDeviceLoginNotification()')
  const redirectedAt = mfaForm.indexOf('window.location.assign(nextPath)')

  assert.ok(verifiedAt >= 0)
  assert.ok(registeredAt > verifiedAt)
  assert.ok(notifiedAt > registeredAt)
  assert.ok(redirectedAt > notifiedAt)
})

test('PKCE and OTP callback sessions are registered only after authentication succeeds', () => {
  assert.match(callback, /authSucceeded = !error/)
  assert.match(callback, /if \(authSucceeded && !isPasswordRecovery\) \{[\s\S]*registerCurrentAppSession\(supabase\)/)
})

test('registration errors are logged safely and do not throw a second login error', () => {
  assert.match(helper, /console\.error\('\[session-registration\] registration failed'/)
  assert.doesNotMatch(helper, /throw error/)
})

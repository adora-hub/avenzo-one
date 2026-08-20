import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import test from 'node:test'

const authFormPath = new URL('../src/app/components/auth-form.tsx', import.meta.url)
const callbackPath = new URL('../src/app/auth/callback/route.ts', import.meta.url)
const recoveryFormPath = new URL('../src/app/components/password-recovery-form.tsx', import.meta.url)
const setPasswordPagePath = new URL('../src/app/auth/set-password/page.tsx', import.meta.url)
const setPasswordFormPath = new URL('../src/app/components/set-password-form.tsx', import.meta.url)

test('password reset email returns through the auth callback to the set-password route', async () => {
  const source = await readFile(authFormPath, 'utf8')
  assert.match(source, /resetPasswordForEmail/)
  assert.match(source, /getPasswordRecoveryRedirectUrl\(\)/)
  assert.match(source, /https:\/\/app\.avenzoone\.com/)
  assert.match(source, /NEXT_PUBLIC_APP_URL/)
})

test('legacy implicit recovery hashes are routed to the set-password page', async () => {
  const source = await readFile(authFormPath, 'utf8')
  assert.match(source, /authType === 'recovery'/)
  assert.match(source, /window\.location\.assign\('\/auth\/set-password'\)/)
})

test('expired recovery hashes show a clear recovery message instead of a normal login form', async () => {
  const source = await readFile(authFormPath, 'utf8')
  assert.match(source, /recoveryError === 'otp_expired'/)
  assert.match(source, /ลิงก์ตั้งรหัสผ่านหมดอายุหรือถูกใช้แล้ว/)
  assert.match(source, /setMode\('forgot-password'\)/)
})

test('set-password page does not redirect before the browser consumes recovery tokens', async () => {
  const page = await readFile(setPasswordPagePath, 'utf8')
  assert.doesNotMatch(page, /redirect\(/)
  assert.match(page, /<PasswordRecoveryForm \/>/)
})

test('recovery form consumes fragment tokens and handles expired links', async () => {
  const source = await readFile(recoveryFormPath, 'utf8')
  assert.match(source, /supabase\.auth\.setSession/)
  assert.match(source, /supabase\.auth\.getUser/)
  assert.match(source, /ลิงก์ตั้งรหัสผ่านไม่ถูกต้อง หมดอายุ หรือถูกใช้ไปแล้ว/)
  assert.match(source, /\?forgot=1&recovery=expired/)
})

test('callback does not register recovery as a normal application login', async () => {
  const source = await readFile(callbackPath, 'utf8')
  assert.match(source, /authSucceeded && !isPasswordRecovery/)
  assert.match(source, /recovery_link_invalid/)
})

test('MFA-enabled recovery verifies AAL2 before updating the password', async () => {
  const source = await readFile(setPasswordFormPath, 'utf8')
  assert.match(source, /getAuthenticatorAssuranceLevel/)
  assert.match(source, /listFactors/)
  assert.match(source, /challengeAndVerify/)
  assert.match(source, /supabase\.auth\.setSession/)
  assert.match(source, /updateUser\(\{ password \}\)/)
  assert.ok(
    source.indexOf('challengeAndVerify') < source.indexOf('updateUser({ password })'),
    'MFA verification must happen before the password update',
  )
  assert.match(source, /รหัส Authenticator 6 หลัก/)
})

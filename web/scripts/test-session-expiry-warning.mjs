import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import test from 'node:test'
import { calculateAppSessionExpiryState } from '../src/lib/session-activity.ts'

const component = await readFile('src/app/components/session-activity-heartbeat.tsx', 'utf8')

const baseline = {
  registered: true,
  heartbeatRecorded: true,
  policyTier: 'organization',
  policyVersion: 1,
  warningSeconds: 300,
  serverTime: '2026-08-11T10:00:00.000Z',
  startedAt: '2026-08-11T09:00:00.000Z',
  lastSeenAt: '2026-08-11T10:00:00.000Z',
  idleExpiresAt: '2026-08-11T10:04:00.000Z',
  absoluteExpiresAt: '2026-08-18T09:00:00.000Z',
  idleExpired: false,
  absoluteExpired: false,
  revoked: false,
}

test('uses server time and shows the idle warning inside the warning window', () => {
  const state = calculateAppSessionExpiryState(baseline, 1_000, 31_000)
  assert.equal(state?.kind, 'idle')
  assert.equal(state?.remainingSeconds, 210)
  assert.equal(state?.showWarning, true)
  assert.equal(state?.expired, false)
})

test('chooses the earliest expiry and absolute lifetime cannot be mistaken for idle', () => {
  const state = calculateAppSessionExpiryState({
    ...baseline,
    idleExpiresAt: '2026-08-11T12:00:00.000Z',
    absoluteExpiresAt: '2026-08-11T10:03:00.000Z',
  }, 1_000, 1_000)
  assert.equal(state?.kind, 'absolute')
  assert.equal(state?.remainingSeconds, 180)
})

test('marks an elapsed or revoked session as expired', () => {
  const elapsed = calculateAppSessionExpiryState(baseline, 1_000, 301_000)
  assert.equal(elapsed?.expired, true)
  assert.equal(elapsed?.remainingSeconds, 0)

  const revoked = calculateAppSessionExpiryState({ ...baseline, revoked: true }, 1_000, 1_000)
  assert.equal(revoked?.kind, 'revoked')
  assert.equal(revoked?.expired, true)
})

test('warning UI is accessible and lets idle users continue before expiry', () => {
  assert.match(component, /role="alertdialog"/)
  assert.match(component, /aria-live="polite"/)
  assert.match(component, /ใช้งานต่อ/)
  assert.match(component, /forceHeartbeatRef/)
  assert.match(component, /if \(warningVisibleRef\.current\) return/)
  assert.match(component, /ใกล้ครบอายุสูงสุดของ Session/)
})

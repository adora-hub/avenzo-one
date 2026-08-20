import assert from 'node:assert/strict'
import { readdir, readFile } from 'node:fs/promises'
import path from 'node:path'
import test from 'node:test'

const migrationDirectory = path.resolve('../supabase/migrations')
const migrationName = (await readdir(migrationDirectory)).find((name) =>
  name.endsWith('_phase_1_2_4_2_1_function_permission_allowlist.sql'),
)

assert.ok(migrationName, 'Phase 1.2.4.2.1 migration must exist')

const migration = await readFile(path.join(migrationDirectory, migrationName), 'utf8')

function signaturesBetween(startMarker, endMarker) {
  const start = migration.indexOf(startMarker)
  const end = migration.indexOf(endMarker)
  assert.ok(start >= 0 && end > start, `${startMarker} section must be present`)

  return [...migration.slice(start, end).matchAll(/'public\.([^']+\([^']*\))'/g)].map(
    ([, signature]) => signature,
  )
}

const authenticated = signaturesBetween(
  '-- AUTHENTICATED_ALLOWLIST_BEGIN',
  '-- AUTHENTICATED_ALLOWLIST_END',
)
const serviceOnly = signaturesBetween(
  '-- SERVICE_ROLE_ONLY_BEGIN',
  '-- SERVICE_ROLE_ONLY_END',
)
const allSignatures = [...authenticated, ...serviceOnly]

test('all 56 SECURITY DEFINER functions are classified exactly once', () => {
  assert.equal(authenticated.length, 42)
  assert.equal(serviceOnly.length, 14)
  assert.equal(allSignatures.length, 56)
  assert.equal(new Set(allSignatures).size, 56)
})
test('deny-by-default is applied before reviewed grants', () => {
  assert.match(
    migration,
    /alter default privileges for role postgres in schema public\s+revoke execute on functions from public, anon, authenticated;/,
  )
  assert.match(
    migration,
    /revoke execute on function %s from public, anon, authenticated, service_role/,
  )
  assert.match(migration, /grant execute on function %s to service_role/)
  assert.match(migration, /grant execute on function %s to authenticated/)
  assert.doesNotMatch(migration, /grant execute on function %s to (?:public|anon)/)
})

test('internal and legacy functions are not browser-callable', () => {
  const newlyRestricted = [
    'current_app_session_policy()',
    'platform_billing_transfer_fulfillment_queue()',
    'platform_cancel_billing_credit_note(uuid,text)',
  ]

  for (const signature of newlyRestricted) {
    assert.ok(serviceOnly.includes(signature), `${signature} must remain service-role-only`)
    assert.ok(!authenticated.includes(signature), `${signature} must not be authenticated`)
  }
})

test('current application RPC surface remains in the authenticated allowlist', () => {
  const requiredCurrentFunctions = [
    'app_current_session_status()',
    'customer_prepare_billing_transfer_proof(uuid,uuid,text,text,bigint,numeric,timestamp with time zone,text,uuid)',
    'platform_admin_directory()',
    'platform_billing_transfer_fulfillment_queue_v2()',
    'platform_review_billing_transfer_proof_v2(uuid,text,text,uuid,boolean,text)',
    'platform_update_billing_transfer_approval_policy(numeric,boolean,text,uuid,bigint)',
  ]

  for (const signature of requiredCurrentFunctions) {
    assert.ok(authenticated.includes(signature), `${signature} must remain authenticated`)
  }
})

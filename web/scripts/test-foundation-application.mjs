import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import test from 'node:test'

const read = (path) => readFile(new URL(path, import.meta.url), 'utf8')

const migrationPath = '../../supabase/migrations/20260813135745_phase_2_0_4_server_application_foundation.sql'

test('server command boundary re-authenticates and does not trust a client session', async () => {
  const [action, context, service, repository, core] = await Promise.all([
    read('../src/app/actions/foundation.ts'),
    read('../src/lib/foundation/server-context.ts'),
    read('../src/lib/foundation/server-service.ts'),
    read('../src/lib/foundation/supabase-repository.ts'),
    read('../src/lib/foundation/service-core.ts'),
  ])

  assert.match(action, /^'use server'/)
  assert.match(action, /parseFoundationCommand/)
  assert.match(action, /executeFoundationServerCommand/)
  assert.doesNotMatch(action, /createAdminClient|SUPABASE_SECRET_KEY/)

  assert.match(context, /import 'server-only'/)
  assert.match(context, /auth\.getUser\(\)/)
  assert.doesNotMatch(context, /auth\.getSession\(\)/)
  assert.match(context, /current_user_organization_access/)

  assert.match(service, /getFoundationActor/)
  assert.match(service, /resolveBranchIds/)
  assert.match(service, /executeFoundationCommand/)
  assert.match(repository, /server_execute_foundation_command/)
  assert.match(repository, /server_post_inventory_command/)
  assert.match(core, /commandType === 'product\.create_with_initial_sku'[\s\S]*return 'product\.create'/)
  assert.match(core, /commandType\.startsWith\('product\.'\)[\s\S]*return 'product\.update'/)
  assert.match(core, /commandType === 'product\.archive'[\s\S]*return 'product\.archive'/)
  assert.doesNotMatch(core, /return 'product\.manage'/)
})

test('reads use the user-scoped RLS client and keyset cursors', async () => {
  const [factory, repository] = await Promise.all([
    read('../src/lib/foundation/server-read.ts'),
    read('../src/lib/foundation/supabase-repository.ts'),
  ])

  assert.match(factory, /createClient/)
  assert.doesNotMatch(factory, /createAdminClient/)
  assert.match(factory, /SupabaseFoundationReadRepository/)
  assert.match(repository, /decodeFoundationCursor/)
  assert.match(repository, /updated_at\.lt/)
  assert.match(repository, /occurred_at\.lt/)
  assert.match(repository, /\.limit\(pageSize \+ 1\)/)
})

test('database owns idempotency, authorization, versioning and immutable evidence', async () => {
  const migration = await read(migrationPath)

  assert.match(migration, /create table public\.foundation_commands/i)
  assert.match(migration, /create table public\.foundation_domain_events/i)
  assert.match(migration, /expected_version/i)
  assert.match(migration, /version_conflict/i)
  assert.match(migration, /server_actor_has_org_permission/i)
  assert.match(migration, /command_payload_conflict/i)
  assert.match(migration, /prevent_foundation_history_mutation/i)
  assert.match(migration, /grant execute on function public\.server_execute_foundation_command[\s\S]*to service_role/i)
  assert.match(migration, /revoke all on function public\.server_execute_foundation_command[\s\S]*from public, anon, authenticated/i)
})

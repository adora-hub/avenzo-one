import assert from 'node:assert/strict'
import { readdir, readFile } from 'node:fs/promises'
import { spawnSync } from 'node:child_process'
import test from 'node:test'

const container = process.env.GSC05_CONTAINER
const root = new URL('../../', import.meta.url)
const baselineRoot = new URL('supabase/production-baseline/', root)
const migrationRoot = new URL('supabase/migrations/', root)
const gsc03 = '20260821112527_phase_gsc_03_global_sales_code_compatibility.sql'
const gsc04 = '20260821115026_phase_gsc_04_global_allocator_range_rollover.sql'
const gsc05 = '20260821143000_phase_gsc_05_atomic_creation_integration.sql'

function psql(sql) {
  const result = spawnSync('docker', [
    'exec', '-i', container, 'psql', '-X', '-U', 'postgres', '-d', 'postgres',
    '-v', 'ON_ERROR_STOP=1', '-At',
  ], { input: sql, encoding: 'utf8', maxBuffer: 80 * 1024 * 1024 })
  if (result.status !== 0) throw new Error(`${result.stdout}\n${result.stderr}`)
  return result.stdout.trim()
}

const bridges = [
  ['20260807084013', new URL('supabase/migrations/20260806230000_phase_0_7_permission_aware_ui.sql', root)],
  ['20260807084013', new URL('supabase/migrations/20260806233000_phase_0_7_restrict_organization_creation.sql', root)],
  ['20260807084013', new URL('supabase/migrations/20260806234500_phase_0_7_member_access_summary.sql', root)],
  ['20260807135259', new URL('supabase/migrations/20260807150000_phase_1_0_2_plans_prices.sql', root)],
  ['20260807135259', new URL('supabase/migrations/20260807160000_phase_1_0_2_1_plan_lifecycle.sql', root)],
  ['20260809080324', new URL('supabase/migrations/20260808150000_phase_1_1_3_3_stripe_test_checkout.sql', root)],
  ['20260811125537', new URL('supabase/production-baseline/bridges/recovered_stripe_test_event_current_definition.sql', root)],
]

test('GSC-05 replays the full baseline and proves atomic creation', { timeout: 600_000 }, async () => {
  assert.ok(container, 'GSC05_CONTAINER is required; use only an isolated Supabase stack')
  assert.equal(psql(`select count(*) from pg_catalog.pg_tables where schemaname='public';`), '0')
  const manifest = JSON.parse(await readFile(new URL('manifest.json', baselineRoot), 'utf8'))
  let baselineCount = 0
  let bridgeCount = 0
  for (const migration of manifest.migrations) {
    for (const [, bridge] of bridges.filter(([version]) => version === migration.version)) {
      psql(await readFile(bridge, 'utf8'))
      bridgeCount += 1
    }
    psql(await readFile(new URL(migration.file, baselineRoot), 'utf8'))
    baselineCount += 1
  }
  assert.equal(baselineCount, 90)
  assert.equal(bridgeCount, 7)

  const forward = (await readdir(migrationRoot))
    .filter((file) => file.endsWith('.sql'))
    .filter((file) => file >= '20260813124837_' && file < gsc03)
    .sort()
  for (const file of forward) psql(await readFile(new URL(file, migrationRoot), 'utf8'))
  for (const file of [gsc03, gsc04, gsc05]) {
    psql(await readFile(new URL(file, migrationRoot), 'utf8'))
  }
  const result = psql(await readFile(
    new URL('supabase/tests/phase_gsc_05_atomic_creation_integration.sql', root), 'utf8',
  ))
  assert.match(result, /PHASE_GSC_05_ATOMIC_CREATION_INTEGRATION_OK/)
})

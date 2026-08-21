import assert from 'node:assert/strict'
import { readdir, readFile } from 'node:fs/promises'
import { spawnSync } from 'node:child_process'
import test from 'node:test'

const container = process.env.GSC03_CONTAINER ?? 'supabase_db_avenzo-one-local'
const useIsolatedStack = process.env.GSC03_ISOLATED_STACK === '1'
const database = useIsolatedStack ? 'postgres' : 'avenzo_gsc03_replay_test'
const root = new URL('../../', import.meta.url)
const baselineRoot = new URL('supabase/production-baseline/', root)
const migrationRoot = new URL('supabase/migrations/', root)
const gscMigration = '20260821112527_phase_gsc_03_global_sales_code_compatibility.sql'

function docker(args, options = {}) {
  const result = spawnSync('docker', args, {
    encoding: 'utf8',
    maxBuffer: 40 * 1024 * 1024,
    ...options,
  })
  if (result.status !== 0) {
    throw new Error(`docker ${args.join(' ')} failed\n${result.stdout}\n${result.stderr}`)
  }
  return result.stdout.trim()
}

function psql(sql) {
  return docker([
    'exec', '-i', container, 'psql', '-X', '-U', 'postgres', '-d', database,
    '-v', 'ON_ERROR_STOP=1', '-At',
  ], { input: sql })
}

function prepareDatabase() {
  if (useIsolatedStack) {
    const tableCount = psql(`select count(*) from pg_catalog.pg_tables where schemaname='public';`)
    assert.equal(tableCount, '0', `Refusing non-empty isolated database: ${tableCount} public tables`)
    return
  }
  docker(['exec', container, 'dropdb', '-U', 'postgres', '--if-exists', '--force', database])
  docker(['exec', container, 'createdb', '-U', 'postgres', database])
  docker([
    'exec', container, 'psql', '-U', 'postgres', '-d', database,
    '-v', 'ON_ERROR_STOP=1', '-c', 'drop schema public cascade;',
  ])
  docker([
    'exec', container, 'bash', '-lc',
    `pg_dump -U postgres -d postgres --schema-only --no-owner --no-privileges --exclude-extension=pg_cron --schema=auth --schema=extensions --schema=vault | psql -U postgres -d ${database} -v ON_ERROR_STOP=1`,
  ])
  docker([
    'exec', container, 'bash', '-lc',
    `pg_dump -U postgres -d postgres --schema-only --section=pre-data --no-owner --no-privileges --schema=storage | psql -U postgres -d ${database} -v ON_ERROR_STOP=1`,
  ])
  psql('create schema if not exists public;')
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

const legacyFixture = String.raw`
insert into auth.users (id, email, created_at, updated_at)
values ('00000000-0000-4000-8000-00000000d401', 'gsc03-owner@example.test', now(), now());
insert into public.organizations (id,name,slug,status,timezone,currency,created_by)
values ('00000000-0000-4000-8000-00000000d411','GSC03 Organization','gsc03-organization','active','Asia/Bangkok','THB','00000000-0000-4000-8000-00000000d401');
insert into public.products (id,organization_id,name,status,created_by,updated_by) values
('00000000-0000-4000-8000-00000000d501','00000000-0000-4000-8000-00000000d411','Legacy Product','draft','00000000-0000-4000-8000-00000000d401','00000000-0000-4000-8000-00000000d401'),
('00000000-0000-4000-8000-00000000d502','00000000-0000-4000-8000-00000000d411','Global Product','draft','00000000-0000-4000-8000-00000000d401','00000000-0000-4000-8000-00000000d401');
insert into public.skus (id,organization_id,product_id,sku_code,name,sales_code,base_unit_code,status,created_by,updated_by)
values ('00000000-0000-4000-8000-00000000d601','00000000-0000-4000-8000-00000000d411','00000000-0000-4000-8000-00000000d501','LEGACY-SKU-01','Legacy SKU','CF-LEGACY-01','piece','draft','00000000-0000-4000-8000-00000000d401','00000000-0000-4000-8000-00000000d401');
insert into public.sales_code_sequences (id,organization_id,name,purpose,prefix,start_number,next_number,digit_count,status,created_by,updated_by)
values ('00000000-0000-4000-8000-00000000d701','00000000-0000-4000-8000-00000000d411','Historical sequence','permanent_sales','OLD_',0,0,4,'active','00000000-0000-4000-8000-00000000d401','00000000-0000-4000-8000-00000000d401');
`

test('GSC-03 replays the canonical baseline and forward migrations before compatibility enforcement', { timeout: 300_000 }, async () => {
  prepareDatabase()
  try {
    const manifest = JSON.parse(await readFile(new URL('manifest.json', baselineRoot), 'utf8'))
    let appliedBaseline = 0
    let appliedBridges = 0
    for (const migration of manifest.migrations) {
      for (const [beforeVersion, bridgeUrl] of bridges.filter(([version]) => version === migration.version)) {
        assert.equal(beforeVersion, migration.version)
        psql(await readFile(bridgeUrl, 'utf8'))
        appliedBridges += 1
      }
      psql(await readFile(new URL(migration.file, baselineRoot), 'utf8'))
      appliedBaseline += 1
    }
    assert.equal(appliedBaseline, 90)
    assert.equal(appliedBridges, 7)

    const forwardFiles = (await readdir(migrationRoot))
      .filter((file) => file.endsWith('.sql'))
      .filter((file) => file >= '20260813124837_' && file < gscMigration)
      .sort()
    for (const file of forwardFiles) psql(await readFile(new URL(file, migrationRoot), 'utf8'))

    psql(legacyFixture)
    psql(await readFile(new URL(gscMigration, migrationRoot), 'utf8'))
    const behavior = await readFile(new URL('supabase/tests/phase_gsc_03_global_sales_code_compatibility.sql', root), 'utf8')
    assert.match(psql(behavior), /PHASE_GSC_03_GLOBAL_SALES_CODE_COMPATIBILITY_OK/)
    assert.equal(psql(`select sales_code from public.skus where id='00000000-0000-4000-8000-00000000d601';`), 'CF-LEGACY-01')
  } finally {
    if (!useIsolatedStack) {
      docker(['exec', container, 'dropdb', '-U', 'postgres', '--if-exists', '--force', database])
    }
  }
})

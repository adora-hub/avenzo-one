import assert from 'node:assert/strict'
import { readdir, readFile } from 'node:fs/promises'
import { spawn, spawnSync } from 'node:child_process'
import test from 'node:test'

const container = process.env.GSC04_CONTAINER
const root = new URL('../../', import.meta.url)
const baselineRoot = new URL('supabase/production-baseline/', root)
const migrationRoot = new URL('supabase/migrations/', root)
const gsc03Migration = '20260821112527_phase_gsc_03_global_sales_code_compatibility.sql'
const gsc04Migration = '20260821115026_phase_gsc_04_global_allocator_range_rollover.sql'

function docker(args, options = {}) {
  const result = spawnSync('docker', args, {
    encoding: 'utf8',
    maxBuffer: 60 * 1024 * 1024,
    ...options,
  })
  if (result.status !== 0) {
    throw new Error(`docker ${args.join(' ')} failed\n${result.stdout}\n${result.stderr}`)
  }
  return result.stdout.trim()
}

function psql(sql) {
  return docker([
    'exec', '-i', container, 'psql', '-X', '-U', 'postgres', '-d', 'postgres',
    '-v', 'ON_ERROR_STOP=1', '-At',
  ], { input: sql })
}

function psqlAsync(sql) {
  return new Promise((resolve, reject) => {
    const child = spawn('docker', [
      'exec', '-i', container, 'psql', '-X', '-U', 'postgres', '-d', 'postgres',
      '-v', 'ON_ERROR_STOP=1', '-At',
    ], { stdio: ['pipe', 'pipe', 'pipe'] })
    let stdout = ''
    let stderr = ''
    child.stdout.setEncoding('utf8')
    child.stderr.setEncoding('utf8')
    child.stdout.on('data', (chunk) => { stdout += chunk })
    child.stderr.on('data', (chunk) => { stderr += chunk })
    child.on('error', reject)
    child.on('close', (code) => {
      if (code === 0) resolve(stdout.trim())
      else reject(new Error(`concurrent psql failed (${code})\n${stdout}\n${stderr}`))
    })
    child.stdin.end(sql)
  })
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
values ('00000000-0000-4000-8000-00000000d401', 'gsc04-owner@example.test', now(), now());
insert into public.organizations (id,name,slug,status,timezone,currency,created_by)
values ('00000000-0000-4000-8000-00000000d411','GSC04 Organization','gsc04-organization','active','Asia/Bangkok','THB','00000000-0000-4000-8000-00000000d401');
insert into public.products (id,organization_id,name,status,created_by,updated_by) values
('00000000-0000-4000-8000-00000000d501','00000000-0000-4000-8000-00000000d411','Legacy Product','draft','00000000-0000-4000-8000-00000000d401','00000000-0000-4000-8000-00000000d401'),
('00000000-0000-4000-8000-00000000d502','00000000-0000-4000-8000-00000000d411','Global Product','draft','00000000-0000-4000-8000-00000000d401','00000000-0000-4000-8000-00000000d401');
insert into public.skus (id,organization_id,product_id,sku_code,name,sales_code,base_unit_code,status,created_by,updated_by)
values ('00000000-0000-4000-8000-00000000d601','00000000-0000-4000-8000-00000000d411','00000000-0000-4000-8000-00000000d501','LEGACY-SKU-01','Legacy SKU','CF-LEGACY-01','piece','draft','00000000-0000-4000-8000-00000000d401','00000000-0000-4000-8000-00000000d401');
insert into public.sales_code_sequences (id,organization_id,name,purpose,prefix,start_number,next_number,digit_count,status,created_by,updated_by)
values ('00000000-0000-4000-8000-00000000d701','00000000-0000-4000-8000-00000000d411','Historical A sequence','permanent_sales','A',0,0,4,'active','00000000-0000-4000-8000-00000000d401','00000000-0000-4000-8000-00000000d401');
`

const performanceFixture = String.raw`
insert into auth.users (id, email, created_at, updated_at)
values ('00000000-0000-4000-8000-00000000f401', 'gsc04-performance@example.test', now(), now());
insert into public.organizations (id,name,slug,status,timezone,currency,created_by)
values ('00000000-0000-4000-8000-00000000f411','GSC04 Performance','gsc04-performance','active','Asia/Bangkok','THB','00000000-0000-4000-8000-00000000f401');
insert into public.products (id,organization_id,name,status,created_by,updated_by)
values ('00000000-0000-4000-8000-00000000f501','00000000-0000-4000-8000-00000000f411','GSC04 Performance Product','draft','00000000-0000-4000-8000-00000000f401','00000000-0000-4000-8000-00000000f401');
`

function performanceBatch(start, end) {
  return String.raw`
insert into public.skus (
  id, organization_id, product_id, sku_code, name, sales_code,
  base_unit_code, status, created_by, updated_by
)
select gen_random_uuid(),
  '00000000-0000-4000-8000-00000000f411',
  '00000000-0000-4000-8000-00000000f501',
  'PERF-SKU-' || lpad(n::text, 5, '0'),
  'Performance SKU ' || n,
  chr(65 + ((n - 1) / 999)::integer) || lpad((((n - 1) % 999) + 1)::text, 3, '0'),
  'piece', 'draft',
  '00000000-0000-4000-8000-00000000f401',
  '00000000-0000-4000-8000-00000000f401'
from generate_series(${start}, ${end}) n;`
}

function reserveSql(commandId, prefix, quantity) {
  return `select public.server_reserve_global_sales_code_range(
    '${commandId}',
    '00000000-0000-4000-8000-00000000f411',
    '${prefix}', ${quantity},
    encode(extensions.digest(
      jsonb_build_object('prefix','${prefix}','quantity',${quantity},'ttl_hours',3)::text,
      'sha256'
    ), 'hex'),
    '00000000-0000-4000-8000-00000000f401'
  );`
}

test('GSC-04 replays baseline, verifies behavior, concurrency and bounded query latency', { timeout: 600_000 }, async () => {
  assert.ok(container, 'GSC04_CONTAINER is required; run only against an isolated Supabase stack')
  assert.equal(psql(`select count(*) from pg_catalog.pg_tables where schemaname='public';`), '0')

  const manifest = JSON.parse(await readFile(new URL('manifest.json', baselineRoot), 'utf8'))
  let appliedBaseline = 0
  let appliedBridges = 0
  for (const migration of manifest.migrations) {
    for (const [, bridgeUrl] of bridges.filter(([version]) => version === migration.version)) {
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
    .filter((file) => file >= '20260813124837_' && file < gsc03Migration)
    .sort()
  for (const file of forwardFiles) psql(await readFile(new URL(file, migrationRoot), 'utf8'))

  psql(legacyFixture)
  psql(await readFile(new URL(gsc03Migration, migrationRoot), 'utf8'))
  assert.match(psql(await readFile(
    new URL('supabase/tests/phase_gsc_03_global_sales_code_compatibility.sql', root),
    'utf8',
  )), /PHASE_GSC_03_GLOBAL_SALES_CODE_COMPATIBILITY_OK/)

  psql(await readFile(new URL(gsc04Migration, migrationRoot), 'utf8'))
  assert.equal(psql(`select scope_kind from public.permissions where code = 'product.create';`), 'organization')
  assert.equal(psql(`select count(*) from public.permissions where scope_kind is null;`), '0')
  assert.match(psql(await readFile(
    new URL('supabase/tests/phase_gsc_04_global_allocator_range_rollover.sql', root),
    'utf8',
  )), /PHASE_GSC_04_GLOBAL_ALLOCATOR_RANGE_ROLLOVER_OK/)

  psql(performanceFixture)
  for (let start = 1; start <= 9990; start += 250) {
    psql(performanceBatch(start, Math.min(start + 249, 9990)))
  }
  psql('analyze public.sku_identifier_registry; analyze public.sales_code_reservations;')
  const previewPlan = JSON.parse(psql(`explain (analyze, buffers, format json)
    select public.server_preview_global_sales_code_range(
      '00000000-0000-4000-8000-00000000f411', 'J', 50,
      '00000000-0000-4000-8000-00000000f401'
    );`))
  const executionTime = previewPlan[0]['Execution Time']
  assert.ok(executionTime < 1000, `GSC-04 preview took ${executionTime} ms`)
  const indexPlan = psql(`explain (analyze, buffers)
    select max(right(normalized_identifier, 3)::integer)
    from public.sku_identifier_registry
    where organization_id='00000000-0000-4000-8000-00000000f411'
      and normalized_identifier >= 'J001'
      and normalized_identifier <= 'J999';`)
  assert.match(indexPlan, /sku_identifier_registry_pkey|Index Scan|Bitmap Index Scan/)
  const preview = JSON.parse(psql(`select public.server_preview_global_sales_code_range(
    '00000000-0000-4000-8000-00000000f411', 'J', 50,
    '00000000-0000-4000-8000-00000000f401'
  );`))
  assert.equal(preview.first_code, 'K001')
  assert.equal(preview.last_code, 'K050')

  const concurrent = await Promise.all([
    psqlAsync(reserveSql('00000000-0000-4000-8000-00000000f601', 'X', 50)),
    psqlAsync(reserveSql('00000000-0000-4000-8000-00000000f602', 'X', 50)),
  ])
  const ranges = concurrent.map((value) => {
    const result = JSON.parse(value)
    return `${result.first_code}-${result.last_code}`
  }).sort()
  assert.deepEqual(ranges, ['X001-X050', 'X051-X100'])

  const replay = await Promise.all([
    psqlAsync(reserveSql('00000000-0000-4000-8000-00000000f603', 'Y', 1)),
    psqlAsync(reserveSql('00000000-0000-4000-8000-00000000f603', 'Y', 1)),
  ])
  assert.equal(replay[0], replay[1])
  assert.equal(psql(`select count(*) from public.sales_code_allocator_commands
    where id='00000000-0000-4000-8000-00000000f603';`), '1')
  assert.equal(psql(`select count(*) from public.sales_code_reservation_batches
    where organization_id='00000000-0000-4000-8000-00000000f411'
      and id=(select (result->>'batch_id')::uuid from public.sales_code_allocator_commands
              where id='00000000-0000-4000-8000-00000000f603');`), '1')
})

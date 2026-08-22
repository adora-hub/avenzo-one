import assert from 'node:assert/strict'
import { readdir, readFile } from 'node:fs/promises'
import { spawn, spawnSync } from 'node:child_process'
import test from 'node:test'

const container = process.env.GSC05_CONTAINER
const root = new URL('../../', import.meta.url)
const baselineRoot = new URL('supabase/production-baseline/', root)
const migrationRoot = new URL('supabase/migrations/', root)
const gsc03 = '20260821112527_phase_gsc_03_global_sales_code_compatibility.sql'
const gsc04 = '20260821115026_phase_gsc_04_global_allocator_range_rollover.sql'
const gsc05 = '20260821143000_phase_gsc_05_atomic_creation_integration.sql'
const resultSentinel = 'AVENZO_RESULT_JSON='
const allowedCommandTags = new Set(['BEGIN', 'SET', 'COMMIT'])

function psql(sql) {
  const result = spawnSync('docker', [
    'exec', '-i', container, 'psql', '-X', '-U', 'postgres', '-d', 'postgres',
    '-v', 'ON_ERROR_STOP=1', '-At',
  ], { input: sql, encoding: 'utf8', maxBuffer: 80 * 1024 * 1024 })
  if (result.status !== 0) throw new Error(`${result.stdout}\n${result.stderr}`)
  return result.stdout.trim()
}

function parsePsqlResult({ code, stdout, stderr }) {
  if (code !== 0) throw new Error(`psql_result_nonzero:${code}\n${stderr}`)
  if (stderr.trim()) throw new Error(`psql_result_stderr:${stderr.trim()}`)

  const resultLines = []
  for (const rawLine of stdout.split(/\r?\n/)) {
    const line = rawLine.trim()
    if (!line || allowedCommandTags.has(line)) continue
    if (line.startsWith(resultSentinel)) {
      resultLines.push(line.slice(resultSentinel.length))
      continue
    }
    throw new Error(`psql_result_unexpected_output:${line}`)
  }
  if (resultLines.length !== 1) {
    throw new Error(`psql_result_count_invalid:${resultLines.length}`)
  }
  try {
    return JSON.parse(resultLines[0])
  } catch (error) {
    throw new Error(`psql_result_json_invalid:${error.message}`)
  }
}

function psqlResult(sql) {
  const result = spawnSync('docker', [
    'exec', '-i', container, 'psql', '-X', '-q', '-U', 'postgres', '-d', 'postgres',
    '-v', 'ON_ERROR_STOP=1', '-At',
  ], { input: sql, encoding: 'utf8', maxBuffer: 80 * 1024 * 1024 })
  return parsePsqlResult({
    code: result.status,
    stdout: result.stdout ?? '',
    stderr: result.stderr ?? '',
  })
}

function psqlAsync(sql) {
  return new Promise((resolve, reject) => {
    const child = spawn('docker', [
      'exec', '-i', container, 'psql', '-X', '-q', '-U', 'postgres', '-d', 'postgres',
      '-v', 'ON_ERROR_STOP=1', '-At',
    ], { stdio: ['pipe', 'pipe', 'pipe'] })
    let stdout = ''
    let stderr = ''
    child.stdout.setEncoding('utf8')
    child.stderr.setEncoding('utf8')
    child.stdout.on('data', (chunk) => { stdout += chunk })
    child.stderr.on('data', (chunk) => { stderr += chunk })
    child.on('error', reject)
    child.on('close', (code) => resolve({ code, stdout: stdout.trim(), stderr: stderr.trim() }))
    child.stdin.end(sql)
  })
}

function creationPayload({
  name, skuCode, salesCode, categoryId, childCommandId,
  mode = 'manual', prefix, allocatorCommandId,
}) {
  const itemPayload = {
    name,
    sku_name: name,
    sku_code: skuCode,
    category_id: categoryId,
    structure_type: 'standard',
    base_unit_code: 'piece',
    sale_price: 100,
  }
  if (salesCode) itemPayload.sales_code = salesCode
  const payload = {
    sales_code_mode: mode,
    creation_items: [{
      command_id: childCommandId,
      command_type: 'product.create_with_initial_sku',
      payload: itemPayload,
    }],
  }
  if (mode === 'sequence') {
    payload.requested_prefix = prefix
    payload.allocator_command_id = allocatorCommandId
  }
  return payload
}

function creationSql({ commandId, organizationId, actorId, payload }) {
  const json = JSON.stringify(payload).replaceAll("'", "''")
  return `begin;
set local role service_role;
with args as (select '${json}'::jsonb as payload)
select '${resultSentinel}' || public.server_execute_global_sales_code_creation(
  '${commandId}', '${organizationId}', 'normal', payload,
  encode(extensions.digest(payload::text, 'sha256'), 'hex'), '${actorId}'
)::text
from args;
commit;`
}

function assertCanonicalConflict(result) {
  assert.notEqual(result.code, 0)
  assert.match(result.stderr, /command_payload_conflict/)
  assert.doesNotMatch(result.stderr, /duplicate key value|unique constraint/i)
}

test('GSC-05 replay parser accepts one sentinel JSON and rejects noisy or unsafe output', () => {
  assert.deepEqual(parsePsqlResult({
    code: 0,
    stdout: 'BEGIN\nSET\nAVENZO_RESULT_JSON={"ok":true,"count":1}\nCOMMIT\n',
    stderr: '',
  }), { ok: true, count: 1 })

  assert.throws(() => parsePsqlResult({
    code: 0,
    stdout: 'AVENZO_RESULT_JSON={"ok":true}',
    stderr: 'ERROR: forced failure SQLSTATE 23505',
  }), /psql_result_stderr/)
  assert.throws(() => parsePsqlResult({ code: 0, stdout: 'BEGIN\nCOMMIT', stderr: '' }), /psql_result_count_invalid:0/)
  assert.throws(() => parsePsqlResult({
    code: 0,
    stdout: 'AVENZO_RESULT_JSON={}\nAVENZO_RESULT_JSON={}',
    stderr: '',
  }), /psql_result_count_invalid:2/)
  assert.throws(() => parsePsqlResult({ code: 0, stdout: 'AVENZO_RESULT_JSON={bad}', stderr: '' }), /psql_result_json_invalid/)
  assert.throws(() => parsePsqlResult({ code: 0, stdout: 'NOTICE unexpected', stderr: '' }), /psql_result_unexpected_output/)
  assert.throws(() => parsePsqlResult({ code: 3, stdout: 'AVENZO_RESULT_JSON={}', stderr: '' }), /psql_result_nonzero:3/)
})

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
  psql(legacyFixture)
  for (const file of [gsc03, gsc04, gsc05]) {
    psql(await readFile(new URL(file, migrationRoot), 'utf8'))
  }
  const result = psql(await readFile(
    new URL('supabase/tests/phase_gsc_05_atomic_creation_integration.sql', root), 'utf8',
  ))
  assert.match(result, /PHASE_GSC_05_ATOMIC_CREATION_INTEGRATION_OK/)

  psql(String.raw`
insert into auth.users (id, email, created_at, updated_at) values
('00000000-0000-4000-8000-00000000e501', 'gsc05-concurrency-a@example.test', now(), now()),
('00000000-0000-4000-8000-00000000e502', 'gsc05-concurrency-b@example.test', now(), now());
insert into public.organizations (id,name,slug,status,timezone,currency,created_by) values
('00000000-0000-4000-8000-00000000e511','GSC05 Concurrency A','gsc05-concurrency-a','active','Asia/Bangkok','THB','00000000-0000-4000-8000-00000000e501'),
('00000000-0000-4000-8000-00000000e512','GSC05 Concurrency B','gsc05-concurrency-b','active','Asia/Bangkok','THB','00000000-0000-4000-8000-00000000e502');
do $$
declare
  v record;
  v_membership uuid;
  v_owner_role uuid;
begin
  for v in select * from (values
    ('00000000-0000-4000-8000-00000000e511'::uuid, '00000000-0000-4000-8000-00000000e501'::uuid, '00000000-0000-4000-8000-00000000e521'::uuid),
    ('00000000-0000-4000-8000-00000000e512'::uuid, '00000000-0000-4000-8000-00000000e502'::uuid, '00000000-0000-4000-8000-00000000e522'::uuid)
  ) fixture(organization_id, actor_id, fallback_role_id)
  loop
    select id into strict v_membership from public.organization_members
    where organization_id = v.organization_id and user_id = v.actor_id;
    select id into v_owner_role from public.organization_roles
    where organization_id = v.organization_id and code = 'owner';
    if v_owner_role is null then
      insert into public.organization_roles (
        id, organization_id, code, name, description, is_system, created_by
      ) values (
        v.fallback_role_id, v.organization_id, 'owner', 'Owner',
        'GSC-05 concurrency owner', true, v.actor_id
      ) returning id into v_owner_role;
    end if;
    insert into public.member_roles (membership_id, role_id)
    values (v_membership, v_owner_role) on conflict do nothing;
  end loop;
end;
$$;
insert into public.product_categories (id, organization_id, name, created_by, updated_by) values
('00000000-0000-4000-8000-00000000e531','00000000-0000-4000-8000-00000000e511','GSC05 Concurrent A','00000000-0000-4000-8000-00000000e501','00000000-0000-4000-8000-00000000e501'),
('00000000-0000-4000-8000-00000000e532','00000000-0000-4000-8000-00000000e512','GSC05 Concurrent B','00000000-0000-4000-8000-00000000e502','00000000-0000-4000-8000-00000000e502');
`)

  const orgA = '00000000-0000-4000-8000-00000000e511'
  const orgB = '00000000-0000-4000-8000-00000000e512'
  const actorA = '00000000-0000-4000-8000-00000000e501'
  const actorB = '00000000-0000-4000-8000-00000000e502'

  const samePayload = creationPayload({
    name: 'GSC05 Same Replay', skuCode: 'GSC05-CON-SAME',
    categoryId: '00000000-0000-4000-8000-00000000e531',
    childCommandId: '00000000-0000-4000-8000-00000000e602',
    mode: 'sequence', prefix: 'S',
    allocatorCommandId: '00000000-0000-4000-8000-00000000e603',
  })
  const sameSql = creationSql({
    commandId: '00000000-0000-4000-8000-00000000e601',
    organizationId: orgA, actorId: actorA, payload: samePayload,
  })
  const sameResults = await Promise.all([psqlAsync(sameSql), psqlAsync(sameSql)])
  const sameValues = sameResults.map(parsePsqlResult)
  assert.deepEqual(sameValues[0], sameValues[1])
  assert.equal(psql(`select concat_ws('|',
    (select count(*) from public.global_sales_code_creation_commands where id='00000000-0000-4000-8000-00000000e601'),
    (select count(*) from public.products where organization_id='${orgA}' and name='GSC05 Same Replay'),
    (select count(*) from public.skus where organization_id='${orgA}' and sku_code='GSC05-CON-SAME'),
    (select count(*) from public.sales_code_sequences where organization_id='${orgA}' and prefix='S' and standard_version='global_v1'),
    (select count(*) from public.sales_code_allocator_commands where id='00000000-0000-4000-8000-00000000e603')
  );`), '1|1|1|1|1')
  assert.deepEqual(psqlResult(sameSql), sameValues[0])

  const conflictCommandId = '00000000-0000-4000-8000-00000000e611'
  const conflictA = creationSql({
    commandId: conflictCommandId, organizationId: orgA, actorId: actorA,
    payload: creationPayload({
      name: 'GSC05 Conflict A', skuCode: 'GSC05-CONFLICT-A', salesCode: 'CA001',
      categoryId: '00000000-0000-4000-8000-00000000e531',
      childCommandId: '00000000-0000-4000-8000-00000000e612',
    }),
  })
  const conflictB = creationSql({
    commandId: conflictCommandId, organizationId: orgA, actorId: actorA,
    payload: creationPayload({
      name: 'GSC05 Conflict B', skuCode: 'GSC05-CONFLICT-B', salesCode: 'CB001',
      categoryId: '00000000-0000-4000-8000-00000000e531',
      childCommandId: '00000000-0000-4000-8000-00000000e613',
    }),
  })
  const conflictResults = await Promise.all([psqlAsync(conflictA), psqlAsync(conflictB)])
  assert.equal(conflictResults.filter(({ code }) => code === 0).length, 1)
  assert.equal(conflictResults.filter(({ code }) => code !== 0).length, 1)
  parsePsqlResult(conflictResults.find(({ code }) => code === 0))
  assertCanonicalConflict(conflictResults.find(({ code }) => code !== 0))
  assert.equal(psql(`select concat_ws('|',
    (select count(*) from public.global_sales_code_creation_commands where id='${conflictCommandId}'),
    (select count(*) from public.products where organization_id='${orgA}' and name in ('GSC05 Conflict A','GSC05 Conflict B')),
    (select count(*) from public.skus where organization_id='${orgA}' and sku_code in ('GSC05-CONFLICT-A','GSC05-CONFLICT-B'))
  );`), '1|1|1')

  const independentCalls = [
    creationSql({
      commandId: '00000000-0000-4000-8000-00000000e621', organizationId: orgA, actorId: actorA,
      payload: creationPayload({
        name: 'GSC05 Independent A', skuCode: 'GSC05-INDEPENDENT-A', salesCode: 'IA001',
        categoryId: '00000000-0000-4000-8000-00000000e531',
        childCommandId: '00000000-0000-4000-8000-00000000e622',
      }),
    }),
    creationSql({
      commandId: '00000000-0000-4000-8000-00000000e623', organizationId: orgA, actorId: actorA,
      payload: creationPayload({
        name: 'GSC05 Independent B', skuCode: 'GSC05-INDEPENDENT-B', salesCode: 'IB001',
        categoryId: '00000000-0000-4000-8000-00000000e531',
        childCommandId: '00000000-0000-4000-8000-00000000e624',
      }),
    }),
  ]
  const independentResults = await Promise.all(independentCalls.map(psqlAsync))
  independentResults.map(parsePsqlResult)
  assert.equal(psql(`select count(distinct pg_catalog.hashtextextended(id::text, 20260821143000))
    from (values
      ('00000000-0000-4000-8000-00000000e621'::uuid),
      ('00000000-0000-4000-8000-00000000e623'::uuid)
    ) commands(id);`), '2')

  const crossTenantCommandId = '00000000-0000-4000-8000-00000000e631'
  const crossTenantResults = await Promise.all([
    psqlAsync(creationSql({
      commandId: crossTenantCommandId, organizationId: orgA, actorId: actorA,
      payload: creationPayload({
        name: 'GSC05 Tenant A', skuCode: 'GSC05-TENANT-A', salesCode: 'TA001',
        categoryId: '00000000-0000-4000-8000-00000000e531',
        childCommandId: '00000000-0000-4000-8000-00000000e632',
      }),
    })),
    psqlAsync(creationSql({
      commandId: crossTenantCommandId, organizationId: orgB, actorId: actorB,
      payload: creationPayload({
        name: 'GSC05 Tenant B', skuCode: 'GSC05-TENANT-B', salesCode: 'TB001',
        categoryId: '00000000-0000-4000-8000-00000000e532',
        childCommandId: '00000000-0000-4000-8000-00000000e633',
      }),
    })),
  ])
  assert.equal(crossTenantResults.filter(({ code }) => code === 0).length, 1)
  assert.equal(crossTenantResults.filter(({ code }) => code !== 0).length, 1)
  parsePsqlResult(crossTenantResults.find(({ code }) => code === 0))
  assertCanonicalConflict(crossTenantResults.find(({ code }) => code !== 0))
  assert.equal(psql(`select concat_ws('|',
    (select count(*) from public.global_sales_code_creation_commands where id='${crossTenantCommandId}'),
    (select count(*) from public.products where name in ('GSC05 Tenant A','GSC05 Tenant B')),
    (select count(*) from public.skus where sku_code in ('GSC05-TENANT-A','GSC05-TENANT-B'))
  );`), '1|1|1')
})

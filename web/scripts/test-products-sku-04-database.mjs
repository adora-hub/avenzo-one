import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { spawn, spawnSync } from 'node:child_process'
import test from 'node:test'

const container = 'supabase_db_avenzo-one-local'
const database = 'avenzo_sku04_test'
const root = new URL('../', import.meta.url)

function docker(args, options = {}) {
  const result = spawnSync('docker', args, { encoding: 'utf8', maxBuffer: 30 * 1024 * 1024, ...options })
  if (result.status !== 0) throw new Error(`docker ${args.join(' ')} failed\n${result.stdout}\n${result.stderr}`)
  return result.stdout.trim()
}

function psql(sql) {
  return docker(['exec', '-i', container, 'psql', '-X', '-U', 'postgres', '-d', database, '-v', 'ON_ERROR_STOP=1', '-At'], { input: sql })
}

function psqlAsync(sql) {
  return new Promise((resolve, reject) => {
    const child = spawn('docker', ['exec', '-i', container, 'psql', '-X', '-U', 'postgres', '-d', database, '-v', 'ON_ERROR_STOP=1', '-At'], { stdio: ['pipe', 'pipe', 'pipe'] })
    let stdout = ''
    let stderr = ''
    child.stdout.setEncoding('utf8')
    child.stderr.setEncoding('utf8')
    child.stdout.on('data', (chunk) => { stdout += chunk })
    child.stderr.on('data', (chunk) => { stderr += chunk })
    child.on('error', reject)
    child.on('close', (code) => code === 0 ? resolve(stdout.trim()) : reject(new Error(`${stdout}\n${stderr}`)))
    child.stdin.end(sql)
  })
}

function prepareDatabase() {
  docker(['exec', container, 'dropdb', '-U', 'postgres', '--if-exists', '--force', database])
  docker(['exec', container, 'createdb', '-U', 'postgres', database])
  docker(['exec', container, 'psql', '-U', 'postgres', '-d', database, '-v', 'ON_ERROR_STOP=1', '-c', 'drop schema public cascade;'])
  docker(['exec', container, 'bash', '-lc', `pg_dump -U postgres -d postgres --schema-only --no-owner --no-privileges --exclude-extension=pg_cron --schema=auth --schema=private --schema=public --schema=extensions --schema=vault | psql -U postgres -d ${database} -v ON_ERROR_STOP=1`])
  docker(['exec', container, 'bash', '-lc', `pg_dump -U postgres -d postgres --data-only --no-owner --no-privileges --column-inserts --table=public.permissions | psql -U postgres -d ${database} -v ON_ERROR_STOP=1`])
}

const fixture = String.raw`
insert into auth.users (id, email, created_at, updated_at)
values ('00000000-0000-4000-8000-000000000461', 'sku04-concurrency@example.test', now(), now());
insert into public.organizations (id, name, slug, status, timezone, currency, created_by)
values ('00000000-0000-4000-8000-000000000462', 'SKU04 Concurrent', 'sku04-concurrent', 'active', 'Asia/Bangkok', 'THB', '00000000-0000-4000-8000-000000000461');
do $$ declare v_role uuid; v_member uuid; begin
  select id into v_role from public.organization_roles where organization_id='00000000-0000-4000-8000-000000000462' and code='owner';
  select id into strict v_member from public.organization_members where organization_id='00000000-0000-4000-8000-000000000462' and user_id='00000000-0000-4000-8000-000000000461';
  if v_role is null then
    insert into public.organization_roles(id,organization_id,code,name,is_system,created_by)
    values('00000000-0000-4000-8000-000000000463','00000000-0000-4000-8000-000000000462','owner','Owner',true,'00000000-0000-4000-8000-000000000461') returning id into v_role;
  end if;
  insert into public.member_roles(membership_id,role_id) values(v_member,v_role) on conflict do nothing;
end $$;
insert into public.product_categories(id,organization_id,name,created_by,updated_by)
values('00000000-0000-4000-8000-000000000464','00000000-0000-4000-8000-000000000462','Concurrent Category','00000000-0000-4000-8000-000000000461','00000000-0000-4000-8000-000000000461');
`

function concurrentCommand(commandId, name, optionCode, salesCode, hashCharacter) {
  return `select public.server_execute_variant_sku_sequence_command(
    '${commandId}','00000000-0000-4000-8000-000000000462','product.create_with_variants',
    '{"name":"${name}","category_id":"00000000-0000-4000-8000-000000000464","structure_type":"variant","base_unit_code":"piece","sku_prefix":"CC","sku_product_sequence":1,"sku_sequence_digits":3,"option_groups":[{"name":"แบบ","kind":"custom","values":[{"name":"${optionCode}","code":"${optionCode}"}]}],"variants":[{"key":"${optionCode}","name":"${name}","sku_code":"CC-001-${optionCode}","sales_code":"${salesCode}","status":"draft","sale_price":100,"option_codes":["${optionCode}"]}]}'::jsonb,
    repeat('${hashCharacter}',64),'00000000-0000-4000-8000-000000000461');`
}

test('SKU-04 migration and SQL behavior suite pass on an isolated database', { timeout: 120_000 }, async () => {
  prepareDatabase()
  try {
    const migration = await readFile(new URL('../supabase/migrations/20260820134813_phase_2_1_sku_04_product_sequence_allocator.sql', root), 'utf8')
    const behavior = await readFile(new URL('../supabase/tests/phase_2_1_sku_04_product_sequence_allocator.sql', root), 'utf8')
    psql(migration)
    psql(behavior)
  } finally {
    docker(['exec', container, 'dropdb', '-U', 'postgres', '--if-exists', '--force', database])
  }
})

test('SKU-04 concurrent Product creation claims one sequence exactly once', { timeout: 120_000 }, async () => {
  prepareDatabase()
  try {
    const migration = await readFile(new URL('../supabase/migrations/20260820134813_phase_2_1_sku_04_product_sequence_allocator.sql', root), 'utf8')
    psql(migration)
    psql(fixture)
    const results = await Promise.allSettled([
      psqlAsync(concurrentCommand('00000000-0000-4000-8000-000000000471', 'Concurrent One', 'ONE', 'C401', 'a')),
      psqlAsync(concurrentCommand('00000000-0000-4000-8000-000000000472', 'Concurrent Two', 'TWO', 'C402', 'b')),
    ])
    const resultDetails = results.map((result) => result.status === 'fulfilled'
      ? { status: result.status, value: result.value }
      : { status: result.status, reason: String(result.reason) })
    assert.equal(results.filter((result) => result.status === 'fulfilled').length, 1, JSON.stringify(resultDetails))
    assert.equal(results.filter((result) => result.status === 'rejected').length, 1, JSON.stringify(resultDetails))
    assert.match(String(results.find((result) => result.status === 'rejected')?.reason), /sku_product_sequence_conflict/)
    assert.equal(psql(`select count(*) || ':' || max(last_sequence) from public.sku_product_sequences where organization_id='00000000-0000-4000-8000-000000000462' and prefix='CC';`), '1:1')
    assert.equal(psql(`select count(*) from public.products where organization_id='00000000-0000-4000-8000-000000000462';`), '1')
  } finally {
    docker(['exec', container, 'dropdb', '-U', 'postgres', '--if-exists', '--force', database])
  }
})

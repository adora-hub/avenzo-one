import assert from 'node:assert/strict'
import { spawn, spawnSync } from 'node:child_process'
import test from 'node:test'

const container = process.env.RAPID_BE03C_CONTAINER
const sentinel = 'AVENZO_RESULT_JSON='

if (!container) throw new Error('RAPID_BE03C_CONTAINER is required')

function rawPsql(sql) {
  const result = spawnSync('docker', [
    'exec', '-i', container, 'psql', '-X', '-q', '-U', 'postgres', '-d', 'postgres',
    '-v', 'ON_ERROR_STOP=1', '-At',
  ], { input: sql, encoding: 'utf8', maxBuffer: 32 * 1024 * 1024 })
  if (result.status !== 0) throw new Error(`${result.stdout}\n${result.stderr}`)
  return result.stdout.trim()
}

function asyncPsql(sql) {
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
    child.on('close', (code) => resolve({ code, stdout, stderr }))
    child.stdin.end(sql)
  })
}

function parseResult(result) {
  assert.equal(result.code, 0, result.stderr)
  const lines = result.stdout.split(/\r?\n/).map((line) => line.trim()).filter(Boolean)
  const jsonLines = lines.filter((line) => line.startsWith(sentinel))
  assert.equal(jsonLines.length, 1, `unexpected psql output: ${result.stdout}`)
  return JSON.parse(jsonLines[0].slice(sentinel.length))
}

const org = '00000000-0000-4000-8000-00000000d311'
const actor = '00000000-0000-4000-8000-00000000d301'
const branch = '00000000-0000-4000-8000-00000000d321'
const category = '00000000-0000-4000-8000-00000000d331'

function reserve(prefix, quantity, commandId) {
  const output = rawPsql(`
with args as (
  select jsonb_build_object('prefix','${prefix}','quantity',${quantity},'ttl_hours',3) payload
)
select '${sentinel}' || public.server_reserve_global_sales_code_range(
  '${commandId}', '${org}', '${prefix}', ${quantity},
  encode(extensions.digest(payload::text, 'sha256'), 'hex'), '${actor}'
)::text from args;
`)
  const line = output.split(/\r?\n/).find((value) => value.startsWith(sentinel))
  assert.ok(line, output)
  return JSON.parse(line.slice(sentinel.length))
}

function codesFor(batchId) {
  return rawPsql(`select code from public.sales_code_reservations
    where organization_id='${org}' and batch_id='${batchId}'
    order by sequence_number,id;`).split(/\r?\n/).filter(Boolean)
}

function payload(batchId, codes, label, childOffset = 1) {
  return {
    sales_code_mode: 'reserved_batch',
    reservation_batch_id: batchId,
    creation_items: codes.map((code, index) => ({
      client_row_id: `${label}-${index + 1}`,
      command_id: `00000000-0000-4000-9${childOffset}${String(index + 1).padStart(2, '0')}-00000000d9${String(childOffset).padStart(2, '0')}`,
      command_type: 'product.create_with_initial_sku',
      sales_code: code,
      payload: {
        name: `${label} ${code}`,
        sku_name: `${label} ${code}`,
        sku_code: code,
        category_id: category,
        structure_type: 'standard',
        base_unit_code: 'piece',
        sale_price: 100,
      },
      handoff: { branch_id: branch, initial_stock: 1 },
    })),
  }
}

function creationSql(commandId, value) {
  const json = JSON.stringify(value).replaceAll("'", "''")
  return `begin;
set local role service_role;
with args as (select '${json}'::jsonb payload)
select '${sentinel}' || public.server_execute_global_sales_code_creation(
  '${commandId}', '${org}', 'rapid', payload,
  encode(extensions.digest(payload::text, 'sha256'), 'hex'), '${actor}'
)::text from args;
commit;`
}

rawPsql(`
insert into auth.users (id,email,created_at,updated_at)
values ('${actor}','rapid-be03c-concurrency@example.test',now(),now());
insert into public.organizations (id,name,slug,status,timezone,currency,created_by)
values ('${org}','Rapid BE03C Concurrency','rapid-be03c-concurrency','active','Asia/Bangkok','THB','${actor}');
select set_config('request.jwt.claims','{"sub":"${actor}","role":"authenticated","aal":"aal1"}',false);
insert into public.branches (id,organization_id,code,name,status,created_by)
values ('${branch}','${org}','BKK-01','Rapid BE03C Concurrency Branch','active','${actor}');
select set_config('request.jwt.claims','',false);
insert into public.product_categories (id,organization_id,name,created_by,updated_by)
values ('${category}','${org}','Rapid BE03C Concurrency Category','${actor}','${actor}');
`)

test('same command and payload returns one stable result and creates once', { timeout: 120_000 }, async () => {
  const batch = reserve('K', 1, '00000000-0000-4000-8000-00000000d341')
  const codes = codesFor(batch.batch_id)
  const value = payload(batch.batch_id, codes, 'Rapid Same', 1)
  const sql = creationSql('00000000-0000-4000-8000-00000000d351', value)
  const [leftRaw, rightRaw] = await Promise.all([asyncPsql(sql), asyncPsql(sql)])
  const left = parseResult(leftRaw)
  const right = parseResult(rightRaw)
  assert.deepEqual(left, right)
  assert.equal(left.created_count, 1)
  assert.equal(Number(rawPsql(`select count(*) from public.skus where organization_id='${org}' and sales_code='${codes[0]}'`)), 1)
})

test('same command with different payload returns canonical idempotency conflict', { timeout: 120_000 }, async () => {
  const batch = reserve('L', 2, '00000000-0000-4000-8000-00000000d342')
  const codes = codesFor(batch.batch_id)
  const command = '00000000-0000-4000-8000-00000000d352'
  const results = await Promise.all([
    asyncPsql(creationSql(command, payload(batch.batch_id, [codes[0]], 'Rapid Conflict A', 2))),
    asyncPsql(creationSql(command, payload(batch.batch_id, [codes[1]], 'Rapid Conflict B', 3))),
  ])
  assert.equal(results.filter((result) => result.code === 0).length, 1)
  const failure = results.find((result) => result.code !== 0)
  assert.match(failure.stderr, /idempotency_conflict/)
  assert.doesNotMatch(failure.stderr, /duplicate key value|unique constraint/i)
})

test('overlapping reversed selections serialize without deadlock or partial commit', { timeout: 120_000 }, async () => {
  const batch = reserve('M', 2, '00000000-0000-4000-8000-00000000d343')
  const codes = codesFor(batch.batch_id)
  const results = await Promise.all([
    asyncPsql(creationSql('00000000-0000-4000-8000-00000000d353', payload(batch.batch_id, codes, 'Rapid Overlap A', 4))),
    asyncPsql(creationSql('00000000-0000-4000-8000-00000000d354', payload(batch.batch_id, [...codes].reverse(), 'Rapid Overlap B', 5))),
  ])
  assert.equal(results.filter((result) => result.code === 0).length, 1)
  const failure = results.find((result) => result.code !== 0)
  assert.match(failure.stderr, /rapid_reserved_code_unavailable/)
  assert.doesNotMatch(failure.stderr, /deadlock|duplicate key value/i)
  assert.equal(Number(rawPsql(`select count(*) from public.skus where organization_id='${org}' and sales_code = any(array['${codes.join("','")}'])`)), 2)
})

test('disjoint subsets from one batch both succeed and consume only selected rows', { timeout: 120_000 }, async () => {
  const batch = reserve('N', 4, '00000000-0000-4000-8000-00000000d344')
  const codes = codesFor(batch.batch_id)
  const results = await Promise.all([
    asyncPsql(creationSql('00000000-0000-4000-8000-00000000d355', payload(batch.batch_id, [codes[0], codes[2]], 'Rapid Disjoint A', 6))),
    asyncPsql(creationSql('00000000-0000-4000-8000-00000000d356', payload(batch.batch_id, [codes[3], codes[1]], 'Rapid Disjoint B', 7))),
  ])
  const parsed = results.map(parseResult)
  assert.deepEqual(parsed.map((value) => value.created_count), [2, 2])
  assert.equal(Number(rawPsql(`select count(*) from public.sales_code_reservations where organization_id='${org}' and batch_id='${batch.batch_id}' and status='assigned'`)), 4)
  assert.equal(Number(rawPsql(`select count(*) from public.products where organization_id='${org}' and name like 'Rapid Disjoint %'`)), 4)
})

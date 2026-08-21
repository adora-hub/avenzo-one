import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { spawnSync } from 'node:child_process'
import test from 'node:test'

const container = 'supabase_db_avenzo-one-local'
const database = 'avenzo_gsc03_test'

function docker(args, options = {}) {
  const result = spawnSync('docker', args, {
    encoding: 'utf8',
    maxBuffer: 30 * 1024 * 1024,
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
  docker(['exec', container, 'dropdb', '-U', 'postgres', '--if-exists', '--force', database])
  docker(['exec', container, 'createdb', '-U', 'postgres', database])
  docker([
    'exec', container, 'psql', '-U', 'postgres', '-d', database,
    '-v', 'ON_ERROR_STOP=1', '-c', 'drop schema public cascade;',
  ])
  docker([
    'exec', container, 'bash', '-lc',
    `pg_dump -U postgres -d postgres --schema-only --no-owner --no-privileges --exclude-extension=pg_cron --schema=auth --schema=private --schema=public --schema=extensions --schema=vault | psql -U postgres -d ${database} -v ON_ERROR_STOP=1`,
  ])
  docker([
    'exec', container, 'bash', '-lc',
    `pg_dump -U postgres -d postgres --data-only --no-owner --no-privileges --column-inserts --table=public.permissions | psql -U postgres -d ${database} -v ON_ERROR_STOP=1`,
  ])
}

const legacyFixture = String.raw`
insert into auth.users (id, email, created_at, updated_at)
values ('00000000-0000-4000-8000-00000000d401', 'gsc03-owner@example.test', now(), now());

insert into public.organizations (
  id, name, slug, status, timezone, currency, created_by
) values (
  '00000000-0000-4000-8000-00000000d411', 'GSC03 Organization',
  'gsc03-organization', 'active', 'Asia/Bangkok', 'THB',
  '00000000-0000-4000-8000-00000000d401'
);

insert into public.products (
  id, organization_id, name, status, created_by, updated_by
) values
  ('00000000-0000-4000-8000-00000000d501',
   '00000000-0000-4000-8000-00000000d411', 'Legacy Product', 'draft',
   '00000000-0000-4000-8000-00000000d401',
   '00000000-0000-4000-8000-00000000d401'),
  ('00000000-0000-4000-8000-00000000d502',
   '00000000-0000-4000-8000-00000000d411', 'Global Product', 'draft',
   '00000000-0000-4000-8000-00000000d401',
   '00000000-0000-4000-8000-00000000d401');

insert into public.skus (
  id, organization_id, product_id, sku_code, name, sales_code,
  base_unit_code, status, created_by, updated_by
) values (
  '00000000-0000-4000-8000-00000000d601',
  '00000000-0000-4000-8000-00000000d411',
  '00000000-0000-4000-8000-00000000d501',
  'LEGACY-SKU-01', 'Legacy SKU', 'CF-LEGACY-01',
  'piece', 'draft',
  '00000000-0000-4000-8000-00000000d401',
  '00000000-0000-4000-8000-00000000d401'
);

insert into public.sales_code_sequences (
  id, organization_id, name, purpose, prefix, start_number, next_number,
  digit_count, status, created_by, updated_by
) values (
  '00000000-0000-4000-8000-00000000d701',
  '00000000-0000-4000-8000-00000000d411',
  'Historical sequence', 'permanent_sales', 'OLD_', 0, 0, 4, 'active',
  '00000000-0000-4000-8000-00000000d401',
  '00000000-0000-4000-8000-00000000d401'
);
`

test('GSC-03 migration preserves legacy rows and enforces Global V1 on an isolated database', { timeout: 120_000 }, async () => {
  prepareDatabase()
  try {
    assert.equal(psql(`select count(*) from information_schema.columns where table_schema='public' and table_name='sales_code_sequences' and column_name='standard_version';`), '0')
    psql(legacyFixture)

    const migration = await readFile(new URL(
      '../../supabase/migrations/20260821112527_phase_gsc_03_global_sales_code_compatibility.sql',
      import.meta.url,
    ), 'utf8')
    const behavior = await readFile(new URL(
      '../../supabase/tests/phase_gsc_03_global_sales_code_compatibility.sql',
      import.meta.url,
    ), 'utf8')

    psql(migration)
    const result = psql(behavior)
    assert.match(result, /PHASE_GSC_03_GLOBAL_SALES_CODE_COMPATIBILITY_OK/)
    assert.equal(psql(`select sales_code from public.skus where id='00000000-0000-4000-8000-00000000d601';`), 'CF-LEGACY-01')
    assert.equal(psql(`select standard_version from public.sales_code_sequences where id='00000000-0000-4000-8000-00000000d701';`), 'legacy')
  } finally {
    docker(['exec', container, 'dropdb', '-U', 'postgres', '--if-exists', '--force', database])
  }
})

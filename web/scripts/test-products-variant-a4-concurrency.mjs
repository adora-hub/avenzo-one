import assert from "node:assert/strict";
import { spawn, spawnSync } from "node:child_process";
import test from "node:test";

const container = "supabase_db_avenzo-one-local";
const database = "avenzo_a4_concurrency_test";

function docker(args, options = {}) {
  const result = spawnSync("docker", args, {
    encoding: "utf8",
    maxBuffer: 20 * 1024 * 1024,
    ...options,
  });
  if (result.status !== 0) {
    throw new Error(`docker ${args.join(" ")} failed\n${result.stdout}\n${result.stderr}`);
  }
  return result.stdout.trim();
}

function psql(sql) {
  return docker(
    ["exec", "-i", container, "psql", "-U", "postgres", "-d", database, "-v", "ON_ERROR_STOP=1", "-At"],
    { input: sql },
  );
}

function psqlAsync(sql) {
  return new Promise((resolve, reject) => {
    const child = spawn(
      "docker",
      ["exec", "-i", container, "psql", "-U", "postgres", "-d", database, "-v", "ON_ERROR_STOP=1", "-At"],
      { stdio: ["pipe", "pipe", "pipe"] },
    );
    let stdout = "";
    let stderr = "";
    child.stdout.setEncoding("utf8");
    child.stderr.setEncoding("utf8");
    child.stdout.on("data", (chunk) => { stdout += chunk; });
    child.stderr.on("data", (chunk) => { stderr += chunk; });
    child.on("error", reject);
    child.on("close", (code) => {
      if (code === 0) resolve(stdout.trim());
      else reject(new Error(`concurrent psql failed (${code})\n${stdout}\n${stderr}`));
    });
    child.stdin.end(sql);
  });
}

const setupSql = String.raw`
insert into auth.users (id, email, created_at, updated_at)
values ('00000000-0000-4000-8000-00000000c401', 'a4-concurrency@example.test', now(), now());
insert into public.organizations (id, name, slug, status, timezone, currency, created_by)
values ('00000000-0000-4000-8000-00000000c411', 'A4 Concurrency', 'a4-concurrency', 'active', 'Asia/Bangkok', 'THB', '00000000-0000-4000-8000-00000000c401');
insert into public.products (id, organization_id, name, status, created_by, updated_by) values
  ('00000000-0000-4000-8000-00000000c501', '00000000-0000-4000-8000-00000000c411', 'Concurrent Product 1', 'draft', '00000000-0000-4000-8000-00000000c401', '00000000-0000-4000-8000-00000000c401'),
  ('00000000-0000-4000-8000-00000000c502', '00000000-0000-4000-8000-00000000c411', 'Concurrent Product 2', 'draft', '00000000-0000-4000-8000-00000000c401', '00000000-0000-4000-8000-00000000c401');
insert into public.skus (id, organization_id, product_id, sku_code, name, base_unit_code, status, created_by, updated_by) values
  ('00000000-0000-4000-8000-00000000c601', '00000000-0000-4000-8000-00000000c411', '00000000-0000-4000-8000-00000000c501', 'A4-CONCURRENT-001', 'Concurrent SKU 1', 'piece', 'draft', '00000000-0000-4000-8000-00000000c401', '00000000-0000-4000-8000-00000000c401'),
  ('00000000-0000-4000-8000-00000000c602', '00000000-0000-4000-8000-00000000c411', '00000000-0000-4000-8000-00000000c502', 'A4-CONCURRENT-002', 'Concurrent SKU 2', 'piece', 'draft', '00000000-0000-4000-8000-00000000c401', '00000000-0000-4000-8000-00000000c401');
select public.server_execute_sales_code_command(
  '00000000-0000-4000-8000-00000000c701',
  '00000000-0000-4000-8000-00000000c411', 'sequence.create',
  '{"name":"Concurrent A","purpose":"permanent_sales","prefix":"A","start_number":1,"digit_count":3}'::jsonb,
  repeat('c', 64), '00000000-0000-4000-8000-00000000c401'
);
`;

function allocationSql(commandId, skuId, hashCharacter) {
  return `select public.server_execute_sales_code_command(
    '${commandId}',
    '00000000-0000-4000-8000-00000000c411', 'permanent.allocate',
    jsonb_build_object(
      'sequence_id', (select id from public.sales_code_sequences where organization_id = '00000000-0000-4000-8000-00000000c411' and prefix = 'A'),
      'sku_id', '${skuId}'
    ),
    repeat('${hashCharacter}', 64), '00000000-0000-4000-8000-00000000c401'
  );`;
}

test("A4 two concurrent sessions allocate A001 and A002 exactly once", { timeout: 120_000 }, async () => {
  docker(["exec", container, "dropdb", "-U", "postgres", "--if-exists", "--force", database]);
  try {
    docker(["exec", container, "createdb", "-U", "postgres", database]);
    docker(["exec", container, "psql", "-U", "postgres", "-d", database, "-v", "ON_ERROR_STOP=1", "-c", "drop schema public cascade;"]);
    docker([
      "exec", container, "bash", "-lc",
      `pg_dump -U postgres -d postgres --schema-only --no-owner --no-privileges --exclude-extension=pg_cron --schema=auth --schema=private --schema=public --schema=extensions --schema=vault | psql -U postgres -d ${database} -v ON_ERROR_STOP=1`,
    ]);
    docker([
      "exec", container, "bash", "-lc",
      `pg_dump -U postgres -d postgres --data-only --no-owner --no-privileges --column-inserts --table=public.permissions | psql -U postgres -d ${database} -v ON_ERROR_STOP=1`,
    ]);
    psql(setupSql);

    const outputs = await Promise.all([
      psqlAsync(allocationSql(
        "00000000-0000-4000-8000-00000000c702",
        "00000000-0000-4000-8000-00000000c601",
        "d",
      )),
      psqlAsync(allocationSql(
        "00000000-0000-4000-8000-00000000c703",
        "00000000-0000-4000-8000-00000000c602",
        "e",
      )),
    ]);

    assert.equal(outputs.length, 2);
    const allocated = psql(`
      select string_agg(sales_code, ',' order by sales_code)
      from public.skus
      where organization_id = '00000000-0000-4000-8000-00000000c411';
    `);
    assert.equal(allocated, "A001,A002");

    const state = psql(`
      select next_number || ':' || (
        select count(*) from public.sales_code_allocator_events
        where organization_id = '00000000-0000-4000-8000-00000000c411'
          and event_name = 'sales_code.permanent.assigned'
      )
      from public.sales_code_sequences
      where organization_id = '00000000-0000-4000-8000-00000000c411' and prefix = 'A';
    `);
    assert.equal(state, "3:2");
  } finally {
    docker(["exec", container, "dropdb", "-U", "postgres", "--if-exists", "--force", database]);
  }
});

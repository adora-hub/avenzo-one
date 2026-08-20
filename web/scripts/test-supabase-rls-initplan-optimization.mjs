import assert from "node:assert/strict";
import { readFile, readdir } from "node:fs/promises";
import path from "node:path";
import test from "node:test";

const migrationDirectory = path.resolve("../supabase/migrations");
const migrationSuffix = "phase_1_2_4_2_3_rls_initplan_optimization.sql";
const policyName = "aal2 platform admins read billing live shadow commands";

async function readMigration() {
  const migrationFiles = await readdir(migrationDirectory);
  const migrationFile = migrationFiles.find((file) => file.endsWith(migrationSuffix));

  assert.ok(migrationFile, `Missing migration ending with ${migrationSuffix}`);
  return readFile(path.join(migrationDirectory, migrationFile), "utf8");
}

test("migration alters only the reviewed billing shadow command policy", async () => {
  const migration = (await readMigration()).toLowerCase();

  assert.match(
    migration,
    new RegExp(`alter\\s+policy\\s+"${policyName}"\\s+on\\s+public\\.billing_live_shadow_commands`),
  );
  assert.doesNotMatch(migration, /\bdrop\s+policy\b/);
  assert.doesNotMatch(migration, /\bcreate\s+policy\b/);
  assert.doesNotMatch(migration, /\bgrant\b|\brevoke\b/);
  assert.doesNotMatch(migration, /\binsert\b|\bupdate\b|\bdelete\b/);
});

test("row-independent JWT lookup uses the Supabase InitPlan form", async () => {
  const migration = (await readMigration())
    .replace(/--.*$/gm, "")
    .toLowerCase();

  assert.match(migration, /\(\s*select\s+auth\.jwt\(\)\s*\)\s*->>\s*'aal'/);
  assert.doesNotMatch(migration, /select\s*\(\s*auth\.jwt\(\)\s*->>/);
});

test("platform-admin and AAL2 authorization semantics remain mandatory", async () => {
  const migration = (await readMigration()).toLowerCase();

  assert.match(migration, /\(\s*select\s+private\.is_platform_admin\(\)\s*\)/);
  assert.match(migration, /->>\s*'aal'\s*\)\s*=\s*'aal2'/);
  assert.doesNotMatch(migration, /\bor\b/);
  assert.doesNotMatch(migration, /\btrue\b/);
});

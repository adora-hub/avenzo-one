import assert from "node:assert/strict";
import { readFile, readdir } from "node:fs/promises";
import path from "node:path";
import test from "node:test";

const migrationDirectory = path.resolve("../supabase/migrations");
const migrationSuffix = "phase_1_2_4_2_2_anonymous_grant_hardening.sql";
const targetTables = [
  "branches",
  "member_branches",
  "organization_members",
  "organizations",
];

async function readMigration() {
  const migrationFiles = await readdir(migrationDirectory);
  const migrationFile = migrationFiles.find((file) => file.endsWith(migrationSuffix));

  assert.ok(migrationFile, `Missing migration ending with ${migrationSuffix}`);
  return readFile(path.join(migrationDirectory, migrationFile), "utf8");
}

test("migration revokes anonymous access from the reviewed tenant tables", async () => {
  const migration = (await readMigration()).toLowerCase();

  for (const table of targetTables) {
    assert.match(
      migration,
      new RegExp(`revoke\\s+all\\s+privileges\\s+on\\s+table\\s+public\\.${table}\\s+from\\s+anon\\s*;`),
    );
  }
});

test("migration prevents future postgres-created tables and sequences from inheriting anon grants", async () => {
  const migration = (await readMigration()).toLowerCase();

  assert.match(
    migration,
    /alter\s+default\s+privileges\s+for\s+role\s+postgres\s+in\s+schema\s+public\s+revoke\s+all\s+privileges\s+on\s+tables\s+from\s+anon\s*;/,
  );
  assert.match(
    migration,
    /alter\s+default\s+privileges\s+for\s+role\s+postgres\s+in\s+schema\s+public\s+revoke\s+all\s+privileges\s+on\s+sequences\s+from\s+anon\s*;/,
  );
});

test("migration does not weaken signed-in, service-role, or Supabase Auth access", async () => {
  const migration = (await readMigration())
    .replace(/--.*$/gm, "")
    .toLowerCase();

  assert.doesNotMatch(migration, /grant\s+.+\s+to\s+anon/);
  assert.doesNotMatch(migration, /revoke\s+.+\s+from\s+authenticated/);
  assert.doesNotMatch(migration, /revoke\s+.+\s+from\s+service_role/);
  assert.doesNotMatch(migration, /\bauth\./);
});

test("public authentication and invitation entry points do not query the hardened tables", async () => {
  const sourceFiles = [
    "src/app/components/auth-form.tsx",
    "src/app/page.tsx",
    "src/app/auth/callback/route.ts",
    "src/app/invitations/[id]/page.tsx",
    "src/app/components/accept-invitation-form.tsx",
    "src/app/api/invitations/pending/route.ts",
    "src/app/api/invitations/send/route.ts",
  ];
  const sources = await Promise.all(
    sourceFiles.map(async (file) => ({ file, source: await readFile(path.resolve(file), "utf8") })),
  );

  for (const { file, source } of sources) {
    for (const table of targetTables) {
      assert.doesNotMatch(
        source,
        new RegExp(`\\.from\\(["']${table}["']\\)`),
        `${file} must not query public.${table} before authentication`,
      );
    }
  }
});

test("public flows retain explicit authentication boundaries", async () => {
  const authForm = await readFile(path.resolve("src/app/components/auth-form.tsx"), "utf8");
  const callback = await readFile(path.resolve("src/app/auth/callback/route.ts"), "utf8");
  const invitationPage = await readFile(path.resolve("src/app/invitations/[id]/page.tsx"), "utf8");
  const acceptInvitation = await readFile(
    path.resolve("src/app/components/accept-invitation-form.tsx"),
    "utf8",
  );

  assert.match(authForm, /auth\.signInWithPassword/);
  assert.match(authForm, /auth\.signUp/);
  assert.match(authForm, /auth\.resetPasswordForEmail/);
  assert.match(callback, /exchangeCodeForSession|verifyOtp/);
  assert.match(invitationPage, /auth\.getUser/);
  assert.match(invitationPage, /if\s*\(\s*!user\s*\)/);
  assert.match(invitationPage, /createAdminClient/);
  assert.match(acceptInvitation, /rpc\(["']accept_organization_invitation["']/);
});

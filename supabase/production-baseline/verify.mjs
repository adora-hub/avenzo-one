import { createHash } from "node:crypto";
import { readFile, readdir } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const baselineDirectory = dirname(fileURLToPath(import.meta.url));
const manifestPath = join(baselineDirectory, "manifest.json");
const manifest = JSON.parse(await readFile(manifestPath, "utf8"));
const bridgeDirectory = join(baselineDirectory, "bridges");
const bridgeManifest = JSON.parse(
  await readFile(join(bridgeDirectory, "manifest.json"), "utf8"),
);
const expectedFiles = new Set(manifest.migrations.map((migration) => migration.file));
const supportSqlFiles = new Set([
  "schema-diff-detail.sql",
  "schema-fingerprint.sql",
]);
const actualFiles = new Set(
  (await readdir(baselineDirectory)).filter(
    (file) => file.endsWith(".sql") && !supportSqlFiles.has(file),
  ),
);
const errors = [];

for (const migration of manifest.migrations) {
  const path = join(baselineDirectory, migration.file);
  let sql;

  try {
    sql = await readFile(path, "utf8");
  } catch {
    errors.push(`missing: ${migration.file}`);
    continue;
  }

  const canonicalSql = sql.replaceAll("\r\n", "\n").replace(/\n+$/u, "");
  const actualHash = createHash("md5").update(canonicalSql, "utf8").digest("hex");

  if (actualHash !== migration.canonical_md5) {
    errors.push(
      `hash mismatch: ${migration.file} expected=${migration.canonical_md5} actual=${actualHash}`,
    );
  }
}

for (const file of actualFiles) {
  if (!expectedFiles.has(file)) errors.push(`untracked SQL: ${file}`);
}

if (actualFiles.size !== manifest.migration_count) {
  errors.push(
    `file count mismatch: expected=${manifest.migration_count} actual=${actualFiles.size}`,
  );
}

for (const bridge of bridgeManifest.bridges) {
  const bridgePath = resolve(bridgeDirectory, bridge.file);
  let sql;

  try {
    sql = await readFile(bridgePath, "utf8");
  } catch {
    errors.push(`missing bridge: ${bridge.file}`);
    continue;
  }

  const canonicalSql = sql.replaceAll("\r\n", "\n");
  const actualHash = createHash("sha256")
    .update(canonicalSql, "utf8")
    .digest("hex");

  if (actualHash !== bridge.sha256) {
    errors.push(
      `bridge hash mismatch: ${bridge.file} expected=${bridge.sha256} actual=${actualHash}`,
    );
  }
}

if (errors.length > 0) {
  console.error(errors.join("\n"));
  process.exitCode = 1;
} else {
  console.log(
    `Production baseline verified: ${actualFiles.size}/${manifest.migration_count} canonical SQL files + ${bridgeManifest.bridges.length} bridges`,
  );
}

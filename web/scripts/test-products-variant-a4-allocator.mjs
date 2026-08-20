import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const migrationUrl = new URL(
  "../../supabase/migrations/20260816105113_phase_2_1_a4_atomic_sales_code_allocator.sql",
  import.meta.url,
);
const sqlTestUrl = new URL(
  "../../supabase/tests/phase_2_1_a4_atomic_sales_code_allocator.sql",
  import.meta.url,
);
const concurrencyUrl = new URL("./test-products-variant-a4-concurrency.mjs", import.meta.url);
const documentUrl = new URL(
  "../../docs/AVENZO_ONE_Product_Variant_A4_Atomic_Sales_Code_Allocator.md",
  import.meta.url,
);

const [migration, sqlTest, concurrency, document] = await Promise.all([
  readFile(migrationUrl, "utf8"),
  readFile(sqlTestUrl, "utf8"),
  readFile(concurrencyUrl, "utf8"),
  readFile(documentUrl, "utf8"),
]);

test("A4 creates the permanent identifier registry and lifecycle history", () => {
  assert.match(migration, /create table public\.sku_identifier_registry/);
  assert.match(migration, /create table public\.sku_identifier_bindings/);
  assert.match(migration, /identifier_cross_field_collision_existing_data/);
  assert.match(migration, /identifier_cross_field_collision/);
  assert.match(migration, /sales_code_is_permanent/);
});

test("A4 creates sequences, expiring batches, individual reservations, commands and events", () => {
  for (const table of [
    "sales_code_sequences",
    "sales_code_reservation_batches",
    "sales_code_reservations",
    "sales_code_allocator_commands",
    "sales_code_allocator_events",
  ]) {
    assert.match(migration, new RegExp(`create table public\\.${table}`));
  }
  assert.match(migration, /quantity between 1 and 400/);
  assert.match(migration, /now\(\) \+ interval '7 days'/);
});

test("A4 allocator holds a sequence row lock and skips permanent collisions", () => {
  assert.match(migration, /from public\.sales_code_sequences s[\s\S]*for update/);
  assert.match(migration, /from public\.sku_identifier_registry r[\s\S]*normalized_identifier = v_candidate/);
  assert.match(migration, /next_number = v_candidate_number \+ 1/);
});

test("A4 keeps preview non-authoritative and command execution server-only", () => {
  assert.match(migration, /'preview_only', true/);
  assert.match(migration, /server_preview_sales_code_sequence/);
  assert.match(migration, /server_execute_sales_code_command/);
  assert.match(migration, /from public, anon, authenticated/);
  assert.match(migration, /to service_role/);
});

test("A4 behavior tests cover sequence, reservation, resolver, reuse and RLS", () => {
  assert.match(sqlTest, /A001/);
  assert.match(sqlTest, /A002/);
  assert.match(sqlTest, /A003/);
  assert.match(sqlTest, /B001/);
  assert.match(sqlTest, /B070/);
  assert.match(sqlTest, /OLD-BARCODE/);
  assert.match(sqlTest, /set local role authenticated/);
  assert.match(sqlTest, /PHASE_2_1_A4_ATOMIC_SALES_CODE_ALLOCATOR_OK/);
});

test("A4 has an isolated two-session concurrency test and documented rollback", () => {
  assert.match(concurrency, /Promise\.all/);
  assert.match(concurrency, /A001,A002/);
  assert.match(concurrency, /dropdb/);
  assert.match(document, /Concurrency/i);
  assert.match(document, /Rollback plan/i);
  assert.match(document, /ข้อมูลจริงก่อน rollback/);
});

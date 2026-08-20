import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const migrationUrl = new URL(
  "../../supabase/migrations/20260816103853_phase_2_1_a3_variant_data_model.sql",
  import.meta.url,
);
const sqlTestUrl = new URL(
  "../../supabase/tests/phase_2_1_a3_variant_data_model.sql",
  import.meta.url,
);
const rollbackUrl = new URL(
  "../../docs/AVENZO_ONE_Product_Variant_A3_Data_Model.md",
  import.meta.url,
);

const [migration, sqlTest, document] = await Promise.all([
  readFile(migrationUrl, "utf8"),
  readFile(sqlTestUrl, "utf8"),
  readFile(rollbackUrl, "utf8"),
]);

test("A3 creates the structured Variant model", () => {
  for (const table of [
    "product_option_groups",
    "product_option_values",
    "product_option_value_aliases",
    "sku_option_assignments",
    "sku_variant_images",
  ]) {
    assert.match(migration, new RegExp(`create table public\\.${table}`));
  }
});

test("A3 keeps tenant-safe compound foreign keys", () => {
  assert.match(migration, /sku_option_assignments_sku_fk[\s\S]*organization_id, product_id, sku_id/);
  assert.match(migration, /sku_option_assignments_value_fk[\s\S]*organization_id, option_group_id, option_value_id/);
  assert.match(migration, /sku_variant_images_product_image_fk[\s\S]*organization_id, product_id, product_image_id/);
});

test("A3 enforces limits, valid assignments, unique combinations, and immutable SKU Code", () => {
  assert.match(migration, /variant_option_group_limit_exceeded/);
  assert.match(migration, /variant_option_value_limit_exceeded/);
  assert.match(migration, /invalid_or_inactive_variant_assignment/);
  assert.match(migration, /duplicate_variant_combination/);
  assert.match(migration, /sku_code_is_immutable/);
});

test("A3 exposes read-only RLS to authenticated users", () => {
  const policyCount = (migration.match(/create policy .*_read/g) ?? []).length;
  assert.equal(policyCount, 5);
  assert.match(migration, /revoke all privileges[\s\S]*from public, anon, authenticated/);
  assert.match(migration, /grant select[\s\S]*to authenticated/);
  assert.doesNotMatch(migration, /grant (insert|update|delete|all)/i);
});

test("A3 SQL test covers behavior and tenant isolation", () => {
  assert.match(sqlTest, /duplicate_variant_combination/);
  assert.match(sqlTest, /sku_code_is_immutable/);
  assert.match(sqlTest, /set local role authenticated/);
  assert.match(sqlTest, /exactly its tenant option groups/);
  assert.match(sqlTest, /PHASE_2_1_A3_VARIANT_DATA_MODEL_OK/);
});

test("A3 documents a reversible rollback order", () => {
  assert.match(document, /Rollback plan/i);
  assert.match(document, /sku_variant_images/);
  assert.match(document, /sku_option_assignments/);
  assert.match(document, /product_option_groups/);
  assert.match(document, /ข้อมูลจริงก่อน rollback/);
});

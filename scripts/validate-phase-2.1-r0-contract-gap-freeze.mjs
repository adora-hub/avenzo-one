import { readFile } from "node:fs/promises";

const root = new URL("../", import.meta.url);
const [document, schema, inventorySchema, repositories, contracts, productsMockup, creationMockup] = await Promise.all([
  readFile(new URL("docs/AVENZO_ONE_Phase_2.1.R0_Products_Contract_Gap_Freeze.md", root), "utf8"),
  readFile(new URL("supabase/migrations/20260813124837_phase_2_0_3_2_product_sku_schema.sql", root), "utf8"),
  readFile(new URL("supabase/migrations/20260813131250_phase_2_0_3_4_inventory_ledger_balance.sql", root), "utf8"),
  readFile(new URL("web/src/lib/foundation/repositories.ts", root), "utf8"),
  readFile(new URL("web/src/lib/foundation/contracts.ts", root), "utf8"),
  readFile(new URL("docs/mockups/phase-2.1-products-workspace-ui.html", root), "utf8"),
  readFile(new URL("docs/mockups/phase-2.1-unified-product-creation-form.html", root), "utf8"),
]);

const checks = {
  documentStatus: /Owner Approved \/ Completed Locally — R1 may start/.test(document),
  noMigrationScope: /ไม่มี Migration, Production UI, Command หรือ RLS change/.test(document),
  stateDefinitions: ["NOW", "DERIVED", "LATER", "HIDDEN"].every((state) => document.includes(`\`${state}\``)),
  currentProductFields: /create table public\.products[\s\S]*?name text not null[\s\S]*?description text[\s\S]*?status text/.test(schema),
  currentSkuFields: /create table public\.skus[\s\S]*?sku_code text not null[\s\S]*?barcode text[\s\S]*?sales_code text[\s\S]*?base_unit_code text not null/.test(schema),
  identifierUniqueness: /skus_organization_sku_code_unique/.test(schema) && /skus_organization_barcode_unique/.test(schema) && /skus_organization_sales_code_unique/.test(schema),
  permanentSalesCode: /sku_sales_code_is_permanent/.test(schema),
  immutableBaseUnit: /sku_base_unit_is_immutable/.test(schema),
  inventoryBalanceExists: /create table public\.inventory_balances/.test(inventorySchema),
  immutableMovementExists: /create table public\.stock_movements/.test(inventorySchema) && /immutable/.test(inventorySchema),
  currentReadModels: /export type ProductReadModel/.test(repositories) && /export type SkuReadModel/.test(repositories) && /export type InventoryBalanceReadModel/.test(repositories),
  currentCommands: /'product\.create'/.test(contracts) && /'sku\.create'/.test(contracts),
  mockupColumnsCovered: ["Product", "รหัส CF", "SKU / Variants", "Stock", "Base Unit", "Price", "หมวดหมู่", "แบรนด์", "Barcode", "อัตราภาษี", "Tags", "สาขา", "ผู้สร้าง"].every((field) => productsMockup.includes(field) && document.includes(field)),
  creationFieldsCovered: ["รูปสินค้า", "หมายเหตุสินค้า", "น้ำหนักและขนาด", "Packaging", "Bundle", "Safety Stock"].every((field) => creationMockup.includes(field) && document.includes(field)),
  r1Scope: /## R1 Scope Freeze/.test(document) && /ไม่แก้ Repository, Command, Migration หรือ RLS/.test(document),
  r2SerializableContract: /type ProductWorkspaceRow/.test(document) && /mode: 'single-unit' \| 'mixed-units' \| 'no-balance'/.test(document),
  noNPlusOne: /ห้าม query ต่อแถว/.test(document),
  mixedUnitSafety: /ถ้า aggregate คนละ Base Unit ห้ามบวกตัวเลขรวม/.test(document),
  r3DefaultColumns: /## R3 Data Grid Freeze/.test(document) && /Sales Code preview/.test(document) && /Updated at/.test(document),
  priceAndCostHidden: /Sale price[\s\S]*?LATER \+ HIDDEN/.test(document) && /Cost price[\s\S]*?LATER \+ HIDDEN/.test(document),
  imageGatePreserved: /Product image\/cover[\s\S]*?R6 Image Gate/.test(document),
  identifierRulesPreserved: /Sales Code permanent; archived entity ไม่มี edit action/.test(document),
  stockMutationBoundary: /Stock และ Base Unit read-only/.test(document) && /resolve เป็น `sku_id`/.test(document),
  clinicDeferred: /Clinic Mockup ถูกพักไว้/.test(document),
  sequentialGate: /ห้ามเริ่ม R2 หรือ R3 พร้อม R1/.test(document),
};

const failed = Object.entries(checks).filter(([, passed]) => !passed).map(([name]) => name);
if (failed.length) throw new Error(`R0 Contract Gap Freeze checks failed: ${failed.join(", ")}`);

console.log(`Phase 2.1.R0 Contract Gap Freeze: ${Object.keys(checks).length}/${Object.keys(checks).length} checks passed`);

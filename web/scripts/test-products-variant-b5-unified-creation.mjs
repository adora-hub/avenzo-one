import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import test from 'node:test'

const root = new URL('../', import.meta.url)
const read = (path) => readFile(new URL(path, root), 'utf8')

test('B5 trusted command creates the complete variant graph atomically', async () => {
  const sql = await read('../supabase/migrations/20260816111737_phase_2_1_b5_unified_variant_creation.sql')
  for (const contract of [
    'server_execute_variant_creation_command',
    'product.create_with_variants',
    'product.variant_images.assign',
    'product_option_groups',
    'product_option_values',
    'sku_option_assignments',
    'sku_variant_images',
    'foundation_domain_events',
    'append_organization_audit_log',
  ]) assert.match(sql, new RegExp(contract.replaceAll('.', '\\.')))
  assert.match(sql, /revoke all on function public\.server_execute_variant_creation_command[\s\S]+from public, anon, authenticated, service_role/i)
  assert.match(sql, /grant execute on function public\.server_execute_variant_creation_command[\s\S]+to service_role/i)
})

test('B5 real form renders the approved builder and submits all enabled variants', async () => {
  const [form, builder, css, mockup] = await Promise.all([
    read('src/app/organizations/[id]/products/new/unified-product-creation-form.tsx'),
    read('src/app/organizations/[id]/products/new/variant-creation-builder.tsx'),
    read('src/app/globals.css'),
    read('../docs/mockups/phase-2.1-unified-product-creation-form.html'),
  ])
  assert.match(form, /<VariantCreationBuilder/)
  assert.match(form, /structure !== 'variant' \? <>[\s\S]+product-sku-name-field[\s\S]+product-identifier-zone[\s\S]+product-sku-staging[\s\S]+<\/> : null/)
  assert.match(form, /SKU Variant และตัวเลือกสินค้า/)
  assert.match(form, /commandType: isVariantCreation \? 'product\.create_with_variants'/)
  assert.match(form, /assignVariantImages/)
  assert.match(form, /variantSkus/)
  assert.match(form, /readyImageIdsByClientId/)
  assert.match(form, /พบ SKU Code ซ้ำในตาราง Combination/)
  assert.match(builder, /กำหนดตัวเลือกและสร้าง SKU Combination/)
  assert.match(builder, /ครบ 3 กลุ่มแล้ว/)
  assert.match(builder, /ลบกลุ่มใดกลุ่มหนึ่งเพื่อเพิ่มกลุ่มใหม่/)
  assert.match(builder, /ราคาขายทุกตัวเลือก/)
  assert.match(builder, /รูปประจำ Variant/)
  assert.match(builder, /synchronizeVariantCombinations/)
  assert.match(css, /\.product-variant-builder/)
  assert.match(css, /\.product-variant-matrix-wrap/)
  assert.match(mockup, /id="singleSkuEditor" class="single-sku-only"/)
  assert.match(mockup, /elements\.singleSkuEditor\.hidden = structure === "variant"/)
  assert.match(mockup, /SKU Variant และตัวเลือกสินค้า/)
  assert.match(form, /base_unit_code: structure === 'variant' \? formString\(data, 'baseUnitCode'\)/)
  assert.doesNotMatch(form, /variants:[\s\S]+base_unit_code: formString\(data, 'baseUnitCode'\)[\s\S]+option_codes/)
  assert.match(mockup, /data-field="baseUnit"[\s\S]+id="singleSkuEditor"/)
  assert.match(builder, /salesCode: string/)
  assert.match(builder, /รหัสขาย \/ รหัส CF/)
  assert.match(form, /sales_code: variant\.salesCode \|\| undefined/)
  assert.match(mockup, /data-combination-field="salesCode"/)
  assert.match(builder, /กำหนดรหัสขาย \/ รหัส CF/)
  assert.match(builder, /ค่าเริ่มต้นของทุกรายการ/)
  assert.match(builder, /salesCodeMode === 'sequence'/)
  assert.match(builder, /checkVariantProductIdentifiersAction/)
  assert.match(builder, /onIdentifierCheckChange\?\.\(true\)/)
  assert.match(form, /ทุก Combination ต้องใช้รหัสขายมาตรฐาน เช่น A001 หรือ AA001 และห้ามใช้เลข 000/)
  assert.match(form, /identifierVariantKeys/)
  assert.match(form, /variantKeys\.add\(variant\.key\)/)
  assert.match(form, /รหัสเดียวกันใช้ซ้ำได้ภายใน Variant เดียว แต่ห้ามชี้ไปคนละ Variant/)
  assert.doesNotMatch(form, /textarea:not\(\[disabled\]\), button:not\(\[disabled\]\)/)
  assert.match(form, /variantIdentifiersReady/)
  assert.match(mockup, /id="variantSalesCodeMode"/)
  assert.match(mockup, /checkVariantIdentifiersMock/)
  assert.match(css, /product-variant-identifier-check/)
  assert.match(css, /product-variant-matrix \{ width: 100%; min-width: 1160px/)
  assert.match(form, /sale_price: structure === 'variant'[\s\S]+variantCombinations\.find\(\(variant\) => variant\.enabled\)\?\.price/)
  assert.match(form, /sale_price: Number\(variant\.price\)/)
  assert.match(form, /variant\.price === '' \|\| !Number\.isFinite\(Number\(variant\.price\)\) \|\| Number\(variant\.price\) < 0/)
  assert.match(form, /structure === 'variant' \? 'ภาษีและต้นทุนร่วม' : 'ราคาและภาษี'/)
  assert.match(form, /product-variant-price-summary/)
  assert.match(form, /อัตราภาษีร่วม/)
  assert.match(css, /\.product-variant-price-summary/)
  assert.match(css, /\.product-creation-page input:not\(\[type="checkbox"\]\):not\(\[type="radio"\]\):focus/)
  assert.match(css, /box-shadow: inset 0 0 0 1px var\(--focus-color\)/)
  assert.match(css, /\.product-creation-page \.product-variant-values-editor input:focus[\s\S]+box-shadow: none !important/)
  assert.match(mockup, /id="variantPriceSummary"/)
  assert.match(mockup, /id="singleSalePriceField"/)
  assert.match(mockup, /singleSalePriceField"\)\.hidden = structure === "variant"/)
  assert.match(mockup, /ราคาขายของ SKU Combination ยังไม่ครบ/)
})

test('B5 variant identifiers are checked in batches against the permanent registry', async () => {
  const [checker, actions, builder] = await Promise.all([
    read('src/lib/foundation/product-identifier-check.server.ts'),
    read('src/app/actions/foundation.ts'),
    read('src/app/organizations/[id]/products/new/variant-creation-builder.tsx'),
  ])
  assert.match(checker, /checkVariantProductIdentifiers/)
  assert.match(checker, /sku_identifier_registry/)
  assert.match(checker, /duplicate_in_form/)
  assert.match(checker, /already_exists/)
  assert.match(checker, /identifierSequenceCandidates\(normalized, offset, 100\)/)
  assert.match(checker, /suggestionByValue\.get\(collision\.value\.toUpperCase\(\)\)/)
  assert.match(checker, /eq\('organization_id', organizationId\)/)
  assert.match(builder, /suggestedIdentifierCollisions/)
  assert.match(builder, /function useIdentifierSuggestion/)
  assert.match(builder, /รหัสถัดไปที่ว่างจริง/)
  assert.match(builder, /ระบบจะตรวจฐานข้อมูลซ้ำให้อัตโนมัติ/)
  assert.match(checker, /new Set\(entries\.map\(\(entry\) => entry\.key\)\)/)
  assert.match(checker, /variantKeys\.size > 1/)
  assert.match(checker, /value\.variants\.length > 100/)
  assert.match(actions, /checkVariantProductIdentifiersAction/)
})
test('B5 command is validated and routed only through the trusted repository', async () => {
  const [contracts, repository] = await Promise.all([
    read('src/lib/foundation/contracts.ts'),
    read('src/lib/foundation/supabase-repository.ts'),
  ])
  assert.match(contracts, /'product\.create_with_variants'/)
  assert.match(contracts, /'product\.variant_images\.assign'/)
  assert.match(contracts, /payload\.option_groups/)
  assert.match(contracts, /payload\.variants/)
  assert.match(repository, /server_execute_variant_creation_command/)
  assert.match(repository, /productVariantCreationCommandTypes\.includes/)
})

test('B5 hotfix elevates only trusted trigger guards without table grants', async () => {
  const sql = await read('../supabase/migrations/20260816163000_phase_2_1_b5_variant_trigger_privilege_fix.sql')
  for (const functionName of [
    'enforce_variant_collection_limits',
    'validate_sku_option_assignment',
    'prevent_variant_master_archive_in_use',
    'validate_variant_combination_uniqueness',
    'sync_sku_identifier_registry',
  ]) {
    assert.match(sql, new RegExp(`alter function private\\.${functionName}\\(\\)[\\s\\S]+security definer`, 'i'))
    assert.match(sql, new RegExp(`revoke all on function private\\.${functionName}\\(\\)[\\s\\S]+from public, anon, authenticated, service_role`, 'i'))
  }
  assert.doesNotMatch(sql, /grant\s+(select|insert|update|delete|all)[\s\S]+to service_role/i)
})

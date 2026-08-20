import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import test from 'node:test'

const read = (path) => readFile(new URL(path, import.meta.url), 'utf8')
const formPath = '../src/app/organizations/[id]/products/new/unified-product-creation-form.tsx'
const stylesPath = '../src/app/globals.css'

test('R7.2.4D bounds and sanitizes restored SKU staging Browser Drafts', async () => {
  const form = await read(formPath)
  assert.match(form, /SKU_DRAFT_MAX_ITEMS = 100/)
  assert.match(form, /function sanitizeSkuDrafts/)
  assert.match(form, /value\.slice\(0, SKU_DRAFT_MAX_ITEMS\)/)
  assert.match(form, /FORBIDDEN_CONTROL_CHARACTERS/)
  assert.match(form, /BASE_UNIT_CODES\.has\(baseUnitCode\)/)
})

test('R7.2.4D persists staged rows and sequence offset in the versioned Browser Draft', async () => {
  const form = await read(formPath)
  assert.match(form, /skuDrafts: stagedSkus, salesSequenceOffset: sequenceOffset/)
  assert.match(form, /setSkuDrafts\(sanitizeSkuDrafts\(saved\.skuDrafts, bundleSkus\)\)/)
  assert.match(form, /setSalesSequenceOffset\(Number\(saved\.salesSequenceOffset\)\)/)
  assert.match(form, /DRAFT_MAX_BYTES = 1024 \* 1024/)
})

test('R7.2.4D renders the approved count, empty state, table, and row actions', async () => {
  const form = await read(formPath)
  assert.match(form, /คิวสินค้าที่รอสร้าง/)
  assert.match(form, /product-count-badge">\{skuDrafts\.length\}/)
  assert.match(form, /ยังไม่มีสินค้าในคิว/)
  for (const label of ['สินค้า', 'รหัสสินค้า (SKU)', 'รหัสขาย / CF', 'Barcode', 'หน่วยนับ', 'สถานะ']) assert.ok(form.includes(label))
  assert.match(form, /รหัสขาย \/ CF รายการถัดไป/)
  assert.match(form, /salesCodeMode === 'sequence' \? salesSequenceCurrent/)
  assert.match(form, /พร้อมตรวจสอบ/)
  assert.match(form, /editSkuDraft\(draft\.id\)/)
  assert.match(form, /removeSkuDraft\(draft\.id\)/)
  assert.match(form, /product-sku-staging-product/)
  assert.match(form, /skuDraftImages\[draft\.id\]/)
  assert.match(form, /data-tooltip="แก้ไขสินค้า"/)
  assert.match(form, /data-tooltip="นำออกจากคิว"/)
})

test('R7.2.4D requires and snapshots the cover image for every queued product row', async () => {
  const form = await read(formPath)
  assert.match(form, /imageId: images\[0\]\?\.id \?\? ''/)
  assert.match(form, /imageName: images\[0\]\?\.file\.name/)
  assert.match(form, /รูปสินค้าอย่างน้อย 1 ภาพ/)
  assert.match(form, /alt=\{`รูปสินค้า \$\{draftProductName\}`\}/)
})

test('R7.2.4D validates local identifiers against every other staged SKU', async () => {
  const form = await read(formPath)
  assert.match(form, /function skuDraftValidationErrors/)
  assert.match(form, /item\.id !== editingSkuDraftId/)
  assert.match(form, /flatMap\(\(item\) => \[item\.skuCode, item\.salesCode, item\.barcode\]\)/)
  assert.match(form, /ซ้ำในรายการ:/)
})

test('R7.2.4D performs authenticated advisory duplicate checks before staging', async () => {
  const form = await read(formPath)
  assert.match(form, /function storeCurrentSkuDraft/)
  assert.match(form, /checkProductIdentifiersAction\(\{[\s\S]*organizationId,[\s\S]*skuCode: record\.skuCode/)
  assert.match(form, /skuDraftCheckRequestRef\.current !== requestId/)
  assert.match(form, /ข้อมูลสินค้าเปลี่ยนระหว่างตรวจ/)
  assert.match(form, /ยังเก็บสินค้าไม่ได้ พบรหัสที่ถูกใช้แล้ว:/)
})

test('R7.2.4D advances sequence preview only after storing a new sequence SKU', async () => {
  const form = await read(formPath)
  assert.match(form, /salesCodeMode === 'sequence' && editingIndex < 0 \? salesSequenceOffset \+ 1/)
  assert.match(form, /setSalesSequenceOffset\(nextOffset\)/)
  assert.match(form, /salesSequenceOffset \+ 1\)/)
  assert.match(form, /Preview ยังไม่จองเลข/)
})

test('queued product identifiers advance immediately and are excluded from group generation', async () => {
  const form = await read(formPath)
  assert.match(form, /nextIdentifierOutsideSet\(record\.skuCode, queuedIdentifiers\)/)
  assert.match(form, /nextIdentifierOutsideSet\(record\.salesCode, queuedIdentifiers\)/)
  assert.match(form, /nextIdentifiers: editingIndex < 0/)
  assert.match(form, /queuedIdentifiers\.has\(value\.toUpperCase\(\)\)/)
})

test('R7.2.4D supports edit, cancel, update, and delete without mutating system data', async () => {
  const form = await read(formPath)
  assert.match(form, /setEditingSkuDraftId\(id\)/)
  assert.match(form, /บันทึกการแก้ไขสินค้า/)
  assert.match(form, /ยกเลิกแก้ไข/)
  assert.match(form, /setSkuDrafts\(nextDrafts\)/)
  assert.match(form, /นำสินค้า .* ออกจากคิวแล้ว/)
})

test('queued product rows keep an editable price and fixed action column', async () => {
  const form = await read(formPath)
  const styles = await read(stylesPath)
  assert.match(form, /salePrice: formString\(data, 'salePrice'\)/)
  assert.match(form, /updateSkuDraftSalePrice\(draft\.id, event\.currentTarget\.value\)/)
  assert.match(form, /optionalNumber\(initialSku\?\.salePrice \?\? data\.get\('salePrice'\)\)/)
  assert.match(styles, /\.product-sku-staging-table \{ width: max-content; min-width: 100%; border-spacing: 0; border-collapse: separate;/)
  assert.match(styles, /\.product-sku-staging-actions-column \{ position: sticky !important; right: 0;/)
})

test('R7.2.4D maps one staged SKU to the existing atomic initial-SKU payload', async () => {
  const form = await read(formPath)
  assert.match(form, /const initialSku = skuDrafts\[0\]/)
  assert.match(form, /sku_name: initialSku\?\.name/)
  assert.match(form, /sku_code: initialSku\?\.skuCode/)
  assert.match(form, /base_unit_code: structure === 'variant' \? formString\(data, 'baseUnitCode'\) : initialSku\?\.baseUnitCode/)
  assert.match(form, /'product\.create_with_variants' : 'product\.create_with_initial_sku'/)
})

test('R7.2.4D prevents silent multi-SKU loss instead of inventing a non-atomic write path', async () => {
  const form = await read(formPath)
  assert.match(form, /if \(skuDrafts\.length > 1\)/)
  assert.match(form, /Atomic command ปัจจุบันสร้างได้ครั้งละ 1 SKU/)
  assert.match(form, /จึงยังไม่ส่งข้อมูล เพื่อป้องกันรายการสูญหาย/)
  assert.doesNotMatch(form, /commandType: 'sku\.create'/)
})

test('R7.2.4D keeps approved responsive actions and accessible pending state', async () => {
  const form = await read(formPath)
  const styles = await read(stylesPath)
  assert.match(form, /aria-busy=\{isSkuDraftChecking\}/)
  assert.match(form, /กำลังตรวจและเก็บสินค้า…/)
  assert.match(styles, /\.product-sku-staging-actions \{ display: flex; gap: 7px; \}/)
  assert.match(styles, /\.product-sku-staging-row-actions \{ display: flex; justify-content: flex-end; gap: 5px; \}/)
  assert.match(styles, /\.product-sku-staging-actions-column \{ position: sticky !important; right: 0;/)
  assert.match(styles, /\.product-sku-staging-icon-action/)
  assert.match(styles, /\.product-sku-staging-floating-tooltip \{ position: fixed;/)
  assert.match(styles, /\.product-sku-staging-actions \{ display: grid; \}/)
})
test('R7.2.4D stores and restores the complete product snapshot without mixing queued products', async () => {
  const form = await read(formPath)
  assert.match(form, /type ProductDraftSnapshot = \{/)
  assert.match(form, /snapshot: currentProductDraftSnapshot\(\)/)
  assert.match(form, /readProductDraftFields\(form\)/)
  assert.match(form, /restoreProductDraftFields\(form, snapshot\.fields, snapshot\.checkedFields\)/)
  assert.match(form, /setSkuDraftImages\(\(current\) => \(\{ \.\.\.current, \[record\.id\]: \[\.\.\.images\] \}\)\)/)
  assert.match(form, /setCategoryId\(''\)/)
  assert.match(form, /setImages\(\[\]\)/)
  assert.match(form, /เก็บสินค้าทั้งรายการแล้ว พร้อมกรอกรายการถัดไป/)
})

test('queue validation moves directly to the first field that needs fixing', async () => {
  const form = await read(formPath)
  assert.match(form, /function focusSkuDraftValidationError\(error: string\)/)
  assert.match(form, /error\.includes\('ราคาขาย'\)[\s\S]*\? 'salePrice'/)
  assert.match(form, /target\.scrollIntoView\(\{ behavior: 'smooth', block: 'center' \}\)/)
  assert.match(form, /focusSkuDraftValidationError\(errors\[0\]\)/)
})
test('queued sale price uses one compact field without nested focus or spinner chrome', async () => {
  const styles = await read(stylesPath)
  assert.match(styles, /\.product-sku-staging-price-field \{ display: inline-grid;/)
  assert.match(styles, /\.product-sku-staging-price-field input \{[^}]*box-shadow: none;[^}]*appearance: textfield;/)
  assert.match(styles, /\.product-sku-staging-price-field input:focus \{ border: 0; outline: 0; box-shadow: none; \}/)
  assert.match(styles, /input::-webkit-inner-spin-button,[\s\S]*input::-webkit-outer-spin-button \{ margin: 0; appearance: none; \}/)
})

test('queue review validates then persists every queued product with retry-safe command ids', async () => {
  const form = await read(formPath)
  assert.match(form, /const queueReviewMode = structure !== 'variant' && skuDrafts\.length > 0 && !hasUnqueuedProductChanges/)
  assert.match(form, /const queueSectionCompletion = \{/)
  assert.match(form, /คิวสินค้า \$\{skuDrafts\.length\} รายการ/)
  assert.match(form, /ตรวจสอบและสร้าง \$\{skuDrafts\.length\} รายการ/)
  assert.match(form, /function reviewQueuedProducts\(\)/)
  assert.match(form, /function createQueuedProducts\(\)/)
  assert.match(form, /buildQueuedProductPayload\(draft\)/)
  assert.match(form, /queueRecoveryKey/)
  assert.match(form, /queue:\$\{draft\.id\}:command-id/)
  assert.match(form, /commandType: 'product\.create_with_initial_sku'/)
  assert.match(form, /onClick=\{queueReviewMode \? createQueuedProducts : undefined\}/)
  assert.match(form, /กดสร้างอีกครั้งเพื่อทำต่อโดยไม่สร้าง Product ซ้ำ/)
})

test('queue review warns when a new product is still being edited outside the queue', async () => {
  const form = await read(formPath)
  assert.match(form, /const hasUnqueuedProductChanges = Boolean\(/)
  assert.match(form, /เก็บรายการที่กำลังกรอกก่อนตรวจคิว \$\{skuDrafts\.length\} รายการ/)
})

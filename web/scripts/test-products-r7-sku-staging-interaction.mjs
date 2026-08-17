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
  assert.match(form, /setSkuDrafts\(sanitizeSkuDrafts\(saved\.skuDrafts\)\)/)
  assert.match(form, /setSalesSequenceOffset\(Number\(saved\.salesSequenceOffset\)\)/)
  assert.match(form, /DRAFT_MAX_BYTES = 256 \* 1024/)
})

test('R7.2.4D renders the approved count, empty state, table, and row actions', async () => {
  const form = await read(formPath)
  assert.match(form, /รายการ SKU ที่เตรียมสร้าง/)
  assert.match(form, /product-count-badge">\{skuDrafts\.length\}/)
  assert.match(form, /ยังไม่มี SKU ในรายการ — SKU ที่กำลังกรอกด้านบนยังไม่ถูกเก็บ/)
  for (const label of ['ชื่อรุ่น / ตัวเลือก', 'SKU Code', 'Sales Code', 'Barcode', 'Base Unit']) assert.match(form, new RegExp(label))
  assert.match(form, /editSkuDraft\(draft\.id\)/)
  assert.match(form, /removeSkuDraft\(draft\.id\)/)
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
  assert.match(form, /ข้อมูล SKU เปลี่ยนระหว่างตรวจ/)
  assert.match(form, /ยังเก็บ SKU ไม่ได้ พบรหัสที่ถูกใช้แล้ว:/)
})

test('R7.2.4D advances sequence preview only after storing a new sequence SKU', async () => {
  const form = await read(formPath)
  assert.match(form, /salesCodeMode === 'sequence' && editingIndex < 0 \? salesSequenceOffset \+ 1/)
  assert.match(form, /setSalesSequenceOffset\(nextOffset\)/)
  assert.match(form, /salesSequenceOffset \+ 1\)/)
  assert.match(form, /Preview ยังไม่จองเลข/)
})

test('R7.2.4D supports edit, cancel, update, and delete without mutating system data', async () => {
  const form = await read(formPath)
  assert.match(form, /setEditingSkuDraftId\(id\)/)
  assert.match(form, /บันทึกการแก้ไข SKU/)
  assert.match(form, /ยกเลิกแก้ไข/)
  assert.match(form, /setSkuDrafts\(nextDrafts\)/)
  assert.match(form, /ลบ SKU .* ออกจาก Browser Draft แล้ว/)
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
  assert.match(form, /กำลังตรวจและเก็บ SKU…/)
  assert.match(styles, /\.product-sku-staging-actions \{ display: flex; gap: 7px; \}/)
  assert.match(styles, /\.product-sku-staging-row-actions \{ display: flex; justify-content: flex-end; gap: 5px; \}/)
  assert.match(styles, /\.product-sku-staging-actions \{ display: grid; \}/)
})

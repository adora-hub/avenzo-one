import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import test from 'node:test'

const read = (path) => readFile(new URL(path, import.meta.url), 'utf8')
const formPath = '../src/app/organizations/[id]/products/new/unified-product-creation-form.tsx'

test('R7.2 exposes one governed unified creation route from Products', async () => {
  const [page, workspace, form] = await Promise.all([
    read('../src/app/organizations/[id]/products/new/page.tsx'),
    read('../src/app/organizations/[id]/products/product-sku-workspace.tsx'),
    read(formPath),
  ])
  assert.match(workspace, /products\/new[\s\S]*สร้างสินค้าปกติ/)
  assert.match(page, /current_user_organization_access/)
  assert.match(page, /permissions\.has\('product\.manage'\)/)
  assert.match(form, /สร้าง Product, รูปภาพ, SKU แรก และข้อมูลการขายจากหน้าเดียว/)
})

test('R7.2 submits Product and first SKU only through the R7.1 atomic command', async () => {
  const form = await read(formPath)
  assert.match(form, /commandType: 'product\.create_with_initial_sku'/)
  assert.match(form, /product_id[\s\S]*sku_id/)
  assert.doesNotMatch(form, /commandType: 'product\.create'/)
  assert.doesNotMatch(form, /commandType: 'sku\.create'/)
})

test('R7.2 uses the R6 prepare-upload-finalize pipeline and cleanup compensation', async () => {
  const [form, actions] = await Promise.all([
    read(formPath),
    read('../src/app/actions/foundation.ts'),
  ])
  assert.match(form, /product\.image\.prepare/)
  assert.match(form, /uploadPreparedProductImage\(supabase, reservation, image\.file\)/)
  assert.match(form, /product\.image\.finalize/)
  assert.match(form, /product\.images\.reorder/)
  assert.match(form, /executeProductImageCleanupAction/)
  assert.match(actions, /executeProductImageCleanupCommand/)
  assert.doesNotMatch(actions, /service_role.*client/i)
})

test('R7.2 validates approved form limits and preserves draft recovery', async () => {
  const form = await read(formPath)
  assert.match(form, /PRODUCT_IMAGE_MAX_FILES/)
  assert.match(form, /PRODUCT_IMAGE_MAX_BYTES/)
  assert.match(form, /tagIds[\s\S]*slice\(0, 12\)/)
  assert.match(form, /localStorage\.setItem\(pendingDraftKey/)
  assert.match(form, /อัปโหลดต่อ/)
  assert.match(form, /ยังคงสถานะฉบับร่าง/)
})

test('R7.2 keeps stock writes outside product creation', async () => {
  const form = await read(formPath)
  assert.match(form, /คำนวณหลังสร้าง SKU และรับ Stock/)
  assert.match(form, /Derived value ห้ามกรอกหรือแก้โดยตรง/)
  assert.match(form, /safety_stock/)
  assert.match(form, /reorder_min/)
  assert.match(form, /reorder_max/)
  assert.doesNotMatch(form, /commandType: '(receive|adjustment_in|adjustment_out|transfer)'/)
  assert.doesNotMatch(form, /stock_movements|inventory_balances/)
})

test('R7.2 implements the approved single-page sections and bounded inputs', async () => {
  const form = await read(formPath)
  for (const section of [
    'ข้อมูลทั่วไป', 'รูปสินค้า', 'SKU แรก', 'ราคาและภาษี',
    'น้ำหนักและขนาด', 'Packaging / Bundle', 'สาขาและนโยบายสต๊อก', 'ข้อมูลระบบ',
  ]) assert.match(form, new RegExp(section.replace('/', '\\/')))
  assert.match(form, /maxLength=\{160\}/)
  assert.match(form, /name="internalNote" maxLength=\{1000\}/)
  assert.match(form, /Base Unit/)
  assert.match(form, /pair — คู่/)
  assert.match(form, /pack — แพ็ค/)
})

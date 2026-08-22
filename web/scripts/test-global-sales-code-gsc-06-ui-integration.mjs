import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import test from 'node:test'

const root = new URL('../', import.meta.url)
const read = (path) => readFile(new URL(path, root), 'utf8')

test('GSC-06 exposes an authenticated service-only preview boundary', async () => {
  const server = await read('src/lib/foundation/global-sales-code-preview.server.ts')
  const actions = await read('src/app/actions/foundation.ts')
  assert.match(server, /getFoundationActor/)
  assert.match(server, /requireFoundationPermission\(actor, 'product\.create'\)/)
  assert.match(server, /createAdminClient/)
  assert.match(server, /server_preview_global_sales_code_range/)
  assert.match(server, /\^\[A-Z\]\{1,3\}\$/)
  assert.match(actions, /previewGlobalSalesCodeRangeAction/)
})

test('GSC-06 gives Normal, Variant and Rapid one Global V1 contract', async () => {
  const canonical = await read('src/lib/foundation/global-sales-code.ts')
  const normal = await read('src/app/organizations/[id]/products/new/unified-product-creation-form.tsx')
  const variant = await read('src/app/organizations/[id]/products/new/variant-creation-builder.tsx')
  const rapid = await read('src/app/organizations/[id]/products/live-sale/rapid-entry/rapid-prefix-assistant.tsx')
  assert.match(canonical, /format: 'ใช้ตัวอักษรอังกฤษ A–Z จำนวน 1–3 ตัว ตามด้วยเลข 3 หลัก 001–999'/)
  assert.match(canonical, /runningNumber: 'เลขรัน 3 หลัก'/)
  assert.match(canonical, /number_width: 'เลขรันต้องมี 3 หลัก ตั้งแต่ 001–999'/)
  assert.match(canonical, /zero_reserved: 'เลข 000 เป็นรหัสสำรองและไม่สามารถนำมาใช้ได้'/)
  for (const source of [normal, variant]) {
    assert.match(source, /GLOBAL_SALES_CODE_UI_TEXT/)
    assert.match(source, /GLOBAL_SALES_CODE_UI_TEXT\.help\.format/)
    assert.match(source, /validateGlobalSalesCode/)
    assert.match(source, /previewGlobalSalesCodeRangeAction/)
    assert.match(source, /maxLength=\{3\}/)
  }
  assert.match(normal, /useState<SalesCodeMode>\('sequence'\)/)
  assert.match(rapid, /quantity: RANGE_SIZE/)
  assert.match(rapid, /ยังไม่จองจนกดสร้างสินค้า/)
})

test('GSC-06 handles timeout, stale response, denied and retry without clearing input', async () => {
  const helper = await read('src/lib/foundation/global-sales-code-preview-ui.ts')
  const variant = await read('src/app/organizations/[id]/products/new/variant-creation-builder.tsx')
  const rapid = await read('src/app/organizations/[id]/products/live-sale/rapid-entry/rapid-prefix-assistant.tsx')
  assert.match(helper, /12_000/)
  assert.match(helper, /global_sales_code_preview_timeout/)
  assert.match(variant, /salesCodePreviewRequestRef/)
  assert.match(rapid, /requestSequenceRef\.current !== requestSequence/)
  assert.match(rapid, /status === 'timeout'/)
  assert.match(rapid, /status === 'denied'/)
  assert.match(rapid, /retryCheck/)
})

import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import test from 'node:test'

const read = (path) => readFile(new URL(path, import.meta.url), 'utf8')
const formPath = '../src/app/organizations/[id]/products/new/unified-product-creation-form.tsx'
const pagePath = '../src/app/organizations/[id]/products/new/page.tsx'
const actionPath = '../src/app/actions/foundation.ts'

test('T2 loads stock destinations only after the switch is enabled', async () => {
  const form = await read(formPath)
  assert.match(form, /if \(!initialStockEnabled \|\| !canLoadInitialStockDestinations \|\| initialStockDestinationStatus !== 'idle'\) return/)
  assert.match(form, /loadInitialStockDestinationsAction\(\{ organizationId \}\)/)
  assert.doesNotMatch(await read(pagePath), /listWarehouses|listLocations/)
})

test('T2 enforces warehouse and location read plus inventory receive before querying', async () => {
  const page = await read(pagePath)
  const action = await read(actionPath)
  assert.match(page, /permissions\.has\('warehouse\.read'\)/)
  assert.match(page, /permissions\.has\('location\.read'\)/)
  assert.match(page, /permissions\.has\('inventory\.receive'\)/)
  assert.match(action, /getFoundationActor\(organizationId\)/)
  assert.match(action, /!actor\.permissions\.includes\('warehouse\.read'\)/)
  assert.match(action, /!actor\.permissions\.includes\('location\.read'\)/)
  assert.match(action, /!actor\.permissions\.includes\('inventory\.receive'\)/)
  assert.match(action, /status: 'active'/)
})

test('T2 uses real cascading warehouse and location identifiers', async () => {
  const form = await read(formPath)
  assert.match(form, /filteredInitialStockWarehouses = initialStockWarehouses\.filter/)
  assert.match(form, /filteredInitialStockLocations = initialStockLocations\.filter/)
  assert.match(form, /selectInitialStockBranch/)
  assert.match(form, /selectInitialStockWarehouse/)
  assert.match(form, /location\.isDefault/)
  const standardStock = form.slice(form.indexOf(': initialStockEnabled'), form.indexOf("{structure === 'variant'", form.indexOf(': initialStockEnabled')))
  assert.doesNotMatch(standardStock, /<option value="main">คลังหลัก<\/option>/)
  assert.doesNotMatch(standardStock, /<option value="available">พร้อมขาย<\/option>/)
})

test('T2 selector states remain and T5.2 adds only the approved trusted write boundary', async () => {
  const form = await read(formPath)
  for (const text of ['กำลังโหลดคลังและตำแหน่งจัดเก็บ', 'ลองใหม่', 'ยังไม่มีคลังและตำแหน่งจัดเก็บที่พร้อมใช้งาน', 'ต้องมีสิทธิ์ดูคลังและรับสต็อก']) {
    assert.match(form, new RegExp(text))
  }
  assert.match(form, /T5\.2 · Atomic Backend/)
  assert.match(form, /executeInitialStockWorkflowAction/)
  assert.doesNotMatch(form, /data-ui-only="true"|ยังไม่บันทึกสต็อกจริง/)
  assert.doesNotMatch(form, /commandType: 'receive'|commandType: 'inventory\./)
})

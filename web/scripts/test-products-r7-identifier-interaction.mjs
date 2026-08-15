import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import test from 'node:test'

const read = (path) => readFile(new URL(path, import.meta.url), 'utf8')
const formPath = '../src/app/organizations/[id]/products/new/unified-product-creation-form.tsx'
const actionPath = '../src/app/actions/foundation.ts'
const serverPath = '../src/lib/foundation/product-identifier-check.server.ts'

test('R7.2.4C validates bounded Organization-scoped identifier check input', async () => {
  const server = await read(serverPath)
  assert.match(server, /UUID_PATTERN/)
  assert.match(server, /CODE_PATTERN = \/\^\[A-Z0-9\]/)
  assert.match(server, /normalizedOptionalString\(value\.skuCode, 80, true\)/)
  assert.match(server, /normalizedOptionalString\(value\.salesCode, 80, true\)/)
  assert.match(server, /normalizedOptionalString\(value\.barcode, 128\)/)
  assert.match(server, /throw new FoundationError\('validation_failed', 400\)/)
})

test('R7.2.4C checks permission and uses the authenticated RLS client', async () => {
  const server = await read(serverPath)
  assert.match(server, /getFoundationActor\(parsed\.organizationId\)/)
  assert.match(server, /requireFoundationPermission\(actor, 'product\.manage'\)/)
  assert.match(server, /createClient\(\)/)
  assert.doesNotMatch(server, /createAdminClient|service_role|serviceRole/)
})

test('R7.2.4C queries each identifier with explicit tenant scope and bounded reads', async () => {
  const server = await read(serverPath)
  assert.match(server, /Promise\.all\(parsed\.identifiers\.map/)
  assert.match(server, /\.from\('skus'\)/)
  assert.match(server, /\.eq\('organization_id', parsed\.organizationId\)/)
  assert.match(server, /\.eq\(identifier\.field, identifier\.value\)/)
  assert.match(server, /\.limit\(1\)/)
  for (const field of ['sku_code', 'sales_code', 'barcode']) assert.match(server, new RegExp(`field: '${field}'`))
})

test('R7.2.4C exposes a safe Server Action without changing mutation commands', async () => {
  const action = await read(actionPath)
  assert.match(action, /export async function checkProductIdentifiersAction/)
  assert.match(action, /await checkProductIdentifiers\(input\)/)
  assert.match(action, /mapFoundationError\(error\)/)
  assert.doesNotMatch(action, /checkProductIdentifiersAction[\s\S]*commandType:/)
})

test('R7.2.4C synchronizes derived identifiers and marks prior checks stale', async () => {
  const form = await read(formPath)
  assert.match(form, /function markIdentifierCheckStale/)
  assert.match(form, /identifierCheckRequestRef\.current \+= 1/)
  assert.match(form, /ข้อมูลรหัสเปลี่ยนแล้ว กรุณาตรวจสอบอีกครั้งก่อนบันทึก/)
  assert.match(form, /target\.value = target\.value\.toUpperCase\(\)/)
  assert.match(form, /salesCodeMode === 'same-sku'/)
  assert.match(form, /barcodeMode === 'internal-sales'/)
})

test('R7.2.4C performs live advisory checks and discards stale responses', async () => {
  const form = await read(formPath)
  assert.match(form, /checkProductIdentifiersAction\(\{ organizationId, skuCode, salesCode, barcode \}\)/)
  assert.match(form, /identifierCheckRequestRef\.current !== requestId/)
  assert.match(form, /latest\.skuCode !== skuCode/)
  assert.match(form, /result\.data\.collisions/)
  assert.match(form, /พบรหัสที่ถูกใช้แล้ว:/)
  assert.match(form, /ไม่พบรหัสซ้ำใน Organization/)
})

test('R7.2.4C keeps the approved loading and accessible status interaction', async () => {
  const form = await read(formPath)
  assert.match(form, /isIdentifierChecking, startIdentifierCheck/)
  assert.match(form, /disabled=\{!canManage \|\| isIdentifierChecking\}/)
  assert.match(form, /aria-busy=\{isIdentifierChecking\}/)
  assert.match(form, /role="status" aria-live="polite"/)
  assert.match(form, /กำลังตรวจรหัสกับข้อมูลของ Organization/)
})

test('R7.2.4C preserves sequence preview and atomic uniqueness authority', async () => {
  const form = await read(formPath)
  assert.match(form, /Preview ยังไม่จองเลข/)
  assert.match(form, /Server transaction เป็นผู้ยืนยัน Unique ขั้นสุดท้าย/)
  assert.match(form, /commandType: 'product\.create_with_initial_sku'/)
  assert.doesNotMatch(form, /commandType: 'sku\.create'/)
  assert.doesNotMatch(form, /reserveSales|allocateSales|sales_sequence\.reserve/)
})

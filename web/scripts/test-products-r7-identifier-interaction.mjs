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

test('generated SKU helper creates, checks, and advances to the next available code', async () => {
  const form = await read(formPath)
  assert.match(form, /function generatedCodeCandidate/)
  assert.match(form, /function generateAndCheckIdentifierGroup/)
  assert.match(form, /for \(let offset = 0; offset < 25; offset \+= 1\)/)
  assert.match(form, /checkProductIdentifiersAction\(\{ organizationId, skuCode, salesCode, barcode \}\)/)
  assert.match(form, /if \(result\.data\.collisions\.length\) continue/)
  assert.match(form, /function clearIdentifierValidationIssue/)
  assert.match(form, /issue\.sectionId === 'sku' && issue\.label === 'ตรวจสอบรหัส'/)
  assert.match(form, /removeAttribute\('data-validation-invalid'\)/)
  assert.match(form, /onClick=\{generateAndCheckIdentifierGroup\}/)
  assert.match(form, /สร้างและตรวจสอบรหัส/)
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
  assert.match(form, /'product\.create_with_variants' : 'product\.create_with_initial_sku'/)
  assert.doesNotMatch(form, /commandType: 'sku\.create'/)
  assert.doesNotMatch(form, /reserveSales|allocateSales|sales_sequence\.reserve/)
})

test('identifier UX Part 1 groups codes and moves unit and initial status to their work zones', async () => {
  const form = await read(formPath)
  const identifierZoneStart = form.indexOf('<fieldset className="full product-identifier-zone">')
  const identifierZoneEnd = form.indexOf('</div></fieldset>', identifierZoneStart)
  const identifierZone = form.slice(identifierZoneStart, identifierZoneEnd)
  assert.ok(identifierZoneStart > -1)
  assert.match(identifierZone, /รหัสสินค้า \(SKU\)/)
  assert.match(identifierZone, /รหัสขาย \/ รหัส CF ประจำสินค้า/)
  assert.match(identifierZone, /Barcode \/ รหัสสแกน/)
  assert.match(identifierZone, /product-identifier-assistant/)
  assert.doesNotMatch(identifierZone, /id="baseUnitCode"/)
  assert.ok(form.indexOf('id="baseUnitCode"') < identifierZoneStart)
  assert.match(form, /product-initial-status-summary/)
  assert.match(form, /สถานะหลังสร้าง/)
  assert.doesNotMatch(form, /name="initialStatus"/)
})

test('identifier UX Part 2 shows independent live status below every identifier field', async () => {
  const form = await read(formPath)
  assert.match(form, /type IdentifierStatusMap = Record<IdentifierStatusKey, Feedback>/)
  assert.match(form, /function applyIdentifierStatuses/)
  assert.match(form, /identifierStatuses\.skuCode\.text/)
  assert.match(form, /identifierStatuses\.salesCode\.text/)
  assert.match(form, /identifierStatuses\.barcode\.text/)
  assert.match(form, /รหัส \$\{values\.salesCode\} สามารถใช้ขายและรับ CF ได้/)
  assert.match(form, /collisionFields\.has\('sku_code'\)/)
  assert.match(form, /collisionFields\.has\('sales_code'\)/)
  assert.match(form, /collisionFields\.has\('barcode'\)/)
  assert.match(form, /product-identifier-field-status/)
})

test('identifier UX Part 3 auto-checks after debounce and blur with request bounds', async () => {
  const form = await read(formPath)
  assert.match(form, /IDENTIFIER_AUTO_CHECK_DEBOUNCE_MS = 650/)
  assert.match(form, /IDENTIFIER_AUTO_CHECK_MIN_INTERVAL_MS = 900/)
  assert.match(form, /identifierAutoCheckTimerRef/)
  assert.match(form, /identifierAutoCheckLastSignatureRef/)
  assert.match(form, /function scheduleIdentifierAutoCheck/)
  assert.match(form, /signature === identifierAutoCheckLastSignatureRef\.current/)
  assert.match(form, /Math\.max\(delay, IDENTIFIER_AUTO_CHECK_MIN_INTERVAL_MS - elapsed, 0\)/)
  assert.match(form, /checkIdentifiers\('auto'\)/)
  assert.match(form, /scheduleIdentifierAutoCheck\(0\)/)
  assert.match(form, /ระบบตรวจให้อัตโนมัติเมื่อหยุดพิมพ์หรือออกจากช่อง/)
  assert.match(form, /ตรวจสอบอีกครั้ง/)
})

test('identifier UX Part 4 recommends the next code and rechecks after one click', async () => {
  const form = await read(formPath)
  assert.match(form, /function nextIdentifierCode/)
  assert.match(form, /Number\(match\[2\]\) \+ 1/)
  assert.match(form, /identifierSuggestions/)
  assert.match(form, /function useIdentifierSuggestion/)
  assert.match(form, /setIdentifierSuggestions\(suggestions\)/)
  assert.match(form, /ใช้รหัสแนะนำ \{identifierSuggestions\.salesCode\}/)
  assert.match(form, /ใช้รหัสแนะนำ \{identifierSuggestions\.skuCode\}/)
  assert.match(form, /ใช้รหัสแนะนำ \{identifierSuggestions\.barcode\}/)
  assert.match(form, /scheduleIdentifierAutoCheck\(0\)/)
  assert.match(form, /salesCodeMode === 'same-sku' \? 'skuCode' : 'salesCode'/)
  assert.match(form, /field === 'salesCode' && salesCodeMode === 'sequence'/)
  assert.match(form, /setSalesSequenceOffset\(\(current\) => current \+ 1\)/)
})

test('identifier UX Part 5 creates and checks the complete identifier group from the zone header', async () => {
  const form = await read(formPath)
  assert.match(form, /product-identifier-zone-head/)
  assert.match(form, /สร้างและตรวจสอบรหัสทั้งหมด/)
  assert.match(form, /salesCodeMode === 'sequence'/)
  assert.match(form, /formatSalesSequence\(salesSequencePrefix, salesSequenceStart, salesSequenceDigits, salesSequenceOffset\)/)
  assert.match(form, /barcodeMode === 'internal-sku'/)
  assert.match(form, /barcodeMode === 'internal-sales'/)
  assert.match(form, /checkProductIdentifiersAction\(\{ organizationId, skuCode, salesCode, barcode \}\)/)
  assert.match(form, /สร้างและตรวจสอบรหัสทั้งหมดแล้ว/)
  const zoneHead = form.indexOf('product-identifier-zone-head')
  const skuField = form.indexOf('htmlFor="skuCode"', zoneHead)
  assert.ok(zoneHead > -1 && skuField > zoneHead)
})

test('identifier UX Part 6 supports novice, keyboard, screen-reader, mobile, and failure recovery flows', async () => {
  const [form, styles] = await Promise.all([read(formPath), read('../src/app/globals.css')])
  for (const field of ['skuCode', 'salesCode', 'barcode']) {
    assert.match(form, new RegExp(`aria-describedby="${field}Status ${field}Help"`))
    assert.match(form, new RegExp(`id="${field}Status"[\\s\\S]*?aria-live="polite" aria-atomic="true"`))
  }
  assert.match(form, /type="button" onClick=\{\(\) => checkIdentifiers\(\)\}/)
  assert.match(form, /markIdentifierStatusesFailed\('ตรวจสอบรหัสไม่สำเร็จ กรุณาลองอีกครั้ง'\)/)
  assert.match(form, /Session หมดอายุ กรุณาเข้าสู่ระบบใหม่แล้วตรวจอีกครั้ง/)
  assert.match(form, /บัญชีนี้ไม่มีสิทธิ์ตรวจรหัสของ Organization/)
  assert.match(form, /ตรวจสอบอีกครั้ง/)
  assert.match(styles, /\.product-identifier-suggestion:focus-visible/)
  assert.match(styles, /\.product-identifier-suggestion \{ min-height: 44px; \}/)
  assert.match(styles, /\.product-identifier-zone-head \{ align-items: stretch; flex-direction: column; \}/)
})

test('barcode choices use consistent user language and require their source code', async () => {
  const form = await read(formPath)
  assert.match(form, />กรอก Barcode จากผู้ผลิต</)
  assert.match(form, />ใช้รหัสสินค้า \(SKU\) เป็น Barcode</)
  assert.match(form, />ใช้รหัสขาย \/ รหัส CF เป็น Barcode</)
  assert.match(form, />ยังไม่กำหนด Barcode</)
  assert.match(form, /value="internal-sku" disabled=\{!summaryFields\.skuCode\}/)
  assert.match(form, /value="internal-sales" disabled=\{!summaryFields\.salesCode\}/)
  assert.match(form, /const barcodeSourceHelp = barcodeMode === 'internal-sku'/)
  assert.doesNotMatch(form, /สร้างรหัสภายในจาก (SKU Code|Sales Code)/)
})

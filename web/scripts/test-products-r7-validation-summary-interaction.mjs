import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import test from 'node:test'

const read = (path) => readFile(new URL(path, import.meta.url), 'utf8')
const formPath = '../src/app/organizations/[id]/products/new/unified-product-creation-form.tsx'
const stylesPath = '../src/app/globals.css'

test('R7.2.4E replaces fragmented client errors with one validation issue model', async () => {
  const form = await read(formPath)
  assert.match(form, /type ValidationIssue =/)
  assert.match(form, /function collectValidationIssues/)
  assert.match(form, /setValidationIssues\(issues\)/)
  assert.match(form, /if \(!validateBeforeCreate\(data\)\) return/)
})

test('R7.2.4E lists every issue in an accessible top summary', async () => {
  const form = await read(formPath)
  assert.match(form, /product-validation-summary/)
  assert.match(form, /role=\{validationIssues\.length \? 'alert' : 'status'\}/)
  assert.match(form, /aria-live="assertive" tabIndex=\{-1\}/)
  assert.match(form, /ตรวจพบ \$\{validationIssues\.length\} จุดที่ต้องแก้/)
})

test('R7.2.4E issue buttons scroll to, mark, and focus the matching control', async () => {
  const form = await read(formPath)
  assert.match(form, /function focusValidationIssue/)
  assert.match(form, /target\.scrollIntoView\(\{ behavior: 'smooth', block: 'center' \}\)/)
  assert.match(form, /target\.focus\(\{ preventScroll: true \}\)/)
  assert.match(form, /onClick=\{\(\) => focusValidationIssue\(issue\)\}/)
})

test('R7.2.4E owns validation presentation instead of browser-native bubbles', async () => {
  const form = await read(formPath)
  assert.match(form, /className="product-creation-layout" noValidate onSubmit=\{submit\}/)
  assert.match(form, /clearValidationMarkers\(\)/)
  assert.match(form, /data-validation-invalid/)
  assert.match(form, /aria-invalid/)
})

test('R7.2.4E validates required product, category, image, SKU, and price data', async () => {
  const form = await read(formPath)
  for (const message of ['กรุณากรอกชื่อสินค้า', 'กรุณาเลือกหมวดหมู่สินค้า', 'กรุณาเลือกรูปสินค้าอย่างน้อย 1 ภาพ', 'SKU แรก', 'กรุณากรอกราคาขายเป็นตัวเลขตั้งแต่ 0 ขึ้นไป']) assert.match(form, new RegExp(message))
})

test('R7.2.4E validates staged SKU state and requires a fresh identifier advisory check', async () => {
  const form = await read(formPath)
  assert.match(form, /if \(editingSkuDraftId\) add\('sku'/)
  assert.match(form, /if \(skuDrafts\.length > 1\) add\('sku'/)
  assert.match(form, /if \(skuDrafts\.length === 1 && currentSku\.skuCode\)/)
  assert.match(form, /identifierFeedback\.tone !== 'success'/)
})

test('R7.2.4E covers physical, packaging, bundle, and stock policy cross-field rules', async () => {
  const form = await read(formPath)
  assert.match(form, /physicalValidationErrors\(data\)/)
  assert.match(form, /packagingBundleValidationErrors\(payload\.quantity_behavior\)/)
  assert.match(form, /inventoryPolicyValidationErrors\(data\)/)
  assert.match(form, /hasNoSelectedSalesBranch\(\)/)
})

test('R7.2.4E connects validation counts and direct navigation to the summary timeline', async () => {
  const form = await read(formPath)
  assert.match(form, /validationIssueCountForSection/)
  assert.match(form, /data-invalid=\{issueCount \? 'true' : 'false'\}/)
  assert.match(form, /`\$\{issueCount\} จุดต้องแก้`/)
  assert.match(form, /focusValidationIssue\(firstIssue\)/)
})

test('R7.2.4E keeps bounded plain-text safety and server authority visible', async () => {
  const form = await read(formPath)
  assert.match(form, /FORBIDDEN_CONTROL_CHARACTERS\.test\(payload\.name\)/)
  assert.match(form, /byteLength > DRAFT_MAX_BYTES/)
  assert.match(form, /Server transaction เป็น Authority ขั้นสุดท้ายเสมอ/)
  assert.match(form, /commandType: 'product\.create_with_initial_sku'/)
})

test('R7.2.4E styles errors with semantic tokens in light and dark themes', async () => {
  const styles = await read(stylesPath)
  assert.match(styles, /\.product-validation-summary\.danger/)
  assert.match(styles, /var\(--status-danger-border\)/)
  assert.match(styles, /\.product-section-timeline a\[data-invalid="true"\]/)
  assert.match(styles, /\.product-creation-layout \[data-validation-invalid='true'\]/)
  assert.doesNotMatch(styles, /\.product-validation-summary[^\n]*#[0-9a-f]{3,8}/i)
})

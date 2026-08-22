import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import test from 'node:test'

const read = (path) => readFile(new URL(path, import.meta.url), 'utf8')
const formPath = '../src/app/organizations/[id]/products/new/unified-product-creation-form.tsx'
const stylesPath = '../src/app/globals.css'
const mockupPath = '../../docs/mockups/phase-2.1-unified-product-creation-form.html'

test('R7.2.5 keeps the approved 1280 desktop canvas and 300px summary rail', async () => {
  const styles = await read(stylesPath)
  assert.match(styles, /product-workspace-page\.product-creation-page \{ width: 100%; max-width: 1280px; \}/)
  assert.match(styles, /\.product-creation-layout \{[^}]*grid-template-columns: minmax\(0, 1fr\) 300px/)
  assert.match(styles, /\.product-creation-summary \{ position: sticky; top: 16px;/)
})

test('R7.2.5 applies approved wide-screen and intermediate workspace gutters', async () => {
  const styles = await read(stylesPath)
  assert.match(styles, /@media \(min-width: 1600px\)[\s\S]*padding-right: 48px; padding-left: 48px/)
  assert.match(styles, /@media \(min-width: 761px\) and \(max-width: 1279px\)[\s\S]*padding-right: 24px; padding-left: 24px/)
})

test('R7.2.5 collapses the summary rail before tablet width without horizontal page overflow', async () => {
  const styles = await read(stylesPath)
  assert.match(styles, /@container product-creation \(max-width: 980px\)[\s\S]*\.product-creation-layout \{ grid-template-columns: 1fr; \}/)
  assert.match(styles, /@container product-creation \(max-width: 980px\)[\s\S]*\.product-creation-summary \{ position: static; \}/)
  assert.match(styles, /@container product-creation \(max-width: 980px\)[\s\S]*\.product-section-timeline \{ display: none; \}/)
})

test('R7.2.5 stacks heading actions and all form grids at 760px', async () => {
  const styles = await read(stylesPath)
  assert.match(styles, /@media \(max-width: 760px\)[\s\S]*\.product-creation-heading \{ align-items: stretch; flex-direction: column; \}/)
  assert.match(styles, /\.product-form-grid\.two, \.product-form-grid\.three, \.product-form-grid\.four \{ grid-template-columns: 1fr; \}/)
  assert.match(styles, /\.product-branch-grid \{ grid-template-columns: 1fr; \}/)
})

test('R7.2.5 preserves 44px touch targets for mobile creation controls', async () => {
  const styles = await read(stylesPath)
  assert.match(styles, /\.product-creation-page \.button, \.product-physical-tab,[^}]*min-height: 44px; touch-action: manipulation;/)
  assert.match(styles, /\.product-image-actions button \{ width: 40px; min-height: 40px; touch-action: manipulation; \}/)
})

test('R7.2.5 makes validation issues readable at mobile widths', async () => {
  const styles = await read(stylesPath)
  assert.match(styles, /\.product-validation-summary li button \{ grid-template-columns: minmax\(0, 1fr\) auto; min-height: 44px; \}/)
  assert.match(styles, /\.product-validation-summary li button small \{ grid-column: 1 \/ -1; \}/)
  assert.match(styles, /\.product-validation-summary li button span:last-child \{ grid-column: 2; grid-row: 1; \}/)
})

test('R7.2.5 keeps image, SKU, packaging, and bundle content bounded', async () => {
  const styles = await read(stylesPath)
  assert.match(styles, /\.product-image-grid \{ grid-template-columns: repeat\(2, minmax\(0, 1fr\)\); \}/)
  assert.match(styles, /\.product-editor-scroll \{ max-width: 100%; overflow-x: auto;/)
  assert.match(styles, /\.product-editor-table \{ width: 100%; min-width: 1120px;/)
})

test('R7.2.5 stacks dialogs and success destinations safely at 480px', async () => {
  const styles = await read(stylesPath)
  assert.match(styles, /@media \(max-width: 480px\)[\s\S]*\.product-system-metadata \{ grid-template-columns: 1fr; \}/)
  assert.match(styles, /@media \(max-width: 480px\)[\s\S]*\.product-security-summary ul \{ grid-template-columns: 1fr; \}/)
  assert.match(styles, /\.product-success-dialog footer \{ grid-template-columns: 1fr; \}/)
})

test('R7.2.5 uses semantic surfaces for Light and Dark instead of white alert panels', async () => {
  const styles = await read(stylesPath)
  for (const token of ['--surface-elevated', '--status-danger-surface', '--status-success-surface', '--status-info-surface']) assert.match(styles, new RegExp(`var\\(${token}\\)`))
  assert.match(styles, /\[data-theme="dark"\] \.product-creation-page \.product-primary-action/)
  assert.match(styles, /\[data-theme="dark"\] \.product-creation-card > header > span/)
})

test('draft save confirmation stays visible at the top center of the viewport', async () => {
  const [styles, form] = await Promise.all([read(stylesPath), read(formPath)])
  assert.match(styles, /\.product-draft-save-toast \{[^}]*position: fixed;[^}]*top: 18px;[^}]*left: 50%;/)
  assert.match(styles, /@keyframes product-draft-toast-in[^}]*translate\(-50%, -10px\)/)
  assert.match(form, /window\.setTimeout\([\s\S]*?10000\)/)
  assert.match(form, /product-draft-save-countdown/)
})

test('R7.2.5 production hierarchy matches approved mockup sections and actions', async () => {
  const [form, mockup] = await Promise.all([read(formPath), read(mockupPath)])
  for (const text of ['ข้อมูลทั่วไป', 'รูปสินค้า', 'SKU แรกและรหัสสินค้า', 'ราคาและภาษี', 'น้ำหนักและขนาด', 'หน่วยบรรจุและ Bundle', 'สาขาและนโยบายสต๊อก', 'ข้อมูลระบบ', 'สรุปก่อนสร้าง', 'ตรวจสอบและสร้าง', 'บันทึกร่าง']) {
    assert.match(form, new RegExp(text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')))
    assert.match(mockup, new RegExp(text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')))
  }
  assert.match(form, /กลับหน้าสินค้า/)
  assert.match(mockup, /ยกเลิก/)
})

test('R7.2.5 keeps prototype-only controls outside the production page', async () => {
  const form = await read(formPath)
  assert.doesNotMatch(form, /UI Prototype · Mock data only/)
  assert.doesNotMatch(form, />Reset</)
  assert.doesNotMatch(form, /สลับ Theme/)
  assert.match(form, /พร้อมสร้างสินค้า/)
  assert.doesNotMatch(form, /UI Simulation|UI ทดลอง|Local Backend|PREVIEW|Production|Validation &amp; Security Guardrails/)
})

test('R7.2.5 retains accessible modal, tabs, status, and summary semantics', async () => {
  const form = await read(formPath)
  assert.match(form, /role="dialog" aria-modal="true"/)
  assert.match(form, /role="tablist" aria-label="ชนิดน้ำหนักและขนาด"/)
  assert.match(form, /role="progressbar"/)
  assert.match(form, /navigation "ความคืบหน้าการสร้างสินค้า"|aria-label="ความคืบหน้าการสร้างสินค้า"/)
})

import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import test from 'node:test'

const read = (path) => readFile(new URL(path, import.meta.url), 'utf8')
const formPath = '../src/app/organizations/[id]/products/new/unified-product-creation-form.tsx'

test('R7.2.2 keeps the approved heading, production note and required guide hierarchy', async () => {
  const form = await read(formPath)
  assert.match(form, /Part 2\.1\.4A · Unified Product Creation/)
  assert.match(form, /สร้าง Product, รูปภาพ, SKU แรก และข้อมูลการขายจากหน้าเดียว/)
  assert.match(form, /product-production-banner/)
  assert.match(form, /เชื่อมระบบจริงแล้ว/)
  assert.match(form, /product-required-guide/)
  assert.match(form, /ช่องที่มีเครื่องหมาย \* จำเป็นต้องกรอก/)
  assert.doesNotMatch(form, /Interaction Prototype เท่านั้น/)
})

test('R7.2.2 exposes one continuous surface and a truthful empty-master state', async () => {
  const [form, styles] = await Promise.all([read(formPath), read('../src/app/globals.css')])
  assert.match(form, /className="product-creation-sections"/)
  assert.match(form, /product-master-state-alert/)
  assert.match(styles, /\.product-creation-sections \{[^}]*overflow: hidden[^}]*border:/)
  assert.match(styles, /\.product-creation-card \{[^}]*border-bottom:/)
  assert.match(styles, /\.product-creation-card:last-child \{ border-bottom: 0; \}/)
})

test('R7.2.2 summary mirrors the approved progress, facts, timeline and action order', async () => {
  const [form, styles] = await Promise.all([read(formPath), read('../src/app/globals.css')])
  assert.match(form, /role="progressbar"/)
  assert.match(form, /กรอกข้อมูลแล้ว \{completionPercent\}%/)
  for (const fact of ['รูปแบบ', 'SKU', 'ราคา', 'รูปภาพ', 'สาขา', 'หน่วยบรรจุ', 'Bundle']) {
    assert.match(form, new RegExp(`<dt>${fact}</dt>`))
  }
  assert.match(form, /product-section-timeline/)
  assert.match(form, /กำลังกรอก/)
  assert.match(form, /เสร็จแล้ว/)
  assert.match(styles, /\.product-section-timeline::before/)
  assert.match(form, /product-summary-actions[\s\S]*ตรวจสอบและสร้าง[\s\S]*บันทึกร่าง[\s\S]*ยกเลิก/)
})

test('R7.2.2 uses the approved responsive canvas and action hierarchy', async () => {
  const styles = await read('../src/app/globals.css')
  assert.match(styles, /product-workspace-page\.product-creation-page \{ width: 100%; max-width: 1280px; \}/)
  assert.match(styles, /grid-template-columns: minmax\(0, 1fr\) 300px/)
  assert.match(styles, /@container product-creation \(max-width: 980px\)/)
  assert.match(styles, /\.product-creation-heading \.button-row \{ display: grid; grid-template-columns: 1fr 1fr; \}/)
  assert.match(styles, /\.product-creation-heading \.button-row \.button:last-child \{ grid-column: 1 \/ -1; \}/)
})

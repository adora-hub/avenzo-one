import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import test from 'node:test'

const read = (path) => readFile(new URL(path, import.meta.url), 'utf8')
const formPath = '../src/app/organizations/[id]/products/new/unified-product-creation-form.tsx'

test('R7.2.3H renders the approved Section 8 heading and status', async () => {
  const form = await read(formPath)
  assert.match(form, /<h2>ข้อมูลระบบ<\/h2>/)
  assert.match(form, /ระบบสร้างอัตโนมัติและแสดงแบบอ่านอย่างเดียวหลังบันทึก/)
  assert.match(form, /<small>Read-only<\/small>/)
})

test('R7.2.3H renders Created Updated and Creator as read-only metadata', async () => {
  const form = await read(formPath)
  const section = form.slice(form.indexOf('<section id="metadata"'), form.indexOf('</section>', form.indexOf('<section id="metadata"')))
  assert.match(section, /<dt>วันที่สร้าง<\/dt><dd>กำหนดหลังบันทึก<\/dd>/)
  assert.match(section, /<dt>แก้ไขล่าสุด<\/dt><dd>กำหนดหลังบันทึก<\/dd>/)
  assert.match(section, /<dt>ผู้สร้าง<\/dt><dd>\{actorEmail \|\| 'ผู้ใช้ที่เข้าสู่ระบบปัจจุบัน'\}<\/dd>/)
  assert.doesNotMatch(section, /<dt>Organization<\/dt>|<dt>สถานะเริ่มต้น<\/dt>/)
})

test('R7.2.3H renders the approved validation and security guardrail topics', async () => {
  const form = await read(formPath)
  assert.match(form, /Validation &amp; Security Guardrails/)
  for (const topic of ['Plain text, Normalize', 'Code ใช้ A–Z, 0–9', 'Min\/Max และตรวจ Cross-field', 'Browser Draft ไม่เกิน 256 KB', 'Organization, Actor และ Permission มาจาก Session ฝั่ง Server']) {
    assert.match(form, new RegExp(topic))
  }
})

test('R7.2.3H enforces the 256 KB Browser Draft limit without storing image files', async () => {
  const form = await read(formPath)
  assert.match(form, /const DRAFT_MAX_BYTES = 256 \* 1024/)
  assert.match(form, /new TextEncoder\(\)\.encode\(serializedDraft\)\.byteLength > DRAFT_MAX_BYTES/)
  assert.match(form, /Browser Draft มีขนาดเกิน 256 KB/)
  const draft = form.slice(form.indexOf('function saveBrowserDraft'), form.indexOf('function setFormFieldValue'))
  assert.doesNotMatch(draft, /images[,}]/)
})

test('R7.2.3H discloses current Image Gate coverage and the remaining hardening gap', async () => {
  const form = await read(formPath)
  assert.match(form, /Image Gate ตรวจ MIME และขนาด/)
  assert.match(form, /Magic bytes, Decode\/Re-encode และ Strip EXIF ยังเป็น Security hardening ที่ต้องปิดก่อน Production/)
  assert.match(form, /Image content hardening ยังเป็น Known gap/)
  assert.match(form, /Server ยังเป็น Authority เสมอ/)
})

test('R7.2.3H applies approved metadata and responsive security summary styles', async () => {
  const styles = await read('../src/app/globals.css')
  assert.match(styles, /\.product-system-metadata \{[^}]*grid-template-columns: repeat\(3, minmax\(0, 1fr\)\)/)
  assert.match(styles, /\.product-security-summary \{/)
  assert.match(styles, /\.product-security-summary ul \{[^}]*grid-template-columns: repeat\(2, minmax\(0, 1fr\)\)/)
  assert.match(styles, /\.product-security-validation-status\.warning/)
  assert.match(styles, /\.product-security-summary ul \{ grid-template-columns: 1fr; \}/)
})

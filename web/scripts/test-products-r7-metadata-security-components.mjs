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

test('R7.2.3H keeps developer validation and security notes off the user page', async () => {
  const form = await read(formPath)
  assert.doesNotMatch(form, /Validation &amp; Security Guardrails/)
  assert.doesNotMatch(form, /Plain text, Normalize|Organization, Actor และ Permission|Known gap|Server ยังเป็น Authority/)
})

test('R7.2.3H enforces the 256 KB local draft limit without storing image files', async () => {
  const form = await read(formPath)
  assert.match(form, /const DRAFT_MAX_BYTES = 256 \* 1024/)
  assert.match(form, /new TextEncoder\(\)\.encode\(serializedDraft\)\.byteLength > DRAFT_MAX_BYTES/)
  assert.match(form, /ข้อมูลร่างบนอุปกรณ์มีขนาดเกิน 256 KB/)
  const draft = form.slice(form.indexOf('function saveBrowserDraft'), form.indexOf('function setFormFieldValue'))
  assert.doesNotMatch(draft, /images[,}]/)
})

test('R7.2.3H describes image checks without exposing development terminology', async () => {
  const form = await read(formPath)
  assert.doesNotMatch(form, /Image Gate|Magic bytes|Decode\/Re-encode|Strip EXIF|Production|Known gap/)
})

test('R7.2.3H applies approved metadata responsive styles', async () => {
  const styles = await read('../src/app/globals.css')
  assert.match(styles, /\.product-system-metadata \{[^}]*grid-template-columns: repeat\(3, minmax\(0, 1fr\)\)/)
  assert.match(styles, /@media \(max-width: 480px\)[\s\S]*\.product-system-metadata \{ grid-template-columns: 1fr; \}/)
})

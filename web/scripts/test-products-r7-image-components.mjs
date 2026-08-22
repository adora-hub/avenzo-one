import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import test from 'node:test'

const read = (path) => readFile(new URL(path, import.meta.url), 'utf8')
const formPath = '../src/app/organizations/[id]/products/new/unified-product-creation-form.tsx'

test('R7.2.3B renders the approved image count, real-file toolbar and cover note', async () => {
  const form = await read(formPath)
  assert.match(form, /product-section-status[^<]*>\{images\.length\} \/ \{PRODUCT_IMAGE_MAX_FILES\} ภาพ/)
  assert.match(form, /product-image-toolbar/)
  assert.match(form, /เลือกภาพจากเครื่อง/)
  assert.match(form, /ภาพแรกเป็นภาพปกโดยอัตโนมัติ/)
  assert.doesNotMatch(form, /เพิ่มภาพจำลอง/)
  assert.match(form, /product-image-empty-interactive/)
  assert.match(form, /onDrop=\{dropProductImages\}/)
  assert.match(form, /คลิกหรือลากรูปสินค้ามาวาง/)
})

test('R7.2.3B uses the approved empty and populated image-grid composition', async () => {
  const [form, styles] = await Promise.all([read(formPath), read('../src/app/globals.css')])
  assert.match(form, /import Image from 'next\/image'/)
  assert.match(form, /product-image-grid/)
  assert.match(form, /product-image-empty/)
  assert.match(form, /ยังไม่มีรูปสินค้า/)
  assert.match(form, /<Image[^>]*width=\{600\} height=\{600\}[^>]*unoptimized/)
  assert.match(styles, /\.product-image-grid \{[^}]*repeat\(4, minmax\(0, 1fr\)\)/)
  assert.match(styles, /\.product-image-media \{[^}]*aspect-ratio: 1/)
})

test('Image-UI keeps a green click and drop tile available until all nine images are selected', async () => {
  const [form, styles] = await Promise.all([read(formPath), read('../src/app/globals.css')])
  assert.match(form, /images\.length < PRODUCT_IMAGE_MAX_FILES \? <label/)
  assert.match(form, /คลิกหรือลากรูปเพิ่ม/)
  assert.match(form, /เพิ่มได้อีก \$\{PRODUCT_IMAGE_MAX_FILES - images\.length\} ภาพ/)
  assert.match(form, /product-image-empty-icon/)
  assert.match(styles, /\.product-image-empty \{[^}]*var\(--status-success-surface\)/)
  assert.match(styles, /\.product-image-grid\.has-images \.product-image-empty \{[^}]*grid-column: auto;[^}]*aspect-ratio: 1;/)
})

test('R7.2.3B supports reorder, explicit cover selection and removal', async () => {
  const form = await read(formPath)
  assert.match(form, /function setCoverImage\(index: number\)/)
  assert.match(form, /copy\.unshift\(cover\)/)
  for (const label of ['เลื่อนภาพไปซ้าย', 'ตั้งเป็นภาพปก', 'เลื่อนภาพไปขวา', 'ลบภาพ']) {
    assert.match(form, new RegExp(label))
  }
  assert.match(form, /aria-pressed=\{index === 0\}/)
})

test('R7.2.3B displays the approved image policy and live upload status', async () => {
  const form = await read(formPath)
  assert.match(form, /รองรับ JPEG, PNG และ WebP/)
  assert.match(form, /MB ต่อภาพ · แนะนำภาพสี่เหลี่ยม 1200 × 1200 px/)
  assert.match(form, /product-image-upload-status/)
  assert.match(form, /aria-live="polite"/)
  assert.match(form, /failedImageCount/)
  assert.match(form, /readyImageCount/)
})

test('R7.2.3B preserves the R6 image gate and responsive two-column contract', async () => {
  const [form, styles] = await Promise.all([read(formPath), read('../src/app/globals.css')])
  assert.match(form, /PRODUCT_IMAGE_ALLOWED_MIME_TYPES/)
  assert.match(form, /PRODUCT_IMAGE_MAX_BYTES/)
  assert.match(form, /PRODUCT_IMAGE_MAX_FILES/)
  assert.match(form, /commandType: 'product\.image\.prepare'/)
  assert.match(form, /uploadPreparedProductImage\(supabase, reservation, image\.file\)/)
  assert.match(form, /commandType: 'product\.image\.finalize'/)
  assert.match(form, /commandType: 'product\.images\.reorder'/)
  assert.match(styles, /@media \(max-width: 760px\)[\s\S]*\.product-image-grid \{ grid-template-columns: repeat\(2, minmax\(0, 1fr\)\); \}/)
  assert.match(styles, /\.product-image-actions button \{ width: 40px; min-height: 40px; touch-action: manipulation; \}/)
})

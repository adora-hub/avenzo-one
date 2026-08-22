import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import test from 'node:test'

const read = (path) => readFile(new URL(path, import.meta.url), 'utf8')

test('Product Creation permits a Draft without images and keeps the Image Gate for selected files', async () => {
  const form = await read('../src/app/organizations/[id]/products/new/unified-product-creation-form.tsx')

  assert.match(form, /รูปภาพไม่บังคับและจะผ่าน Image Gate เมื่อเลือกอัปโหลด/)
  assert.match(form, /ไม่บังคับ · เพิ่มได้สูงสุด 9 ภาพ/)
  assert.match(form, /ยังไม่ใส่รูปก็สร้างสินค้าได้ และเพิ่มภายหลังได้/)
  assert.doesNotMatch(form, /if \(images\.length < 1\) add\('images'/)
  assert.doesNotMatch(form, /errors\.push\('รูปสินค้าอย่างน้อย 1 ภาพ'\)/)
  assert.match(form, /images\.some\(\(image\) => image\.stage === 'failed'\)/)
  assert.match(form, /PRODUCT_IMAGE_MAX_FILES/)
  assert.match(form, /uploadPreparedProductImage/)
})

test('Optional images do not reduce completion or queue readiness', async () => {
  const form = await read('../src/app/organizations/[id]/products/new/unified-product-creation-form.tsx')
  const completionChecks = form.slice(form.indexOf('const completionChecks ='), form.indexOf('const completionPercent ='))

  assert.match(form, /images: true,/)
  assert.match(form, /\{ id: 'images', label: 'รูปสินค้า', optional: true \}/)
  assert.match(form, /!section\.optional && section\.id !== 'metadata' && !sectionCompletion\[section\.id\]/)
  assert.doesNotMatch(completionChecks, /sectionCompletion\.images/)
  assert.doesNotMatch(form, /queueCompleteCount[\s\S]{0,900}draftImages\.some/)
  assert.match(form, /โดยยังไม่มีรูปสินค้า สามารถเพิ่มรูปภายหลังได้/)
})

test('Optional image section starts collapsed and reopens only when useful', async () => {
  const form = await read('../src/app/organizations/[id]/products/new/unified-product-creation-form.tsx')

  assert.match(form, /const \[imagesSectionOpen, setImagesSectionOpen\] = useState\(false\)/)
  assert.match(form, /setImagesSectionOpen\(false\)[\s\S]{0,120}setImageFeedback\(null\)/)
  assert.match(form, /setImagesSectionOpen\(restoredImages\.length > 0\)/)
  assert.match(form, /if \(stage === 'failed'\) setImagesSectionOpen\(true\)/)
  assert.match(form, /issue\.sectionId === 'images' && !imagesSectionOpen[\s\S]{0,100}setImagesSectionOpen\(true\)/)
})

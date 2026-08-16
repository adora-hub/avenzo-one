import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import test from 'node:test'

const read = (path) => readFile(new URL(path, import.meta.url), 'utf8')
const formPath = '../src/app/organizations/[id]/products/new/unified-product-creation-form.tsx'
const stylesPath = '../src/app/globals.css'

test('R7.2.4F validates and bounds the durable pending-recovery record', async () => {
  const form = await read(formPath)
  assert.match(form, /function sanitizePendingDraft/)
  assert.match(form, /UUID_PATTERN\.test\(productId\)/)
  assert.match(form, /UUID_PATTERN\.test\(skuId\)/)
  assert.match(form, /productName.*slice\(0, 160\)/)
  assert.match(form, /FORBIDDEN_CONTROL_CHARACTERS\.test\(productName\)/)
})

test('R7.2.4F restores only a valid recovery record and removes unsafe storage', async () => {
  const form = await read(formPath)
  assert.match(form, /const restored = sanitizePendingDraft\(JSON\.parse\(pendingRaw\)\)/)
  assert.match(form, /if \(restored\) setPendingDraft\(restored\)/)
  assert.match(form, /else window\.localStorage\.removeItem\(pendingDraftKey\)/)
})

test('R7.2.4F recovery validates only replacement images instead of stale creation fields', async () => {
  const form = await read(formPath)
  assert.match(form, /if \(pendingDraft\) \{[\s\S]*กรุณาเลือกภาพใหม่อย่างน้อย 1 ภาพเพื่ออัปโหลดต่อ[\s\S]*return issues/)
  assert.ok(form.indexOf('if (pendingDraft) {') < form.indexOf("if (!payload.name) add('general'"))
})

test('R7.2.4F reuses the original Product without repeating the atomic command', async () => {
  const form = await read(formPath)
  assert.match(form, /let recovery = pendingDraft/)
  assert.match(form, /if \(!recovery\) \{[\s\S]*commandType: 'product\.create_with_initial_sku'/)
  assert.match(form, /uploadImages\(recovery\.productId, recovery\.productName\)/)
})

test('R7.2.4F preserves pending recovery when any image upload fails', async () => {
  const form = await read(formPath)
  assert.match(form, /setPendingDraft\(recovery\)/)
  assert.match(form, /window\.localStorage\.setItem\(pendingDraftKey, JSON\.stringify\(recovery\)\)/)
  assert.match(form, /ข้อมูลหลักถูกบันทึกเป็น Draft แล้ว แต่อัปโหลดรูปไม่สำเร็จ/)
  assert.match(form, /กด “อัปโหลดต่อ” ได้โดยไม่สร้างสินค้าซ้ำ/)
})

test('R7.2.4F renders an explicit recovery state with retry and safe Product access', async () => {
  const form = await read(formPath)
  assert.match(form, /กู้คืนงานสร้างสินค้าที่อัปโหลดภาพไม่ครบ/)
  assert.match(form, /ระบบจะใช้ Product ID เดิมและไม่สร้างซ้ำ/)
  assert.match(form, /onClick=\{focusRecoveryImages\}>เลือกภาพใหม่/)
  assert.match(form, /เปิด Product Draft/)
})

test('R7.2.4F opens the approved success dialog only after image completion', async () => {
  const form = await read(formPath)
  assert.ok(form.indexOf('if (failedCount > 0)') < form.indexOf('setCreationSuccess({'))
  assert.match(form, /สร้างสินค้าเรียบร้อยแล้ว/)
  assert.match(form, /พร้อม \{creationSuccess\.skuCount\} SKU ถูกสร้างเป็นฉบับร่าง/)
  assert.match(form, /role="dialog" aria-modal="true"/)
})

test('R7.2.4F traps dialog focus, supports Escape, and restores prior focus', async () => {
  const form = await read(formPath)
  assert.match(form, /function handleSuccessDialogKeyDown/)
  assert.match(form, /event\.key === 'Escape'/)
  assert.match(form, /event\.key !== 'Tab'/)
  assert.match(form, /successReturnFocusRef\.current\?\.focus\(\)/)
})

test('R7.2.4F offers truthful post-create destinations without stock side effects', async () => {
  const form = await read(formPath)
  assert.match(form, /ดูรายละเอียดสินค้าที่สร้าง/)
  assert.match(form, /กลับไปหน้ารายการสินค้า/)
  assert.match(form, /สร้างสินค้ารายการถัดไป/)
  assert.match(form, /function createNextProduct\(\)/)
  assert.match(form, /window\.location\.assign\(`\/organizations\/\$\{organizationId\}\/products\/new`\)/)
  assert.match(form, /ยังไม่เพิ่ม Stock/)
  assert.doesNotMatch(form, /commandType: 'inventory\./)
})

test('R7.2.4F uses approved semantic modal and responsive recovery styles', async () => {
  const styles = await read(stylesPath)
  assert.match(styles, /\.product-success-backdrop/)
  assert.match(styles, /\.product-success-dialog \{/)
  assert.match(styles, /\.product-success-mark/)
  assert.match(styles, /\.product-success-actions/)
  assert.match(styles, /\.product-success-detail-link/)
  assert.match(styles, /var\(--status-success-surface\)/)
  assert.match(styles, /\.product-recovery-actions/)
  assert.match(styles, /\.product-success-dialog footer \{ grid-template-columns: 1fr; \}/)
})

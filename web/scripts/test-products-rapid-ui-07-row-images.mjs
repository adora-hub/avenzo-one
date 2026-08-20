import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import test from 'node:test'

const tablePath = new URL('../src/app/organizations/[id]/products/live-sale/rapid-entry/rapid-entry-table.tsx', import.meta.url)
const stylesPath = new URL('../src/app/globals.css', import.meta.url)

test('Rapid-UI-07 accepts one JPEG, PNG or WebP cover image per row', async () => {
  const source = await readFile(tablePath, 'utf8')
  assert.match(source, /ALLOWED_IMAGE_TYPES = new Set\(\['image\/jpeg', 'image\/png', 'image\/webp'\]\)/)
  assert.match(source, /MAX_IMAGE_BYTES = 5 \* 1024 \* 1024/)
  assert.match(source, /accept="image\/jpeg,image\/png,image\/webp"/)
  assert.match(source, /รูปภาพต้องมีขนาดไม่เกิน 5 MB/)
})

test('Rapid-UI-07 supports click selection and drag-drop on an individual row', async () => {
  const source = await readFile(tablePath, 'utf8')
  assert.match(source, /function dropRowImage\(/)
  assert.match(source, /onDragEnter=/)
  assert.match(source, /onDragOver=/)
  assert.match(source, /onDrop=\{\(event\) => dropRowImage\(event, row\.index\)\}/)
  assert.match(source, /setRowImage\(row\.index, event\.currentTarget\.files\?\.\[0\]\)/)
})

test('Rapid-UI-07 provides a square preview with icon-only replace and remove actions', async () => {
  const source = await readFile(tablePath, 'utf8')
  const styles = await readFile(stylesPath, 'utf8')
  assert.match(source, /className="live-sale-rapid-image-preview"/)
  assert.match(source, /data-tooltip="เปลี่ยนภาพ"/)
  assert.match(source, /data-tooltip="นำภาพออก"/)
  assert.match(source, /aria-label=\{`นำภาพรหัส \$\{row\.salesCode\} ออก`\}/)
  assert.match(styles, /\.live-sale-rapid-image-preview \{[^}]*object-fit: cover;/)
})

test('Rapid-UI-07 exposes top tooltips and keyboard-accessible file inputs', async () => {
  const source = await readFile(tablePath, 'utf8')
  const styles = await readFile(stylesPath, 'utf8')
  assert.match(source, /aria-label=\{`เลือกภาพปกรหัส \$\{row\.salesCode\}`\}/)
  assert.match(styles, /bottom: calc\(100% \+ 7px\)/)
  assert.match(styles, /\.live-sale-rapid-image-placeholder input, \.live-sale-rapid-image-preview-trigger input, \.live-sale-rapid-image-action input/)
})

test('Rapid-UI-07 revokes replaced, removed, range-reset and unmounted previews', async () => {
  const source = await readFile(tablePath, 'utf8')
  assert.match(source, /URL\.createObjectURL\(file\)/)
  assert.match(source, /URL\.revokeObjectURL\(url\)/)
  assert.match(source, /if \(row\.image\) revokeImageUrl\(row\.image\.previewUrl\)/)
  assert.match(source, /useEffect\(\(\) => \(\) => revokeAllImageUrls\(\), \[\]\)/)
  assert.match(source, /rangeIdentityRef\.current !== rangeIdentity/)
})

test('Rapid-UI-07 remains a browser preview and does not upload to a backend', async () => {
  const source = await readFile(tablePath, 'utf8')
  assert.doesNotMatch(source, /supabase\.storage|product\.image\.prepare|product\.image\.finalize|fetch\(/)
})

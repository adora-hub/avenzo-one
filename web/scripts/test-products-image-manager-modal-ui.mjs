import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import test from 'node:test'

const read = (path) => readFile(new URL(path, import.meta.url), 'utf8')

test('IMAGE-EDIT-01 opens a dedicated product image manager from both approved entry points', async () => {
  const page = await read('../src/app/organizations/[id]/products/page.tsx')
  const workspace = await read('../src/app/organizations/[id]/products/product-sku-workspace.tsx')
  const detail = await read('../src/app/organizations/[id]/products/product-detail-sheet.tsx')
  const grid = await read('../src/app/organizations/[id]/products/products-data-grid.tsx')

  assert.match(page, /requestedProductAction === 'images'/)
  assert.match(workspace, /ProductImageManagerModal/)
  assert.match(workspace, /editorMode === 'manage-images'/)
  assert.match(detail, /จัดการรูปภาพ/)
  assert.match(grid, /<strong>จัดการรูปภาพ<\/strong>/)
})

test('IMAGE-EDIT-02 supports repeated click selection, multi-file drop and guarded image validation', async () => {
  const modal = await read('../src/app/organizations/[id]/products/product-image-manager-modal.tsx')

  assert.match(modal, /function addFiles\(fileList: FileList \| File\[\]\)/)
  assert.match(modal, /multiple onChange=/)
  assert.match(modal, /onDrop=\{dropFiles\}/)
  assert.match(modal, /validateProductImageFile\(file\)/)
  assert.match(modal, /PRODUCT_IMAGE_MAX_FILES/)
  assert.match(modal, /JPEG, PNG หรือ WebP ขนาดไม่เกิน 5 MB/)
})

test('IMAGE-EDIT-03 provides cover, replace, remove and two accessible reorder methods without backend writes', async () => {
  const modal = await read('../src/app/organizations/[id]/products/product-image-manager-modal.tsx')

  assert.match(modal, /function setCover\(itemId: string\)/)
  assert.match(modal, /return \[\s*\{ \.\.\.selected, isCover: true \},/)
  assert.match(modal, /filter\(\(item\) => item\.id !== itemId\)/)
  assert.match(modal, /function replaceImage\(itemId: string/)
  assert.match(modal, /function removeImage\(itemId: string\)/)
  assert.match(modal, /function moveImage\(itemId: string, direction: -1 \| 1\)/)
  assert.match(modal, /function reorderDroppedItem\(targetId: string\)/)
  assert.match(modal, /role="dialog" aria-modal="true"/)
  assert.match(modal, /การเปลี่ยนแปลงยังไม่ถูกบันทึก/)
  assert.doesNotMatch(modal, /executeFoundationCommandAction|createClient|supabase|fetch\(/)
})

test('image manager uses the standard fixed header, scrollable body and fixed footer modal frame', async () => {
  const css = await read('../src/app/globals.css')

  assert.match(css, /\.product-image-manager-dialog \{[^}]*grid-template-rows: auto minmax\(0, 1fr\) auto/)
  assert.match(css, /\.product-image-manager-body \{[^}]*overflow-y: auto/)
  assert.match(css, /\.product-image-manager-footer \{[^}]*min-height: 74px/)
  assert.match(css, /\.product-image-manager-grid \{[^}]*repeat\(3, minmax\(0, 1fr\)\)/)
  assert.match(css, /\.product-image-manager-close \{[^}]*width: 40px;[^}]*height: 40px;[^}]*border-radius: 9px/)
  assert.match(css, /\.product-image-manager-upload-button \{[^}]*height: 40px;[^}]*border-radius: 9px;[^}]*font-size: 13px/)
  assert.match(css, /\.product-image-manager-footer \.button \{[^}]*height: 40px;[^}]*border-radius: 9px;[^}]*font-size: 13px/)
  assert.match(css, /\.product-image-manager-footer \.button:not\(\.secondary\) \{[^}]*background: #111217/)
  assert.match(css, /\.product-image-manager-dialog \.button\.secondary \{[^}]*background: var\(--surface-elevated\)/)
  assert.match(css, /\.product-image-manager-dialog \.button:disabled \{[^}]*cursor: not-allowed;[^}]*opacity: 1/)
  assert.match(css, /@media \(max-width: 520px\)/)
})

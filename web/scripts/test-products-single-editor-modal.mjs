import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import test from 'node:test'
import { fileURLToPath } from 'node:url'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const source = fs.readFileSync(path.join(root, 'src/app/organizations/[id]/products/product-sku-workspace.tsx'), 'utf8')
const styles = fs.readFileSync(path.join(root, 'src/app/globals.css'), 'utf8')

test('route edit opens one editor modal without rendering Quick View behind it', () => {
  assert.match(source, /useState<EditorMode>\(\(\) => \{[\s\S]*productAction === 'edit'[\s\S]*return 'edit-product'/)
  assert.match(source, /\{!editorMode && productAction === '' \? <ProductDetailSheet[\s\S]*\/> : null\}/)
  assert.match(source, /product-single-editor-dialog" role="dialog" aria-modal="true"/)
})

test('editor close returns route-based editing to the product list', () => {
  assert.match(source, /function closeEditor\(\) \{[\s\S]*productAction === 'skus' && editorMode !== 'manage-skus'[\s\S]*setEditorMode\('manage-skus'\)[\s\S]*productAction === 'edit' \|\| productAction === 'skus' \|\| productAction === 'price'[\s\S]*router\.replace\(closeDetailHref\)[\s\S]*else setEditorMode\(null\)/)
  assert.match(source, /productAction === '' && \(editorMode === 'manage-skus' \|\| editorMode === 'manage-images' \|\| editorMode === 'edit-product' \|\| editorMode === 'edit-price'\)/)
  assert.match(source, /aria-label="ปิดหน้าต่าง"[\s\S]*onClick=\{closeEditor\}/)
})

test('cancel from a SKU child editor returns to the SKU manager', () => {
  assert.match(source, /function closeOnEscape[\s\S]*productAction === 'skus' && editorMode !== 'manage-skus'[\s\S]*setEditorMode\('manage-skus'\)/)
  assert.match(source, /function closeEditor\(\)[\s\S]*productAction === 'skus' && editorMode !== 'manage-skus'[\s\S]*setFeedback\(null\)[\s\S]*setEditorMode\('manage-skus'\)[\s\S]*return/)
})

test('manage SKU route opens a dedicated manager modal instead of Quick View', () => {
  assert.match(source, /productAction === 'skus' && canManage[\s\S]*return 'manage-skus'/)
  assert.match(source, /editorMode === 'manage-skus' \? 'จัดการ SKU \/ ตัวเลือก'/)
  assert.match(source, /className="product-sku-manager-table"/)
  assert.match(source, />รหัสขาย \/ CF</)
  assert.match(source, />แก้ไข SKU</)
  assert.match(source, />แก้ราคา</)
  assert.match(styles, /\.product-sku-manager-table \{[^}]*min-width: 860px/)
})

test('product editor follows the approved modal copy and hierarchy', () => {
  const editor = source.slice(source.indexOf("{editorMode === 'edit-product'"), source.indexOf("{editorMode === 'edit-price'"))
  assert.match(source, /editorMode === 'manage-skus' \? 'SKU \/ ตัวเลือก' : 'ข้อมูลสินค้า'/)
  assert.match(source, /'แก้ไขข้อมูลสินค้า'/)
  assert.match(editor, /product-complete-editor-step">1<[\s\S]*>ข้อมูลทั่วไป</)
  assert.match(editor, /product-complete-editor-step">2<[\s\S]*>หมวดหมู่และการจัดกลุ่ม</)
  assert.match(editor, /product-complete-editor-step">3<[\s\S]*>ข้อมูลส่วนกลาง</)
  assert.doesNotMatch(editor, /รูปภาพ|ภาพปก|product-editor-image/)
  assert.match(source, /name="categoryId"/)
  assert.match(source, /name="brandId"/)
  assert.match(source, /product-select-control"><select name="categoryId"/)
  assert.match(source, /product-select-control"><select name="brandId"/)
  assert.match(source, /product-select-control"><select name="productId"/)
  assert.match(source, /product-select-control"><select name="status"/)
  assert.match(source, /name="tagIds"/)
  assert.match(source, /name="internalNote"/)
  assert.match(source, /editorMode === 'edit-product' \? 'บันทึกการแก้ไข' : 'บันทึก'/)
  assert.match(styles, /\.product-single-editor-dialog \{[^}]*width: min\(920px, 100%\)[^}]*border-radius: 16px/)
  assert.match(styles, /\.product-single-editor-dialog footer \{[^}]*border-top: 1px solid var\(--border-default\)/)
  assert.match(styles, /\.product-single-editor-dialog footer \.button:not\(\.secondary\) \{[^}]*background: #111217/)
  assert.match(styles, /\.product-complete-editor-section :is\(input, select, textarea\) \{[^}]*min-height: 42px/)
  assert.match(styles, /\.product-single-editor-dialog \.product-select-control select \{[^}]*appearance: none[^}]*padding-right: 38px/)
  assert.match(styles, /\.product-single-editor-dialog \.product-select-control::after \{[^}]*right: 12px/)
  assert.match(styles, /\.product-single-editor-dialog \.form-grid-two \{[^}]*align-items: start/)
})

test('complete editor uses product commands while images stay in their dedicated manager', () => {
  const editor = source.slice(source.indexOf("{editorMode === 'edit-product'"), source.indexOf("{editorMode === 'edit-price'"))
  assert.match(source, /executeEditorCommand\('product\.metadata\.update'/)
  assert.match(source, /executeEditorCommand\('product\.update'/)
  assert.doesNotMatch(editor, /product\.image|product\.images|uploadPreparedProductImage/)
  assert.match(source, /editorMode === 'manage-images'[\s\S]*<ProductImageManagerModal/)
})

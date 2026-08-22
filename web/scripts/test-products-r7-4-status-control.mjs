import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import test from 'node:test'

const grid = await readFile(new URL('../src/app/organizations/[id]/products/products-data-grid.tsx', import.meta.url), 'utf8')
const workspace = await readFile(new URL('../src/app/organizations/[id]/products/product-sku-workspace.tsx', import.meta.url), 'utf8')
const css = await readFile(new URL('../src/app/globals.css', import.meta.url), 'utf8')

test('status uses the same native compact select contract as the approved mockup', () => {
  assert.match(grid, /function productStatusControl\(row: ProductWorkspaceRow\)/)
  assert.match(grid, /className={`product-grid-status-select-shell \$\{row\.status\}`}/)
  assert.match(grid, /<select\s+className="product-grid-status-select"/)
  assert.match(grid, /<svg className="product-grid-status-chevron"/)
  assert.match(grid, /\{ value: 'active', label: 'ใช้งานอยู่' \}/)
  assert.match(grid, /\{ value: 'draft', label: 'ฉบับร่าง' \}/)
  assert.match(grid, /\{ value: 'archived', label: 'เก็บถาวร' \}/)
  assert.doesNotMatch(grid, /product-grid-status-menu|product-grid-status-options/)
})

test('status transitions follow the existing safe lifecycle contract', () => {
  assert.match(grid, /row\.status === 'archived'/)
  assert.match(grid, /targetStatus === 'draft'/)
  assert.match(grid, /commandType: targetStatus === 'active' \? 'product\.activate' : 'product\.archive'/)
  assert.match(grid, /idKey: 'product_id', id: row\.id, version: row\.version/)
  assert.match(workspace, /canManage=\{canManage\}/)
  assert.match(workspace, /isPending=\{isPending\}/)
  assert.match(workspace, /onRequestLifecycle=\{requestLifecycle\}/)
})

test('Quick View remains a separate action in the row menu', () => {
  assert.match(grid, /className="product-grid-row-menu" role="menu"/)
  assert.match(grid, /<Link role="menuitem"[^>]*><IconEye[^>]*>\s*<span>Quick View<\/span><\/Link>/)
  assert.match(grid, /<Link role="menuitem"[^>]*><IconEdit[^>]*><span className="product-grid-row-menu-copy"><strong>แก้ไขข้อมูลสินค้า<\/strong><small>ชื่อ หมวดหมู่ แบรนด์ Tags และข้อมูลส่วนกลาง<\/small><\/span><\/Link>/)
  assert.match(grid, /<Link role="menuitem"[^>]*><IconPackages[^>]*><span className="product-grid-row-menu-copy"><strong>จัดการ SKU \/ ตัวเลือก<\/strong><small>รหัส SKU รหัสขาย ราคา และสถานะ<\/small><\/span><\/Link>/)
  assert.match(css, /\.product-grid-row-menu-copy \{[^}]*display: grid/)
})

test('status dimensions, padding, dot and chevron mirror the approved mockup', () => {
  assert.match(css, /\.product-grid-status-select-shell \{[^}]*width: 120px[^}]*height: 30px/)
  assert.match(css, /\.product-grid-status-select \{[^}]*width: 120px[^}]*height: 30px[^}]*padding: 0 32px 0 27px/)
  assert.match(css, /\.product-grid-status-dot \{[^}]*left: 10px[^}]*width: 7px[^}]*height: 7px/)
  assert.match(css, /\.product-grid-status-chevron \{[^}]*right: 12px[^}]*width: 14px[^}]*height: 14px/)
})

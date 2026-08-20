import assert from 'node:assert/strict'
import fs from 'node:fs'

const grid = fs.readFileSync(new URL('../src/app/organizations/[id]/products/products-data-grid.tsx', import.meta.url), 'utf8')
const css = fs.readFileSync(new URL('../src/app/globals.css', import.meta.url), 'utf8')
const readModel = fs.readFileSync(new URL('../src/lib/foundation/product-workspace-read-model.ts', import.meta.url), 'utf8')
const repository = fs.readFileSync(new URL('../src/lib/foundation/supabase-repository.ts', import.meta.url), 'utf8')
const standards = fs.readFileSync(new URL('../../docs/AVENZO_ONE_Design_System_and_UIUX_Standards_V1.md', import.meta.url), 'utf8')

assert.match(grid, /SKU \/ ตัวเลือกทั้งหมด <span>\(รหัสสำหรับขายและตัดสต็อกแยกกัน\)<\/span>/)
assert.match(grid, /visibleColumns\.map\(\(column\) => variantCell\(sku, index, column\)\)/)
assert.match(grid, /product-grid-variant-actions-head/)
assert.match(grid, /openRowMenu\(event\.currentTarget, row\.id, false, sku\.id\)/)
assert.match(grid, /skuId: rowMenu\.skuId/)
assert.match(readModel, /stock: summarizeSkuStock/)
assert.match(readModel, /image: variantImageAssignmentBySku\.get\(sku\.id\)\?\.image \?\? coverImageByProduct\.get\(product\.id\) \?\? null/)
assert.match(grid, /const variantImage = sku\.image \?\? row\.coverImage/)
assert.match(repository, /from\('sku_variant_images'\)/)
assert.match(css, /\.product-grid-variant-actions \{ position: sticky; right: 0;/)
assert.match(css, /\.product-grid-variant-pinned \{ position: sticky;/)
assert.match(css, /\.product-grid-variant-table \{[\s\S]*overflow-x: scroll;[\s\S]*scrollbar-gutter: stable;/)
assert.match(css, /\.product-grid-wrap \{ container-type: inline-size; \}/)
assert.match(css, /\.product-grid-variant-card \{ position: sticky; left: 14px; width: calc\(100cqw - 28px\);/)
assert.match(css, /\.product-grid-variant-table::-webkit-scrollbar \{ height: 10px; \}/)
assert.match(standards, /Expanded child rows/)

console.log('Products expanded variant grid checks passed')

import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import test from 'node:test'

const read = (path) => readFile(new URL(path, import.meta.url), 'utf8')
const formPath = '../src/app/organizations/[id]/products/new/unified-product-creation-form.tsx'

test('R7.2.4A loads versioned active and archived Category Brand masters on the Server', async () => {
  const page = await read('../src/app/organizations/[id]/products/new/page.tsx')
  assert.match(page, /product_categories'\)\.select\('id, name, status, version'\)/)
  assert.match(page, /product_brands'\)\.select\('id, name, status, version'\)/)
  const categoryQuery = page.slice(page.indexOf("supabase.from('product_categories')"), page.indexOf("supabase.from('product_brands')"))
  const brandQuery = page.slice(page.indexOf("supabase.from('product_brands')"), page.indexOf("supabase.from('product_tags')"))
  assert.doesNotMatch(categoryQuery, /\.eq\('status', 'active'\)/)
  assert.doesNotMatch(brandQuery, /\.eq\('status', 'active'\)/)
})

test('R7.2.4A exposes an accessible Context Master Data dialog for Category and Brand', async () => {
  const form = await read(formPath)
  assert.match(form, /function MasterDataManager/)
  assert.match(form, /kind="category" items=\{categories\}/)
  assert.match(form, /kind="brand" items=\{brands\}/)
  assert.match(form, /role="dialog" aria-modal="true"/)
  assert.match(form, /aria-haspopup="dialog"/)
  assert.match(form, /event\.key === 'Escape'/)
  assert.match(form, /event\.key !== 'Tab'/)
  assert.match(form, /triggerRef\.current\?\.focus\(\)/)
})

test('R7.2.4A implements search edit archive and bounded bulk staging', async () => {
  const form = await read(formPath)
  assert.match(form, /placeholder=\{`ค้นหา\$\{label\}\.\.\.`\}/)
  assert.match(form, /workingItems\.filter\(\(item\) => item\.name\.toLocaleLowerCase/)
  assert.match(form, /const itemMaxLength = kind === 'tag' \? 80 : 120/)
  assert.match(form, /maxLength=\{itemMaxLength\}/)
  assert.match(form, /เก็บถาวร/)
  assert.match(form, /bulkInput\.split\(\/\[,\\n\]\//)
  assert.match(form, /\.slice\(0, 20\)/)
  assert.match(form, /maxLength=\{600\}/)
  assert.match(form, /const next = \[\.\.\.sourceItems\][\s\S]*const \{ next, added \} = mergeBulkItems\(workingItems\)[\s\S]*setWorkingItems\(next\)[\s\S]*setError\(added \? '' : 'ไม่มีรายการใหม่ให้เพิ่ม'\)/)
})

test('R7.2.4A persists every supported change through the trusted versioned command', async () => {
  const form = await read(formPath)
  assert.match(form, /commandType: 'product\.master\.upsert'/)
  assert.match(form, /master_id: item\.id, expected_version: item\.version/)
  assert.match(form, /commandId: crypto\.randomUUID\(\)/)
  assert.match(form, /แต่ละรายการบันทึกผ่าน trusted command พร้อม Audit Log/)
  const manager = form.slice(form.indexOf('function MasterDataManager'), form.indexOf('export function UnifiedProductCreationForm'))
  assert.doesNotMatch(manager, /createClient\(|\.from\('product_categories'\)|\.from\('product_brands'\)/)
})

test('R7.2.4A saves pending bulk text without requiring the staging button first', async () => {
  const form = await read(formPath)
  assert.match(form, /function mergeBulkItems\(sourceItems: MasterWorkingItem\[\]\)/)
  assert.match(form, /const itemsToSave = bulkInput\.trim\(\) \? mergeBulkItems\(workingItems\)\.next : workingItems/)
  assert.match(form, /const changes = itemsToSave\.filter/)
  assert.match(form, /onSaved\(savedItems\)[\s\S]*setBulkInput\(''\)[\s\S]*setOpen\(false\)/)
})

test('R7.2.4A does not promise unsupported reactivation of immutable archived masters', async () => {
  const form = await read(formPath)
  assert.match(form, /originallyArchived/)
  assert.match(form, /เก็บถาวรแล้ว<\/button>/)
  assert.match(form, /รายการที่เก็บถาวรแล้วเปิดกลับไม่ได้/)
  assert.doesNotMatch(form, />เปิดใช้งาน<\/button>/)
})

test('R7.2.4A keeps archived masters out of selectors and clears archived selections', async () => {
  const form = await read(formPath)
  assert.match(form, /activeCategories = categories\.filter\(\(option\) => option\.status !== 'archived'\)/)
  assert.match(form, /activeBrands = brands\.filter\(\(option\) => option\.status !== 'archived'\)/)
  assert.match(form, /activeCategories\.map/)
  assert.match(form, /activeBrands\.map/)
  assert.match(form, /setCategoryId\(''\)/)
  assert.match(form, /setBrandId\(''\)/)
})

test('R7.2.4A applies the approved modal list and responsive composition', async () => {
  const styles = await read('../src/app/globals.css')
  assert.match(styles, /\.product-master-dialog \{[^}]*width: min\(720px, 100%\)/)
  assert.match(styles, /\.product-master-toolbar \{[^}]*grid-template-columns: minmax\(0, 1fr\) auto/)
  assert.match(styles, /\.product-master-row \{[^}]*grid-template-columns: minmax\(0, 1fr\) auto/)
  assert.match(styles, /\.product-master-bulk textarea \{[^}]*font-size: 15px[^}]*font-weight: 400[^}]*line-height: 1\.65/)
  assert.match(styles, /\.product-master-dialog > footer/)
  assert.match(styles, /\.product-master-row \{ grid-template-columns: 1fr; \}/)
})

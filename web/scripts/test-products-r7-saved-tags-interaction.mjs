import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import test from 'node:test'

const read = (path) => readFile(new URL(path, import.meta.url), 'utf8')
const formPath = '../src/app/organizations/[id]/products/new/unified-product-creation-form.tsx'

test('R7.2.4B loads active and archived Tag masters for picker and manager boundaries', async () => {
  const page = await read('../src/app/organizations/[id]/products/new/page.tsx')
  const tagQuery = page.slice(page.indexOf("supabase.from('product_tags')"), page.indexOf("supabase.from('branches')"))
  assert.match(tagQuery, /select\('id, name, status, version'\)/)
  assert.doesNotMatch(tagQuery, /\.eq\('status', 'active'\)/)
})

test('R7.2.4B replaces the details baseline with an accessible hover focus and click quick menu', async () => {
  const form = await read(formPath)
  assert.match(form, /function SavedTagsInteraction/)
  assert.match(form, /aria-haspopup="menu" aria-expanded=\{quickOpen\}/)
  assert.match(form, /onPointerEnter=\{\(\) => setQuickOpen\(true\)\}/)
  assert.match(form, /onFocus=\{\(\) => setQuickOpen\(true\)\}/)
  assert.match(form, /event\.key === 'Escape'/)
  assert.match(form, /role="menuitemcheckbox" aria-checked=\{selectedSet\.has\(tag\.id\)\}/)
  assert.doesNotMatch(form, /<details className="product-saved-tags-navigation"/)
})

test('R7.2.4B provides the approved searchable multi-select dialog and 12 Tag limit', async () => {
  const form = await read(formPath)
  assert.match(form, /role="dialog" aria-modal="true" aria-labelledby=\{titleId\}/)
  assert.match(form, /ค้นหา เช่น งานใหม่ หรือ โปรโมชั่น/)
  assert.match(form, /renderPickerGroup\('ผลการค้นหา', searchResults\)/)
  assert.match(form, /renderPickerGroup\('ปักหมุด', pinned\)/)
  assert.match(form, /renderPickerGroup\('ใช้ล่าสุด', recent\)/)
  assert.match(form, /renderPickerGroup\('ใช้บ่อย', frequent\)/)
  assert.match(form, /!query && !activeTags\.length \? <div className="product-master-empty">ยังไม่มี Tags ที่บันทึกไว้<\/div>/)
  assert.match(form, /selectedIds\.length >= 12/)
  assert.match(form, /\{selectedIds\.length\} \/ 12/)
  assert.match(form, /event\.key !== 'Tab'/)
})

test('R7.2.4B creates and manages Tags only through the trusted command boundary', async () => {
  const form = await read(formPath)
  assert.match(form, /function createAndSelectTag/)
  const createInteraction = form.slice(form.indexOf('function createAndSelectTag'), form.indexOf('function renderQuickGroup'))
  assert.match(createInteraction, /selectedIds\.length >= 12/)
  assert.match(createInteraction, /เลือก Tags ได้สูงสุด 12 รายการ/)
  assert.match(form, /commandType: 'product\.master\.upsert'/)
  assert.match(form, /payload: \{ master_kind: 'tag', name, status: 'active' \}/)
  assert.match(form, /MasterDataManager organizationId=\{organizationId\} kind="tag"/)
  const interaction = form.slice(form.indexOf('function SavedTagsInteraction'), form.indexOf('export function UnifiedProductCreationForm'))
  assert.doesNotMatch(interaction, /createClient\(|\.from\('product_tags'\)/)
})

test('R7.2.4B keeps archived Tags out of selection and clears archived selected IDs', async () => {
  const form = await read(formPath)
  assert.match(form, /activeTags = tags\.filter\(\(tag\) => tag\.status !== 'archived'\)/)
  assert.match(form, /const activeTags = tags\.filter\(\(option\) => option\.status !== 'archived'\)/)
  assert.match(form, /setTagIds\(\(current\) => current\.filter\(\(id\) => options\.some\(\(option\) => option\.id === id && option\.status !== 'archived'\)\)\)/)
})

test('R7.2.4B stores only bounded Organization-scoped recent Tag UI preferences', async () => {
  const form = await read(formPath)
  assert.match(form, /avenzo\.products\.tags\.recent\.\$\{organizationId\}/)
  assert.match(form, /stored\.filter\(\(id\): id is string => typeof id === 'string'\)\.slice\(0, 5\)/)
  assert.match(form, /\[id, \.\.\.current\.filter\(\(item\) => item !== id\)\]\.slice\(0, 5\)/)
  assert.match(form, /ใช้ล่าสุดเป็น UI preference ใน Browser นี้/)
})

test('R7.2.4B preserves direct exact-name input and product command Tag IDs', async () => {
  const form = await read(formPath)
  assert.match(form, /function selectSavedTagFromInput/)
  assert.match(form, /localeCompare\(normalized, 'th', \{ sensitivity: 'base' \}\)/)
  assert.match(form, /tag_ids: tagIds/)
  assert.match(form, /พิมพ์ Tag แล้วกด Enter/)
})

test('R7.2.4B applies approved quick-menu dialog groups and responsive styles', async () => {
  const styles = await read('../src/app/globals.css')
  assert.match(styles, /\.product-saved-tags-menu \{[^}]*width: min\(310px, calc\(100vw - 32px\)\)/)
  assert.match(styles, /\.product-saved-tags-dialog \{[^}]*width: min\(720px, 100%\)/)
  assert.match(styles, /\.product-saved-tag-groups/)
  assert.match(styles, /\.product-saved-tag-group button\[aria-pressed="true"\]/)
  assert.match(styles, /\.product-saved-tags-dialog \{ max-height: calc\(100vh - 20px\); \}/)
})

import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import test from 'node:test'

const read = (path) => readFile(new URL(path, import.meta.url), 'utf8')
const formPath = '../src/app/organizations/[id]/products/new/unified-product-creation-form.tsx'

test('R7.2.3G renders the approved Section 7 heading and branch selector', async () => {
  const form = await read(formPath)
  assert.match(form, /<h2>สาขาและนโยบายสต๊อก<\/h2>/)
  assert.match(form, /การเปิดขายและค่าควบคุมต่อ SKU \+ Location ไม่ใช่ข้อมูล Product โดยตรง/)
  assert.match(form, /<small>Inventory Policy<\/small>/)
  assert.match(form, /สาขาที่เปิดขาย/)
  assert.match(form, /branches\.map/)
  assert.match(form, /type="checkbox" value=\{branch\.id\} checked=\{checked\}/)
})

test('R7.2.3G keeps branch selection in Browser Draft but out of the R7.1 payload', async () => {
  const form = await read(formPath)
  assert.match(form, /selectedBranchIds: branchIds/)
  assert.match(form, /R7\.1 ยังไม่มี Branch sales-scope contract/)
  assert.match(form, /summaryBranches = branches\.filter/)
  const payload = form.slice(form.indexOf('function buildPayload'), form.indexOf('function submit(event'))
  assert.doesNotMatch(payload, /branch_ids|selectedBranchIds/)
})

test('R7.2.3G renders Safety, Min, Max and derived Available fields', async () => {
  const form = await read(formPath)
  for (const label of ['กันสต๊อกสินค้า (Safety Stock)', 'จำนวน Min ในการเติม', 'จำนวน Max ในการเติม', 'จำนวนที่ใช้ได้']) {
    assert.match(form, new RegExp(label.replace(/[()]/g, '\\$&')))
  }
  assert.match(form, /name="safetyStock"[^>]*defaultValue="0"/)
  assert.match(form, /name="reorderMin"/)
  assert.match(form, /name="reorderMax"/)
  assert.match(form, /value="คำนวณหลังสร้าง SKU และรับ Stock" readOnly/)
  assert.match(form, /Derived value ห้ามกรอกหรือแก้โดยตรง/)
})

test('R7.2.3G validates inventory policy cross-field rules', async () => {
  const form = await read(formPath)
  assert.match(form, /function inventoryPolicyValidationErrors/)
  assert.match(form, /Min ต้องไม่น้อยกว่า Safety Stock/)
  assert.match(form, /Max ต้องไม่น้อยกว่า Min/)
  assert.match(form, /inventoryPolicyValidationErrors\(data\)/)
  assert.match(form, /inventoryPolicyValidationErrors\(new FormData\(event\.currentTarget\)\)/)
})

test('R7.2.3G preserves stock authority and Reserved Allocated disclosure', async () => {
  const form = await read(formPath)
  assert.match(form, /Reserved\/Allocated จาก Order เป็น Transaction คนละส่วนกับ Safety Stock/)
  assert.match(form, /safety_stock: optionalNumber\(data\.get\('safetyStock'\)\)/)
  assert.match(form, /reorder_min: optionalNumber\(data\.get\('reorderMin'\)\)/)
  assert.match(form, /reorder_max: optionalNumber\(data\.get\('reorderMax'\)\)/)
  assert.doesNotMatch(form, /commandType: 'inventory\./)
  assert.doesNotMatch(form, /available_quantity:/)
})

test('R7.2.3G applies approved branch, derived field and responsive styles', async () => {
  const styles = await read('../src/app/globals.css')
  assert.match(styles, /\.product-branch-grid \{[^}]*grid-template-columns: repeat\(3, minmax\(0, 1fr\)\)/)
  assert.match(styles, /\.product-branch-option\.selected/)
  assert.match(styles, /\.product-inventory-policy-grid input\[readonly\]/)
  assert.match(styles, /\.product-inventory-validation\.danger/)
  assert.match(styles, /\.product-branch-grid \{ grid-template-columns: 1fr; \}/)
})

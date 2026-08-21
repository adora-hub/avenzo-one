import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import test from 'node:test'

const root = new URL('../', import.meta.url)
const read = (path) => readFile(new URL(path, root), 'utf8')

test('Live-UI-01 provides an authenticated organization route without write integration', async () => {
  const page = await read('src/app/organizations/[id]/products/live-sale/page.tsx')
  assert.match(page, /current_user_organization_access/)
  assert.match(page, /permissions\.has\('product\.read'\)/)
  assert.match(page, /canManage=\{permissions\.has\('product\.create'\)\}/)
  assert.doesNotMatch(page, /permissions\.has\('product\.manage'\)/)
  assert.match(page, /currentPage="live-sale"/)
  assert.match(page, /<LiveSalePageShell/)
  assert.doesNotMatch(page, /executeFoundationCommandAction|\.insert\(|\.update\(|\.delete\(|fetch\(/)
})

test('Live-UI-01 links the Products create menu to the new route', async () => {
  const workspace = await read('src/app/organizations/[id]/products/product-sku-workspace.tsx')
  assert.match(workspace, /href=\{`\/organizations\/\$\{organizationId\}\/products\/live-sale`\}/)
  assert.match(workspace, /สร้างสินค้าขายด่วน \/ Live Sale/)
  assert.doesNotMatch(workspace, /Live Sale อยู่ในแผนเชื่อมระบบจริง/)
})

test('Live-UI-01 shell keeps UI Preview safety boundaries visible', async () => {
  const shell = await read('src/app/organizations/[id]/products/live-sale/live-sale-page-shell.tsx')
  const reservationUi = await read('src/app/organizations/[id]/products/live-sale/live-sale-reservation-ui.tsx')
  assert.match(shell, /<LiveSaleReservationUi/)
  assert.match(reservationUi, /ชุดรหัสขายด่วน/)
  assert.match(reservationUi, /UI PREVIEW/)
  assert.match(reservationUi, /ไม่จองรหัส ไม่สร้าง Product\/SKU ไม่เปิดบิล และไม่เปลี่ยนแปลง Stock จริง/)
  assert.match(reservationUi, /กลับหน้าสินค้า/)
  assert.doesNotMatch(shell, /use client|fetch\(|supabase|executeFoundationCommandAction/)
  assert.doesNotMatch(reservationUi, /fetch\(|supabase|executeFoundationCommandAction/)
})

test('Live-UI-01 breadcrumb and responsive styling follow the shared design system', async () => {
  const breadcrumb = await read('src/app/components/product-header-breadcrumb.tsx')
  const styles = await read('src/app/globals.css')
  assert.match(breadcrumb, /'live-sale'/)
  assert.match(breadcrumb, /<LiveSaleIcon/)
  assert.match(styles, /\.live-sale-page-heading \{[^}]*grid-template-columns:/)
  assert.match(styles, /\.live-sale-shell-grid \{[^}]*grid-template-columns:/)
  assert.match(styles, /@media \(max-width: 900px\)[\s\S]*\.live-sale-shell-grid \{ grid-template-columns: 1fr; \}/)
  assert.match(styles, /var\(--status-info-border\)/)
  assert.match(styles, /var\(--surface-elevated\)/)
})

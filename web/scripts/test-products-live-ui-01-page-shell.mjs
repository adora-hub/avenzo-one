import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import test from 'node:test'

const root = new URL('../', import.meta.url)
const read = (path) => readFile(new URL(path, root), 'utf8')

test('Live-UI-01 redirects the retired Live Sale route to Rapid Entry', async () => {
  const page = await read('src/app/organizations/[id]/products/live-sale/page.tsx')
  assert.match(page, /redirect\(`\/organizations\/\$\{organizationId\}\/products\/live-sale\/rapid-entry`\)/)
  assert.doesNotMatch(page, /LiveSalePageShell|current_user_organization_access/)
})

test('Live-UI-01 links the Products create menu directly to Rapid Entry', async () => {
  const workspace = await read('src/app/organizations/[id]/products/product-sku-workspace.tsx')
  assert.match(workspace, /href=\{`\/organizations\/\$\{organizationId\}\/products\/live-sale\/rapid-entry`\}/)
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

import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import test from 'node:test'

const root = new URL('../', import.meta.url)
const read = (path) => readFile(new URL(path, root), 'utf8')

test('Rapid-UI-01 provides an authenticated organization route without write integration', async () => {
  const page = await read('src/app/organizations/[id]/products/live-sale/rapid-entry/page.tsx')
  assert.match(page, /current_user_organization_access/)
  assert.match(page, /permissions\.has\('product\.read'\)/)
  assert.match(page, /canManage=\{permissions\.has\('product\.create'\)\}/)
  assert.doesNotMatch(page, /permissions\.has\('product\.manage'\)/)
  assert.match(page, /currentPage="live-sale-rapid-entry"/)
  assert.match(page, /<RapidEntryWorkspaceShell/)
  assert.doesNotMatch(page, /executeFoundationCommandAction|\.insert\(|\.update\(|\.delete\(|fetch\(/)
})

test('Rapid-UI-01 is the primary Live Sale destination from Products and legacy URLs', async () => {
  const workspace = await read('src/app/organizations/[id]/products/product-sku-workspace.tsx')
  const legacyPage = await read('src/app/organizations/[id]/products/live-sale/page.tsx')
  assert.match(workspace, /products\/live-sale\/rapid-entry/)
  assert.match(legacyPage, /products\/live-sale\/rapid-entry/)
})

test('Rapid-UI-01 identifies the page as Live Sale and returns directly to Products', async () => {
  const breadcrumb = await read('src/app/components/product-header-breadcrumb.tsx')
  const shell = await read('src/app/organizations/[id]/products/live-sale/rapid-entry/rapid-entry-workspace-shell.tsx')
  assert.match(breadcrumb, /currentPage === 'live-sale-rapid-entry'[\s\S]*aria-current="page"[\s\S]*<span>Live Sale<\/span>/)
  assert.doesNotMatch(breadcrumb, /currentPage === 'live-sale-rapid-entry'[\s\S]*<span>กรอกสินค้าแบบตาราง<\/span>/)
  assert.match(shell, /href=\{productsHref\}><ArrowLeftIcon \/>กลับหน้าสินค้า/)
  assert.doesNotMatch(shell, /กลับ Live Sale|const liveSaleHref/)
})

test('Rapid-UI-01 shell states the 50-row scope and local-backend safety boundary', async () => {
  const shell = await read('src/app/organizations/[id]/products/live-sale/rapid-entry/rapid-entry-workspace-shell.tsx')
  assert.match(shell, /สูงสุด 50 รายการ/)
  assert.match(shell, /Viewport ขั้นต่ำ 1,024px/)
  assert.match(shell, /เชื่อม Local Backend แล้ว/)
  assert.match(shell, /PREVIEW และ Production ยังไม่ถูกแก้ไข/)
  assert.match(shell, /<RapidEntrySetupWorkspace organizationId=\{organizationId\} actorUserId=\{actorUserId\} canManage=\{canManage\}/)
  assert.doesNotMatch(shell, /ขอบเขต V1|live-sale-rapid-scope-card/)
  assert.doesNotMatch(shell, /<table|fetch\(|supabase|executeFoundationCommandAction/)
})

test('Rapid-UI-01 blocks viewports below 1024px without mobile card fallback', async () => {
  const shell = await read('src/app/organizations/[id]/products/live-sale/rapid-entry/rapid-entry-workspace-shell.tsx')
  const styles = await read('src/app/globals.css')
  assert.match(shell, /live-sale-rapid-supported/)
  assert.match(shell, /live-sale-rapid-viewport-block/)
  assert.match(shell, /ความกว้างอย่างน้อย 1,024px/)
  assert.match(styles, /@media \(max-width: 1023px\)[\s\S]*?\.live-sale-rapid-supported \{ display: none; \}[\s\S]*?\.live-sale-rapid-viewport-block \{ display: grid; \}/)
  assert.doesNotMatch(styles, /live-sale-rapid-mobile-card/)
})

test('Rapid-UI-01 follows scoped Live Sale accent and semantic surface tokens', async () => {
  const styles = await read('src/app/globals.css')
  assert.match(styles, /\.live-sale-rapid-workspace \{[^}]*var\(--border-default\)[^}]*var\(--surface-elevated\)/)
  assert.match(styles, /\.live-sale-rapid-limit-badge \{[^}]*#aae600/)
  assert.match(styles, /\.live-sale-rapid-block-actions \.button \{[^}]*height: 40px;[^}]*min-height: 40px;/)
})

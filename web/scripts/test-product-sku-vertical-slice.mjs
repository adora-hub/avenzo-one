import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import test from 'node:test'

const read = (path) => readFile(new URL(path, import.meta.url), 'utf8')

test('Product/SKU page reads through the RLS repository and URL state', async () => {
  const [page, repository, factory] = await Promise.all([
    read('../src/app/organizations/[id]/products/page.tsx'),
    read('../src/lib/foundation/supabase-repository.ts'),
    read('../src/lib/foundation/server-read.ts'),
  ])

  assert.match(page, /searchParams: Promise<SearchParams>/)
  assert.match(page, /createFoundationReadRepository/)
  assert.match(page, /listProducts/)
  assert.match(page, /listSkus/)
  assert.match(page, /product\.read/)
  assert.match(page, /product\.manage/)
  assert.doesNotMatch(page, /createAdminClient|SUPABASE_SECRET_KEY/)
  assert.match(factory, /createClient/)
  assert.doesNotMatch(factory, /createAdminClient/)
  assert.match(repository, /updated_at\.lt/)
  assert.match(repository, /pageSize \+ 1/)
})

test('all Product/SKU mutations use the authorized Foundation Server Action', async () => {
  const [workspace, action] = await Promise.all([
    read('../src/app/organizations/[id]/products/product-sku-workspace.tsx'),
    read('../src/app/actions/foundation.ts'),
  ])

  assert.match(workspace, /executeFoundationCommandAction/)
  assert.match(workspace, /crypto\.randomUUID\(\)/)
  assert.match(workspace, /product\.create/)
  assert.match(workspace, /product\.update/)
  assert.match(workspace, /product\.activate/)
  assert.match(workspace, /product\.archive/)
  assert.match(workspace, /sku\.create/)
  assert.match(workspace, /sku\.update/)
  assert.match(workspace, /sku\.activate/)
  assert.match(workspace, /sku\.archive/)
  assert.doesNotMatch(workspace, /\.from\(['"](?:products|skus)['"]\)/)
  assert.match(action, /executeFoundationServerCommand/)
})

test('slice includes responsive and non-happy-path UI contracts', async () => {
  const [workspace, loading, error, css, shell] = await Promise.all([
    read('../src/app/organizations/[id]/products/product-sku-workspace.tsx'),
    read('../src/app/organizations/[id]/products/loading.tsx'),
    read('../src/app/organizations/[id]/products/error.tsx'),
    read('../src/app/globals.css'),
    read('../src/app/components/application-shell.tsx'),
  ])

  assert.match(workspace, /OperationsEmptyState/)
  assert.match(workspace, /product-mobile-list/)
  assert.match(workspace, /OperationsDetailSheet/)
  assert.match(workspace, /role="dialog" aria-modal="true"/)
  assert.match(loading, /aria-busy="true"/)
  assert.match(error, /role="alert"/)
  assert.match(css, /@media \(max-width: 760px\)[\s\S]*\.product-table-wrap \{ display: none; \}/)
  assert.match(css, /\.product-mobile-list \{ display: grid; \}/)
  assert.match(shell, /Product & SKU/)
})

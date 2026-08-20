import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import test from 'node:test'

const components = await readFile(new URL('../src/app/components/operations-ui.tsx', import.meta.url), 'utf8')
const billingPage = await readFile(new URL('../src/app/platform-admin/billing/page.tsx', import.meta.url), 'utf8')
const css = await readFile(new URL('../src/app/globals.css', import.meta.url), 'utf8')

test('operations foundation exports the approved shared patterns', () => {
  for (const name of ['OperationsPageHeader', 'OperationsPanelHeader', 'OperationsFilterBar', 'OperationsStatusBadge', 'OperationsDataGrid', 'OperationsEmptyState', 'OperationsSummaryCard', 'OperationsCardList', 'OperationsFormSection', 'OperationsDetailSheet']) {
    assert.match(components, new RegExp(`export function ${name}\\b`))
  }
})

test('billing exceptions is the first operations UI pilot', () => {
  assert.match(billingPage, /Phase 1\.3\.6\.4 · Operations UI Pilot/)
  assert.match(billingPage, /<OperationsFilterBar label="ตัวกรองรายการชำระเงินที่ต้องตรวจสอบ">/)
  assert.match(billingPage, /<OperationsDataGrid label="รายการชำระเงินผิดปกติ"/)
  assert.match(billingPage, /<OperationsDataGrid label="ประวัติคำสั่งแก้ไข"/)
  assert.match(billingPage, /<OperationsCardList label="สรุปความพร้อมระบบรับชำระ">/)
  assert.match(billingPage, /<OperationsSummaryCard label="Provider หลัก"/)
  assert.match(billingPage, /<PaymentExceptionActions\s+attemptId=/)
})

test('operations patterns use semantic surfaces and status tokens', () => {
  const operationsCss = css.match(/\.operations-page-header[\s\S]*?\.operations-empty-state\.info\s*\{[^}]*\}/)?.[0] ?? ''
  assert.ok(operationsCss, 'Operations UI styles must exist as one shared block')
  assert.match(operationsCss, /var\(--surface-elevated\)/)
  assert.match(operationsCss, /var\(--status-success-surface\)/)
  assert.match(operationsCss, /var\(--status-danger-surface\)/)
  assert.doesNotMatch(operationsCss, /#[0-9a-f]{3,8}\b/i)
})

test('operations filters and lists expose accessible names', () => {
  assert.match(components, /role="group" aria-label=\{label\}/)
  assert.match(components, /role="list" aria-label=\{label\}/)
  assert.match(components, /role="status"/)
  assert.match(components, /role="dialog" aria-modal="false" aria-labelledby=\{titleId\}/)
})

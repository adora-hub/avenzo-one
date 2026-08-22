import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'
import { resolveProductStockStatus } from '../src/app/organizations/[id]/products/product-stock-status.ts'

const now = new Date('2026-08-22T12:00:00.000Z')

function row(stockStatusSkus) {
  return {
    stock: { mode: 'single-unit', baseUnitCode: 'piece', onHand: 20, allocated: 0, available: 20, branchCodes: [] },
    stockStatusSkus,
  }
}

function sku(skuCode, available, options = {}) {
  return {
    skuCode,
    available,
    reorderMin: options.reorderMin ?? null,
    safetyStock: options.safetyStock ?? null,
    lastReceivedAt: options.lastReceivedAt ?? null,
  }
}

test('all SKU without available stock resolves to out of stock', () => {
  assert.equal(resolveProductStockStatus(row([sku('A001', 0), sku('A002', 0)]), now).key, 'out')
})

test('one unavailable variant keeps the product sellable but marks it low', () => {
  const result = resolveProductStockStatus(row([sku('A001', 0), sku('A002', 20)]), now)
  assert.equal(result.key, 'low')
  assert.match(result.description, /A001/)
})

test('reorder min takes precedence over fallback threshold', () => {
  assert.equal(resolveProductStockStatus(row([sku('A001', 8, { reorderMin: 10 })]), now).key, 'low')
})

test('risk state takes precedence over a recent receipt', () => {
  const received = '2026-08-21T12:00:00.000Z'
  assert.equal(resolveProductStockStatus(row([sku('A001', 2, { reorderMin: 3, lastReceivedAt: received })]), now).key, 'low')
})

test('healthy stock received within seven days resolves to new', () => {
  assert.equal(resolveProductStockStatus(row([sku('A001', 20, { lastReceivedAt: '2026-08-18T12:00:00.000Z' })]), now).key, 'new')
})

test('healthy older stock resolves to normal', () => {
  assert.equal(resolveProductStockStatus(row([sku('A001', 20, { lastReceivedAt: '2026-08-10T12:00:00.000Z' })]), now).key, 'normal')
})

test('stock status badges use the compact pill treatment in the product grid', () => {
  const css = readFileSync(new URL('../src/app/globals.css', import.meta.url), 'utf8')

  assert.match(
    css,
    /\.product-grid-stock-status \.operations-status-badge \{[^}]*min-height: 22px;[^}]*padding: 2px 8px;[^}]*border-radius: 999px;[^}]*font-size: 11px;/,
  )
  assert.match(css, /\.success[^\{]*:not\(\.operations-status-badge\)/)
  assert.match(css, /\.warning[^\{]*:not\(\.operations-status-badge\)/)
})

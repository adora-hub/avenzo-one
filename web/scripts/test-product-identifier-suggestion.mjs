import assert from 'node:assert/strict'
import test from 'node:test'
import { identifierSequenceCandidates, nextIdentifierOutsideSet } from '../src/lib/foundation/product-identifier-suggestion.ts'

test('suggestion candidates preserve prefix and digit width', () => {
  assert.deepEqual(identifierSequenceCandidates('A001', 1, 3), ['A002', 'A003', 'A004'])
  assert.deepEqual(identifierSequenceCandidates('AB052', 1, 2), ['AB053', 'AB054'])
})

test('suggestion candidates can jump directly to the next unchecked batch', () => {
  assert.deepEqual(identifierSequenceCandidates('A001', 100, 2), ['A101', 'A102'])
  assert.deepEqual(identifierSequenceCandidates('AB001', 52, 1), ['AB053'])
})

test('suggestion candidates remain bounded and normalize manual identifiers', () => {
  assert.deepEqual(identifierSequenceCandidates(' custom ', 1, 2), ['CUSTOM-002', 'CUSTOM-003'])
  assert.equal(identifierSequenceCandidates('A001', 1, 500).length, 100)
})
test('next identifier skips every code already reserved in the Browser Draft queue', () => {
  assert.equal(nextIdentifierOutsideSet('SKU-MK-001', new Set(['SKU-MK-002', 'SKU-MK-003'])), 'SKU-MK-004')
  assert.equal(nextIdentifierOutsideSet('A004', new Set(['A005'])), 'A006')
})
test('next identifier skips a fully occupied numeric range', () => {
  const unavailable = new Set(Array.from({ length: 8 }, (_, index) => `A${String(index + 2).padStart(3, '0')}`))
  assert.equal(nextIdentifierOutsideSet('A001', unavailable), 'A010')
})

test('server checks the Organization registry in bounded batches before suggesting', async () => {
  const source = await import('node:fs/promises').then(({ readFile }) => readFile(new URL('../src/lib/foundation/product-identifier-check.server.ts', import.meta.url), 'utf8'))
  assert.match(source, /from\('sku_identifier_registry'\)/)
  assert.match(source, /eq\('organization_id', parsed\.organizationId\)/)
  assert.match(source, /offset <= 10_000/)
  assert.match(source, /identifierSequenceCandidates\(normalized, offset, 100\)/)
  assert.match(source, /suggestion: suggestionByValue\.get/)
})
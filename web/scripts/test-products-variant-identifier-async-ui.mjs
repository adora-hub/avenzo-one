import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import test from 'node:test'
import {
  VariantIdentifierCheckTimeoutError,
  variantIdentifierCheckFailureMessage,
  withVariantIdentifierCheckTimeout,
} from '../src/lib/foundation/variant-identifier-check-ui.ts'

const read = (path) => readFile(new URL(path, import.meta.url), 'utf8')
const builderPath = '../src/app/organizations/[id]/products/new/variant-creation-builder.tsx'

test('Variant identifier check returns the successful response before timeout', async () => {
  const result = await withVariantIdentifierCheckTimeout(Promise.resolve({ ok: true, data: { checked: 8, collisions: [] } }), 50)
  assert.equal(result.ok, true)
  assert.equal(result.data.checked, 8)
  assert.deepEqual(result.data.collisions, [])
})

test('Variant identifier check preserves duplicate collision results', async () => {
  const duplicate = { key: 'blue-s', field: 'sku_code', value: 'TS-BLU-S', reason: 'already_exists' }
  const result = await withVariantIdentifierCheckTimeout(Promise.resolve({ ok: true, data: { checked: 2, collisions: [duplicate] } }), 50)
  assert.deepEqual(result.data.collisions, [duplicate])
})

test('Variant identifier check converts API rejection to a retryable user message', async () => {
  const apiError = new Error('network_down')
  await assert.rejects(() => withVariantIdentifierCheckTimeout(Promise.reject(apiError), 50), apiError)
  assert.equal(variantIdentifierCheckFailureMessage(apiError), 'เชื่อมต่อระบบตรวจรหัสไม่สำเร็จ กรุณากด “ตรวจรหัสอีกครั้ง”')
})

test('Variant identifier check times out and returns a retryable timeout message', async () => {
  await assert.rejects(
    () => withVariantIdentifierCheckTimeout(new Promise(() => {}), 5),
    VariantIdentifierCheckTimeoutError,
  )
  assert.equal(
    variantIdentifierCheckFailureMessage(new VariantIdentifierCheckTimeoutError()),
    'การตรวจรหัสใช้เวลานานเกินไป กรุณากด “ตรวจรหัสอีกครั้ง”',
  )
})

test('Variant builder always releases loading and ignores stale or unmounted requests', async () => {
  const builder = await read(builderPath)
  const handlerStart = builder.indexOf('async function checkVariantIdentifiers()')
  const handler = builder.slice(handlerStart, builder.indexOf('\n  useEffect(() => {', handlerStart))
  assert.match(handler, /if \(checkInFlightRef\.current \|\| isIdentifierChecking\) return/)
  assert.match(handler, /try \{/)
  assert.match(handler, /withVariantIdentifierCheckTimeout/)
  assert.match(handler, /catch \(error\) \{/)
  assert.match(handler, /finally \{/)
  assert.match(handler, /checkInFlightRef\.current = false/)
  assert.match(handler, /if \(isMountedRef\.current\) setIsIdentifierChecking\(false\)/)
  assert.match(handler, /!isMountedRef\.current \|\| requestId !== checkRequestRef\.current/)
  assert.match(builder, /isMountedRef\.current = false/)
  assert.match(builder, /checkRequestRef\.current \+= 1/)
  assert.match(builder, /disabled=\{disabled \|\| isIdentifierChecking\} aria-busy=\{isIdentifierChecking\}/)
  assert.match(builder, /ตรวจรหัสอีกครั้ง/)
  assert.doesNotMatch(handler, /setCombinations|setGroups/)
})

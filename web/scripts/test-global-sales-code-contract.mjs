import assert from 'node:assert/strict'
import test from 'node:test'
import {
  GLOBAL_SALES_CODE_MAX_RANGE_SIZE,
  GLOBAL_SALES_CODE_PATTERN,
  GLOBAL_SALES_CODE_RESERVATION_TTL_HOURS,
  GLOBAL_SALES_CODE_UI_TEXT,
  formatGlobalSalesCode,
  globalSalesCodeRemainingCapacity,
  globalSalesCodeUiStateMessage,
  globalSalesCodeValidationMessage,
  nextGlobalSalesCode,
  nextGlobalSalesCodePrefix,
  normalizeGlobalSalesCode,
  previewGlobalSalesCodeRange,
  validateGlobalSalesCode,
} from '../src/lib/foundation/global-sales-code.ts'

test('normalizes whitespace, mixed case and full-width input', () => {
  assert.equal(normalizeGlobalSalesCode('  a001  '), 'A001')
  assert.equal(normalizeGlobalSalesCode('ａａ００１'), 'AA001')
})

test('accepts canonical Global Sales Code V1 values', () => {
  for (const value of ['A001', 'A999', 'Z999', 'AA001', 'AB052', 'ZZZ999']) {
    const result = validateGlobalSalesCode(value)
    assert.equal(result.ok, true, value)
    assert.equal(GLOBAL_SALES_CODE_PATTERN.test(value), true, value)
  }
})

test('rejects reserved zero, Thai, punctuation and malformed widths explicitly', () => {
  const cases = [
    ['', 'required'],
    ['A000', 'zero_reserved'],
    ['ก001', 'invalid_characters'],
    ['A๐๐๑', 'invalid_characters'],
    ['A-001', 'invalid_characters'],
    ['A_001', 'invalid_characters'],
    ['A 001', 'invalid_characters'],
    ['A01', 'number_width'],
    ['A0001', 'number_width'],
    ['AAAA001', 'prefix_too_long'],
    ['001A', 'invalid_format'],
  ]
  for (const [value, error] of cases) {
    assert.deepEqual(validateGlobalSalesCode(value), {
      ok: false,
      normalized: normalizeGlobalSalesCode(value),
      error,
    })
  }
})

test('formats only valid prefixes and numbers', () => {
  assert.equal(formatGlobalSalesCode(' a ', 1), 'A001')
  assert.equal(formatGlobalSalesCode('ZZZ', 999), 'ZZZ999')
  assert.throws(() => formatGlobalSalesCode('A-', 1), /invalid_global_sales_code_prefix/)
  assert.throws(() => formatGlobalSalesCode('AAAA', 1), /invalid_global_sales_code_prefix/)
  assert.throws(() => formatGlobalSalesCode('A', 0), /invalid_global_sales_code_number/)
  assert.throws(() => formatGlobalSalesCode('A', 1.5), /invalid_global_sales_code_number/)
})

test('rolls prefixes in Excel-style order without duplicates', () => {
  assert.equal(nextGlobalSalesCodePrefix('A'), 'B')
  assert.equal(nextGlobalSalesCodePrefix('Y'), 'Z')
  assert.equal(nextGlobalSalesCodePrefix('Z'), 'AA')
  assert.equal(nextGlobalSalesCodePrefix('AZ'), 'BA')
  assert.equal(nextGlobalSalesCodePrefix('ZZ'), 'AAA')
  assert.equal(nextGlobalSalesCodePrefix('ZZZ'), null)

  const prefixes = new Set(['A'])
  let prefix = 'A'
  while (prefix !== 'ZZZ') {
    prefix = nextGlobalSalesCodePrefix(prefix)
    assert.notEqual(prefix, null)
    assert.equal(prefixes.has(prefix), false, prefix)
    prefixes.add(prefix)
  }
  assert.equal(prefixes.size, 18_278)
})

test('increments codes across every required boundary', () => {
  assert.equal(nextGlobalSalesCode('A001'), 'A002')
  assert.equal(nextGlobalSalesCode('A999'), 'B001')
  assert.equal(nextGlobalSalesCode('Z999'), 'AA001')
  assert.equal(nextGlobalSalesCode('AA999'), 'AB001')
  assert.equal(nextGlobalSalesCode('ZZ999'), 'AAA001')
  assert.equal(nextGlobalSalesCode('ZZZ999'), null)
  assert.equal(nextGlobalSalesCode('A000'), null)
})

test('calculates remaining capacity inside one prefix', () => {
  assert.equal(globalSalesCodeRemainingCapacity(1), 999)
  assert.equal(globalSalesCodeRemainingCapacity(980), 20)
  assert.equal(globalSalesCodeRemainingCapacity(999), 1)
  assert.throws(() => globalSalesCodeRemainingCapacity(0), /invalid_global_sales_code_start_number/)
})

test('previews one or fifty codes without claiming server authority', () => {
  const one = previewGlobalSalesCodeRange({ prefix: 'a', startNumber: 120, quantity: 1 })
  assert.deepEqual(one, {
    ok: true,
    state: 'preview',
    authoritative: false,
    requestedPrefix: 'A',
    prefix: 'A',
    startNumber: 120,
    endNumber: 120,
    startCode: 'A120',
    endCode: 'A120',
    quantity: 1,
    movedToNextPrefix: false,
  })

  const fifty = previewGlobalSalesCodeRange({ prefix: 'A', startNumber: 120, quantity: 50 })
  assert.equal(fifty.ok, true)
  assert.equal(fifty.ok && fifty.startCode, 'A120')
  assert.equal(fifty.ok && fifty.endCode, 'A169')
  assert.equal(fifty.ok && fifty.quantity, GLOBAL_SALES_CODE_MAX_RANGE_SIZE)
})

test('moves a complete range to the next prefix instead of splitting it', () => {
  const result = previewGlobalSalesCodeRange({ prefix: 'A', startNumber: 980, quantity: 50 })
  assert.equal(result.ok, true)
  assert.equal(result.ok && result.prefix, 'B')
  assert.equal(result.ok && result.startCode, 'B001')
  assert.equal(result.ok && result.endCode, 'B050')
  assert.equal(result.ok && result.movedToNextPrefix, true)
})

test('rejects invalid range requests and terminal exhaustion', () => {
  assert.equal(previewGlobalSalesCodeRange({ prefix: 'A-', startNumber: 1, quantity: 1 }).ok, false)
  assert.equal(previewGlobalSalesCodeRange({ prefix: 'A', startNumber: 0, quantity: 1 }).ok, false)
  assert.equal(previewGlobalSalesCodeRange({ prefix: 'A', startNumber: 1, quantity: 51 }).ok, false)
  assert.deepEqual(previewGlobalSalesCodeRange({ prefix: 'ZZZ', startNumber: 980, quantity: 50 }), {
    ok: false,
    state: 'invalid',
    authoritative: false,
    error: 'prefix_exhausted',
  })
})

test('shares one Thai UI vocabulary for every creation experience', () => {
  assert.equal(GLOBAL_SALES_CODE_UI_TEXT.labels.prefix, 'Prefix รหัสขาย')
  assert.equal(GLOBAL_SALES_CODE_UI_TEXT.labels.runningNumber, 'เลขรัน 3 หลัก')
  assert.match(GLOBAL_SALES_CODE_UI_TEXT.help.preview, /ยังไม่ได้จองหรือบันทึกจริง/)
  assert.match(globalSalesCodeUiStateMessage('reserved'), /3 ชั่วโมง/)
  assert.match(globalSalesCodeUiStateMessage('permission_denied'), /ไม่มีสิทธิ์/)
  assert.equal(GLOBAL_SALES_CODE_RESERVATION_TTL_HOURS, 3)

  const invalid = validateGlobalSalesCode('A000')
  assert.match(globalSalesCodeValidationMessage(invalid), /000/)
})

export const GLOBAL_SALES_CODE_PREFIX_MIN_LENGTH = 1
export const GLOBAL_SALES_CODE_PREFIX_MAX_LENGTH = 3
export const GLOBAL_SALES_CODE_DIGIT_COUNT = 3
export const GLOBAL_SALES_CODE_MIN_NUMBER = 1
export const GLOBAL_SALES_CODE_MAX_NUMBER = 999
export const GLOBAL_SALES_CODE_MAX_RANGE_SIZE = 50
export const GLOBAL_SALES_CODE_RESERVATION_TTL_HOURS = 3
export const GLOBAL_SALES_CODE_PATTERN = /^[A-Z]{1,3}(00[1-9]|0[1-9][0-9]|[1-9][0-9]{2})$/

const PREFIX_PATTERN = /^[A-Z]+$/
const LOOSE_CODE_PATTERN = /^([A-Z]+)([0-9]+)$/

export type GlobalSalesCodeValidationError =
  | 'required'
  | 'invalid_characters'
  | 'invalid_format'
  | 'prefix_too_long'
  | 'number_width'
  | 'zero_reserved'

export type GlobalSalesCodeValidationResult =
  | {
      ok: true
      value: string
      normalized: string
      prefix: string
      number: number
    }
  | {
      ok: false
      normalized: string
      error: GlobalSalesCodeValidationError
    }

export type GlobalSalesCodeRangeError =
  | 'invalid_prefix'
  | 'invalid_start_number'
  | 'invalid_quantity'
  | 'prefix_exhausted'

export type GlobalSalesCodeRangePreview =
  | {
      ok: true
      state: 'preview'
      authoritative: false
      requestedPrefix: string
      prefix: string
      startNumber: number
      endNumber: number
      startCode: string
      endCode: string
      quantity: number
      movedToNextPrefix: boolean
    }
  | {
      ok: false
      state: 'invalid'
      authoritative: false
      error: GlobalSalesCodeRangeError
    }

export type GlobalSalesCodeUiState =
  | 'idle'
  | 'checking'
  | 'preview'
  | 'reserved'
  | 'assigned'
  | 'conflict'
  | 'expired'
  | 'timeout'
  | 'permission_denied'

export const GLOBAL_SALES_CODE_UI_TEXT = {
  labels: {
    prefix: 'Prefix รหัสขาย',
    runningNumber: 'เลขรัน 3 หลัก',
    recommendedRange: 'ช่วงที่แนะนำ',
    nextAvailable: 'รหัสถัดไปที่ใช้ได้',
    recheck: 'ตรวจสอบรหัสอีกครั้ง',
  },
  help: {
    format: 'ใช้ตัวอักษรอังกฤษ A–Z จำนวน 1–3 ตัว ตามด้วยเลข 3 หลัก 001–999',
    preview: 'เป็นรหัสตัวอย่างก่อนตรวจสอบกับระบบ ยังไม่ได้จองหรือบันทึกจริง',
    sameAsSku: 'ใช้รหัสเดียวกับ SKU ได้เมื่อ SKU ตรงตามรูปแบบรหัสขายและยังว่างอยู่',
    reservation: 'รหัสที่จองแต่ยังไม่สร้างสินค้าจะหมดอายุภายใน 3 ชั่วโมง',
  },
  errors: {
    required: 'กรุณากรอกรหัสขาย',
    invalid_characters: 'ใช้ได้เฉพาะตัวอักษรอังกฤษ A–Z และตัวเลข 0–9',
    invalid_format: 'รูปแบบรหัสขายไม่ถูกต้อง ตัวอย่าง A001 หรือ AA001',
    prefix_too_long: 'Prefix ใช้ตัวอักษรอังกฤษได้ไม่เกิน 3 ตัว',
    number_width: 'เลขรันต้องมี 3 หลัก ตั้งแต่ 001–999',
    zero_reserved: 'เลข 000 เป็นรหัสสำรองและไม่สามารถนำมาใช้ได้',
  } satisfies Record<GlobalSalesCodeValidationError, string>,
  states: {
    idle: 'รอตรวจสอบรหัสขาย',
    checking: 'กำลังตรวจสอบรหัสกับระบบ…',
    preview: 'เป็นเพียงตัวอย่าง ยังไม่ได้จองหรือบันทึกรหัส',
    reserved: 'จองรหัสไว้ชั่วคราวแล้ว กรุณาสร้างสินค้าให้เสร็จภายใน 3 ชั่วโมง',
    assigned: 'บันทึกรหัสขายกับ SKU สำเร็จแล้ว',
    conflict: 'รหัสนี้ถูกใช้หรือจองแล้ว กรุณาใช้รหัสถัดไปที่ระบบแนะนำ',
    expired: 'รหัสที่จองไว้หมดอายุแล้ว กรุณาตรวจสอบช่วงรหัสใหม่',
    timeout: 'การตรวจสอบใช้เวลานานเกินไป กรุณาตรวจสอบรหัสอีกครั้ง',
    permission_denied: 'บัญชีนี้ไม่มีสิทธิ์ตรวจสอบหรือกำหนดรหัสขาย',
  } satisfies Record<GlobalSalesCodeUiState, string>,
} as const

export function normalizeGlobalSalesCode(value: string) {
  return value.normalize('NFKC').trim().toUpperCase()
}

export function normalizeGlobalSalesCodePrefix(value: string) {
  return value.normalize('NFKC').trim().toUpperCase()
}

export function validateGlobalSalesCode(value: string): GlobalSalesCodeValidationResult {
  const normalized = normalizeGlobalSalesCode(value)
  if (!normalized) return { ok: false, normalized, error: 'required' }
  if (/[^A-Z0-9]/.test(normalized)) {
    return { ok: false, normalized, error: 'invalid_characters' }
  }

  const match = normalized.match(LOOSE_CODE_PATTERN)
  if (!match) return { ok: false, normalized, error: 'invalid_format' }

  const [, prefix, numberText] = match
  if (prefix.length > GLOBAL_SALES_CODE_PREFIX_MAX_LENGTH) {
    return { ok: false, normalized, error: 'prefix_too_long' }
  }
  if (numberText.length !== GLOBAL_SALES_CODE_DIGIT_COUNT) {
    return { ok: false, normalized, error: 'number_width' }
  }

  const number = Number(numberText)
  if (number === 0) return { ok: false, normalized, error: 'zero_reserved' }
  if (!GLOBAL_SALES_CODE_PATTERN.test(normalized)) {
    return { ok: false, normalized, error: 'invalid_format' }
  }

  return { ok: true, value: normalized, normalized, prefix, number }
}

export function globalSalesCodeValidationMessage(result: GlobalSalesCodeValidationResult) {
  return result.ok ? `รหัส ${result.value} อยู่ในรูปแบบมาตรฐาน` : GLOBAL_SALES_CODE_UI_TEXT.errors[result.error]
}

export function formatGlobalSalesCode(prefix: string, number: number) {
  const normalizedPrefix = normalizeGlobalSalesCodePrefix(prefix)
  if (!PREFIX_PATTERN.test(normalizedPrefix)
    || normalizedPrefix.length < GLOBAL_SALES_CODE_PREFIX_MIN_LENGTH
    || normalizedPrefix.length > GLOBAL_SALES_CODE_PREFIX_MAX_LENGTH) {
    throw new RangeError('invalid_global_sales_code_prefix')
  }
  if (!Number.isInteger(number)
    || number < GLOBAL_SALES_CODE_MIN_NUMBER
    || number > GLOBAL_SALES_CODE_MAX_NUMBER) {
    throw new RangeError('invalid_global_sales_code_number')
  }
  return `${normalizedPrefix}${String(number).padStart(GLOBAL_SALES_CODE_DIGIT_COUNT, '0')}`
}

export function nextGlobalSalesCodePrefix(prefix: string) {
  const normalized = normalizeGlobalSalesCodePrefix(prefix)
  if (!PREFIX_PATTERN.test(normalized)
    || normalized.length < GLOBAL_SALES_CODE_PREFIX_MIN_LENGTH
    || normalized.length > GLOBAL_SALES_CODE_PREFIX_MAX_LENGTH) {
    return null
  }

  const characters = normalized.split('')
  for (let index = characters.length - 1; index >= 0; index -= 1) {
    if (characters[index] !== 'Z') {
      characters[index] = String.fromCharCode(characters[index].charCodeAt(0) + 1)
      return characters.join('')
    }
    characters[index] = 'A'
  }

  return characters.length < GLOBAL_SALES_CODE_PREFIX_MAX_LENGTH
    ? `A${characters.join('')}`
    : null
}

export function nextGlobalSalesCode(value: string) {
  const parsed = validateGlobalSalesCode(value)
  if (!parsed.ok) return null
  if (parsed.number < GLOBAL_SALES_CODE_MAX_NUMBER) {
    return formatGlobalSalesCode(parsed.prefix, parsed.number + 1)
  }
  const nextPrefix = nextGlobalSalesCodePrefix(parsed.prefix)
  return nextPrefix ? formatGlobalSalesCode(nextPrefix, GLOBAL_SALES_CODE_MIN_NUMBER) : null
}

export function globalSalesCodeRemainingCapacity(startNumber: number) {
  if (!Number.isInteger(startNumber)
    || startNumber < GLOBAL_SALES_CODE_MIN_NUMBER
    || startNumber > GLOBAL_SALES_CODE_MAX_NUMBER) {
    throw new RangeError('invalid_global_sales_code_start_number')
  }
  return GLOBAL_SALES_CODE_MAX_NUMBER - startNumber + 1
}

export function previewGlobalSalesCodeRange(input: {
  prefix: string
  startNumber: number
  quantity: number
}): GlobalSalesCodeRangePreview {
  const requestedPrefix = normalizeGlobalSalesCodePrefix(input.prefix)
  if (!PREFIX_PATTERN.test(requestedPrefix)
    || requestedPrefix.length < GLOBAL_SALES_CODE_PREFIX_MIN_LENGTH
    || requestedPrefix.length > GLOBAL_SALES_CODE_PREFIX_MAX_LENGTH) {
    return { ok: false, state: 'invalid', authoritative: false, error: 'invalid_prefix' }
  }
  if (!Number.isInteger(input.startNumber)
    || input.startNumber < GLOBAL_SALES_CODE_MIN_NUMBER
    || input.startNumber > GLOBAL_SALES_CODE_MAX_NUMBER) {
    return { ok: false, state: 'invalid', authoritative: false, error: 'invalid_start_number' }
  }
  if (!Number.isInteger(input.quantity)
    || input.quantity < 1
    || input.quantity > GLOBAL_SALES_CODE_MAX_RANGE_SIZE) {
    return { ok: false, state: 'invalid', authoritative: false, error: 'invalid_quantity' }
  }

  const fitsRequestedPrefix = input.startNumber + input.quantity - 1 <= GLOBAL_SALES_CODE_MAX_NUMBER
  const prefix = fitsRequestedPrefix ? requestedPrefix : nextGlobalSalesCodePrefix(requestedPrefix)
  if (!prefix) return { ok: false, state: 'invalid', authoritative: false, error: 'prefix_exhausted' }

  const startNumber = fitsRequestedPrefix ? input.startNumber : GLOBAL_SALES_CODE_MIN_NUMBER
  const endNumber = startNumber + input.quantity - 1
  return {
    ok: true,
    state: 'preview',
    authoritative: false,
    requestedPrefix,
    prefix,
    startNumber,
    endNumber,
    startCode: formatGlobalSalesCode(prefix, startNumber),
    endCode: formatGlobalSalesCode(prefix, endNumber),
    quantity: input.quantity,
    movedToNextPrefix: !fitsRequestedPrefix,
  }
}

export function globalSalesCodeUiStateMessage(state: GlobalSalesCodeUiState) {
  return GLOBAL_SALES_CODE_UI_TEXT.states[state]
}

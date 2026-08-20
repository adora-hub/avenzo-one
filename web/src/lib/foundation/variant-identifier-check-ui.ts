export const VARIANT_IDENTIFIER_CHECK_TIMEOUT_MS = 12_000

export class VariantIdentifierCheckTimeoutError extends Error {
  constructor() {
    super('variant_identifier_check_timeout')
    this.name = 'VariantIdentifierCheckTimeoutError'
  }
}

export async function withVariantIdentifierCheckTimeout<T>(
  request: Promise<T>,
  timeoutMs = VARIANT_IDENTIFIER_CHECK_TIMEOUT_MS,
) {
  let timeout: ReturnType<typeof setTimeout> | undefined
  try {
    return await Promise.race([
      request,
      new Promise<never>((_, reject) => {
        timeout = setTimeout(() => reject(new VariantIdentifierCheckTimeoutError()), timeoutMs)
      }),
    ])
  } finally {
    if (timeout !== undefined) clearTimeout(timeout)
  }
}

export function variantIdentifierCheckFailureMessage(error: unknown) {
  return error instanceof VariantIdentifierCheckTimeoutError
    ? 'การตรวจรหัสใช้เวลานานเกินไป กรุณากด “ตรวจรหัสอีกครั้ง”'
    : 'เชื่อมต่อระบบตรวจรหัสไม่สำเร็จ กรุณากด “ตรวจรหัสอีกครั้ง”'
}

export const GLOBAL_SALES_CODE_PREVIEW_TIMEOUT_MS = 12_000

export function withGlobalSalesCodePreviewTimeout<T>(
  request: Promise<T>,
  timeoutMs = GLOBAL_SALES_CODE_PREVIEW_TIMEOUT_MS,
) {
  return new Promise<T>((resolve, reject) => {
    const timer = window.setTimeout(() => reject(new Error('global_sales_code_preview_timeout')), timeoutMs)
    request.then(
      (result) => { window.clearTimeout(timer); resolve(result) },
      (error) => { window.clearTimeout(timer); reject(error) },
    )
  })
}

export function globalSalesCodePreviewFailureMessage(error: unknown) {
  const message = error instanceof Error ? error.message : ''
  return message === 'global_sales_code_preview_timeout'
    ? 'การตรวจสอบใช้เวลานานเกินไป กรุณาตรวจสอบรหัสอีกครั้ง'
    : 'ตรวจสอบช่วงรหัสไม่ได้ ข้อมูลที่กรอกยังอยู่ครบ กรุณาลองอีกครั้ง'
}

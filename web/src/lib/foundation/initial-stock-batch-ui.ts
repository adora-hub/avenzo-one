export type InitialStockBatchStatus = 'idle' | 'loading' | 'success' | 'error' | 'duplicate'
export type InitialStockBatchOutcome = Extract<InitialStockBatchStatus, 'success' | 'error' | 'duplicate'>

export function resolveInitialStockBatchOutcome(input: {
  hasValidationErrors: boolean
  isDuplicate: boolean
}): InitialStockBatchOutcome {
  if (input.hasValidationErrors) return 'error'
  if (input.isDuplicate) return 'duplicate'
  return 'success'
}

export function formatInitialStockBatchId(revision: number) {
  const safeRevision = Number.isFinite(revision) ? Math.max(1, Math.trunc(revision)) : 1
  return `UI-BATCH-${String(safeRevision).padStart(3, '0')}`
}

'use server'

import type { FoundationErrorCode } from '@/lib/foundation/errors'
import { mapFoundationError } from '@/lib/foundation/errors'
import {
  executeProductImportRows,
  type ProductImportExecutionResult,
} from '@/lib/foundation/product-import-execute.server'

export type ProductImportExecuteActionResult =
  | { ok: true; data: ProductImportExecutionResult[] }
  | { ok: false; error: FoundationErrorCode; status: number }

export async function executeProductImportRowsAction(input: unknown): Promise<ProductImportExecuteActionResult> {
  try {
    return { ok: true, data: await executeProductImportRows(input) }
  } catch (error) {
    const safeError = mapFoundationError(error)
    return { ok: false, error: safeError.code, status: safeError.status }
  }
}

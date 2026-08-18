'use server'

import type { FoundationErrorCode } from '@/lib/foundation/errors'
import { mapFoundationError } from '@/lib/foundation/errors'
import {
  checkProductImportIdentifiers,
  type ProductImportIdentifierCheckResult,
} from '@/lib/foundation/product-import-check.server'

export type ProductImportIdentifierCheckActionResult =
  | { ok: true; data: ProductImportIdentifierCheckResult }
  | { ok: false; error: FoundationErrorCode; status: number }

export async function checkProductImportIdentifiersAction(
  input: unknown,
): Promise<ProductImportIdentifierCheckActionResult> {
  try {
    return { ok: true, data: await checkProductImportIdentifiers(input) }
  } catch (error) {
    const safeError = mapFoundationError(error)
    return { ok: false, error: safeError.code, status: safeError.status }
  }
}

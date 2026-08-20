import type {
  ProductImportField,
  ProductImportIssue,
  ProductImportNormalizedRow,
} from './product-excel-import-validation'

const normalizedIdentifier = (value: string) => value.normalize('NFKC').trim().toUpperCase()

export function findProductImportFileDuplicates(rows: ProductImportNormalizedRow[]): ProductImportIssue[] {
  const occurrences = new Map<string, Array<{ sourceRow: number; field: ProductImportField }>>()

  rows.forEach((row) => {
    const identifiers: Array<{ field: ProductImportField; value: string | null }> = [
      { field: 'SKU Code', value: row.skuCode },
      { field: 'Sales Code', value: row.salesCode },
      { field: 'Barcode', value: row.barcode },
    ]
    identifiers.forEach(({ field, value }) => {
      if (!value) return
      const normalized = normalizedIdentifier(value)
      const entries = occurrences.get(normalized) ?? []
      // One SKU may intentionally share a value across its identifier fields.
      if (!entries.some((entry) => entry.sourceRow === row.sourceRow && entry.field === field)) {
        entries.push({ sourceRow: row.sourceRow, field })
        occurrences.set(normalized, entries)
      }
    })
  })

  const issues: ProductImportIssue[] = []
  occurrences.forEach((entries, value) => {
    if (new Set(entries.map((entry) => entry.sourceRow)).size < 2) return
    entries.forEach((entry) => issues.push({
      sourceRow: entry.sourceRow,
      field: entry.field,
      code: 'duplicate_file',
      message: `รหัส ${value} ซ้ำกับสินค้าอีกแถวในไฟล์`,
    }))
  })
  return issues
}

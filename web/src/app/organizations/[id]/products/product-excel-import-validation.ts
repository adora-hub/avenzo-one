import type { ProductImportHeader, ProductImportRawRow } from './product-excel-import'

export type ProductImportField = ProductImportHeader | 'Row'
export type ProductImportIssue = {
  sourceRow: number
  field: ProductImportField
  code: 'required' | 'format' | 'length' | 'range' | 'duplicate_file' | 'duplicate_organization' | 'master_missing'
  message: string
}

export type ProductImportNormalizedRow = {
  sourceRow: number
  productName: string
  categoryName: string
  brandName: string | null
  skuCode: string
  salesCode: string | null
  barcode: string | null
  baseUnitCode: string
  quantityBehavior: 'discrete' | 'weight' | 'volume'
  salePrice: number
  taxCategory: 'standard' | 'zero' | 'exempt' | 'out_of_scope'
  taxRate: number
  tags: string[]
  branches: string[]
  status: 'draft' | 'active' | 'archived'
}

export type ProductImportValidationResult = { rows: ProductImportNormalizedRow[]; issues: ProductImportIssue[] }

const CONTROL_CHARACTERS = /[\u0000-\u001f\u007f]/
const normalizedText = (value: string) => value.normalize('NFKC').trim()
const matches = (value: string, candidates: string[]) => candidates.some((candidate) => normalizedText(candidate).toLowerCase().replaceAll(' ', '') === value)

function list(value: string) {
  return Array.from(new Set(value.split('|').map(normalizedText).filter(Boolean)))
}

function tax(value: string): Pick<ProductImportNormalizedRow, 'taxCategory' | 'taxRate'> | null {
  const key = normalizedText(value).toLowerCase().replaceAll(' ', '')
  if (matches(key, ['vat7%', 'vat7', 'standard', 'ภาษีมูลค่าเพิ่ม7%'])) return { taxCategory: 'standard', taxRate: 7 }
  if (matches(key, ['vat0%', 'vat0', 'zero', '0%'])) return { taxCategory: 'zero', taxRate: 0 }
  if (matches(key, ['exempt', 'ยกเว้นภาษี', 'ยกเว้น'])) return { taxCategory: 'exempt', taxRate: 0 }
  if (matches(key, ['out_of_scope', 'outofscope', 'novat', 'นอกขอบเขต'])) return { taxCategory: 'out_of_scope', taxRate: 0 }
  return null
}

function quantityBehavior(value: string): ProductImportNormalizedRow['quantityBehavior'] | null {
  const key = normalizedText(value).toLowerCase()
  if (matches(key, ['discrete', 'จำนวนเต็ม'])) return 'discrete'
  if (matches(key, ['weight', 'น้ำหนัก'])) return 'weight'
  if (matches(key, ['volume', 'ปริมาตร'])) return 'volume'
  return null
}

function productStatus(value: string): ProductImportNormalizedRow['status'] | null {
  const key = normalizedText(value).toLowerCase()
  if (matches(key, ['draft', 'ฉบับร่าง'])) return 'draft'
  if (matches(key, ['active', 'ใช้งาน', 'ใช้งานอยู่'])) return 'active'
  if (matches(key, ['archived', 'เก็บถาวร'])) return 'archived'
  return null
}

export function validateProductImportRows(rawRows: ProductImportRawRow[]): ProductImportValidationResult {
  const rows: ProductImportNormalizedRow[] = []
  const issues: ProductImportIssue[] = []
  const add = (row: ProductImportRawRow, field: ProductImportField, code: ProductImportIssue['code'], message: string) => issues.push({ sourceRow: row.sourceRow, field, code, message })

  for (const row of rawRows) {
    const productName = normalizedText(row['Product Name'])
    const categoryName = normalizedText(row.Category)
    const brandName = normalizedText(row.Brand) || null
    const skuCode = normalizedText(row['SKU Code']).toUpperCase()
    const salesCode = normalizedText(row['Sales Code']).toUpperCase() || null
    const barcode = normalizedText(row.Barcode) || null
    const baseUnitCode = normalizedText(row['Base Unit']).toLowerCase()
    const behavior = quantityBehavior(row['Quantity Behavior'])
    const parsedTax = tax(row.Tax)
    const parsedStatus = productStatus(row.Status)
    const priceText = normalizedText(row.Price).replaceAll(',', '')
    const salePrice = priceText === '' ? Number.NaN : Number(priceText)
    const tags = list(row.Tags)
    const branches = list(row.Branches)

    if (!productName) add(row, 'Product Name', 'required', 'กรุณากรอกชื่อสินค้า')
    else if (productName.length > 160) add(row, 'Product Name', 'length', 'ชื่อสินค้าต้องไม่เกิน 160 ตัวอักษร')
    if (!categoryName) add(row, 'Category', 'required', 'กรุณากรอกหมวดหมู่สินค้า')
    else if (categoryName.length > 120) add(row, 'Category', 'length', 'ชื่อหมวดหมู่ต้องไม่เกิน 120 ตัวอักษร')
    if (brandName && brandName.length > 120) add(row, 'Brand', 'length', 'ชื่อแบรนด์ต้องไม่เกิน 120 ตัวอักษร')
    if (!skuCode) add(row, 'SKU Code', 'required', 'กรุณากรอกรหัสสินค้า (SKU)')
    else if (skuCode.length > 80 || CONTROL_CHARACTERS.test(skuCode)) add(row, 'SKU Code', 'format', 'SKU ต้องไม่เกิน 80 ตัวอักษรและห้ามมีอักขระควบคุม')
    if (salesCode && (salesCode.length > 80 || CONTROL_CHARACTERS.test(salesCode))) add(row, 'Sales Code', 'format', 'รหัสขาย / CF ต้องไม่เกิน 80 ตัวอักษรและห้ามมีอักขระควบคุม')
    if (barcode && (barcode.length > 128 || CONTROL_CHARACTERS.test(barcode))) add(row, 'Barcode', 'format', 'Barcode ต้องไม่เกิน 128 ตัวอักษรและห้ามมีอักขระควบคุม')
    if (!/^[a-z][a-z0-9_]{0,31}$/.test(baseUnitCode)) add(row, 'Base Unit', 'format', 'Base Unit ต้องขึ้นต้นด้วย a-z และใช้เฉพาะ a-z, 0-9 หรือ _')
    if (!behavior) add(row, 'Quantity Behavior', 'format', 'วิธีนับต้องเป็น discrete, weight หรือ volume')
    if (!Number.isFinite(salePrice) || salePrice < 0 || salePrice > 999_999_999.99) add(row, 'Price', 'range', 'ราคาขายต้องเป็นตัวเลข 0–999,999,999.99')
    if (!parsedTax) add(row, 'Tax', 'format', 'ภาษีต้องเป็น VAT 7%, VAT 0%, Exempt หรือ No VAT')
    if (tags.length > 12) add(row, 'Tags', 'range', 'ป้ายกำกับต้องไม่เกิน 12 รายการ')
    if (!branches.length) add(row, 'Branches', 'required', 'กรุณาระบุสาขาอย่างน้อย 1 สาขา')
    if (!parsedStatus) add(row, 'Status', 'format', 'สถานะต้องเป็น draft, active หรือ archived')

    if (!issues.some((issue) => issue.sourceRow === row.sourceRow)) rows.push({ sourceRow: row.sourceRow, productName, categoryName, brandName, skuCode, salesCode, barcode, baseUnitCode, quantityBehavior: behavior!, salePrice, ...parsedTax!, tags, branches, status: parsedStatus! })
  }
  return { rows, issues }
}

import { unzipSync } from 'fflate'

export const PRODUCT_IMPORT_HEADERS = [
  'Product Name', 'Category', 'Brand', 'SKU Code', 'Sales Code', 'Barcode',
  'Base Unit', 'Quantity Behavior', 'Price', 'Tax', 'Tags', 'Branches', 'Status',
] as const

export type ProductImportHeader = typeof PRODUCT_IMPORT_HEADERS[number]
export type ProductImportRawRow = Record<ProductImportHeader, string> & { sourceRow: number }

export type ProductImportParseResult = {
  fileName: string
  sheetName: string
  headers: string[]
  rows: ProductImportRawRow[]
}

const MAX_IMPORT_BYTES = 10 * 1024 * 1024
const MAX_IMPORT_ROWS = 20_000

export class ProductImportParseError extends Error {
  readonly code: 'file_type' | 'file_size' | 'file_empty' | 'sheet_missing' | 'headers' | 'row_limit' | 'file_invalid'

  constructor(code: 'file_type' | 'file_size' | 'file_empty' | 'sheet_missing' | 'headers' | 'row_limit' | 'file_invalid', message: string) {
    super(message)
    this.name = 'ProductImportParseError'
    this.code = code
  }
}

function decodeXml(value: string) {
  return value
    .replaceAll('&lt;', '<')
    .replaceAll('&gt;', '>')
    .replaceAll('&quot;', '"')
    .replaceAll('&apos;', "'")
    .replaceAll('&amp;', '&')
    .replace(/&#(\d+);/g, (_, code: string) => String.fromCodePoint(Number(code)))
    .replace(/&#x([\da-f]+);/gi, (_, code: string) => String.fromCodePoint(Number.parseInt(code, 16)))
}

function text(bytes: Uint8Array | undefined) {
  if (!bytes) return ''
  return new TextDecoder('utf-8').decode(bytes)
}

function cellColumn(reference: string) {
  const letters = reference.match(/^[A-Z]+/i)?.[0]?.toUpperCase() ?? 'A'
  let value = 0
  for (const letter of letters) value = value * 26 + letter.charCodeAt(0) - 64
  return Math.max(0, value - 1)
}

function sharedStrings(xml: string) {
  return Array.from(xml.matchAll(/<si(?:\s[^>]*)?>([\s\S]*?)<\/si>/gi), (match) =>
    decodeXml(Array.from(match[1].matchAll(/<t(?:\s[^>]*)?>([\s\S]*?)<\/t>/gi), (part) => part[1]).join('')),
  )
}

function worksheetRows(xml: string, strings: string[]) {
  return Array.from(xml.matchAll(/<row(?:\s[^>]*)?>([\s\S]*?)<\/row>/gi), (rowMatch) => {
    const cells: string[] = []
    for (const cellMatch of rowMatch[1].matchAll(/<c\s([^>]*)>([\s\S]*?)<\/c>/gi)) {
      const attributes = cellMatch[1]
      const body = cellMatch[2]
      const reference = attributes.match(/\br="([^"]+)"/i)?.[1] ?? 'A1'
      const kind = attributes.match(/\bt="([^"]+)"/i)?.[1]
      const raw = body.match(/<v>([\s\S]*?)<\/v>/i)?.[1]
        ?? body.match(/<t(?:\s[^>]*)?>([\s\S]*?)<\/t>/i)?.[1]
        ?? ''
      cells[cellColumn(reference)] = kind === 's' ? strings[Number(raw)] ?? '' : decodeXml(raw)
    }
    return cells
  })
}

function parseCsv(content: string) {
  const rows: string[][] = []
  let row: string[] = []
  let value = ''
  let quoted = false
  for (let index = 0; index < content.length; index += 1) {
    const character = content[index]
    if (quoted) {
      if (character === '"' && content[index + 1] === '"') { value += '"'; index += 1 }
      else if (character === '"') quoted = false
      else value += character
    } else if (character === '"') quoted = true
    else if (character === ',') { row.push(value); value = '' }
    else if (character === '\n') { row.push(value); rows.push(row); row = []; value = '' }
    else if (character !== '\r') value += character
  }
  row.push(value)
  if (row.some((cell) => cell.length) || rows.length === 0) rows.push(row)
  return rows
}

function requireHeaders(rows: string[][]) {
  const headers = (rows[0] ?? []).map((header) => header.replace(/^\uFEFF/, '').trim())
  const missing = PRODUCT_IMPORT_HEADERS.filter((header) => !headers.includes(header))
  const duplicates = headers.filter((header, index) => header && headers.indexOf(header) !== index)
  if (missing.length || duplicates.length) {
    const detail = [missing.length ? `ขาดคอลัมน์ ${missing.join(', ')}` : '', duplicates.length ? `คอลัมน์ซ้ำ ${Array.from(new Set(duplicates)).join(', ')}` : ''].filter(Boolean).join(' · ')
    throw new ProductImportParseError('headers', detail)
  }
  return headers
}

function buildResult(fileName: string, sheetName: string, cells: string[][]): ProductImportParseResult {
  if (!cells.length || cells.every((row) => row.every((cell) => !String(cell ?? '').trim()))) throw new ProductImportParseError('file_empty', 'ไฟล์ไม่มีข้อมูลสินค้า')
  const headers = requireHeaders(cells)
  const sourceRows = cells.slice(1).filter((row) => row.some((cell) => String(cell ?? '').trim()))
  if (sourceRows.length > MAX_IMPORT_ROWS) throw new ProductImportParseError('row_limit', `นำเข้าได้ไม่เกิน ${MAX_IMPORT_ROWS.toLocaleString('th-TH')} รายการต่อครั้ง`)
  const rows = sourceRows.map((row, rowIndex) => {
    const record = { sourceRow: rowIndex + 2 } as ProductImportRawRow
    for (const header of PRODUCT_IMPORT_HEADERS) record[header] = String(row[headers.indexOf(header)] ?? '').trim()
    return record
  })
  return { fileName, sheetName, headers, rows }
}

function parseXlsx(bytes: Uint8Array, fileName: string) {
  let archive: Record<string, Uint8Array>
  try { archive = unzipSync(bytes) } catch { throw new ProductImportParseError('file_invalid', 'ไม่สามารถเปิดไฟล์ Excel นี้ได้') }
  const workbook = text(archive['xl/workbook.xml'])
  const relationships = text(archive['xl/_rels/workbook.xml.rels'])
  const sheets = Array.from(workbook.matchAll(/<sheet\s([^>]+?)\/?\s*>/gi), (match) => ({
    name: decodeXml(match[1].match(/\bname="([^"]+)"/i)?.[1] ?? ''),
    id: match[1].match(/\br:id="([^"]+)"/i)?.[1] ?? '',
  }))
  const sheet = sheets.find((item) => item.name === 'ข้อมูลสินค้า') ?? sheets[0]
  if (!sheet) throw new ProductImportParseError('sheet_missing', 'ไม่พบ Sheet ข้อมูลสินค้า')
  const target = Array.from(relationships.matchAll(/<Relationship\s([^>]+?)\/?\s*>/gi))
    .map((match) => ({ id: match[1].match(/\bId="([^"]+)"/i)?.[1], target: match[1].match(/\bTarget="([^"]+)"/i)?.[1] }))
    .find((item) => item.id === sheet.id)?.target
  if (!target) throw new ProductImportParseError('sheet_missing', 'ไม่พบข้อมูล Sheet ที่เลือก')
  const normalizedTarget = target.replace(/^\//, '').replace(/^xl\//, '')
  const worksheet = text(archive[`xl/${normalizedTarget}`])
  if (!worksheet) throw new ProductImportParseError('sheet_missing', 'ไม่พบข้อมูล Sheet ที่เลือก')
  return buildResult(fileName, sheet.name, worksheetRows(worksheet, sharedStrings(text(archive['xl/sharedStrings.xml']))))
}

export function parseProductImportFile(bytes: Uint8Array, fileName: string): ProductImportParseResult {
  if (bytes.byteLength > MAX_IMPORT_BYTES) throw new ProductImportParseError('file_size', 'ไฟล์ต้องมีขนาดไม่เกิน 10 MB')
  const extension = fileName.toLowerCase().match(/\.[^.]+$/)?.[0]
  if (extension === '.csv') return buildResult(fileName, 'ข้อมูลสินค้า', parseCsv(new TextDecoder('utf-8').decode(bytes)))
  if (extension === '.xlsx') return parseXlsx(bytes, fileName)
  if (extension === '.xls') throw new ProductImportParseError('file_type', 'ไฟล์ .xls รุ่นเก่าไม่รองรับ กรุณาบันทึกเป็น .xlsx หรือ .csv ก่อนนำเข้า')
  throw new ProductImportParseError('file_type', 'รองรับเฉพาะไฟล์ .xlsx หรือ .csv')
}

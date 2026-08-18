import { strToU8, zipSync } from 'fflate'

type TemplateCell = string | number

const TEMPLATE_HEADERS = [
  'Product Name', 'Category', 'Brand', 'SKU Code', 'Sales Code', 'Barcode',
  'Base Unit', 'Quantity Behavior', 'Price', 'Tax', 'Tags', 'Branches', 'Status',
] as const

const TEMPLATE_EXAMPLE: TemplateCell[] = [
  'Example Product', 'Apparel', 'Example Brand', 'SKU-001', 'CF-001', '8850000000001',
  'piece', 'discrete', 100, 'VAT 7%', 'new|sample', 'BKK-01', 'draft',
]

const THAI_FIELD_GUIDE: TemplateCell[][] = [
  ['ชื่อคอลัมน์ในไฟล์', 'คำแปลภาษาไทย', 'ตัวอย่าง', 'จำเป็น', 'คำแนะนำการกรอก'],
  ['Product Name', 'ชื่อสินค้า', 'ต่างหูห่วงสีทอง', 'จำเป็น', 'ชื่อที่ผู้ใช้เห็นในหน้ารายการสินค้า'],
  ['Category', 'หมวดหมู่สินค้า', 'ต่างหู', 'จำเป็น', 'ใช้ชื่อหมวดหมู่ที่มีอยู่ในระบบ'],
  ['Brand', 'แบรนด์', 'Tory', 'ไม่จำเป็น', 'เว้นว่างได้เมื่อสินค้าไม่มีแบรนด์'],
  ['SKU Code', 'รหัสสินค้า (SKU)', 'SKU-TORY-001', 'จำเป็น', 'ต้องไม่ซ้ำภายในองค์กร'],
  ['Sales Code', 'รหัสขาย / รหัส CF', 'A001', 'ไม่จำเป็น', 'รหัสสั้นสำหรับขายหรือรับ CF และต้องไม่ซ้ำภายในองค์กร'],
  ['Barcode', 'บาร์โค้ด / รหัสสแกน', '8850000000001', 'ไม่จำเป็น', 'เก็บเป็นข้อความเพื่อรักษาเลขศูนย์ด้านหน้า'],
  ['Base Unit', 'หน่วยนับ', 'piece', 'จำเป็น', 'เช่น piece = ชิ้น, pair = คู่, pack = แพ็ก'],
  ['Quantity Behavior', 'วิธีนับจำนวน', 'discrete', 'จำเป็น', 'discrete = จำนวนเต็ม, measured = จำนวนทศนิยม'],
  ['Price', 'ราคาขาย (บาท)', 350, 'จำเป็น', 'กรอกเป็นตัวเลขตั้งแต่ 0 ขึ้นไป ไม่ต้องใส่สัญลักษณ์บาท'],
  ['Tax', 'อัตราภาษี', 'VAT 7%', 'จำเป็น', 'ใช้ค่าภาษีที่ระบบรองรับ เช่น VAT 7% หรือ No VAT'],
  ['Tags', 'ป้ายกำกับสินค้า', 'งานใหม่|ต่างหู', 'ไม่จำเป็น', 'หลายรายการให้คั่นด้วยเครื่องหมาย |'],
  ['Branches', 'สาขา', 'BKK-01', 'จำเป็น', 'หลายสาขาให้คั่นด้วยเครื่องหมาย |'],
  ['Status', 'สถานะสินค้า', 'draft', 'จำเป็น', 'draft = ฉบับร่าง, active = ใช้งานอยู่, archived = เก็บถาวร'],
]

function escapeXml(value: TemplateCell) {
  return String(value)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&apos;')
}

function columnName(index: number) {
  let name = ''
  let value = index + 1
  while (value > 0) {
    const remainder = (value - 1) % 26
    name = String.fromCharCode(65 + remainder) + name
    value = Math.floor((value - 1) / 26)
  }
  return name
}

function createCell(value: TemplateCell, row: number, column: number, style: number) {
  const reference = `${columnName(column)}${row}`
  if (typeof value === 'number') return `<c r="${reference}" s="${style}" t="n"><v>${value}</v></c>`
  return `<c r="${reference}" s="${style}" t="inlineStr"><is><t xml:space="preserve">${escapeXml(value)}</t></is></c>`
}

function createWorksheet(rows: TemplateCell[][], widths: number[], autoFilter = false) {
  const lastColumn = columnName(Math.max(0, widths.length - 1))
  const sheetRows = rows.map((cells, index) => {
    const rowNumber = index + 1
    const style = index === 0 ? 1 : 0
    return `<row r="${rowNumber}">${cells.map((value, column) => createCell(value, rowNumber, column, style)).join('')}</row>`
  }).join('')
  const columns = widths.map((width, index) => `<col min="${index + 1}" max="${index + 1}" width="${width}" customWidth="1"/>`).join('')
  const filter = autoFilter ? `<autoFilter ref="A1:${lastColumn}${rows.length}"/>` : ''
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><sheetViews><sheetView workbookViewId="0"><pane ySplit="1" topLeftCell="A2" activePane="bottomLeft" state="frozen"/></sheetView></sheetViews><sheetFormatPr defaultRowHeight="20"/><cols>${columns}</cols><sheetData>${sheetRows}</sheetData>${filter}</worksheet>`
}

export function createProductTemplateWorkbook() {
  const files: Record<string, Uint8Array> = {
    '[Content_Types].xml': strToU8(`<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/><Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/><Override PartName="/xl/worksheets/sheet2.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/><Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/></Types>`),
    '_rels/.rels': strToU8(`<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/></Relationships>`),
    'xl/workbook.xml': strToU8(`<?xml version="1.0" encoding="UTF-8" standalone="yes"?><workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets><sheet name="ข้อมูลสินค้า" sheetId="1" r:id="rId1"/><sheet name="คู่มือภาษาไทย" sheetId="2" r:id="rId2"/></sheets></workbook>`),
    'xl/_rels/workbook.xml.rels': strToU8(`<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/><Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet2.xml"/><Relationship Id="rId3" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/></Relationships>`),
    'xl/styles.xml': strToU8(`<?xml version="1.0" encoding="UTF-8" standalone="yes"?><styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><fonts count="2"><font><sz val="11"/><name val="Aptos"/></font><font><b/><color rgb="FFFFFFFF"/><sz val="11"/><name val="Aptos"/></font></fonts><fills count="3"><fill><patternFill patternType="none"/></fill><fill><patternFill patternType="gray125"/></fill><fill><patternFill patternType="solid"><fgColor rgb="FF111111"/><bgColor indexed="64"/></patternFill></fill></fills><borders count="1"><border><left/><right/><top/><bottom/><diagonal/></border></borders><cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs><cellXfs count="2"><xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0" applyAlignment="1"><alignment vertical="center"/></xf><xf numFmtId="0" fontId="1" fillId="2" borderId="0" xfId="0" applyFont="1" applyFill="1" applyAlignment="1"><alignment vertical="center"/></xf></cellXfs><cellStyles count="1"><cellStyle name="Normal" xfId="0" builtinId="0"/></cellStyles></styleSheet>`),
    'xl/worksheets/sheet1.xml': strToU8(createWorksheet([Array.from(TEMPLATE_HEADERS), TEMPLATE_EXAMPLE], [24, 18, 20, 18, 16, 20, 14, 22, 14, 14, 24, 18, 14], true)),
    'xl/worksheets/sheet2.xml': strToU8(createWorksheet(THAI_FIELD_GUIDE, [24, 28, 26, 14, 64], true)),
  }
  return zipSync(files, { level: 6 })
}

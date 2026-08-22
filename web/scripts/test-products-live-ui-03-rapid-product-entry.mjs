import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import test from 'node:test'

const root = new URL('../', import.meta.url)
const read = (path) => readFile(new URL(path, root), 'utf8')

test('Live-UI-03 adds the approved rapid product entry fields', async () => {
  const ui = await read('src/app/organizations/[id]/products/live-sale/live-sale-reservation-ui.tsx')
  for (const label of ['รูปสินค้า', 'ชื่อสินค้า', 'ราคาขาย', 'จำนวนเริ่มต้น', 'หน่วยขาย', 'สาขา', 'หมายเหตุ']) {
    assert.match(ui, new RegExp(label))
  }
  assert.match(ui, /บันทึกและกลับ Products/)
  assert.match(ui, /บันทึกและสร้างรายการถัดไป/)
})

test('Live-UI-03 advances the prepared Sales Code only in local UI state', async () => {
  const ui = await read('src/app/organizations/[id]/products/live-sale/live-sale-reservation-ui.tsx')
  assert.match(ui, /reservationCodes\.find\(\(code\) => !quickItemByCode\.has\(code\) && !skippedCodeSet\.has\(code\)\)/)
  assert.match(ui, /const nextItems = \[\.\.\.quickItems, item\]/)
  assert.match(ui, /setQuickItems\(nextItems\)/)
  assert.match(ui, /resetQuickProduct\(\)/)
  assert.match(ui, /UI Simulation/)
  assert.doesNotMatch(ui, /createClient|createServerClient|supabase|fetch\(|server action|use server/)
})

test('Live-UI-03 validates required price and quantity values', async () => {
  const ui = await read('src/app/organizations/[id]/products/live-sale/live-sale-reservation-ui.tsx')
  assert.match(ui, /กรุณากรอกชื่อสินค้า/)
  assert.match(ui, /ราคาขายไม่ถูกต้อง/)
  assert.match(ui, /จำนวนต้องเป็นจำนวนเต็มตั้งแต่ 0 ขึ้นไป/)
  assert.match(ui, /ชุดรหัสนี้ถูกใช้ครบแล้ว/)
  assert.match(ui, /role="alert"/)
})

test('Live-UI-03 keeps image selection browser-only with safe limits', async () => {
  const ui = await read('src/app/organizations/[id]/products/live-sale/live-sale-reservation-ui.tsx')
  assert.match(ui, /accept="image\/jpeg,image\/png,image\/webp"/)
  assert.match(ui, /10 \* 1024 \* 1024/)
  assert.match(ui, /URL\.createObjectURL\(file\)/)
  assert.match(ui, /URL\.revokeObjectURL\(imagePreviewUrlRef\.current\)/)
  assert.match(ui, /รูปภาพต้องมีขนาดไม่เกิน 10 MB/)
  assert.match(ui, /imagePreviewUrl: string/)
  assert.match(ui, /className="live-sale-recent-image"/)
  assert.match(ui, /ยังไม่มีรูปสินค้า/)
  assert.match(ui, /imageObjectUrlsRef\.current\.forEach/)
})

test('Live-UI-03 follows the Live Sale design and responsive controls', async () => {
  const css = await read('src/app/globals.css')
  assert.match(css, /\.live-sale-code-lock \{[^}]*#000[^}]*#aae600/s)
  assert.match(css, /\.live-sale-quick-fields input, \.live-sale-quick-fields select \{[^}]*height: 40px; min-height: 40px/s)
  assert.match(css, /\.live-sale-quick-actions \.button \{[^}]*height: 40px; min-height: 40px/s)
  assert.match(css, /@media \(max-width: 600px\)[\s\S]*\.live-sale-quick-fields \{ grid-template-columns: 1fr;/)
})

test('Live-UI-03 redirects the legacy route and uses only granular Product create authority', async () => {
  const [legacyPage, rapidEntryPage] = await Promise.all([
    read('src/app/organizations/[id]/products/live-sale/page.tsx'),
    read('src/app/organizations/[id]/products/live-sale/rapid-entry/page.tsx'),
  ])
  assert.match(legacyPage, /redirect\(`\/organizations\/\$\{organizationId\}\/products\/live-sale\/rapid-entry`\)/)
  assert.match(rapidEntryPage, /canManage=\{permissions\.has\('product\.create'\)\}/)
  assert.doesNotMatch(rapidEntryPage, /product\.manage/)
})

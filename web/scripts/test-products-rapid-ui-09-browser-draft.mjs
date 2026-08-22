import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import test from 'node:test'

const base = '../src/app/organizations/[id]/products/live-sale/rapid-entry/'
const helperPath = new URL(`${base}rapid-entry-browser-draft.ts`, import.meta.url)
const setupPath = new URL(`${base}rapid-entry-setup-workspace.tsx`, import.meta.url)
const tablePath = new URL(`${base}rapid-entry-table.tsx`, import.meta.url)
const prefixPath = new URL(`${base}rapid-prefix-assistant.tsx`, import.meta.url)
const reservationPath = new URL('../src/lib/foundation/global-sales-code-reservation.server.ts', import.meta.url)
const stylesPath = new URL('../src/app/globals.css', import.meta.url)

test('Rapid-UI-09 versions, scopes and bounds Browser Draft data', async () => {
  const source = await readFile(helperPath, 'utf8')
  assert.match(source, /RAPID_BROWSER_DRAFT_VERSION = 1/)
  assert.match(source, /RAPID_BROWSER_DRAFT_MAX_BYTES = 256 \* 1024/)
  assert.match(source, /organizationId !== organizationId/)
  assert.match(source, /actorUserId !== actorUserId/)
  assert.match(source, /reservationKey !== rapidReservationKey/)
  assert.match(source, /draft\.rows\.length !== 50/)
})

test('Rapid-UI-09 restores only validated scalar rows and never stores image bytes', async () => {
  const helper = await readFile(helperPath, 'utf8')
  const table = await readFile(tablePath, 'utf8')
  assert.match(helper, /imageFileName: string/)
  assert.match(table, /imageFileName: \(row\.image\?\.file\.name \?\? row\.imageFileName\)/)
  assert.match(table, /image: null, imageError: row\.imageFileName \? `กรุณาเลือกภาพ/)
  assert.doesNotMatch(helper, /base64|dataURL|arrayBuffer|FileReader/)
  assert.doesNotMatch(table, /readAsDataURL|arrayBuffer\(/)
})

test('Rapid-UI-09 autosaves with debounce and handles storage denial safely', async () => {
  const source = await readFile(tablePath, 'utf8')
  assert.match(source, /window\.setTimeout\(\(\) => persistBrowserDraft\(\), 400\)/)
  assert.match(source, /window\.localStorage\.setItem/)
  assert.match(source, /Browser ไม่อนุญาตให้บันทึก Draft/)
  assert.match(source, /window\.clearTimeout/)
})

test('Rapid-BE-02A flushes the latest valid draft when the page is hidden or closed', async () => {
  const source = await readFile(tablePath, 'utf8')
  assert.match(source, /window\.addEventListener\('pagehide', saveBeforeLeave\)/)
  assert.match(source, /document\.addEventListener\('visibilitychange', saveWhenHidden\)/)
  assert.match(source, /document\.visibilityState === 'hidden'/)
  assert.match(source, /persistBrowserDraft\(false\)/)
  assert.match(source, /window\.removeEventListener\('pagehide', saveBeforeLeave\)/)
  assert.match(source, /document\.removeEventListener\('visibilitychange', saveWhenHidden\)/)
})

test('Rapid-UI-09 requires an explicit restore or confirmed discard', async () => {
  const source = await readFile(setupPath, 'utf8')
  const styles = await readFile(stylesPath, 'utf8')
  assert.match(source, /ต้องการทำงานชุดเดิมต่อหรือไม่/)
  assert.match(source, /กู้คืนและทำต่อ/)
  assert.match(source, /ล้าง Browser Draft ชุดนี้/)
  assert.match(source, /ยืนยันล้าง Draft/)
  assert.match(source, /window\.localStorage\.removeItem/)
  assert.match(styles, /\.live-sale-rapid-draft-notice/)
})

test('Rapid-Draft-01 keeps drafts local while reservation uses the trusted server boundary', async () => {
  const sources = await Promise.all([helperPath, setupPath, tablePath].map((path) => readFile(path, 'utf8')))
  const combined = sources.join('\n')
  assert.doesNotMatch(combined, /supabase|executeFoundationCommandAction|\.insert\(|\.update\(|\.rpc\(/)
  const prefix = await readFile(prefixPath, 'utf8')
  const reservation = await readFile(reservationPath, 'utf8')
  assert.match(prefix, /reserveGlobalSalesCodeRangeAction/)
  assert.match(prefix, /reservationCommandRef/)
  assert.match(reservation, /server_reserve_global_sales_code_range/)
  assert.match(reservation, /requireFoundationPermission\(actor, 'product\.create'\)/)
  assert.doesNotMatch(prefix, /createAdminClient|\.rpc\(/)
})

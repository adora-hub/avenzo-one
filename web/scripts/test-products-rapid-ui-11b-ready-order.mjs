import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import test from 'node:test'

const root = new URL('../', import.meta.url)
const read = (path) => readFile(new URL(path, root), 'utf8')

test('UI-11B toggles ready rows between top and bottom without mutating source rows', async () => {
  const table = await read('src/app/organizations/[id]/products/live-sale/rapid-entry/rapid-entry-table.tsx')
  assert.match(table, /const \[readyRowsAtBottom, setReadyRowsAtBottom\] = useState\(true\)/)
  assert.match(table, /const displayedRows = statusFilter === 'all'/)
  assert.match(table, /\? readyRowsAtBottom/)
  assert.match(table, /\.\.\.visibleRows\.filter\(\(row\) => !rowIsReady/)
  assert.match(table, /\.\.\.visibleRows\.filter\(\(row\) => rowIsReady/)
  assert.doesNotMatch(table, /setRows\([^)]*sort\(|rows\.sort\(/)
})

test('UI-11B detects newly ready rows and provides an undoable announcement', async () => {
  const table = await read('src/app/organizations/[id]/products/live-sale/rapid-entry/rapid-entry-table.tsx')
  assert.match(table, /readyCodesRef = useRef<Set<string> \| null>\(null\)/)
  assert.match(table, /newlyReadyCodes/)
  assert.match(table, /พร้อมสร้างแล้ว — ย้ายออกจากงานที่ต้องทำและไว้ท้ายมุมมองทั้งหมด/)
  assert.match(table, /live-sale-rapid-order-toast/)
  assert.match(table, /setReadyRowsAtBottom\(false\); changeStatusFilter\('all'\)/)
  assert.match(table, />ย้อนกลับ<\/button>/)
})

test('UI-11B exposes an accessible top-bottom text action and preserves row identity', async () => {
  const table = await read('src/app/organizations/[id]/products/live-sale/rapid-entry/rapid-entry-table.tsx')
  assert.match(table, /live-sale-rapid-order-toggle/)
  assert.match(table, /readyRowsAtBottom \? 'สถานะพร้อมสร้างไว้ด้านบน' : 'สถานะพร้อมสร้างไว้ด้านล่าง'/)
  assert.match(table, /ReadyPlacementIcon direction=\{readyRowsAtBottom \? 'up' : 'down'\}/)
  assert.match(table, /data-rapid-row-index=\{row\.index\}/)
  assert.match(table, /live-sale-rapid-row-number">\{row\.index \+ 1\}/)
  assert.match(table, /การจัดลำดับไม่เปลี่ยนเลขแถว รหัสขาย หรือรายการที่เลือก/)
})

test('UI-11B follows the Design System toast and control treatment', async () => {
  const styles = await read('src/app/globals.css')
  const design = await read('../docs/AVENZO_ONE_Design_System_and_UIUX_Standards_V1.md')
  assert.match(styles, /\.live-sale-rapid-order-toast \{[^}]*position: fixed;[^}]*top: 18px;[^}]*left: 50%;/)
  assert.match(styles, /\.live-sale-rapid-order-toast > button \{[^}]*height: 28px;/)
  assert.match(styles, /\.live-sale-rapid-status-filter > \.live-sale-rapid-order-toggle/)
  assert.match(styles, /\.live-sale-rapid-status-filter > \.live-sale-rapid-order-toggle \{[^}]*border: 0;[^}]*background: transparent;/)
  assert.match(styles, /\.live-sale-rapid-status-filter > \.live-sale-rapid-order-toggle svg \{[^}]*width: 15px;[^}]*stroke: currentColor;/)
  assert.match(styles, /\.live-sale-rapid-status-filter \{[^}]*background: transparent;/)
  assert.match(design, /Presentation-only Ready-last ordering/)
})

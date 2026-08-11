import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import test from 'node:test'
import { fileURLToPath } from 'node:url'
import path from 'node:path'

const scriptDirectory = path.dirname(fileURLToPath(import.meta.url))
const repositoryRoot = path.resolve(scriptDirectory, '..', '..')
const [fulfillment, review, page, styles] = await Promise.all([
  readFile(path.join(repositoryRoot, 'web', 'src', 'app', 'components', 'billing-transfer-proof-fulfillment.tsx'), 'utf8'),
  readFile(path.join(repositoryRoot, 'web', 'src', 'app', 'components', 'billing-transfer-proof-review.tsx'), 'utf8'),
  readFile(path.join(repositoryRoot, 'web', 'src', 'app', 'platform-admin', 'billing', 'transfer-proofs', 'page.tsx'), 'utf8'),
  readFile(path.join(repositoryRoot, 'web', 'src', 'app', 'globals.css'), 'utf8'),
])

test('page identifies the approval timeline phase', () => {
  assert.match(page, /Phase 1\.1\.3\.8\.5\.3\.3/)
  assert.match(page, /ดูประวัติการอนุมัติแบบเรียงตามเวลา/)
})

test('server enriches queue rows with existing uploader metadata', () => {
  assert.match(page, /from\('billing_transfer_proofs'\)/)
  assert.match(page, /uploaded_by, submitted_at, created_at/)
  assert.match(page, /from\('organization_members'\)/)
  assert.match(page, /uploader_display_name/)
  assert.doesNotMatch(page, /SUPABASE_SECRET_KEY|service_role|sb_secret_/)
})

test('timeline presents every approval stage in Thai', () => {
  assert.match(fulfillment, /function approvalTimeline/)
  assert.match(fulfillment, /ส่งหลักฐาน/)
  assert.match(fulfillment, /ตรวจหลักฐานผ่าน/)
  assert.match(fulfillment, /รอ Platform Admin คนที่ 2/)
  assert.match(fulfillment, /พร้อมให้คุณอนุมัติคนที่ 2/)
  assert.match(fulfillment, /สร้าง Payment · ชำระ Invoice · ต่อ Subscription/)
})

test('pending review cards show approval history before the first review', () => {
  assert.match(review, /function pendingApprovalTimeline/)
  assert.match(review, /ประวัติการอนุมัติ/)
  assert.match(review, /รอตรวจหลักฐาน/)
  assert.match(review, /รอการอนุมัติตามนโยบาย/)
  assert.match(review, /review-approval-timeline-/)
  assert.match(review, /<ol className="approval-timeline-list">/)
})

test('timeline uses semantic ordered list and responsive styles', () => {
  assert.match(fulfillment, /<ol className="approval-timeline-list">/)
  assert.match(fulfillment, /approval-timeline-item/)
  assert.match(styles, /\.approval-timeline-list/)
  assert.match(styles, /\.approval-timeline-item\.complete/)
  assert.match(styles, /\.approval-timeline-item\.current/)
})

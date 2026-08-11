import Link from 'next/link'
import { redirect } from 'next/navigation'
import { BillingTransferProofFulfillment, type TransferProofFulfillmentItem } from '@/app/components/billing-transfer-proof-fulfillment'
import { BillingTransferApprovalPolicy, type TransferApprovalPolicy } from '@/app/components/billing-transfer-approval-policy'
import { BillingTransferProofReview, type TransferProofReviewItem } from '@/app/components/billing-transfer-proof-review'
import { SignOutButton } from '@/app/components/sign-out-button'
import { createClient } from '@/lib/supabase/server'

export default async function BillingTransferProofReviewPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/?next=/platform-admin/billing/transfer-proofs')
  const [admin, assurance] = await Promise.all([
    supabase.from('platform_admins').select('status, role_code').eq('user_id', user.id).maybeSingle(),
    supabase.auth.mfa.getAuthenticatorAssuranceLevel(),
  ])
  if (admin.data?.status !== 'active') redirect('/dashboard')
  if (assurance.data?.currentLevel !== 'aal2') redirect('/auth/mfa?next=/platform-admin/billing/transfer-proofs')

  const [{ data, error }, fulfillmentResult, policyResult] = await Promise.all([
    supabase.rpc('platform_billing_transfer_proof_review_queue'),
    supabase.rpc('platform_billing_transfer_fulfillment_queue_v2'),
    supabase.rpc('platform_billing_transfer_approval_policy'),
  ])
  const items = ((data ?? []) as TransferProofReviewItem[]).map((item) => ({
    ...item,
    invoice_total: Number(item.invoice_total),
    claimed_amount: Number(item.claimed_amount),
    file_size_bytes: Number(item.file_size_bytes),
  }))
  const rawFulfillmentItems = (fulfillmentResult.data ?? []) as TransferProofFulfillmentItem[]
  const proofIds = rawFulfillmentItems.map((item) => item.proof_id)
  const proofTimelineResult = proofIds.length
    ? await supabase.from('billing_transfer_proofs').select('id, organization_id, uploaded_by, submitted_at, created_at').in('id', proofIds)
    : { data: [], error: null }
  const proofTimelineRows = (proofTimelineResult.data ?? []) as Array<{
    id: string
    organization_id: string
    uploaded_by: string | null
    submitted_at: string | null
    created_at: string
  }>
  const uploaderIds = [...new Set(proofTimelineRows.map((row) => row.uploaded_by).filter((value): value is string => Boolean(value)))]
  const organizationIds = [...new Set(proofTimelineRows.map((row) => row.organization_id))]
  const uploaderResult = uploaderIds.length && organizationIds.length
    ? await supabase.from('organization_members').select('organization_id, user_id, display_name').in('organization_id', organizationIds).in('user_id', uploaderIds)
    : { data: [], error: null }
  const uploaderNames = new Map(
    ((uploaderResult.data ?? []) as Array<{ organization_id: string; user_id: string; display_name: string | null }>).map((row) => [
      `${row.organization_id}:${row.user_id}`,
      row.display_name,
    ] as const),
  )
  const proofTimelineById = new Map(proofTimelineRows.map((row) => [row.id, row]))
  const fulfillmentItems = rawFulfillmentItems.map((item) => {
    const proofTimeline = proofTimelineById.get(item.proof_id)
    const uploaderName = proofTimeline?.uploaded_by
      ? uploaderNames.get(`${item.organization_id}:${proofTimeline.uploaded_by}`) ?? null
      : null
    return {
      ...item,
      invoice_total: Number(item.invoice_total),
      claimed_amount: Number(item.claimed_amount),
      grace_period_days: Number(item.grace_period_days),
      approval_required_count: Number(item.approval_required_count),
      approval_policy_version: Number(item.approval_policy_version),
      single_admin_limit: Number(item.single_admin_limit),
      uploaded_by: proofTimeline?.uploaded_by ?? null,
      uploader_display_name: uploaderName,
      submitted_at: proofTimeline?.submitted_at ?? proofTimeline?.created_at ?? null,
    }
  })
  const policyRow = (policyResult.data as TransferApprovalPolicy[] | null)?.[0]
  const policy = policyRow ? { ...policyRow, single_admin_limit: Number(policyRow.single_admin_limit), version: Number(policyRow.version) } : null

  return <main className="dashboard">
    <header className="topbar"><div className="brand">AVENZO ONE / ตรวจหลักฐานโอน</div><div className="topbar-actions"><span>{user.email}</span><SignOutButton /></div></header>
    <section className="content platform-subscription-content">
      <div className="hero"><div><div className="eyebrow">Phase 1.1.3.8.5.3.3</div><h1>ตรวจหลักฐานและยืนยันรับชำระ</h1><p>ดูประวัติการอนุมัติแบบเรียงตามเวลา พร้อมสถานะและผู้ดำเนินการในแต่ละขั้น</p></div><div className="button-row"><Link className="button secondary" href="/platform-admin/billing">กลับ Billing</Link><Link className="button secondary" href="/platform-admin">กลับ Platform Admin</Link></div></div>
      {policyResult.error ? <div className="error">ไม่สามารถโหลดนโยบายอนุมัติได้: {policyResult.error.message}</div> : policy ? <BillingTransferApprovalPolicy initialPolicy={policy} canEdit={admin.data?.role_code === 'super_admin'} /> : <div className="error">ไม่พบการตั้งค่านโยบายอนุมัติ</div>}
      <section className="subscription-management-section">
        <div className="feature-list-heading"><div><div className="eyebrow">FULFILLMENT QUEUE</div><h2>หลักฐานที่รับรองแล้ว</h2><p>รายการปกติในวงเงินใช้ผู้ดูแล 1 คน ส่วนรายการเกินวงเงินหรือมีความเสี่ยงใช้ผู้ดูแล 2 คน</p></div><span className={`feature-count ${fulfillmentItems.length ? 'has-warning' : ''}`}>{fulfillmentItems.length} รายการ</span></div>
        <div className="safety-note"><strong>ระบบบังคับใช้นโยบายอัตโนมัติ</strong><p>เงื่อนไขถูกคำนวณซ้ำฝั่ง Server ก่อนสร้าง Payment ทุกครั้ง การเปลี่ยนแปลงเกิดใน Transaction เดียวและกดซ้ำไม่สร้างยอดซ้ำ</p></div>
        {fulfillmentResult.error ? <div className="error">ไม่สามารถโหลดคิวยืนยันรับชำระได้: {fulfillmentResult.error.message}</div> : <BillingTransferProofFulfillment initialItems={fulfillmentItems} currentUserId={user.id} />}
      </section>
      <section className="subscription-management-section">
        <div className="feature-list-heading"><div><div className="eyebrow">REVIEW QUEUE</div><h2>หลักฐานที่รอตรวจ</h2><p>เรียงรายการเก่าก่อนและแสดงสูงสุด 100 รายการ</p></div><span className={`feature-count ${items.length ? 'has-warning' : ''}`}>{items.length} รายการ</span></div>
        <div className="safety-note"><strong>หลักฐานผ่าน ≠ ชำระสำเร็จ</strong><p>เฟสนี้บันทึกผลตรวจหลักฐานเท่านั้น Invoice จะยังคงเป็น “รอชำระ” จนกว่าจะมีขั้นตอนสร้าง Payment ที่ตรวจสอบได้</p></div>
        {error ? <div className="error">ไม่สามารถโหลดคิวตรวจหลักฐานได้: {error.message}</div> : <BillingTransferProofReview initialItems={items} />}
      </section>
    </section>
  </main>
}

import { NextResponse } from 'next/server'
import { evaluateAndRecordLiveCheckoutDryRun } from '@/lib/billing/live-checkout-dry-run'
import {
  evaluateLiveEligibilityAuthorization,
  type LiveEligibilityContractCase,
  type LiveEligibilityContractReport,
} from '@/lib/billing/live-eligibility-contract'
import { createAdminClient } from '@/lib/supabase/admin'
import { createClient } from '@/lib/supabase/server'

export const runtime = 'nodejs'

export async function POST() {
  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    const [adminResult, aalResult] = await Promise.all([
      user ? supabase.from('platform_admins').select('status').eq('user_id', user.id).maybeSingle() : Promise.resolve({ data: null }),
      supabase.auth.mfa.getAuthenticatorAssuranceLevel(),
    ])
    const authorization = evaluateLiveEligibilityAuthorization({
      userId: user?.id,
      email: user?.email,
      adminStatus: adminResult.data?.status,
      currentLevel: aalResult.data?.currentLevel,
    })
    if (!authorization.allowed) return NextResponse.json({ error: authorization.error }, { status: authorization.status })

    const admin = createAdminClient()
    const [policyResult, testerResult] = await Promise.all([
      admin.from('billing_live_rollout_policies').select('max_amount_per_charge').eq('provider', 'stripe').maybeSingle(),
      admin.from('billing_live_testers').select('email').eq('provider', 'stripe').eq('active', true).order('updated_at', { ascending: false }).limit(1).maybeSingle(),
    ])
    if (policyResult.error) throw policyResult.error
    if (testerResult.error) throw testerResult.error
    if (!policyResult.data || !testerResult.data?.email) {
      return NextResponse.json({ error: 'billing_live_contract_prerequisite_missing' }, { status: 409 })
    }

    const maxAmount = Number(policyResult.data.max_amount_per_charge)
    const validTester = testerResult.data.email
    const nonce = crypto.randomUUID().slice(0, 8)
    const common = { actorUserId: authorization.userId, actorEmail: authorization.email }
    const noAal2Decision = evaluateLiveEligibilityAuthorization({
      userId: authorization.userId,
      email: authorization.email,
      adminStatus: 'active',
      currentLevel: 'aal1',
    })

    const unauthorizedTester = await evaluateAndRecordLiveCheckoutDryRun({
      ...common,
      commandId: crypto.randomUUID(),
      testerEmail: `contract-not-allowed-${nonce}@invalid.avenzo.test`,
      amount: Math.min(maxAmount, 1),
      reference: `CONTRACT-NOT-ALLOWED-${nonce}`,
    })
    const overLimit = await evaluateAndRecordLiveCheckoutDryRun({
      ...common,
      commandId: crypto.randomUUID(),
      testerEmail: validTester,
      amount: maxAmount + 0.01,
      reference: `CONTRACT-OVER-LIMIT-${nonce}`,
    })

    const duplicateCommandId = crypto.randomUUID()
    const duplicateInput = {
      ...common,
      commandId: duplicateCommandId,
      testerEmail: validTester,
      amount: Math.min(maxAmount, 1),
      reference: `CONTRACT-DUPLICATE-${nonce}`,
    }
    const duplicateFirst = await evaluateAndRecordLiveCheckoutDryRun(duplicateInput)
    const duplicateSecond = await evaluateAndRecordLiveCheckoutDryRun(duplicateInput)

    const cases: LiveEligibilityContractCase[] = [
      {
        key: 'no_aal2',
        label: 'ไม่มี MFA ระดับ AAL2',
        passed: !noAal2Decision.allowed && noAal2Decision.status === 403,
        detail: 'กฎ Authorization ปฏิเสธด้วย HTTP 403 ก่อนเข้าถึง Dry-run',
        auditIds: [],
      },
      {
        key: 'tester_not_allowed',
        label: 'ผู้ทดสอบไม่ได้รับอนุญาต',
        passed: unauthorizedTester.eligible === false && unauthorizedTester.checks.tester_allowed === false && unauthorizedTester.real_charge === false,
        detail: 'Server ปฏิเสธ Tester นอก Allowlist และบันทึกเฉพาะ Audit',
        auditIds: [unauthorizedTester.id],
      },
      {
        key: 'amount_over_limit',
        label: 'ยอดเกินวงเงินต่อครั้ง',
        passed: overLimit.eligible === false && overLimit.checks.amount_within_limit === false && overLimit.real_charge === false,
        detail: `Server ปฏิเสธยอดที่มากกว่า ${maxAmount.toLocaleString('th-TH')} บาท`,
        auditIds: [overLimit.id],
      },
      {
        key: 'duplicate_command',
        label: 'ส่ง Command ID ซ้ำ',
        passed: duplicateFirst.id === duplicateSecond.id && duplicateFirst.command_id === duplicateCommandId && duplicateFirst.real_charge === false,
        detail: 'คำสั่งซ้ำคืน Audit เดิม ไม่สร้างแถวหรือธุรกรรมซ้ำ',
        auditIds: [duplicateFirst.id, duplicateSecond.id],
      },
    ]
    const report: LiveEligibilityContractReport = {
      passed: cases.every((item) => item.passed),
      realChargeCreated: false,
      executedAt: new Date().toISOString(),
      cases,
    }
    return NextResponse.json({ report })
  } catch (error) {
    console.error('Live eligibility contract tests failed', error)
    return NextResponse.json({ error: 'live_eligibility_contract_tests_failed' }, { status: 500 })
  }
}
